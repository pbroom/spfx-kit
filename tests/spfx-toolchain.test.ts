import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { readSpfxSummary } from '../packages/spfx-tools/src/lib/spfx.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { detectSpfxToolchain, requiredSpfxFiles } from '../packages/spfx-tools/src/lib/spfx-toolchain.mjs';

const temporaryDirectories: string[] = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validateCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/validate-spfx-app.mjs');

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SPFx toolchain model', () => {
  it('detects Gulp and Heft packages without depending on their location', () => {
    expect(detectSpfxToolchain({ devDependencies: { '@microsoft/sp-build-web': '1.21.1' } })).toBe('gulp');
    expect(detectSpfxToolchain({ devDependencies: { '@microsoft/spfx-web-build-rig': '1.23.2' } })).toBe('heft');
    expect(detectSpfxToolchain({ devDependencies: { '@microsoft/spfx-heft-plugins': '1.23.2' } })).toBe('heft');
    expect(detectSpfxToolchain({ devDependencies: {} })).toBe('unknown');
    expect(
      detectSpfxToolchain({
        devDependencies: {
          '@microsoft/sp-build-web': '1.21.1',
          '@microsoft/spfx-web-build-rig': '1.23.2'
        }
      })
    ).toBe('ambiguous');
  });

  it('returns toolchain-specific required files', () => {
    expect(requiredSpfxFiles('gulp')).toContain('gulpfile.js');
    expect(requiredSpfxFiles('gulp')).toContain('config/config.json');
    expect(requiredSpfxFiles('gulp')).not.toContain('config/rig.json');
    expect(requiredSpfxFiles('heft')).toContain('config/rig.json');
    expect(requiredSpfxFiles('heft')).toContain('config/typescript.json');
    expect(requiredSpfxFiles('heft')).toContain('config/config.json');
    expect(requiredSpfxFiles('heft')).not.toContain('gulpfile.js');
    expect(requiredSpfxFiles('ambiguous')).toContain('gulpfile.js');
    expect(requiredSpfxFiles('ambiguous')).toContain('config/rig.json');
    expect(requiredSpfxFiles('ambiguous')).toContain('config/typescript.json');
  });

  it('summarizes a Heft app without Yeoman metadata', async () => {
    const appDir = await createMinimalApp({
      name: 'heft-app',
      engines: { node: '>=22.14.0 <23.0.0' },
      dependencies: { '@microsoft/sp-core-library': '1.23.2' },
      devDependencies: { '@microsoft/spfx-web-build-rig': '1.23.2' }
    });

    await expect(readSpfxSummary(appDir)).resolves.toMatchObject({
      originalPackageName: 'heft-app',
      spfxVersion: '1.23.2',
      toolchain: 'heft',
      nodeRange: '>=22.14.0 <23.0.0',
      solutionId: 'solution-id',
      componentIds: ['component-id']
    });
  });

  it('validates a Heft app without requiring legacy Gulp files', async () => {
    const appDir = await createMinimalApp({
      name: '@spfx-kit/heft-app',
      engines: { node: '>=22.14.0 <23.0.0' },
      dependencies: { '@microsoft/sp-core-library': '1.23.2' },
      devDependencies: { '@microsoft/spfx-web-build-rig': '1.23.2' }
    });
    await writeFixtureFile(appDir, 'config/serve.json', {});
    await writeFixtureFile(appDir, 'config/config.json', {});
    await writeFixtureFile(appDir, 'config/write-manifests.json', {
      cdnBasePath: 'https://cdn.example.com/spfx/heft-app/'
    });
    await writeFixtureFile(appDir, 'config/rig.json', {
      rigPackageName: '@microsoft/spfx-web-build-rig'
    });
    await writeFixtureFile(appDir, 'config/typescript.json', {});
    await writeFixtureFile(appDir, 'tsconfig.json', {});
    await writeFixtureFile(appDir, '.spfx-kit/lab/register.tsx', {});

    const result = spawnSync(process.execPath, [validateCli, '--app', appDir, '--profile', 'lab'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Toolchain: heft');
  });
});

async function createMinimalApp(packageJson: Record<string, unknown>) {
  const appDir = await mkdtemp(path.join(tmpdir(), 'spfx-toolchain-'));
  temporaryDirectories.push(appDir);
  await mkdir(path.join(appDir, 'config'), { recursive: true });
  await mkdir(path.join(appDir, 'src', 'webparts', 'example'), { recursive: true });
  await writeFile(path.join(appDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(
    path.join(appDir, 'config', 'package-solution.json'),
    `${JSON.stringify({ solution: { id: 'solution-id', includeClientSideAssets: false } }, null, 2)}\n`
  );
  await writeFile(
    path.join(appDir, 'src', 'webparts', 'example', 'Example.manifest.json'),
    `${JSON.stringify({ id: 'component-id' }, null, 2)}\n`
  );
  return appDir;
}

async function writeFixtureFile(appDir: string, relativePath: string, contents: unknown) {
  const file = path.join(appDir, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const value = typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`;
  await writeFile(file, value);
}
