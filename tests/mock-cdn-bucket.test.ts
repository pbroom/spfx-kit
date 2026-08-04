import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  getMockCdnBucketStatus,
  mockCdnAppReleaseBaseUrl,
  mockCdnSharedReleaseBaseUrl,
  normalizeMockCdnOrigin,
  publishMockCdnAppStage,
  readMockCdnReleaseAsset,
  readMockCdnReleaseManifest,
  resolveMockCdnBucketRoot,
  resolveSelectedMockCdnAppRelease,
  selectMockCdnAppRelease
} from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';

const temporaryDirectories: string[] = [];
const origin = 'http://127.0.0.1:54174';
const appId = 'fixture-spfx';
const releaseId = '1.2.3-20260804T120000000Z-abc123';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local mock CDN bucket contract', () => {
  it('accepts only explicit IPv4 loopback HTTP origins and keeps app and shared namespaces disjoint', () => {
    expect(normalizeMockCdnOrigin(origin)).toBe(origin);
    for (const invalid of [
      'http://127.0.0.1',
      'http://localhost:54174',
      'http://[::1]:54174',
      'http://0.0.0.0:54174',
      'https://127.0.0.1:54174',
      'http://127.0.0.1:54174/path',
      'http://user:secret@127.0.0.1:54174'
    ]) {
      expect(() => normalizeMockCdnOrigin(invalid)).toThrow('loopback HTTP origin');
    }
    expect(mockCdnAppReleaseBaseUrl(origin, appId, releaseId)).toBe(`${origin}/apps/${appId}/versions/${releaseId}/`);
    expect(mockCdnSharedReleaseBaseUrl(origin, 'fluent-icons', releaseId)).toBe(
      `${origin}/shared/fluent-icons/versions/${releaseId}/`
    );
  });

  it('requires workspace-contained bucket roots', async () => {
    const workspaceRoot = await temporaryDirectory();
    expect(resolveMockCdnBucketRoot(workspaceRoot)).toBe(path.join(workspaceRoot, '.spfx-kit', 'mock-cdn', 'v1'));
    expect(() => resolveMockCdnBucketRoot(workspaceRoot, '../outside')).toThrow('inside the workspace');
  });

  it('publishes, explicitly selects, resolves, and reads one immutable verified app release', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
    const stageDir = await createStage(workspaceRoot, { origin, appId, releaseId, main: 'define("main", [], {});' });
    const persistedGeneratedAt = '2026-08-04T12:00:00.000Z';
    const manifestFile = path.join(stageDir, 'deployment-manifest.json');
    const persistedManifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    persistedManifest.generatedAt = persistedGeneratedAt;
    await writeFile(manifestFile, `${JSON.stringify(persistedManifest, null, 2)}\n`);

    const published = await publishMockCdnAppStage({ bucketRoot, origin, stageDir });
    expect(published).toMatchObject({
      namespace: 'app',
      appId,
      releaseId,
      releaseBaseUrl: `${origin}/apps/${appId}/versions/${releaseId}/`,
      files: 2,
      published: true,
      selected: false
    });
    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId })).rejects.toThrow();

    await selectMockCdnAppRelease({ bucketRoot, origin, appId, releaseId });
    const release = await resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId });
    expect(release).toMatchObject({
      appId,
      releaseId,
      releaseBaseUrl: published.releaseBaseUrl,
      manifest: { generatedAt: persistedGeneratedAt }
    });
    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId })).resolves.toMatchObject({
      manifest: { generatedAt: persistedGeneratedAt }
    });
    await expect(readMockCdnReleaseAsset(release, 'main.js')).resolves.toMatchObject({
      bytes: Buffer.from('define("main", [], {});'),
      contentType: 'text/javascript; charset=utf-8',
      etag: expect.stringMatching(/^"sha256-[a-f0-9]{64}"$/)
    });
    await expect(readMockCdnReleaseAsset(release, 'styles.css')).resolves.toMatchObject({
      contentType: 'text/css; charset=utf-8'
    });
    await expect(readMockCdnReleaseAsset(release, 'sharepoint/solution/fixture-spfx.staging.cdn.sppkg')).rejects.toThrow(
      'not allowlisted'
    );
    await expect(readMockCdnReleaseManifest(release)).resolves.toMatchObject({
      contentType: 'application/json; charset=utf-8',
      etag: expect.stringMatching(/^"sha256-[a-f0-9]{64}"$/)
    });
    await expect(getMockCdnBucketStatus({ bucketRoot, origin })).resolves.toMatchObject({
      apps: [{ appId, releaseId, files: 2, status: 'selected-and-verified' }]
    });
  });

  it('is idempotent only for identical releases and never overwrites conflicting bytes', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
    const stageDir = await createStage(workspaceRoot, { origin, appId, releaseId, main: 'first();' });

    await expect(publishMockCdnAppStage({ bucketRoot, origin, stageDir, select: true })).resolves.toMatchObject({
      published: true,
      selected: true
    });
    await expect(publishMockCdnAppStage({ bucketRoot, origin, stageDir })).resolves.toMatchObject({
      published: false,
      selected: false
    });

    const conflictingStage = await createStage(workspaceRoot, {
      origin,
      appId,
      releaseId,
      main: 'different();',
      directoryName: 'conflict'
    });
    await expect(publishMockCdnAppStage({ bucketRoot, origin, stageDir: conflictingStage })).rejects.toThrow(
      'immutable releases cannot be overwritten'
    );
    const release = await resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId });
    await expect(readMockCdnReleaseAsset(release, 'main.js')).resolves.toMatchObject({ bytes: Buffer.from('first();') });
  });

  it('publishes concurrently without partial releases and keeps app/version selections independent', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
    const firstStage = await createStage(workspaceRoot, {
      origin,
      appId,
      releaseId,
      main: 'first();',
      directoryName: 'first-stage'
    });
    const concurrent = await Promise.all([
      publishMockCdnAppStage({ bucketRoot, origin, stageDir: firstStage }),
      publishMockCdnAppStage({ bucketRoot, origin, stageDir: firstStage })
    ]);
    expect(concurrent.map((result) => result.published).sort()).toEqual([false, true]);

    const secondReleaseId = '1.2.4-20260804T130000000Z-def456';
    const secondStage = await createStage(workspaceRoot, {
      origin,
      appId,
      releaseId: secondReleaseId,
      main: 'second();',
      directoryName: 'second-stage'
    });
    const otherAppId = 'other-spfx';
    const otherReleaseId = '2.0.0-20260804T140000000Z-ghi789';
    const otherStage = await createStage(workspaceRoot, {
      origin,
      appId: otherAppId,
      releaseId: otherReleaseId,
      main: 'other();',
      directoryName: 'other-stage'
    });
    await publishMockCdnAppStage({ bucketRoot, origin, stageDir: secondStage, select: true });
    await publishMockCdnAppStage({ bucketRoot, origin, stageDir: otherStage, select: true });
    await selectMockCdnAppRelease({ bucketRoot, origin, appId, releaseId });

    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId })).resolves.toMatchObject({
      appId,
      releaseId
    });
    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId: otherAppId })).resolves.toMatchObject({
      appId: otherAppId,
      releaseId: otherReleaseId
    });
    await expect(access(path.join(bucketRoot, 'apps', appId, 'versions', secondReleaseId))).resolves.toBeUndefined();
  });

  it('rejects stages for another base URL and detects post-selection asset or manifest changes', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
    const wrongOrigin = 'http://127.0.0.1:54175';
    const wrongStage = await createStage(workspaceRoot, { origin: wrongOrigin, appId, releaseId, main: 'wrong();' });
    await expect(publishMockCdnAppStage({ bucketRoot, origin, stageDir: wrongStage })).rejects.toThrow('must exactly match');

    const stageDir = await createStage(workspaceRoot, {
      origin,
      appId,
      releaseId,
      main: 'original();',
      directoryName: 'right'
    });
    await publishMockCdnAppStage({ bucketRoot, origin, stageDir, select: true });
    const release = await resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId });
    await writeFile(path.join(release.releaseDir, 'upload', 'main.js'), 'tampered();');
    await expect(readMockCdnReleaseAsset(release, 'main.js')).rejects.toThrow('immutable release manifest');
    await writeFile(path.join(release.releaseDir, 'upload', 'main.js'), 'original();');

    const selectedFile = path.join(bucketRoot, 'apps', appId, 'selected.json');
    const selected = JSON.parse(await readFile(selectedFile, 'utf8'));
    selected.deploymentManifestSha256 = '0'.repeat(64);
    await writeFile(selectedFile, `${JSON.stringify(selected)}\n`);
    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId })).rejects.toThrow('pinned checksum');
  });

  it('copies only the validated stage closure into the protected bucket', async () => {
    const workspaceRoot = await temporaryDirectory();
    const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
    const stageDir = await createStage(workspaceRoot, { origin, appId, releaseId, main: 'safe();' });
    await writeFile(path.join(stageDir, 'unrelated-secret.txt'), 'not published');
    await publishMockCdnAppStage({ bucketRoot, origin, stageDir });
    const releaseDir = path.join(bucketRoot, 'apps', appId, 'versions', releaseId);

    await expect(access(path.join(releaseDir, 'unrelated-secret.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(path.join(releaseDir, 'README.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(path.join(releaseDir, 'upload', 'main.js'))).resolves.toBeUndefined();
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-kit-mock-cdn-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createStage(
  workspaceRoot: string,
  options: { origin: string; appId: string; releaseId: string; main: string; directoryName?: string }
): Promise<string> {
  const stageDir = path.join(workspaceRoot, options.directoryName || 'stage');
  const uploadDir = path.join(stageDir, 'upload');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${options.appId}.staging.cdn.sppkg`);
  const cdnBasePath = mockCdnAppReleaseBaseUrl(options.origin, options.appId, options.releaseId);
  const componentManifest = {
    id: '11111111-1111-4111-8111-111111111111',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: { main: { type: 'path', path: 'main.js' } }
    }
  };
  await Promise.all([
    writePackage(packageFile, componentManifest),
    writeFileWithParents(path.join(uploadDir, 'main.js'), options.main),
    writeFileWithParents(path.join(uploadDir, 'styles.css'), '.fixture { color: red; }')
  ]);
  const manifest = await createCdnStageManifest({
    allowLocalMockCdn: true,
    cdnBasePath,
    packageFile,
    releaseLabel: options.releaseId,
    releaseId: options.releaseId,
    slug: options.appId,
    stageDir,
    uploadDir
  });
  await writeFile(path.join(stageDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return stageDir;
}

async function writePackage(file: string, componentManifest: object): Promise<void> {
  const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const bytes = zipSync({
    '[Content_Types].xml': strToU8('<Types />'),
    '_rels/.rels': strToU8('<Relationships />'),
    'AppManifest.xml': strToU8('<App />'),
    'feature/WebPart.xml': strToU8(`<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`)
  });
  await writeFileWithParents(file, bytes);
}

async function writeFileWithParents(file: string, value: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}
