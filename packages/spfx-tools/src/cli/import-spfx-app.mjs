#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, required } from '../lib/args.mjs';
import {
  copyManagedSpfxSource,
  exists,
  managedAppDir,
  normalizeManagedSpfxTsconfig,
  preserveOriginalLock,
  readJson,
  writeJson
} from '../lib/fs.mjs';
import { scaffoldLabAdapter } from '../lib/lab-adapter.mjs';
import { readSpfxSummary } from '../lib/spfx.mjs';

const usage = `Usage:
  import-spfx-app --source <git-url-or-path> --name <slug> [--ref <ref>] [--force]`;

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

  const { sourceDir, cleanup } = await resolveSource(source, args.ref);
  try {
    if (!(await exists(path.join(sourceDir, 'package.json')))) {
      throw new Error(`No package.json found in source: ${sourceDir}`);
    }

    if (args.force) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await copyManagedSpfxSource(sourceDir, targetDir);
    const hadOriginalLock = await preserveOriginalLock(sourceDir, targetDir);

    const summary = await readSpfxSummary(targetDir);
    const packagePath = path.join(targetDir, 'package.json');
    const packageJson = await readJson(packagePath);
    packageJson.name = `@spfx-kit/${slug}`;
    packageJson.private = true;
    delete packageJson.exports;
    await writeJson(packagePath, packageJson);

    await writeJson(path.join(targetDir, '.spfx-kit', 'import.json'), {
      source,
      ref: args.ref || null,
      importedAt: new Date().toISOString(),
      originalLockfilePreserved: hadOriginalLock,
      ...summary
    });

    await scaffoldLabAdapter(targetDir, slug, packageJson.description || summary.originalPackageName);
    await normalizeManagedSpfxTsconfig(rootDir, targetDir);
    console.log(`Imported ${source} into ${path.relative(rootDir, targetDir).replace(/\\/g, '/')}`);
  } finally {
    await cleanup();
  }
}

async function resolveSource(source, ref) {
  if (/^(https?:|git@)/.test(source)) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-import-'));
    const clone = spawnSync('git', ['clone', '--depth=1', ...(ref ? ['--branch', ref] : []), source, tmp], {
      stdio: 'inherit'
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed for ${source}`);
    }
    return { sourceDir: tmp, cleanup: () => rm(tmp, { recursive: true, force: true }) };
  }

  return {
    sourceDir: path.resolve(source),
    cleanup: async () => undefined
  };
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
