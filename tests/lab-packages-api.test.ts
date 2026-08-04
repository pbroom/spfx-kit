import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseCdnAssetRoute, readCdnRuntimeAsset, resolveCdnRuntimeDescriptor } from '../apps/lab/server/lab-packages-api';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';

const temporaryDirectories: string[] = [];
const appId = 'fixture-spfx';
const componentId = '0df27fc4-65de-4cd9-9cad-52f0b84e960b';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Lab staging CDN runtime', () => {
  it('fails with actionable guidance when the CDN simulation is not configured', async () => {
    const workspaceRoot = await temporaryDirectory();

    await expect(resolveCdnRuntimeDescriptor(workspaceRoot, appId)).rejects.toThrow(
      'The local staging CDN artifact is missing, invalid, or incomplete. Export a new staging-cdn package and retry.'
    );
  });

  it('describes the real component entry from the latest validated artifact without leaking local paths', async () => {
    const workspaceRoot = await temporaryDirectory();
    await createStage(workspaceRoot, {
      exportId: 'older',
      generatedAt: '2026-08-01T12:00:00.000Z',
      releaseId: '1.0.0-20260801T120000000Z-aaaaaa',
      entryContents: 'older();'
    });
    const latest = await createStage(workspaceRoot, {
      exportId: 'latest',
      generatedAt: '2026-08-02T12:00:00.000Z',
      releaseId: '1.0.1-20260802T120000000Z-bbbbbb',
      entryContents: 'latest();'
    });

    const descriptor = await resolveCdnRuntimeDescriptor(workspaceRoot, appId);

    expect(descriptor).toEqual({
      mode: 'cdn',
      appId,
      releaseId: latest.releaseId,
      generatedAt: latest.generatedAt,
      cdnBasePath: latest.cdnBasePath,
      assetBaseUrl: `/api/lab-packages/cdn-assets/${appId}/${latest.releaseId}/`,
      entryAssetPath: 'main.js',
      entryAssetUrl: `/api/lab-packages/cdn-assets/${appId}/${latest.releaseId}/main.js`,
      dependencyAssets: [
        {
          moduleId: 'helper',
          assetPath: 'helper.js',
          assetUrl: `/api/lab-packages/cdn-assets/${appId}/${latest.releaseId}/helper.js`
        },
        {
          moduleId: 'labels',
          assetPath: 'labels_en-us.js',
          assetUrl: `/api/lab-packages/cdn-assets/${appId}/${latest.releaseId}/labels_en-us.js`
        }
      ],
      packagePath: `sharepoint/solution/${appId}.staging.cdn.sppkg`
    });
    expect(JSON.stringify(descriptor)).not.toContain(workspaceRoot);
  });

  it('serves only manifest-listed bytes for the exact validated release', async () => {
    const workspaceRoot = await temporaryDirectory();
    const stage = await createStage(workspaceRoot, {
      exportId: 'only',
      generatedAt: '2026-08-02T12:00:00.000Z',
      releaseId: '2.0.0-20260802T120000000Z-cccccc',
      entryContents: 'entry();'
    });
    const asset = await readCdnRuntimeAsset(workspaceRoot, appId, stage.releaseId, 'main.js');

    expect(asset.bytes.toString('utf8')).toBe('entry();');
    expect(asset.contentType).toBe('text/javascript; charset=utf-8');
    expect(asset.etag).toMatch(/^"sha256-[a-f0-9]{64}"$/);
    await expect(readCdnRuntimeAsset(workspaceRoot, appId, stage.releaseId, 'unlisted.js')).rejects.toThrow(
      'The local staging CDN artifact is missing, invalid, or incomplete.'
    );
  });

  it('requires a component id only for multi-component packages and supports localized default entries', async () => {
    const multiWorkspace = await temporaryDirectory();
    const multi = await createStage(multiWorkspace, {
      exportId: 'multi',
      generatedAt: '2026-08-02T12:00:00.000Z',
      releaseId: '2.1.0-20260802T120000000Z-multi01',
      entryContents: 'entry();',
      additionalComponent: true
    });

    await expect(resolveCdnRuntimeDescriptor(multiWorkspace, appId)).rejects.toThrow(
      'the Lab adapter must supply a component id'
    );
    await expect(resolveCdnRuntimeDescriptor(multiWorkspace, appId, componentId)).resolves.toMatchObject({
      releaseId: multi.releaseId,
      entryAssetPath: 'main.js'
    });

    const localizedWorkspace = await temporaryDirectory();
    await createStage(localizedWorkspace, {
      exportId: 'localized',
      generatedAt: '2026-08-02T13:00:00.000Z',
      releaseId: '2.2.0-20260802T130000000Z-local01',
      entryContents: 'defaultLocale();',
      localizedEntry: true
    });
    await expect(resolveCdnRuntimeDescriptor(localizedWorkspace, appId)).resolves.toMatchObject({
      entryAssetPath: 'main_en-us.js',
      entryAssetUrl: expect.stringMatching(/\/main_en-us\.js$/),
      dependencyAssets: [
        expect.objectContaining({ moduleId: 'helper', assetPath: 'helper.js' }),
        expect.objectContaining({ moduleId: 'labels', assetPath: 'labels_en-us.js' })
      ]
    });
  });

  it('fails closed when any discovered staging artifact is invalid or the newest timestamp is ambiguous', async () => {
    const invalidWorkspace = await temporaryDirectory();
    await createStage(invalidWorkspace, {
      exportId: 'valid',
      generatedAt: '2026-08-01T12:00:00.000Z',
      releaseId: '3.0.0-20260801T120000000Z-dddddd',
      entryContents: 'valid();'
    });
    const invalid = await createStage(invalidWorkspace, {
      exportId: 'invalid',
      generatedAt: '2026-08-02T12:00:00.000Z',
      releaseId: '3.0.1-20260802T120000000Z-eeeeee',
      entryContents: 'before();'
    });
    await writeFile(path.join(invalid.uploadDir, 'main.js'), 'tampered();');

    await expect(resolveCdnRuntimeDescriptor(invalidWorkspace, appId, componentId)).rejects.toThrow(
      'The local staging CDN artifact is missing, invalid, or incomplete.'
    );

    const ambiguousWorkspace = await temporaryDirectory();
    await createStage(ambiguousWorkspace, {
      exportId: 'one',
      generatedAt: '2026-08-03T12:00:00.000Z',
      releaseId: '4.0.0-20260803T120000000Z-ffffff',
      entryContents: 'one();'
    });
    await createStage(ambiguousWorkspace, {
      exportId: 'two',
      generatedAt: '2026-08-03T12:00:00.000Z',
      releaseId: '4.0.1-20260803T120000000Z-gggggg',
      entryContents: 'two();'
    });

    await expect(resolveCdnRuntimeDescriptor(ambiguousWorkspace, appId, componentId)).rejects.toThrow(
      'The local staging CDN artifact is missing, invalid, or incomplete.'
    );
  });

  it('rejects encoded traversal and path separators before artifact resolution', () => {
    expect(() => parseCdnAssetRoute(`/cdn-assets/${appId}/1.0.0-20260802T120000000Z-aaaaaa/%2e%2e/secret.js`)).toThrow();
    expect(() => parseCdnAssetRoute(`/cdn-assets/${appId}/1.0.0-20260802T120000000Z-aaaaaa/folder%2fsecret.js`)).toThrow();
    expect(() => parseCdnAssetRoute(`/cdn-assets/${appId}/1.0.0-20260802T120000000Z-aaaaaa/folder%5csecret.js`)).toThrow();
  });
});

