import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createLocalCdnAdminRequestHandler, createLocalCdnAdminStore } from '../apps/lab/server/local-cdn-admin-api';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { mockCdnAppReleaseBaseUrl } from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';

const temporaryDirectories: string[] = [];
const runningServers: Server[] = [];
const mockCdnOrigin = 'http://127.0.0.1:54174';
const appId = 'fixture-spfx';
const releaseId = '1.2.3-20260804T120000000Z-admin01';

afterEach(async () => {
  await Promise.all(
    runningServers
      .splice(0)
      .map((server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  );
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local CDN bucket administration API', () => {
  it('lists the empty bucket, publishes only an enumerated source, and selects only by explicit action', async () => {
    const workspaceRoot = await temporaryDirectory();
    await createLocalCdnAdminStore(workspaceRoot, { mockCdnOrigin }).inventory();
    const api = await startAdminApi(workspaceRoot);
    const empty = await getInventory(api);
    expect(empty).toMatchObject({
      namespaces: {
        apps: { status: 'supported', releases: [] },
        shared: { status: 'reserved-unsupported', releases: [] }
      },
      selectedPointers: [],
      publishSources: []
    });

    await createExportStage(workspaceRoot, 'run-one', { releaseId, main: 'first();' });
    const firstInventory = await getInventory(api);
    const source = firstInventory.publishSources[0];
    expect(source).toMatchObject({
      status: 'verified',
      appId,
      releaseId,
      generatedAt: '2026-08-04T12:00:00.000Z',
      manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(source.sourceId).toMatch(/^stage_[a-f0-9]{64}$/);
    expect((await getInventory(api)).publishSources[0].sourceId).toBe(source.sourceId);

    const published = await postJson(api, '/publish', { sourceId: source.sourceId });
    expect(published.response.status).toBe(201);
    expect(published.body).toMatchObject({ appId, releaseId, published: true, selected: false });
    const publishedInventory = await getInventory(api);
    expect(publishedInventory.namespaces.apps.releases).toEqual([
      expect.objectContaining({ appId, releaseId, status: 'verified', selected: false })
    ]);
    expect(publishedInventory.selectedPointers).toEqual([{ appId, status: 'none' }]);

    const selected = await postJson(api, '/select', { appId, releaseId });
    expect(selected.response.status).toBe(200);
    expect(selected.body).toMatchObject({ appId, releaseId, status: 'selected-and-verified' });
    const selectedInventory = await getInventory(api);
    expect(selectedInventory.namespaces.apps.releases).toEqual([
      expect.objectContaining({ appId, releaseId, status: 'verified', selected: true })
    ]);
    expect(JSON.stringify(selectedInventory)).not.toContain(workspaceRoot);
  });

  it('rejects changed, invalid, conflicting, path-like, and symlinked publish sources', async () => {
    const workspaceRoot = await temporaryDirectory();
    const api = await startAdminApi(workspaceRoot);
    const firstStage = await createExportStage(workspaceRoot, 'run-one', { releaseId, main: 'first();' });
    const firstSource = (await getInventory(api)).publishSources[0];

    await writeFile(path.join(firstStage, 'upload', 'main.js'), 'changed-after-enumeration');
    const changed = await postJson(api, '/publish', { sourceId: firstSource.sourceId });
    expect(changed.response.status).toBe(409);
    expect(changed.body.error).toContain('Refresh');

    await createExportStage(workspaceRoot, 'run-two', { releaseId, main: 'second();' });
    const refreshed = await getInventory(api);
    const validSource = refreshed.publishSources.find((source: { label: string }) => source.label.includes('run-two'));
    const published = await postJson(api, '/publish', { sourceId: validSource.sourceId });
    expect(published.response.status).toBe(201);

    const conflictingStage = await createExportStage(workspaceRoot, 'run-three', { releaseId, main: 'third();' });
    expect(conflictingStage).toContain('/run-three/staging-cdn');
    const conflictSource = (await getInventory(api)).publishSources.find((source: { label: string }) =>
      source.label.includes('run-three')
    );
    const conflict = await postJson(api, '/publish', { sourceId: conflictSource.sourceId });
    expect(conflict.response.status).toBe(409);

    const invalidDir = path.join(workspaceRoot, '.spfx-kit', 'exports', appId, 'invalid-run', 'staging-cdn');
    await writeFileWithParents(path.join(invalidDir, 'deployment-manifest.json'), '{}');
    const invalidSource = (await getInventory(api)).publishSources.find((source: { label: string }) =>
      source.label.includes('invalid-run')
    );
    expect(invalidSource.status).toBe('invalid');
    expect((await postJson(api, '/publish', { sourceId: invalidSource.sourceId })).response.status).toBe(409);

    const outside = path.join(workspaceRoot, 'outside-stage');
    await mkdir(outside);
    const linkedStage = path.join(workspaceRoot, '.spfx-kit', 'exports', appId, 'linked-run', 'staging-cdn');
    await mkdir(path.dirname(linkedStage), { recursive: true });
    await symlink(outside, linkedStage);
    expect(
      (await getInventory(api)).publishSources.some((source: { label: string }) => source.label.includes('linked-run'))
    ).toBe(false);

    const arbitrary = await postJson(api, '/publish', { sourceId: '../outside', path: '/etc/passwd' });
    expect(arbitrary.response.status).toBe(400);
  });

  it('rejects wrong-origin, non-loopback-host, malformed, and oversized write requests', async () => {
    const workspaceRoot = await temporaryDirectory();
    const api = await startAdminApi(workspaceRoot);

    const wrongOrigin = await fetch(`${api}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:59999',
        'x-spfx-kit-lab-intent': 'same-origin'
      },
      body: JSON.stringify({ sourceId: 'stage_invalid' })
    });
    expect(wrongOrigin.status).toBe(403);

    const malformed = await postRaw(api, '/publish', '{');
    expect(malformed.response.status).toBe(400);
    expect(malformed.body.error).toContain('valid JSON');

    const oversized = await postRaw(api, '/publish', JSON.stringify({ sourceId: 'x'.repeat(17_000) }));
    expect(oversized.response.status).toBe(413);
    expect(oversized.body.error).toContain('too large');

    const nonLoopbackHost = await fetch(`${api}/`, {
      headers: { Host: `localhost:${new URL(api).port}`, Origin: `http://localhost:${new URL(api).port}` }
    });
    expect(nonLoopbackHost.status).toBe(403);
  });
});

async function startAdminApi(workspaceRoot: string): Promise<string> {
  const handler = createLocalCdnAdminRequestHandler(workspaceRoot, { mockCdnOrigin });
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  runningServers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Admin API test server did not expose a TCP port.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function getInventory(api: string) {
  const response = await fetch(`${api}/`, { headers: { Origin: api } });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}

async function postJson(api: string, pathname: string, value: object) {
  return postRaw(api, pathname, JSON.stringify(value));
}

async function postRaw(api: string, pathname: string, body: string) {
  const response = await fetch(`${api}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: api,
      'x-spfx-kit-lab-intent': 'same-origin'
    },
    body
  });
  return { response, body: await response.json() };
}

async function createExportStage(
  workspaceRoot: string,
  exportId: string,
  options: { releaseId: string; main: string }
): Promise<string> {
  const stageDir = path.join(workspaceRoot, '.spfx-kit', 'exports', appId, exportId, 'staging-cdn');
  const uploadDir = path.join(stageDir, 'upload');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`);
  const cdnBasePath = mockCdnAppReleaseBaseUrl(mockCdnOrigin, appId, options.releaseId);
  const componentManifest = {
    id: '11111111-1111-4111-8111-111111111111',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: { main: { type: 'path', path: 'main.js' } }
    }
  };
  await Promise.all([
    writeFileWithParents(path.join(uploadDir, 'main.js'), options.main),
    writeFileWithParents(packageFile, packageBytes(componentManifest))
  ]);
  const manifest = await createCdnStageManifest({
    allowLocalMockCdn: true,
    cdnBasePath,
    packageFile,
    releaseLabel: options.releaseId,
    releaseId: options.releaseId,
    slug: appId,
    stageDir,
    uploadDir
  });
  manifest.generatedAt = '2026-08-04T12:00:00.000Z';
  await writeFile(path.join(stageDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return stageDir;
}

function packageBytes(componentManifest: object): Uint8Array {
  const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types />'),
    '_rels/.rels': strToU8('<Relationships />'),
    'AppManifest.xml': strToU8('<App />'),
    'feature/WebPart.xml': strToU8(`<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`)
  });
}

async function writeFileWithParents(file: string, value: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-kit-local-cdn-admin-'));
  temporaryDirectories.push(directory);
  return directory;
}
