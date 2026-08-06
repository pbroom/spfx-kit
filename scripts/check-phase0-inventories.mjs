import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const evidenceRoot = path.join('docs', 'evidence', 'shadcn-migration');
const monacoInventoryPath = path.join(evidenceRoot, 'monaco-0.53.0-min-vs-inventory.json');
const workbenchInventoryPath = path.join(evidenceRoot, 'workbench-v1-public-source-format-inventory.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function roleFor(relativePath) {
  if (relativePath === 'loader.js') return 'amd-loader';
  if (relativePath === 'editor/editor.main.js') return 'editor-main';
  if (relativePath === 'style.css') return 'stylesheet-with-embedded-support-assets';
  if (relativePath.startsWith('assets/') && relativePath.includes('worker')) return 'worker';
  if (relativePath.startsWith('nls.messages')) return 'localization';
  if (relativePath.includes('/monaco.contribution.js') || relativePath.includes('contribution.')) {
    return 'language-contribution';
  }
  return 'runtime-module';
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const trackedWorkbench = await readFile(workbenchInventoryPath, 'utf8');
const generatedWorkbench = execFileSync(process.execPath, ['scripts/generate-workbench-v1-inventory.mjs'], {
  encoding: 'utf8'
});
assert.equal(generatedWorkbench, trackedWorkbench, 'The tracked Workbench V1 inventory is not reproducible.');

const trackedMonaco = await readFile(monacoInventoryPath, 'utf8');
const monaco = JSON.parse(trackedMonaco);
const packageMetadata = JSON.parse(await readFile('node_modules/monaco-editor/package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const lockedMonaco = lock.packages['node_modules/monaco-editor'];
assert.equal(packageMetadata.name, monaco.package.name);
assert.equal(packageMetadata.version, monaco.package.version);
assert.equal(lockedMonaco.version, monaco.package.version);
assert.equal(lockedMonaco.resolved, monaco.package.registryTarball);
assert.equal(lockedMonaco.integrity, monaco.package.npmIntegrity);

const installedRoot = path.join('node_modules', 'monaco-editor', 'min', 'vs');
const packRoot = await mkdtemp(path.join(tmpdir(), 'spfx-kit-monaco-pack-'));
try {
  const npmArgs = [
    'pack',
    monaco.package.registryTarball,
    '--offline',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packRoot
  ];
  const npmExecPath = process.env.npm_execpath;
  const packOutput = npmExecPath
    ? execFileSync(process.execPath, [npmExecPath, ...npmArgs], { encoding: 'utf8' })
    : execFileSync('npm', npmArgs, { encoding: 'utf8' });
  const [{ filename }] = JSON.parse(packOutput);
  const packedTarball = path.join(packRoot, filename);
  const generatedMonaco = execFileSync(process.execPath, ['scripts/generate-monaco-runtime-inventory.mjs', packedTarball], {
    encoding: 'utf8'
  });
  assert.equal(
    generatedMonaco,
    trackedMonaco,
    'The tracked Monaco inventory, including tarball provenance and disposition metadata, is not reproducible.'
  );
} finally {
  await rm(packRoot, { recursive: true, force: true });
}

const installedFiles = [];
for (const absolute of (await walk(installedRoot)).sort()) {
  const bytes = await readFile(absolute);
  const metadata = await stat(absolute);
  const relativePath = path.relative(installedRoot, absolute).split(path.sep).join('/');
  installedFiles.push({
    path: relativePath,
    bytes: metadata.size,
    sha256: sha256(bytes),
    role: roleFor(relativePath)
  });
}

assert.deepEqual(installedFiles, monaco.tree.files, 'The installed Monaco min/vs tree differs from the inventory.');
const canonical = installedFiles.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join('');
assert.equal(installedFiles.length, monaco.tree.entryCount);
assert.equal(
  installedFiles.reduce((sum, file) => sum + file.bytes, 0),
  monaco.tree.totalBytes
);
assert.equal(sha256(canonical), monaco.tree.canonicalSha256);

process.stdout.write('Phase 0 focused inventories are reproducible from the pinned public source and lock-resolved install.\n');
