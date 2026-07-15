#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'cli/clone-spfx-app.mjs',
  'cli/create-spfx-app.mjs',
  'cli/export-spfx-app.mjs',
  'cli/import-spfx-app.mjs',
  'cli/sync-lab.mjs',
  'cli/validate-spfx-app.mjs',
  'cli/verify-sppkg.mjs',
  'lib/app-repo-files.mjs',
  'lib/args.mjs',
  'lib/fs.mjs',
  'lib/lab-adapter.mjs',
  'lib/spfx-support.mjs',
  'lib/spfx-toolchain.mjs',
  'lib/spfx.mjs',
  'lib/sppkg.mjs',
  '../templates/app-ci.yml'
];

await Promise.all(required.map((file) => access(path.join(root, file))));
console.log('spfx-tools self-check passed.');
