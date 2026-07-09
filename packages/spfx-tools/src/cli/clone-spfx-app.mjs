#!/usr/bin/env node
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, required } from '../lib/args.mjs';
import { exists, managedAppDir, writeJson } from '../lib/fs.mjs';
import { scaffoldLabAdapter } from '../lib/lab-adapter.mjs';

const usage = `Usage:
  clone-spfx-app --source <git-url-or-path> --name <slug> [--ref <ref>] [--fork <your-fork-url>] [--force]

Clones a third-party SPFx repo, with full git history, into .spfx-kit/apps/<slug>-spfx
so you can run, test, and modify it in the lab and push branches or patches back.
Unlike import-spfx-app, the cloned project is left pristine: package.json and
tsconfig.json are not rewritten, and kit-generated files (.spfx-kit/) are kept out
of the clone's git status via .git/info/exclude.

With --fork, "origin" points at your fork (where you push branches) and
"upstream" points at the original --source repo.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = required(args, 'source', usage);
  const requestedName = required(args, 'name', usage);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(requestedName)) {
    throw new Error('--name must be a lowercase slug using letters, numbers, and hyphens.');
  }
  const slug = requestedName.endsWith('-spfx') ? requestedName : `${requestedName}-spfx`;

  const rootDir = process.cwd();
  const targetDir = managedAppDir(rootDir, slug);
  if ((await exists(targetDir)) && !args.force) {
    throw new Error(`Refusing to overwrite existing app: ${targetDir}. Pass --force to replace it.`);
  }
  if (args.force) {
    await rm(targetDir, { recursive: true, force: true });
  }
  await mkdir(path.dirname(targetDir), { recursive: true });

  const cloneSource = isRemoteUrl(source) ? source : path.resolve(source);
  runGit(rootDir, ['clone', ...(args.ref ? ['--branch', String(args.ref)] : []), cloneSource, targetDir]);

  try {
    if (!(await exists(path.join(targetDir, 'package.json')))) {
      throw new Error(`No package.json found in cloned repo: ${targetDir}`);
    }

    if (args.fork) {
      runGit(targetDir, ['remote', 'add', 'upstream', cloneSource]);
      runGit(targetDir, ['remote', 'set-url', 'origin', String(args.fork)]);
    }

    await excludeKitFilesFromClone(targetDir);
    const scaffolded = await scaffoldLabAdapter(targetDir, slug, await readDescription(targetDir));
    await writeJson(path.join(targetDir, '.spfx-kit', 'clone.json'), {
      source,
      ref: args.ref || null,
      fork: args.fork || null,
      clonedAt: new Date().toISOString()
    });

    const relativeTarget = path.relative(rootDir, targetDir).replace(/\\/g, '/');
    console.log(`Cloned ${source} into ${relativeTarget}`);
    if (args.fork) {
      console.log(`  origin -> ${args.fork} (push your branches here)`);
      console.log(`  upstream -> ${source}`);
    }
    if (scaffolded) {
      console.log(`  Scaffolded local-only lab adapter at ${relativeTarget}/.spfx-kit/lab/register.tsx`);
    }
    console.log('  Run `npm run sync:lab` to register it in the lab.');
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true });
    throw error;
  }
}

function isRemoteUrl(source) {
  return /^(https?:|git@|ssh:)/.test(source);
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed`);
  }
}

// Kit metadata and the lab adapter live under the clone's .spfx-kit/ directory.
// Excluding it locally keeps `git status` in the third-party repo clean, so
// feedback branches and patches never accidentally include kit files.
async function excludeKitFilesFromClone(targetDir) {
  const infoDir = path.join(targetDir, '.git', 'info');
  await mkdir(infoDir, { recursive: true });
  const excludePath = path.join(infoDir, 'exclude');
  const existing = (await exists(excludePath)) ? await readFile(excludePath, 'utf8') : '';
  if (existing.split('\n').includes('.spfx-kit/')) {
    return;
  }
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  await appendFile(excludePath, `${separator}# Local-only SPFx Kit metadata and lab adapter\n.spfx-kit/\n`);
}

async function readDescription(targetDir) {
  try {
    const packageJson = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8'));
    return packageJson.description || packageJson.name;
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
