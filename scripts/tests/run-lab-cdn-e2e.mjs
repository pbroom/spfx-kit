import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const exportsRoot = path.join(workspaceRoot, '.spfx-kit', 'e2e-cdn-exports');
const hiddenExportsRoot = `${exportsRoot}-hidden`;
const exportDir = path.join(exportsRoot, 'hello-card-spfx', 'browser-e2e');
const appDir = path.join(workspaceRoot, 'examples', 'hello-card-spfx');
const exportCli = path.join(workspaceRoot, 'packages', 'spfx-tools', 'src', 'cli', 'export-spfx-app.mjs');

await cleanupTestExports();

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
    'https://staging-cdn.contoso.test/spfx-kit-browser-e2e',
    '--cdn-release',
    'browser-e2e.1',
    '--json'
  ]);
  await run('npx', ['playwright', 'test'], {
    ...process.env,
    SPFX_KIT_E2E_REAL_CDN: '1',
    SPFX_KIT_E2E_FRESH_SERVER: '1',
    SPFX_KIT_LAB_EXPORTS_DIR: exportsRoot
  });
} finally {
  await cleanupTestExports();
}

async function cleanupTestExports() {
  await Promise.all([rm(exportsRoot, { recursive: true, force: true }), rm(hiddenExportsRoot, { recursive: true, force: true })]);
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env,
      stdio: 'inherit'
    });
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
