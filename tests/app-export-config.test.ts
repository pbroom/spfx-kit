import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  describeManagedAppExportConfig,
  updateManagedAppExportConfig,
  validateExportConfig
} from '../apps/lab/server/app-export-config';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('managed app export configuration', () => {
  it('reads defaults from the SPFx package, solution, CDN, and primary web part manifest', async () => {
    const appDir = await createFixture();

    await expect(describeManagedAppExportConfig(appDir)).resolves.toEqual({
      appName: 'Fixture App',
      fileName: 'fixture-app.sppkg',
      description: 'Fixture web part description',
      appIcon: 'FixtureIcon',
      version: '1.2.3',
      cdnUrl: 'https://cdn.example.test/spfx/fixture/'
    });
  });

  it('atomically saves an ignored sidecar overlay without modifying tracked SPFx JSON', async () => {
    const appDir = await createFixture();
    const solutionPath = path.join(appDir, 'config', 'package-solution.json');
    const sourceBefore = await readFile(solutionPath, 'utf8');
    const sidecarDir = path.join(appDir, '.spfx-kit');
    await mkdir(sidecarDir, { recursive: true });
    await writeJson(path.join(sidecarDir, 'export-config.json'), {
      appName: 'Old name',
      futureSetting: { preserve: true }
    });

    const saved = await updateManagedAppExportConfig(appDir, {
      appName: 'Deployment App',
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/'
    });

    expect(saved).toEqual({
      appName: 'Deployment App',
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/'
    });
    await expect(describeManagedAppExportConfig(appDir)).resolves.toEqual(saved);
    expect(JSON.parse(await readFile(path.join(sidecarDir, 'export-config.json'), 'utf8'))).toEqual({
      appName: 'Deployment App',
      futureSetting: { preserve: true },
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/'
    });
    expect(await readFile(solutionPath, 'utf8')).toBe(sourceBefore);
  });

  it('rejects unsafe filenames, invalid versions, and non-production CDN URLs', () => {
    const valid = {
      appName: 'Fixture App',
      fileName: 'fixture.sppkg',
      description: '',
      appIcon: 'Page',
      version: '1.2.3',
      cdnUrl: 'https://cdn.example.test/spfx/fixture/'
    };

    expect(() => validateExportConfig({ ...valid, fileName: '../fixture.sppkg' })).toThrow('directory path');
    expect(() => validateExportConfig({ ...valid, version: '1.2.3.4' })).toThrow('x.y.z');
    expect(() => validateExportConfig({ ...valid, cdnUrl: 'javascript:alert(1)' })).toThrow('HTTPS');
    expect(() => validateExportConfig({ ...valid, cdnUrl: 'http://cdn.example.test/spfx/' })).toThrow('HTTPS');
    expect(() => validateExportConfig({ ...valid, cdnUrl: 'https://localhost/spfx/' })).toThrow('non-localhost');
  });

  it('refuses to follow an app-local configuration directory outside the managed app', async () => {
    const appDir = await createFixture();
    const outsideDir = await makeTemporaryDirectory('spfx-export-config-outside-');
    await symlink(outsideDir, path.join(appDir, '.spfx-kit'), 'dir');

    await expect(
      updateManagedAppExportConfig(appDir, {
        appName: 'Fixture App',
        fileName: 'fixture.sppkg',
        description: '',
        appIcon: 'Page',
        version: '1.2.3',
        cdnUrl: ''
      })
    ).rejects.toThrow('must be a regular app-local directory');
  });
});

async function createFixture(): Promise<string> {
  const appDir = await makeTemporaryDirectory('spfx-export-config-');
  await Promise.all([
    mkdir(path.join(appDir, 'config'), { recursive: true }),
    mkdir(path.join(appDir, 'src', 'webparts', 'fixture'), { recursive: true })
  ]);
  await Promise.all([
    writeJson(path.join(appDir, 'package.json'), {
      name: '@fixture/fixture-app-spfx',
      version: '1.2.3',
      private: true
    }),
    writeJson(path.join(appDir, 'config', 'package-solution.json'), {
      $schema: 'preserved-schema',
      solution: {
        name: 'Fixture App',
        version: '1.2.3.0',
        includeClientSideAssets: true
      },
      paths: { zippedPackage: 'solution/fixture-app.sppkg' }
    }),
    writeJson(path.join(appDir, 'config', 'write-manifests.json'), {
      cdnBasePath: 'https://cdn.example.test/spfx/fixture/'
    }),
    writeJson(path.join(appDir, 'src', 'webparts', 'fixture', 'Fixture.manifest.json'), {
      componentType: 'WebPart',
      preconfiguredEntries: [
        {
          title: { default: 'Fixture web part' },
          description: { default: 'Fixture web part description' },
          officeFabricIconFontName: 'FixtureIcon'
        }
      ]
    })
  ]);
  return appDir;
}

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
