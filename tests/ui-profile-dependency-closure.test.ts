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
  it('validates the production closure held in the dev-only workspace', () => {
    const result = runVerifier();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified production dependency closure');
  });

  it('fails closed when npm omits the dev-held production roots', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(
      fakeNpm,
      'if (process.argv.includes("config")) console.log("false"); else console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: {} } } }))\n'
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Installed npm tree omits production root @base-ui/react');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails closed when npm reports the accepted versions without their installed dependency edges', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(
      fakeNpm,
      'import { readFileSync } from "node:fs"; const closure = JSON.parse(readFileSync("packages/ui-profile/dependency-closure.json", "utf8")); if (process.argv.includes("config")) console.log("false"); else console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: Object.fromEntries(closure.packages.map(({ name, version }) => [name, { version, dependencies: {} }])) } } }))\n'
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        '@base-ui/react: installed dependency edge @babel/runtime differs from the accepted closure'
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails closed when npm links a production root outside the bound install tree', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(
      fakeNpm,
      'if (process.argv.includes("config")) console.log("false"); else console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: { "@base-ui/react": { version: "1.6.0", link: true } } } } }))\n'
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Installed npm tree links production root @base-ui/react');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
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
