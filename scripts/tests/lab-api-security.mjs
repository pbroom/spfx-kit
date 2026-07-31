import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const host = '127.0.0.1';
const port = Number(process.env.SPFX_LAB_SECURITY_TEST_PORT || 53173);
const baseUrl = `http://${host}:${port}`;
const validationDir = path.join(repoRoot, '.tmp-lab-security-validation');
const workspaceFilePath = path.join(validationDir, 'not-an-export.tar.gz');
const exportsValidationDir = path.join(repoRoot, '.spfx-kit', 'exports', '.tmp-lab-security-validation');
const archivePath = path.join(exportsValidationDir, 'sample-export.tar.gz');
const managedAppsDir = path.join(repoRoot, '.spfx-kit', 'apps');
const managedAppLinkPath = path.join(managedAppsDir, `.tmp-vite-fs-allow-${process.pid}`);
const exportConfigAppId = `tmp-export-config-${process.pid}-spfx`;
const exportConfigAppDir = path.join(managedAppsDir, exportConfigAppId);
const exportConfigSidecarDir = path.join(exportConfigAppDir, '.spfx-kit');
const exportConfigSidecarPath = path.join(exportConfigSidecarDir, 'export-config.json');
const requestTimeoutMs = 10_000;

let server;
let externalManagedAppDir;
let externalExportConfigDir;

