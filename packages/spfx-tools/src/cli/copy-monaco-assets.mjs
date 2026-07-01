#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { cp, mkdir, rm } from 'node:fs/promises';
import { parseArgs, required } from '../lib/args.mjs';
import { exists } from '../lib/fs.mjs';

const usage = `Usage:
  copy-monaco-assets --app .spfx-kit/apps/<slug>`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = required(args, 'app', usage);
  const appDir = path.resolve(app);
  const appRequire = createRequire(path.join(appDir, 'package.json'));
  const monacoPackagePath = appRequire.resolve('monaco-editor/package.json');
  const monacoVsDir = path.join(path.dirname(monacoPackagePath), 'min', 'vs');

  if (!(await exists(monacoVsDir))) {
    throw new Error(`Could not find Monaco editor static assets at ${monacoVsDir}`);
  }

  const targets = [path.join(appDir, 'release', 'assets', 'monaco-editor', 'min', 'vs')];
  const tempDeploy = path.join(appDir, 'temp', 'deploy');
  if (await exists(tempDeploy)) {
    targets.push(path.join(tempDeploy, 'monaco-editor', 'min', 'vs'));
  }

  for (const target of targets) {
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(monacoVsDir, target, { recursive: true });
  }

  console.log(`Copied Monaco editor assets for ${app}`);
  for (const target of targets) {
    console.log(`  ${path.relative(process.cwd(), target)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
