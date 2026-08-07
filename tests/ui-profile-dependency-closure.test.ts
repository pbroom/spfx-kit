import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifier = path.join(repositoryRoot, 'packages/ui-profile/scripts/verify-dependency-closure.mjs');

function runVerifier(environment: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [verifier], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment }
  });
}

describe('UI profile dependency closure', () => {
  it('accepts the dev-only workspace being absent from the production npm tree', () => {
    const result = runVerifier();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified production dependency closure');
  });

  it('fails closed when npm does not apply the strict peer-resolution override', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(fakeNpm, 'console.log("true")\n');

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Effective npm config legacy-peer-deps must be false');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