try {
  await mkdir(validationDir, { recursive: true });
  await writeFile(workspaceFilePath, 'workspace-bytes\n');
  await mkdir(exportsValidationDir, { recursive: true });
  await writeFile(archivePath, 'archive-bytes\n');
  await createExportConfigFixture();
  await runCommand('npm', ['run', 'sync:lab']);
  server = await startLabServer();

  await expectStatus(
    'cross-origin JSON write is rejected',
    post('/api/export-spfx-app', {
      origin: 'http://evil.example',
      intent: true,
      contentType: 'application/json',
      body: {}
    }),
    403
  );

  await expectStatus(
    'cross-origin app registry write is rejected',
    post('/api/spfx-apps/sync', {
      origin: 'http://evil.example',
      intent: true,
      contentType: 'application/json',
      body: {}
    }),
    403
  );

  await expectStatus(
    'cross-origin app version write is rejected',
    post('/api/spfx-apps/version', {
      origin: 'http://evil.example',
      intent: true,
      contentType: 'application/json',
      body: { appId: 'fixture-spfx', versionId: 'latest' }
    }),
    403
  );

  await expectStatus(
    'same-origin JSON write without intent header is rejected',
    post('/api/export-spfx-app', {
      origin: baseUrl,
      intent: false,
      contentType: 'application/json',
      body: {}
    }),
    403
  );

  await expectStatus(
    'same-origin write with non-JSON content type is rejected',
    fetchWithTimeout(`${baseUrl}/api/export-spfx-app`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'X-SPFX-KIT-Lab-Intent': 'same-origin',
        'Content-Type': 'text/plain'
      },
      body: '{}'
    }),
    415
  );

  const guardedPassThrough = await post('/api/export-spfx-app', {
    origin: baseUrl,
    intent: true,
    contentType: 'application/json',
    body: {}
  });
  const passThroughBody = await guardedPassThrough.text();
  if (guardedPassThrough.status !== 500 || !passThroughBody.includes('Invalid app slug.')) {
    throw new Error(`same-origin guarded write did not reach API validation: ${guardedPassThrough.status} ${passThroughBody}`);
  }

  const invalidVersion = await post('/api/spfx-apps/version', {
    origin: baseUrl,
    intent: true,
    contentType: 'application/json',
    body: { appId: 'fixture-spfx', versionId: '../main' }
  });
  const invalidVersionBody = await invalidVersion.text();
  if (invalidVersion.status !== 500 || !invalidVersionBody.includes('Invalid app version.')) {
    throw new Error(`invalid app version was not rejected: ${invalidVersion.status} ${invalidVersionBody}`);
  }

  const validExportConfig = {
    appName: 'Security Fixture',
    fileName: 'security-fixture.sppkg',
    description: 'Security validation fixture',
    appIcon: 'Shield',
    version: '1.2.3',
    cdnUrl: 'https://cdn.example.test/spfx/security-fixture/'
  };

  await expectStatus(
    'cross-origin export configuration write is rejected',
    post('/api/spfx-apps/export-config', {
      origin: 'http://evil.example',
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: validExportConfig }
    }),
    403
  );
  await expectStatus(
    'export configuration write without intent is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: false,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: validExportConfig }
    }),
    403
  );
  await expectStatus(
    'non-JSON export configuration write is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'text/plain',
      body: { appId: exportConfigAppId, exportConfig: validExportConfig }
    }),
    415
  );
  await expectErrorContains(
    'invalid export configuration app is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: '../outside', exportConfig: validExportConfig }
    }),
    'Invalid app slug.'
  );
  await expectErrorContains(
    'export configuration filename traversal is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: { ...validExportConfig, fileName: '../escape.sppkg' } }
    }),
    'File name must not include a directory path.'
  );
  await expectErrorContains(
    'invalid export configuration version is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: { ...validExportConfig, version: '1.2.3.4' } }
    }),
    'Version must use x.y.z format.'
  );
  await expectErrorContains(
    'unsafe export configuration CDN URL is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: { ...validExportConfig, cdnUrl: 'file:///etc/passwd' } }
    }),
    'CDN URL must be an absolute non-localhost HTTPS URL.'
  );
  await expectErrorContains(
    'insecure export configuration CDN URL is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: { ...validExportConfig, cdnUrl: 'http://cdn.example.test/spfx/' } }
    }),
    'CDN URL must be an absolute non-localhost HTTPS URL.'
  );
  await expectErrorContains(
    'localhost export configuration CDN URL is rejected',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: { ...validExportConfig, cdnUrl: 'https://localhost/spfx/' } }
    }),
    'CDN URL must be an absolute non-localhost HTTPS URL.'
  );
  await expectMissing('rejected export configuration writes do not create a sidecar', exportConfigSidecarPath);

  externalExportConfigDir = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-export-config-escape-'));
  await symlink(externalExportConfigDir, exportConfigSidecarDir, 'dir');
  await expectErrorContains(
    'export configuration write refuses an escaping sidecar directory',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: validExportConfig }
    }),
    'Export configuration directory must be a regular app-local directory.'
  );
  await expectMissing(
    'escaping sidecar directory receives no export configuration',
    path.join(externalExportConfigDir, 'export-config.json')
  );
  await rm(exportConfigSidecarDir, { force: true });

  await expectStatus(
    'guarded export configuration write saves the app-local sidecar',
    post('/api/spfx-apps/export-config', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: { appId: exportConfigAppId, exportConfig: validExportConfig }
    }),
    200
  );
  const savedExportConfig = JSON.parse(await readFile(exportConfigSidecarPath, 'utf8'));
  if (JSON.stringify(savedExportConfig) !== JSON.stringify(validExportConfig)) {
    throw new Error(`export configuration sidecar did not match the validated payload: ${JSON.stringify(savedExportConfig)}`);
  }

  await expectStatus(
    'export-output archive path downloads',
    fetchWithTimeout(`${baseUrl}/api/export-spfx-app/archive?path=${encodeURIComponent(archivePath)}`),
    200
  );

  await expectStatus(
    'workspace file outside export output is rejected',
    fetchWithTimeout(`${baseUrl}/api/export-spfx-app/archive?path=${encodeURIComponent(workspaceFilePath)}`),
    500
  );

  await expectStatus(
    'outside archive path is rejected',
    fetchWithTimeout(`${baseUrl}/api/export-spfx-app/archive?path=${encodeURIComponent('/etc/hosts')}`),
    500
  );

  externalManagedAppDir = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-vite-fs-allow-'));
  const externalAssetPath = path.join(externalManagedAppDir, 'runtime-app-asset.txt');
  await Promise.all([
    mkdir(managedAppsDir, { recursive: true }),
    writeFile(path.join(externalManagedAppDir, 'package.json'), '{"name":"runtime-fs-allow-fixture"}\n'),
    writeFile(externalAssetPath, 'runtime-app-asset\n')
  ]);
  await symlink(externalManagedAppDir, managedAppLinkPath, 'dir');
  const externalAssetUrl = `${baseUrl}/@fs/${encodeURI(await realpath(externalAssetPath))}`;

  await expectStatus('runtime managed app asset is blocked before registry sync', fetchWithTimeout(externalAssetUrl), 403);
  await expectStatus(
    'same-origin registry sync refreshes Vite managed app roots',
    post('/api/spfx-apps/sync', {
      origin: baseUrl,
      intent: true,
      contentType: 'application/json',
      body: {}
    }),
    200
  );
  await expectStatus('runtime managed app asset is served after registry sync', fetchWithTimeout(externalAssetUrl), 200);

  console.log('lab API security validation passed');
} finally {
  await stopLabServer(server);
  await rm(managedAppLinkPath, { force: true });
  if (externalManagedAppDir) {
    await rm(externalManagedAppDir, { recursive: true, force: true });
  }
  if (externalExportConfigDir) {
    await rm(externalExportConfigDir, { recursive: true, force: true });
  }
  await rm(exportConfigAppDir, { recursive: true, force: true });
  await rm(validationDir, { recursive: true, force: true });
  await rm(exportsValidationDir, { recursive: true, force: true });
  await runCommand('npm', ['run', 'sync:lab']);
}

