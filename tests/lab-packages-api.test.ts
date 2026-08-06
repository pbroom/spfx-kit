import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createCdnRuntimeSessionStore } from '../apps/lab/server/lab-packages-api';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  publishMockCdnAppStage,
  resolveMockCdnBucketRoot,
  selectMockCdnAppRelease
} from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';

const temporaryDirectories: string[] = [];
const appId = 'fixture-spfx';
const componentId = '0df27fc4-65de-4cd9-9cad-52f0b84e960b';
const mockCdnOrigin = 'http://127.0.0.1:4174';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Lab local mock CDN runtime', () => {
  it('fails with actionable guidance when no selected mock-CDN release exists', async () => {
    const workspaceRoot = await temporaryDirectory();
    await expect(createCdnRuntimeSessionStore(workspaceRoot).resolveDescriptor(appId)).rejects.toThrow(
      'The selected local mock CDN release is missing, invalid, or incomplete.'
    );
  });

  it('supports a workspace-contained bucket override and rejects paths outside the workspace', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot, '.spfx-kit/custom-mock-cdn');
    await createAndPublishStage(workspaceRoot, {
      bucketRoot,
      releaseId: '1.0.0-20260804T120000000Z-override',
      entryContents: 'override();',
      select: true
    });

    await expect(
      createCdnRuntimeSessionStore(workspaceRoot, {
        bucketRoot: '.spfx-kit/custom-mock-cdn',
        mockCdnOrigin
      }).resolveDescriptor(appId)
    ).resolves.toMatchObject({
      assets: expect.arrayContaining([expect.objectContaining({ role: 'entry', assetPath: 'main.js' })])
    });
    expect(() => createCdnRuntimeSessionStore(workspaceRoot, { bucketRoot: '../outside' })).toThrow(
      'must resolve inside the workspace'
    );
  });

  it('describes the selected release with exact separate-origin delivery URLs and no local paths', async () => {
    const workspaceRoot = await temporaryDirectory();
    const selected = await createAndPublishStage(workspaceRoot, {
      releaseId: '1.0.1-20260804T120000000Z-bbbbbb',
      entryContents: 'selected();',
      select: true
    });

    const descriptor = await createCdnRuntimeSessionStore(workspaceRoot, { mockCdnOrigin }).resolveDescriptor(appId);
    const releaseBaseUrl = `${mockCdnOrigin}/apps/${appId}/versions/${selected.releaseId}/`;
    expect(descriptor).toEqual({
      mode: 'cdn',
      appId,
      releaseId: selected.releaseId,
      generatedAt: expect.any(String),
      cdnBasePath: releaseBaseUrl,
      delivery: {
        kind: 'local-mock-cdn',
        origin: mockCdnOrigin,
        bucketBaseUrl: `${mockCdnOrigin}/`,
        namespaceKind: 'app-release',
        namespacePath: `apps/${appId}/versions/${selected.releaseId}/`,
        releaseBaseUrl,
        releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
        status: 'published-and-verified'
      },
      assets: [
        expect.objectContaining({
          role: 'dependency',
          moduleId: 'helper',
          assetPath: 'helper.js',
          assetUrl: `${releaseBaseUrl}helper.js`,
          stageStatus: 'allowed-and-verified'
        }),
        expect.objectContaining({
          role: 'dependency',
          moduleId: 'labels',
          assetPath: 'labels_en-us.js',
          assetUrl: `${releaseBaseUrl}labels_en-us.js`,
          stageStatus: 'allowed-and-verified'
        }),
        expect.objectContaining({
          role: 'entry',
          moduleId: 'main',
          assetPath: 'main.js',
          assetUrl: `${releaseBaseUrl}main.js`,
          stageStatus: 'allowed-and-verified'
        })
      ],
      deferredResources: [
        {
          moduleId: 'react',
          kind: 'spfx-component',
          componentId: 'react-component-id',
          version: '17.0.1',
          status: 'deferred',
          reason: 'sharepoint-loader-not-exercised'
        }
      ],
      packagePath: `sharepoint/solution/${appId}.staging.cdn.sppkg`
    });
    expect(JSON.stringify(descriptor)).not.toContain(workspaceRoot);
    expect(JSON.stringify(descriptor)).not.toContain('/api/lab-packages/cdn-assets');
  });

  it('advertises a separately forwarded HTTPS CDN without changing the local bucket provenance', async () => {
    const workspaceRoot = await temporaryDirectory();
    const selected = await createAndPublishStage(workspaceRoot, {
      releaseId: '1.0.2-20260804T120000000Z-forward',
      entryContents: 'forwarded();',
      select: true
    });
    const publicOrigin = 'https://cdn-preview.example.test';
    const descriptor = await createCdnRuntimeSessionStore(workspaceRoot, {
      mockCdnOrigin,
      publicMockCdnOrigin: publicOrigin
    }).resolveDescriptor(appId);
    const releaseBaseUrl = `${publicOrigin}/apps/${appId}/versions/${selected.releaseId}/`;

    expect(descriptor.cdnBasePath).toBe(releaseBaseUrl);
    expect(descriptor.delivery).toMatchObject({ origin: publicOrigin, releaseBaseUrl });
    expect(descriptor.assets.map((asset) => asset.assetUrl)).toEqual(
      expect.arrayContaining([`${releaseBaseUrl}main.js`, `${releaseBaseUrl}helper.js`])
    );
    expect(JSON.stringify(descriptor)).not.toContain(mockCdnOrigin);
  });

  it('requires a component id only for multi-component packages and uses localized default assets', async () => {
    const multiWorkspace = await temporaryDirectory();
    await createAndPublishStage(multiWorkspace, {
      releaseId: '2.1.0-20260804T120000000Z-multi01',
      entryContents: 'entry();',
      additionalComponent: true,
      select: true
    });
    const multiStore = createCdnRuntimeSessionStore(multiWorkspace, { mockCdnOrigin });
    await expect(multiStore.resolveDescriptor(appId)).rejects.toThrow('the Lab adapter must supply a component id');
    await expect(multiStore.resolveDescriptor(appId, componentId)).resolves.toMatchObject({
      assets: expect.arrayContaining([expect.objectContaining({ role: 'entry', assetPath: 'main.js' })])
    });

    const localizedWorkspace = await temporaryDirectory();
    await createAndPublishStage(localizedWorkspace, {
      releaseId: '2.2.0-20260804T130000000Z-local01',
      entryContents: 'defaultLocale();',
      localizedEntry: true,
      select: true
    });
    await expect(
      createCdnRuntimeSessionStore(localizedWorkspace, { mockCdnOrigin }).resolveDescriptor(appId)
    ).resolves.toMatchObject({
      assets: [
        expect.objectContaining({ moduleId: 'helper', assetPath: 'helper.js' }),
        expect.objectContaining({ moduleId: 'labels', assetPath: 'labels_en-us.js' }),
        expect.objectContaining({ role: 'entry', moduleId: 'main', assetPath: 'main_en-us.js' })
      ]
    });
  });

  it('uses only the explicitly selected release and never scans or falls back to another version', async () => {
    const workspaceRoot = await temporaryDirectory();
    const older = await createAndPublishStage(workspaceRoot, {
      releaseId: '3.0.0-20260804T120000000Z-older01',
      entryContents: 'older();',
      select: true
    });
    const newer = await createAndPublishStage(workspaceRoot, {
      releaseId: '3.1.0-20260804T130000000Z-newer01',
      entryContents: 'newer();',
      select: false
    });
    await writeFile(path.join(newer.publishedReleaseDir, 'upload', 'main.js'), 'tampered();');

    await expect(createCdnRuntimeSessionStore(workspaceRoot, { mockCdnOrigin }).resolveDescriptor(appId)).resolves.toMatchObject({
      releaseId: older.releaseId
    });

    await selectMockCdnAppRelease({
      bucketRoot: older.bucketRoot,
      origin: mockCdnOrigin,
      appId,
      releaseId: newer.releaseId
    }).catch(() => undefined);
    await expect(createCdnRuntimeSessionStore(workspaceRoot, { mockCdnOrigin }).resolveDescriptor(appId)).resolves.toMatchObject({
      releaseId: older.releaseId
    });
  });

  it('fails closed when selected package bytes mutate after publication', async () => {
    const workspaceRoot = await temporaryDirectory();
    const selected = await createAndPublishStage(workspaceRoot, {
      releaseId: '4.0.0-20260804T140000000Z-package1',
      entryContents: 'entry();',
      select: true
    });
    await writeFile(
      path.join(selected.publishedReleaseDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`),
      packageBytes([])
    );
    await expect(createCdnRuntimeSessionStore(workspaceRoot, { mockCdnOrigin }).resolveDescriptor(appId)).rejects.toThrow(
      'The selected local mock CDN release is missing, invalid, or incomplete.'
    );
  });
});

interface StageOptions {
  bucketRoot?: string;
  releaseId: string;
  entryContents: string;
  select: boolean;
  additionalComponent?: boolean;
  localizedEntry?: boolean;
}

async function createAndPublishStage(workspaceRoot: string, options: StageOptions) {
  const bucketRoot = options.bucketRoot || resolveMockCdnBucketRoot(workspaceRoot);
  const stageDir = path.join(workspaceRoot, 'fixtures', options.releaseId, 'staging-cdn');
  const uploadDir = path.join(stageDir, 'upload');
  const manifestsDir = path.join(stageDir, 'manifests');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`);
  const cdnBasePath = `${mockCdnOrigin}/apps/${appId}/versions/${options.releaseId}/`;
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
        labels: {
          type: 'localizedPath',
          defaultPath: 'labels_en-us.js',
          paths: { 'fr-fr': 'labels_fr-fr.js' }
        },
        react: { type: 'component', id: 'react-component-id', version: '17.0.1' }
      }
    }
  };
  const additionalComponentManifest = {
    id: 'd614770e-173e-4b4b-a316-111122223333',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'secondary',
      scriptResources: { secondary: { type: 'path', path: 'secondary.js' } }
    }
  };
  const componentManifests = options.additionalComponent ? [componentManifest, additionalComponentManifest] : [componentManifest];
  const writes = [
    writeFileWithParents(path.join(uploadDir, options.localizedEntry ? 'main_en-us.js' : 'main.js'), options.entryContents),
    writeFileWithParents(path.join(uploadDir, 'helper.js'), 'helper();'),
    writeFileWithParents(path.join(uploadDir, 'labels_en-us.js'), 'labelsDefault();'),
    writeFileWithParents(path.join(uploadDir, 'labels_fr-fr.js'), 'labelsFrench();'),
    writeFileWithParents(path.join(manifestsDir, 'component.manifest.json'), `${JSON.stringify(componentManifest, null, 2)}\n`),
    writeFileWithParents(packageFile, packageBytes(componentManifests))
  ];
  if (options.localizedEntry) {
    writes.push(writeFileWithParents(path.join(uploadDir, 'main_fr-fr.js'), 'localeFr();'));
  }
  if (options.additionalComponent) {
    writes.push(
      writeFileWithParents(path.join(uploadDir, 'secondary.js'), 'secondary();'),
      writeFileWithParents(
        path.join(manifestsDir, 'secondary.manifest.json'),
        `${JSON.stringify(additionalComponentManifest, null, 2)}\n`
      )
    );
  }
  await Promise.all(writes);
  const manifest = await createCdnStageManifest({
    allowLocalMockCdn: true,
    cdnBasePath,
    packageFile,
    releaseLabel: options.releaseId,
    releaseId: options.releaseId,
    releaseManifestDir: manifestsDir,
    slug: appId,
    stageDir,
    uploadDir
  });
  await writeFile(path.join(stageDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await publishMockCdnAppStage({
    bucketRoot,
    origin: mockCdnOrigin,
    stageDir,
    select: options.select
  });
  return {
    bucketRoot,
    releaseId: options.releaseId,
    publishedReleaseDir: path.join(bucketRoot, 'apps', appId, 'versions', options.releaseId)
  };
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
