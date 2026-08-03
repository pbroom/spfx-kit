import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyPortableSpfxSource } from '../packages/spfx-tools/src/lib/fs.mjs';
import { withAppliedExportConfig } from '../packages/spfx-tools/src/lib/export/config.mjs';
import { exportCdnPackage } from '../packages/spfx-tools/src/lib/export/targets.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('export configuration application', () => {
  it('preserves the legacy two-file mutation boundary when no sidecar exists', async () => {
    const root = await makeTemporaryDirectory('spfx-export-config-legacy-');
    const appDir = path.join(root, 'legacy-app-spfx');
    const packageJsonPath = path.join(appDir, 'package.json');
    const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
    const writeManifestsPath = path.join(appDir, 'config', 'write-manifests.json');
    await mkdir(path.dirname(packageSolutionPath), { recursive: true });
    await Promise.all([
      writeJson(packageJsonPath, { name: 'legacy-app-spfx', version: '1.0.0' }),
      writeJson(packageSolutionPath, { solution: { includeClientSideAssets: true } }),
      writeJson(writeManifestsPath, { cdnBasePath: 'https://cdn.legacy.test/app/' })
    ]);
    const originalSolution = await readFile(packageSolutionPath, 'utf8');
    const originalWriteManifests = await readFile(writeManifestsPath, 'utf8');

    await expect(
      withAppliedExportConfig(appDir, async ({ exportConfig }) => {
        expect(exportConfig).toBeUndefined();
        await Promise.all([
          writeJson(packageSolutionPath, { solution: { includeClientSideAssets: false } }),
          writeJson(writeManifestsPath, { cdnBasePath: 'https://temporary.test/' })
        ]);
        throw new Error('legacy target failed');
      })
    ).rejects.toThrow('legacy target failed');

    await expect(readFile(packageSolutionPath, 'utf8')).resolves.toBe(originalSolution);
    await expect(readFile(writeManifestsPath, 'utf8')).resolves.toBe(originalWriteManifests);
    await expect(readJson(packageJsonPath)).resolves.toEqual({ name: 'legacy-app-spfx', version: '1.0.0' });
  });

  it('maps the sidecar into SPFx source, resets target mutations, copies overrides, and restores on failure', async () => {
    const fixture = await createFixture();
    const originals = await readTrackedSource(fixture);
    const portableDir = path.join(fixture.root, 'portable-copy');

    await expect(
      withAppliedExportConfig(fixture.appDir, async ({ exportConfig, restoreAppliedSource }) => {
        expect(exportConfig).toEqual(configuredOverrides);
        await expect(readJson(fixture.packageJsonPath)).resolves.toMatchObject({
          name: '@fixture/original-app-spfx',
          version: '2.4.6',
          description: 'Configured export description'
        });
        await expect(readJson(fixture.packageSolutionPath)).resolves.toMatchObject({
          untouched: { keep: true },
          solution: {
            name: 'Configured Export App',
            version: '2.4.6.0',
            includeClientSideAssets: true,
            features: [{ title: 'Original feature', version: '2.4.6.0', description: 'Configured export description' }]
          },
          paths: { zippedPackage: 'sharepoint/solution/configured-export.sppkg' }
        });
        await expect(readJson(fixture.writeManifestsPath)).resolves.toEqual({
          cdnBasePath: 'https://cdn.configured.test/apps/export/',
          untouched: true
        });
        await expect(readJson(fixture.primaryManifestPath)).resolves.toMatchObject({
          preconfiguredEntries: [
            {
              title: { default: 'Configured Export App', fr: 'Titre original' },
              description: { default: 'Configured export description', fr: 'Description originale' },
              iconImageUrl: 'https://cdn.configured.test/icons/app.png'
            }
          ]
        });
        expect((await readJson(fixture.primaryManifestPath)).preconfiguredEntries[0]).not.toHaveProperty(
          'officeFabricIconFontName'
        );
        await expect(readFile(fixture.secondaryManifestPath, 'utf8')).resolves.toBe(originals.secondaryManifest);

        const targetMutation = await readJson(fixture.packageSolutionPath);
        targetMutation.solution.includeClientSideAssets = false;
        await writeJson(fixture.packageSolutionPath, targetMutation);
        await restoreAppliedSource();
        await expect(readJson(fixture.packageSolutionPath)).resolves.toMatchObject({
          solution: { name: 'Configured Export App', version: '2.4.6.0', includeClientSideAssets: true }
        });

        await copyPortableSpfxSource(fixture.appDir, portableDir);
        await expect(readJson(path.join(portableDir, 'package.json'))).resolves.toMatchObject({
          version: '2.4.6',
          description: 'Configured export description'
        });
        await expect(readJson(path.join(portableDir, 'config', 'package-solution.json'))).resolves.toMatchObject({
          solution: { name: 'Configured Export App', version: '2.4.6.0' },
          paths: { zippedPackage: 'sharepoint/solution/configured-export.sppkg' }
        });
        await expect(readJson(path.join(portableDir, 'config', 'write-manifests.json'))).resolves.toMatchObject({
          cdnBasePath: 'https://cdn.configured.test/apps/export/'
        });

        throw new Error('simulated export failure');
      })
    ).rejects.toThrow('simulated export failure');

    await expect(readTrackedSource(fixture)).resolves.toEqual(originals);
  });

  it('applies and restores sidecar overrides for extension-only projects', async () => {
    const root = await makeTemporaryDirectory('spfx-export-config-extension-');
    const appDir = path.join(root, 'extension-app-spfx');
    const packageJsonPath = path.join(appDir, 'package.json');
    const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
    const writeManifestsPath = path.join(appDir, 'config', 'write-manifests.json');
    await Promise.all([
      mkdir(path.dirname(packageSolutionPath), { recursive: true }),
      mkdir(path.join(appDir, '.spfx-kit'), { recursive: true })
    ]);
    await Promise.all([
      writeJson(packageJsonPath, { name: 'extension-app-spfx', version: '1.0.0', description: 'Original description' }),
      writeJson(packageSolutionPath, {
        solution: { name: 'Original Extension', version: '1.0.0.0' },
        paths: { zippedPackage: 'sharepoint/solution/original-extension.sppkg' }
      }),
      writeJson(writeManifestsPath, { cdnBasePath: 'https://cdn.original.test/extension/' }),
      writeJson(path.join(appDir, '.spfx-kit', 'export-config.json'), configuredOverrides)
    ]);
    const originals = await Promise.all([
      readFile(packageJsonPath, 'utf8'),
      readFile(packageSolutionPath, 'utf8'),
      readFile(writeManifestsPath, 'utf8')
    ]);

    await withAppliedExportConfig(appDir, async ({ exportConfig }) => {
      expect(exportConfig).toEqual(configuredOverrides);
      await expect(readJson(packageJsonPath)).resolves.toMatchObject({
        version: '2.4.6',
        description: 'Configured export description'
      });
      await expect(readJson(packageSolutionPath)).resolves.toMatchObject({
        solution: { name: 'Configured Export App', version: '2.4.6.0' },
        paths: { zippedPackage: 'sharepoint/solution/configured-export.sppkg' }
      });
      await expect(readJson(writeManifestsPath)).resolves.toMatchObject({
        cdnBasePath: 'https://cdn.configured.test/apps/export/'
      });
    });

    await expect(
      Promise.all([
        readFile(packageJsonPath, 'utf8'),
        readFile(packageSolutionPath, 'utf8'),
        readFile(writeManifestsPath, 'utf8')
      ])
    ).resolves.toEqual(originals);
  });

  it('uses the configured CDN URL exactly for the CDN build and handoff', async () => {
    const fixture = await createFixture();
    const originals = await readTrackedSource(fixture);
    const outDir = path.join(fixture.root, 'export-output');
    const buildDir = path.join(fixture.root, 'fake-build');
    const packageFile = path.join(buildDir, 'configured-export.sppkg');
    const releaseAssetsDir = path.join(buildDir, 'release-assets');
    const releaseManifestDir = path.join(buildDir, 'release-manifests');
    const deployAssetsDir = path.join(buildDir, 'deploy-assets');
    const seenCdnUrls: string[] = [];
    await mkdir(releaseAssetsDir, { recursive: true });
    await Promise.all([
      writeFile(packageFile, 'fixture package'),
      writeFile(path.join(releaseAssetsDir, 'bundle.js'), 'fixture bundle')
    ]);

    await withAppliedExportConfig(fixture.appDir, async ({ exportConfig }) => {
      const target = await exportCdnPackage(fixture.appDir, outDir, 'fixture-app-spfx', {
        cdnBasePath: exportConfig?.cdnUrl,
        build: async (appDir: string, cdnBasePath: string) => {
          seenCdnUrls.push(cdnBasePath);
          expect(appDir).toBe(fixture.appDir);
          await expect(readJson(fixture.writeManifestsPath)).resolves.toMatchObject({ cdnBasePath });
          return { packageFile, releaseAssetsDir, releaseManifestDir, deployAssetsDir };
        }
      });

      expect(target.id).toBe('cdn');
      await expect(readFile(path.join(outDir, 'cdn', 'README.md'), 'utf8')).resolves.toContain(
        'https://cdn.configured.test/apps/export/'
      );
      await expect(readFile(path.join(outDir, 'cdn', 'cdn-handoff', 'README.md'), 'utf8')).resolves.toContain(
        'https://cdn.configured.test/apps/export/'
      );
    });

    expect(seenCdnUrls).toEqual(['https://cdn.configured.test/apps/export/']);
    await expect(readTrackedSource(fixture)).resolves.toEqual(originals);
  });
});