function post(route, options) {
  return fetchWithTimeout(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      Origin: options.origin,
      ...(options.intent ? { 'X-SPFX-KIT-Lab-Intent': 'same-origin' } : {}),
      'Content-Type': options.contentType
    },
    body: JSON.stringify(options.body)
  });
}

function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
}

async function expectStatus(label, responsePromise, expectedStatus) {
  const response = await responsePromise;
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, received ${response.status}: ${await response.text()}`);
  }
}

async function expectErrorContains(label, responsePromise, expectedMessage) {
  const response = await responsePromise;
  const body = await response.text();
  if (response.status !== 500 || !body.includes(expectedMessage)) {
    throw new Error(`${label}: expected 500 containing ${JSON.stringify(expectedMessage)}, received ${response.status}: ${body}`);
  }
}

async function expectMissing(label, filePath) {
  try {
    await readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  throw new Error(`${label}: ${filePath} exists`);
}

async function createExportConfigFixture() {
  await mkdir(path.join(exportConfigAppDir, 'config'), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(exportConfigAppDir, 'package.json'),
      `${JSON.stringify({ name: exportConfigAppId, version: '1.0.0', private: true }, null, 2)}\n`
    ),
    writeFile(
      path.join(exportConfigAppDir, 'config', 'package-solution.json'),
      `${JSON.stringify(
        {
          solution: { name: 'Security Fixture', version: '1.0.0.0', includeClientSideAssets: true },
          paths: { zippedPackage: 'solution/security-fixture.sppkg' }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      path.join(exportConfigAppDir, 'config', 'write-manifests.json'),
      `${JSON.stringify({ cdnBasePath: 'https://cdn.example.test/spfx/security-fixture/' }, null, 2)}\n`
    )
  ]);
}

async function startLabServer() {
  const child = spawn('npm', ['run', '--workspace', '@spfx-kit/lab', 'dev'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SPFX_LAB_HOST: host,
      SPFX_LAB_PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      output += `\nlab server exited with ${code}`;
    }
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(output || `lab server exited with ${child.exitCode}`);
    }
    try {
      const response = await fetchWithTimeout(baseUrl);
      if (response.ok) {
        return child;
      }
    } catch {
      // Keep waiting until the lab server is ready or the deadline expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await stopLabServer(child);
  throw new Error(`Timed out waiting for lab server:\n${output}`);
}

async function stopLabServer(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }

  // Negative-PID kill targets the whole detached process group (npm + vite).
  // On Windows this throws and the fallback only kills the direct npm child,
  // which can orphan grandchildren; this script targets Linux CI/cloud only.
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && child.exitCode === null && !child.signalCode) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (child.exitCode === null && !child.signalCode) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${code}:\n${output}`));
    });
  });
}
