import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const exportsRoot = path.join(workspaceRoot, '.spfx-kit', 'exports');
const bucketRoot = path.join(workspaceRoot, '.spfx-kit', 'e2e-mock-cdn', 'v1');
const exportDir = path.join(exportsRoot, 'hello-card-spfx', 'browser-e2e');
const manualExportDir = path.join(exportsRoot, 'hello-card-spfx', 'browser-e2e-manual');
const stageDir = path.join(exportDir, 'staging-cdn');
const sourceDescriptorFile = path.join(exportDir, 'github-staging-source.json');
const appDir = path.join(workspaceRoot, 'examples', 'hello-card-spfx');
const exportCli = path.join(workspaceRoot, 'packages', 'spfx-tools', 'src', 'cli', 'export-spfx-app.mjs');
const mockCdnCli = path.join(workspaceRoot, 'packages', 'spfx-tools', 'src', 'cli', 'mock-cdn.mjs');
const mockCdnOrigin = process.env.SPFX_KIT_E2E_MOCK_CDN_ORIGIN || 'http://127.0.0.1:54174';
const labPort = process.env.SPFX_KIT_E2E_LAB_PORT || '54173';
const labOrigin = `http://127.0.0.1:${labPort}`;
let mockServer;

await cleanup();
try {
  await run('npm', ['run', 'install:canary']);
  await run(process.execPath, [
    exportCli,
    '--app',
    appDir,
    '--target',
    'staging-cdn',
    '--out',
    exportDir,
    '--staging-cdn-base-url',
    mockCdnOrigin,
    '--local-mock-cdn',
    '--cdn-release',
    'browser-e2e.1',
    '--json'
  ]);
  await run(process.execPath, [
    exportCli,
    '--app',
    appDir,
    '--target',
    'staging-cdn',
    '--out',
    manualExportDir,
    '--staging-cdn-base-url',
    mockCdnOrigin,
    '--local-mock-cdn',
    '--cdn-release',
    'browser-e2e-manual.1',
    '--json'
  ]);
  await writeGitHubStagingSourceDescriptor();
  await run(process.execPath, [
    mockCdnCli,
    'publish-source',
    '--descriptor',
    sourceDescriptorFile,
    '--materialization',
    exportsRoot,
    '--origin',
    mockCdnOrigin,
    '--root',
    path.relative(workspaceRoot, bucketRoot),
    '--json'
  ]);
  mockServer = spawn(
    process.execPath,
    [
      mockCdnCli,
      'serve',
      '--origin',
      mockCdnOrigin,
      '--lab-origin',
      labOrigin,
      '--root',
      path.relative(workspaceRoot, bucketRoot)
    ],
    { cwd: workspaceRoot, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] }
  );
  mockServer.once('error', (error) => {
    throw error;
  });
  await readFile(path.join(stageDir, 'deployment-manifest.json'), 'utf8');
  await waitForMockCdn(mockCdnOrigin);

  await run('npx', ['playwright', 'test'], {
    ...process.env,
    SPFX_KIT_E2E_REAL_CDN: '1',
    SPFX_KIT_E2E_FRESH_SERVER: '1',
    SPFX_KIT_E2E_LAB_PORT: labPort,
    SPFX_KIT_LAB_EXPORTS_DIR: exportsRoot,
    SPFX_KIT_MOCK_CDN_ROOT: path.relative(workspaceRoot, bucketRoot),
    SPFX_KIT_MOCK_CDN_ORIGIN: mockCdnOrigin,
    SPFX_LAB_PORT: labPort
  });
} finally {
  if (mockServer && mockServer.exitCode === null) {
    mockServer.kill('SIGTERM');
    await new Promise((resolve) => mockServer.once('exit', resolve));
  }
  await cleanup();
}

async function waitForMockCdn(manifestUrl) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (mockServer?.exitCode !== null) {
      throw new Error(`Mock CDN server exited before becoming ready (code ${mockServer?.exitCode}).`);
    }
    try {
      await fetch(`${manifestUrl}/__spfx_kit_ready__`, {
        headers: { Origin: labOrigin },
        redirect: 'error'
      });
      return;
    } catch {
      // The separate process may still be binding the loopback port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Mock CDN did not become ready at ${manifestUrl}.`);
}

async function cleanup() {
  await Promise.all([
    rm(exportDir, { recursive: true, force: true }),
    rm(manualExportDir, { recursive: true, force: true }),
    rm(path.dirname(bucketRoot), { recursive: true, force: true })
  ]);
}

async function writeGitHubStagingSourceDescriptor() {
  const manifestFile = path.join(stageDir, 'deployment-manifest.json');
  const manifestBytes = await readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const closurePaths = new Set([
    'deployment-manifest.json',
    manifest.package.path,
    ...manifest.files.map((file) => `${manifest.uploadRoot}/${file.path}`)
  ]);
  if (manifest.manifests.root) {
    for (const file of await listFiles(stageDir, manifest.manifests.root)) {
      closurePaths.add(file);
    }
  }
  const files = await Promise.all(
    [...closurePaths].sort().map(async (relativePath) => {
      const bytes = await readFile(path.join(stageDir, relativePath));
      return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
    })
  );
  const descriptor = {
    schemaVersion: 1,
    source: {
      kind: 'github-directory',
      visibility: 'private',
      repository: 'example-private/hello-card-staging',
      commit: '0123456789abcdef0123456789abcdef01234567',
      path: 'hello-card-spfx/browser-e2e/staging-cdn'
    },
    releaseManifest: { path: 'deployment-manifest.json', sha256: sha256(manifestBytes) },
    files
  };
  await writeFile(sourceDescriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`);
}

async function listFiles(root, relativeDirectory) {
  const files = [];
  for (const entry of await readdir(path.join(root, relativeDirectory), { withFileTypes: true })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Real CDN E2E fixture may not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspaceRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}