const configuredOverrides = {
  appName: 'Configured Export App',
  fileName: 'configured-export.sppkg',
  description: 'Configured export description',
  appIcon: 'https://cdn.configured.test/icons/app.png',
  version: '2.4.6',
  cdnUrl: 'https://cdn.configured.test/apps/export/'
};

async function createFixture() {
  const root = await makeTemporaryDirectory('spfx-export-config-application-');
  const appDir = path.join(root, 'fixture-app-spfx');
  const packageJsonPath = path.join(appDir, 'package.json');
  const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
  const writeManifestsPath = path.join(appDir, 'config', 'write-manifests.json');
  const primaryManifestPath = path.join(appDir, 'src', 'webparts', 'alpha', 'Alpha.manifest.json');
  const secondaryManifestPath = path.join(appDir, 'src', 'webparts', 'zeta', 'Zeta.manifest.json');
  await Promise.all([
    mkdir(path.dirname(packageSolutionPath), { recursive: true }),
    mkdir(path.dirname(primaryManifestPath), { recursive: true }),
    mkdir(path.dirname(secondaryManifestPath), { recursive: true }),
    mkdir(path.join(appDir, '.spfx-kit'), { recursive: true })
  ]);
  await Promise.all([
    writeFile(
      packageJsonPath,
      '{\n  "name": "@fixture/original-app-spfx",\n  "version": "1.2.3",\n  "description": "Original package description",\n  "private": true\n}\n'
    ),
    writeJson(packageSolutionPath, {
      untouched: { keep: true },
      solution: {
        name: 'Original App',
        version: '1.2.3.0',
        includeClientSideAssets: true,
        features: [{ title: 'Original feature', version: '1.2.3.0', description: 'Original feature description' }]
      },
      paths: { zippedPackage: 'sharepoint/solution/original-app.sppkg' }
    }),
    writeJson(writeManifestsPath, { cdnBasePath: 'https://cdn.original.test/app/', untouched: true }),
    writeJson(primaryManifestPath, {
      componentType: 'WebPart',
      preconfiguredEntries: [
        {
          title: { default: 'Original web part', fr: 'Titre original' },
          description: { default: 'Original manifest description', fr: 'Description originale' },
          officeFabricIconFontName: 'Page'
        }
      ]
    }),
    writeJson(secondaryManifestPath, {
      componentType: 'WebPart',
      preconfiguredEntries: [{ title: { default: 'Secondary web part' } }]
    }),
    writeJson(path.join(appDir, '.spfx-kit', 'export-config.json'), configuredOverrides)
  ]);
  return {
    root,
    appDir,
    packageJsonPath,
    packageSolutionPath,
    writeManifestsPath,
    primaryManifestPath,
    secondaryManifestPath
  };
}

async function readTrackedSource(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const [packageJson, packageSolution, writeManifests, primaryManifest, secondaryManifest] = await Promise.all([
    readFile(fixture.packageJsonPath, 'utf8'),
    readFile(fixture.packageSolutionPath, 'utf8'),
    readFile(fixture.writeManifestsPath, 'utf8'),
    readFile(fixture.primaryManifestPath, 'utf8'),
    readFile(fixture.secondaryManifestPath, 'utf8')
  ]);
  return { packageJson, packageSolution, writeManifests, primaryManifest, secondaryManifest };
}

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
