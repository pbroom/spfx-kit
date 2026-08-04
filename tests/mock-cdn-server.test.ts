import { createServer as createNodeServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  mockCdnAppReleaseBaseUrl,
  publishMockCdnAppStage,
  resolveMockCdnBucketRoot
} from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { listenMockCdnServer, parseMockCdnAssetRoute } from '../packages/spfx-tools/src/lib/mock-cdn-server.mjs';

const temporaryDirectories: string[] = [];
const closeCallbacks: Array<() => Promise<void>> = [];
const appId = 'fixture-spfx';
const releaseId = '2.0.0-20260804T120000000Z-def456';
const labOrigin = 'http://127.0.0.1:54173';

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local mock CDN HTTP service', () => {
  it('serves selected allowlisted bytes and manifest with CDN headers over a distinct origin', async () => {
    const fixture = await runningFixture();
    const assetUrl = `${fixture.origin}/apps/${appId}/versions/${releaseId}/main.js`;
    const response = await fetch(assetUrl, { headers: { Origin: labOrigin } });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('define("main", [], {});');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('etag')).toMatch(/^"sha256-[a-f0-9]{64}"$/);
    expect(response.headers.get('access-control-allow-origin')).toBe(labOrigin);
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');

    const manifest = await fetch(`${fixture.origin}/apps/${appId}/versions/${releaseId}/deployment-manifest.json`, {
      headers: { Origin: labOrigin }
    });
    expect(manifest.status).toBe(200);
    await expect(manifest.json()).resolves.toMatchObject({ slug: appId, releaseId });

    const head = await fetch(assetUrl, { method: 'HEAD', headers: { Origin: labOrigin } });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength('define("main", [], {});')));

    const notModified = await fetch(assetUrl, {
      headers: { Origin: labOrigin, 'If-None-Match': response.headers.get('etag')! }
    });
    expect(notModified.status).toBe(304);
  });

  it('fails closed for wrong origins, methods, unselected releases, shared releases, packages, and unlisted paths', async () => {
    const fixture = await runningFixture();
    const releaseBase = `${fixture.origin}/apps/${appId}/versions/${releaseId}/`;
    const cases = [
      `${releaseBase}missing.js`,
      `${releaseBase}sharepoint/solution/${appId}.staging.cdn.sppkg`,
      `${fixture.origin}/apps/${appId}/versions/9.9.9-other/main.js`,
      `${fixture.origin}/shared/common/versions/${releaseId}/main.js`,
      `${releaseBase}main.js?cache=skip`
    ];
    for (const url of cases) {
      const response = await fetch(url, { headers: { Origin: labOrigin } });
      expect(response.status, url).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }

    const forbidden = await fetch(`${releaseBase}main.js`, { headers: { Origin: 'http://127.0.0.1:59999' } });
    expect(forbidden.status).toBe(403);
    const method = await fetch(`${releaseBase}main.js`, { method: 'POST', headers: { Origin: labOrigin } });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, HEAD');
  });

  it('rechecks asset integrity on every request after the selected release is cached', async () => {
    const fixture = await runningFixture();
    const assetUrl = `${fixture.origin}/apps/${appId}/versions/${releaseId}/main.js`;
    await expect(fetch(assetUrl, { headers: { Origin: labOrigin } }).then((response) => response.status)).resolves.toBe(200);
    await writeFile(path.join(fixture.releaseDir, 'upload', 'main.js'), 'tampered();');

    const response = await fetch(assetUrl, { headers: { Origin: labOrigin } });
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain('integrity check');
  });

  it('parses only protected app/shared version routes and rejects encoded traversal', () => {
    expect(parseMockCdnAssetRoute(`/apps/${appId}/versions/${releaseId}/chunks/main.js`)).toEqual({
      namespace: 'app',
      releaseName: appId,
      releaseId,
      assetPath: 'chunks/main.js'
    });
    expect(parseMockCdnAssetRoute(`/shared/common/versions/${releaseId}/runtime.js`)).toMatchObject({
      namespace: 'shared',
      releaseName: 'common'
    });
    for (const route of [
      `/apps/${appId}/versions/${releaseId}/%2e%2e/secret`,
      `/apps/${appId}/versions/${releaseId}/nested%2Fsecret`,
      `/repository/${appId}/versions/${releaseId}/main.js`
    ]) {
      expect(() => parseMockCdnAssetRoute(route)).toThrow();
    }
  });
});

async function runningFixture(): Promise<{
  origin: string;
  releaseDir: string;
}> {
  const workspaceRoot = await temporaryDirectory();
  const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot);
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const stageDir = path.join(workspaceRoot, 'stage');
  const uploadDir = path.join(stageDir, 'upload');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`);
  const cdnBasePath = mockCdnAppReleaseBaseUrl(origin, appId, releaseId);
  const componentManifest = {
    id: '22222222-2222-4222-8222-222222222222',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: { main: { type: 'path', path: 'main.js' } }
    }
  };
  await writePackage(packageFile, componentManifest);
  await writeFileWithParents(path.join(uploadDir, 'main.js'), 'define("main", [], {});');
  const manifest = await createCdnStageManifest({
    allowLocalMockCdn: true,
    cdnBasePath,
    packageFile,
    releaseLabel: releaseId,
    releaseId,
    slug: appId,
    stageDir,
    uploadDir
  });
  await writeFile(path.join(stageDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await publishMockCdnAppStage({ bucketRoot, origin, stageDir, select: true });
  const running = await listenMockCdnServer({ bucketRoot, origin, labOrigin });
  closeCallbacks.push(running.close);
  return {
    origin,
    releaseDir: path.join(bucketRoot, 'apps', appId, 'versions', releaseId)
  };
}

async function reservePort(): Promise<number> {
  const server = createNodeServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-kit-mock-cdn-server-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePackage(file: string, componentManifest: object): Promise<void> {
  const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  await writeFileWithParents(
    file,
    zipSync({
      '[Content_Types].xml': strToU8('<Types />'),
      '_rels/.rels': strToU8('<Relationships />'),
      'AppManifest.xml': strToU8('<App />'),
      'feature/WebPart.xml': strToU8(`<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`)
    })
  );
}

async function writeFileWithParents(file: string, value: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}
