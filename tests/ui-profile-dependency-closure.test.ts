import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifier = path.join(repositoryRoot, 'packages/ui-profile/scripts/verify-dependency-closure.mjs');

function runVerifier(environment: NodeJS.ProcessEnv = {}, arguments_: string[] = []) {
  return spawnSync(process.execPath, [verifier, ...arguments_], {
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

  it('fails closed when the unfiltered production tree contains a nested extraneous package', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(
      fakeNpm,
      'if (process.argv.includes("config")) console.log("false"); else if (process.argv.includes("clsx")) console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: {} } } })); else console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: { clsx: { version: "2.1.1", dependencies: { "profile-evil": { version: "1.0.0", extraneous: true } } } } } } }))\n'
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('clsx > profile-evil: extraneous');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails closed on top-level unfiltered npm problems and direct workspace extraneous packages', () => {
    for (const tree of [
      {
        problems: ['extraneous: profile-evil'],
        dependencies: { '@spfx-kit/ui-profile': { version: '0.0.0', dependencies: {} } }
      },
      {
        dependencies: {
          '@spfx-kit/ui-profile': {
            version: '0.0.0',
            dependencies: { 'profile-evil': { version: '1.0.0', extraneous: true } }
          }
        }
      }
    ]) {
      const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
      const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
      writeFileSync(
        fakeNpm,
        `if (process.argv.includes("config")) console.log("false"); else console.log(${JSON.stringify(JSON.stringify(tree))})\n`
      );

      try {
        const result = runVerifier({ npm_execpath: fakeNpm });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('profile-evil');
      } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
  });

  it('fails closed when npm exits nonzero with a valid JSON tree and no reported problem', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-fake-npm-'));
    const fakeNpm = path.join(temporaryDirectory, 'fake-npm.mjs');
    writeFileSync(
      fakeNpm,
      'if (process.argv.includes("config")) console.log("false"); else { console.log(JSON.stringify({ dependencies: { "@spfx-kit/ui-profile": { version: "0.0.0", dependencies: {} } } })); process.exitCode = 1 }\n'
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('npm dependency tree problems');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('binds physical manifests to the checkout selected by --lockfile', () => {
    const temporaryRepository = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-selected-lockfile-'));
    const temporaryProfile = path.join(temporaryRepository, 'packages', 'ui-profile');
    const fakeNpm = path.join(temporaryRepository, 'fake-npm.mjs');
    const closure = JSON.parse(readFileSync(path.join(repositoryRoot, 'packages/ui-profile/dependency-closure.json'), 'utf8'));
    const accepted = new Map(closure.packages.map((entry: any) => [entry.name, entry]));
    const installedRoots = Object.fromEntries(
      closure.productionRoots.map((name: string) => {
        const entry: any = accepted.get(name);
        return [
          name,
          {
            version: entry.version,
            dependencies: Object.fromEntries(
              Object.keys(entry.dependencies).map((dependency) => [
                dependency,
                { version: (accepted.get(dependency) as any).version }
              ])
            )
          }
        ];
      })
    );
    mkdirSync(temporaryProfile, { recursive: true });
    copyFileSync(path.join(repositoryRoot, 'package.json'), path.join(temporaryRepository, 'package.json'));
    copyFileSync(path.join(repositoryRoot, 'package-lock.json'), path.join(temporaryRepository, 'package-lock.json'));
    copyFileSync(path.join(repositoryRoot, 'packages/ui-profile/package.json'), path.join(temporaryProfile, 'package.json'));
    writeFileSync(
      fakeNpm,
      `if (process.argv.includes("config")) console.log("false"); else console.log(${JSON.stringify(
        JSON.stringify({ dependencies: { '@spfx-kit/ui-profile': { version: '0.0.0', dependencies: installedRoots } } })
      )})\n`
    );

    try {
      const result = runVerifier({ npm_execpath: fakeNpm }, ['--lockfile', path.join(temporaryRepository, 'package-lock.json')]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Selected lockfile checkout does not contain a bound node_modules root');

      const renamedManifest = JSON.parse(readFileSync(path.join(temporaryProfile, 'package.json'), 'utf8'));
      renamedManifest.name = '@spfx-kit/renamed-profile';
      writeFileSync(path.join(temporaryProfile, 'package.json'), `${JSON.stringify(renamedManifest)}\n`);
      const renamed = runVerifier({ npm_execpath: fakeNpm }, ['--lockfile', path.join(temporaryRepository, 'package-lock.json')]);
      expect(renamed.status).not.toBe(0);
      expect(renamed.stderr).toContain('Selected UI profile identity differs');
    } finally {
      rmSync(temporaryRepository, { recursive: true, force: true });
    }
  });

  it('rejects a selected lockfile symlink before reading another checkout', () => {
    const temporaryRepository = mkdtempSync(path.join(os.tmpdir(), 'spfx-kit-symlinked-lockfile-'));
    const temporaryProfile = path.join(temporaryRepository, 'packages', 'ui-profile');
    mkdirSync(temporaryProfile, { recursive: true });
    copyFileSync(path.join(repositoryRoot, 'package.json'), path.join(temporaryRepository, 'package.json'));
    copyFileSync(path.join(repositoryRoot, 'packages/ui-profile/package.json'), path.join(temporaryProfile, 'package.json'));
    symlinkSync(path.join(repositoryRoot, 'package-lock.json'), path.join(temporaryRepository, 'package-lock.json'));

    try {
      const result = runVerifier({}, ['--lockfile', path.join(temporaryRepository, 'package-lock.json')]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Selected lockfile is not a regular file');
    } finally {
      rmSync(temporaryRepository, { recursive: true, force: true });
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