interface StageOptions {
  exportId: string;
  generatedAt: string;
  releaseId: string;
  entryContents: string;
  additionalComponent?: boolean;
  localizedEntry?: boolean;
}

async function createStage(workspaceRoot: string, options: StageOptions) {
  const stageDir = path.join(workspaceRoot, '.spfx-kit', 'exports', appId, options.exportId, 'staging-cdn');
  const uploadDir = path.join(stageDir, 'upload');
  const manifestsDir = path.join(stageDir, 'manifests');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`);
  const cdnBasePath = `https://staging.contoso.test/spfx/${appId}/versions/${options.releaseId}/`;
  const entryResource = options.localizedEntry
    ? { type: 'localizedPath', defaultPath: 'main_en-us.js', paths: { 'fr-fr': 'main_fr-fr.js' } }
    : { type: 'path', path: 'main.js' };
  const componentManifest = {
    id: componentId,
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: {
        main: entryResource,
        helper: { type: 'path', path: 'helper.js' },
        labels: { type: 'localizedPath', defaultPath: 'labels_en-us.js', paths: { 'fr-fr': 'labels_fr-fr.js' } },
        react: { type: 'component', id: 'react-component-id', version: '17.0.1' }
      }
    }
  };
  const additionalComponentManifest = {
    id: 'd614770e-173e-4b4b-a316-111122223333',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'secondary',
      scriptResources: {
        secondary: { type: 'path', path: 'secondary.js' }
      }
    }
  };
  const componentManifests = options.additionalComponent ? [componentManifest, additionalComponentManifest] : [componentManifest];

  const files = [
    writeFileWithParents(path.join(uploadDir, options.localizedEntry ? 'main_en-us.js' : 'main.js'), options.entryContents),
    writeFileWithParents(path.join(uploadDir, 'helper.js'), 'helper();'),
    writeFileWithParents(path.join(uploadDir, 'labels_en-us.js'), 'labelsDefault();'),
    writeFileWithParents(path.join(uploadDir, 'labels_fr-fr.js'), 'labelsFrench();'),
    writeFileWithParents(path.join(manifestsDir, 'component.manifest.json'), `${JSON.stringify(componentManifest, null, 2)}\n`),
    writeFileWithParents(packageFile, packageBytes(componentManifests))
  ];
  if (options.localizedEntry) {
    files.push(writeFileWithParents(path.join(uploadDir, 'main_fr-fr.js'), 'localeFr();'));
  }
  if (options.additionalComponent) {
    files.push(
      writeFileWithParents(path.join(uploadDir, 'secondary.js'), 'secondary();'),
      writeFileWithParents(
        path.join(manifestsDir, 'secondary.manifest.json'),
        `${JSON.stringify(additionalComponentManifest, null, 2)}\n`
      )
    );
  }
  await Promise.all(files);
  const manifest = await createCdnStageManifest({
    cdnBasePath,
    packageFile,
    releaseLabel: options.releaseId,
    releaseId: options.releaseId,
    releaseManifestDir: manifestsDir,
    slug: appId,
    stageDir,
    uploadDir
  });
  manifest.generatedAt = options.generatedAt;
  await writeFile(path.join(stageDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...options, cdnBasePath, stageDir, uploadDir };
}

function packageBytes(componentManifests: object[]): Uint8Array {
  const elements = componentManifests
    .map((componentManifest) => {
      const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      return `<ClientSideComponent ComponentManifest="${encodedManifest}" />`;
    })
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types />'),
    '_rels/.rels': strToU8('<Relationships />'),
    'AppManifest.xml': strToU8('<App />'),
    'feature/WebPart.xml': strToU8(`<Elements>${elements}</Elements>`)
  });
}

async function writeFileWithParents(file: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-lab-packages-'));
  temporaryDirectories.push(directory);
  return directory;
}
