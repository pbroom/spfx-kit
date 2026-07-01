import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const host = '127.0.0.1';
const port = Number(process.env.SPFX_LAB_SECURITY_TEST_PORT || 53173);
const baseUrl = `http://${host}:${port}`;
const validationDir = path.join(repoRoot, '.tmp-lab-security-validation');
const archivePath = path.join(validationDir, 'sample-export.tar.gz');

let server;

try {
  await mkdir(validationDir, { recursive: true });
  await writeFile(archivePath, 'archive-bytes\n');
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
    fetch(`${baseUrl}/api/export-spfx-app`, {
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

  await expectStatus(
    'workspace archive path downloads',
    fetch(`${baseUrl}/api/export-spfx-app/archive?path=${encodeURIComponent(archivePath)}`),
    200
  );

  await expectStatus(
    'outside archive path is rejected',
    fetch(`${baseUrl}/api/export-spfx-app/archive?path=${encodeURIComponent('/etc/hosts')}`),
    500
  );

  console.log('lab API security validation passed');
} finally {
  if (server) {
    server.kill('SIGTERM');
  }
  await rm(validationDir, { recursive: true, force: true });
}

function post(route, options) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      Origin: options.origin,
      ...(options.intent ? { 'X-SPFX-KIT-Lab-Intent': 'same-origin' } : {}),
      'Content-Type': options.contentType
    },
    body: JSON.stringify(options.body)
  });
}

async function expectStatus(label, responsePromise, expectedStatus) {
  const response = await responsePromise;
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, received ${response.status}: ${await response.text()}`);
  }
}

async function startLabServer() {
  const child = spawn('npm', ['run', '--workspace', '@spfx-kit/lab', 'dev'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SPFX_LAB_HOST: host,
      SPFX_LAB_PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
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
      const response = await fetch(baseUrl);
      if (response.ok) {
        return child;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for lab server:\n${output}`);
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
