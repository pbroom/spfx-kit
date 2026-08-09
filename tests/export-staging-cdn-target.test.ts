import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import { assembleStagingCdnPackage, buildExternalAssetsPackage } from '../packages/spfx-tools/src/lib/export/targets.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('external-assets export target', () => {
  it('owns shared CDN configuration, cleanup, build, and output discovery', async () => {
    const appDir = await temporaryDirectory();
    const cdnBasePath = 'https://staging.contoso.test/spfx/team/versions/1.2.3-build/';
    await writeJson(path.join(appDir, 'config', 'package-solution.json'), {
      paths: { zippedPackage: 'solution/team.sppkg' },
      solution: { includeClientSideAssets: true }
    });
    await writeJson(path.join(appDir, 'config', 'write-manifests.json'), { cdnBasePath: 'https://old.test/' });
    const staleAsset = path.join(appDir, 'release', 'assets', 'stale.js');
    await mkdir(path.dirname(staleAsset), { recursive: true });
    await writeFile(staleAsset, 'stale');

    const build = await buildExternalAssetsPackage(appDir, cdnBasePath, {
      clearGeneratedOutputs: true,
      ship: async () => {
        await expect(readJson(path.join(appDir, 'config', 'package-solution.json'))).resolves.toMatchObject({
          solution: { includeClientSideAssets: false }
        });
        await expect(readJson(path.join(appDir, 'config', 'write-manifests.json'))).resolves.toEqual({ cdnBasePath });
        await expect(access(staleAsset)).rejects.toMatchObject({ code: 'ENOENT' });
        await writePackage(path.join(appDir, 'sharepoint', 'solution', 'team.sppkg'));
      }
    });

    expect(build).toEqual({
      packageFile: path.join(appDir, 'sharepoint', 'solution', 'team.sppkg'),
      releaseAssetsDir: path.join(appDir, 'release', 'assets'),
      releaseManifestDir: path.join(appDir, 'release', 'manifests'),
      deployAssetsDir: path.join(appDir, 'temp', 'deploy')
    });
  });

  it('materializes the exact UI profile artifact before external closure verification', async () => {
    const appDir = await temporaryDirectory();
    const profileRoot = path.join(appDir, 'ui-profile');
    const profilePath = path.join(profileRoot, 'profile.json');
    const cssPath = path.join(profileRoot, 'profile.css');
    const cssBytes = Buffer.from('[data-spfx-ui-scope="fixture"]{display:block}');
    const cssSha256 = createHash('sha256').update(cssBytes).digest('hex');
    const deliveryPath = `spfx-ui-profile/${cssSha256}.css`;
    await Promise.all([
      writeJson(path.join(appDir, 'config', 'package-solution.json'), {
        paths: { zippedPackage: 'solution/team.sppkg' },
        solution: { includeClientSideAssets: true }
      }),
      writeJson(path.join(appDir, 'config', 'write-manifests.json'), { cdnBasePath: 'https://old.test/' }),
      writeJson(profilePath, {}),
      writeFileWithParents(cssPath, cssBytes)
    ]);
    const closure = {
      descriptorSha256: 'a'.repeat(64),
      profilePath,
      descriptor: {
        css: { path: 'profile.css', deliveryPath, sha256: cssSha256, assets: [] }
      }
    };

    const build = await buildExternalAssetsPackage(appDir, 'https://staging.contoso.test/ui/', {
      ship: async () => writePackage(path.join(appDir, 'sharepoint', 'solution', 'team.sppkg')),
      uiProfileClosure: closure
    });

    await expect(readFile(path.join(build.releaseAssetsDir, deliveryPath))).resolves.toEqual(cssBytes);
    expect(build.uiProfileDelivery).toMatchObject({
      descriptorSha256: closure.descriptorSha256,
      mode: 'external',
      status: 'passed'
    });
  });

  it('assembles and validates the real staging target from one build result', async () => {
    const sourceDir = await temporaryDirectory();
    const outDir = await temporaryDirectory();
    const releaseLabel = '1.2.3-rc.4';
    const releaseId = '1.2.3-rc.4-20260731T120000000Z-abc123';
    const cdnBasePath = `https://staging.contoso.test/spfx/team/versions/${releaseId}/`;
    const componentManifest = {
      id: 'component-id',
      loaderConfig: {
        internalModuleBaseUrls: [cdnBasePath],
        entryModuleId: 'main',
        scriptResources: { main: { type: 'path', path: 'main.js' } }
      }
    };
    const build = {
      packageFile: path.join(sourceDir, 'sharepoint', 'solution', 'team.sppkg'),
      releaseAssetsDir: path.join(sourceDir, 'release', 'assets'),
      releaseManifestDir: path.join(sourceDir, 'release', 'manifests'),
      deployAssetsDir: path.join(sourceDir, 'temp', 'deploy')
    };
    await Promise.all([
      writePackage(build.packageFile, componentManifest),
      writeFileWithParents(path.join(build.releaseAssetsDir, 'main.js'), 'main();'),
      writeFileWithParents(path.join(build.deployAssetsDir, 'lazy.js'), 'lazy();'),
      writeJson(path.join(build.releaseManifestDir, 'component.manifest.json'), componentManifest),
      writeFileWithParents(path.join(outDir, 'staging-cdn', 'stale.js'), 'stale')
    ]);

    const target = await assembleStagingCdnPackage(build, outDir, 'team', {
      cdnBasePath,
      releaseId,
      releaseLabel
    });

    expect(target).toMatchObject({
      id: 'staging-cdn',
      releaseLabel,
      releaseId,
      cdnBasePath,
      deploymentManifest: 'deployment-manifest.json',
      proof: {
        localArtifact: 'passed',
        remoteCdn: 'not-run',
        sharePointAppCatalog: 'not-run'
      }
    });
    expect(target.files.map((file: { relativePath: string }) => file.relativePath)).toEqual(
      expect.arrayContaining([
        'README.md',
        'deployment-manifest.json',
        'sharepoint/solution/team.staging.cdn.sppkg',
        'upload/lazy.js',
        'upload/main.js'
      ])
    );
    await expect(access(path.join(outDir, 'staging-cdn', 'stale.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(outDir, 'staging-cdn', 'README.md'), 'utf8')).resolves.toContain(
      `release label \`${releaseLabel}\``
    );
  });

  it('assembles a local mock stage only when the narrow policy is explicit', async () => {
    const sourceDir = await temporaryDirectory();
    const outDir = await temporaryDirectory();
    const releaseLabel = '1.2.3-local.1';
    const releaseId = '1.2.3-local.1-20260804T120000000Z-abc123';
    const cdnBasePath = `http://127.0.0.1:4174/apps/team/versions/${releaseId}/`;
    const componentManifest = {
      id: 'component-id',
      loaderConfig: {
        internalModuleBaseUrls: [cdnBasePath],
        entryModuleId: 'main',
        scriptResources: { main: { type: 'path', path: 'main.js' } }
      }
    };
    const build = {
      packageFile: path.join(sourceDir, 'sharepoint', 'solution', 'team.sppkg'),
      releaseAssetsDir: path.join(sourceDir, 'release', 'assets'),
      releaseManifestDir: path.join(sourceDir, 'release', 'manifests'),
      deployAssetsDir: path.join(sourceDir, 'temp', 'deploy')
    };
    await Promise.all([
      writePackage(build.packageFile, componentManifest),
      writeFileWithParents(path.join(build.releaseAssetsDir, 'main.js'), 'main();'),
      writeJson(path.join(build.releaseManifestDir, 'component.manifest.json'), componentManifest)
    ]);

    await expect(
      assembleStagingCdnPackage(build, outDir, 'team', {
        cdnBasePath,
        releaseId,
        releaseLabel
      })
    ).rejects.toThrow('credential-free HTTPS');
    await expect(
      assembleStagingCdnPackage(build, outDir, 'team', {
        allowLocalMockCdn: true,
        cdnBasePath,
        releaseId,
        releaseLabel
      })
    ).resolves.toMatchObject({ cdnBasePath, releaseId });
  });
});

async function writePackage(file: string, componentManifest?: object) {
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types />'),
    '_rels/.rels': strToU8('<Relationships />'),
    'AppManifest.xml': strToU8('<App />')
  };
  if (componentManifest) {
    const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    entries['feature/WebPart.xml'] = strToU8(
      `<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`
    );
  }
  await writeFileWithParents(file, zipSync(entries));
}

async function writeJson(file: string, value: object) {
  await writeFileWithParents(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeFileWithParents(file: string, contents: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-export-target-'));
  temporaryDirectories.push(directory);
  return directory;
}
