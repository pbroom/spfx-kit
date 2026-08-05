import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import * as mockCdnBucket from '../../../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';
import { JsonBodyError, isSameOriginRequest, readJsonBody, sendJson, verifyStateChangingLabRequest } from './http';
import { rootDir } from './paths';

const {
  DEFAULT_MOCK_CDN_BUCKET_PATH,
  DEFAULT_MOCK_CDN_ORIGIN,
  getMockCdnBucketInventory,
  inspectMockCdnAppStage,
  normalizeMockCdnOrigin,
  publishMockCdnAppStage,
  resolveMockCdnBucketRoot,
  selectMockCdnAppRelease
} = mockCdnBucket;

const apiRoot = '/api/local-cdn';
const maximumAdminBodyBytes = 16 * 1024;
const maximumExportEntries = 5_000;

interface LocalCdnAdminOptions {
  bucketRoot?: string;
  mockCdnOrigin?: string;
}

interface ApprovedPublishSource {
  sourceId: string;
  label: string;
  stageDir: string;
  status: 'verified' | 'invalid';
  appId?: string;
  releaseId?: string;
  releaseBaseUrl?: string;
  generatedAt?: string;
  manifestSha256?: string;
  files?: number;
}

export function spfxLocalCdnAdminApi(): Plugin {
  const options: LocalCdnAdminOptions = {
    bucketRoot: process.env.SPFX_KIT_MOCK_CDN_ROOT || DEFAULT_MOCK_CDN_BUCKET_PATH,
    mockCdnOrigin: process.env.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN
  };
  return {
    name: 'spfx-kit-local-cdn-admin-api',
    configureServer(server) {
      server.middlewares.use(apiRoot, createLocalCdnAdminRequestHandler(rootDir, options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiRoot, createLocalCdnAdminRequestHandler(rootDir, options));
    }
  };
}

export function createLocalCdnAdminRequestHandler(workspaceRoot: string, options: LocalCdnAdminOptions = {}) {
  const store = createLocalCdnAdminStore(workspaceRoot, options);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (pathname !== '/' && pathname !== '/publish' && pathname !== '/select') {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');

    if (!isLoopbackAdminRequest(req)) {
      res.statusCode = 403;
      sendJson(res, { error: 'Local CDN administration is available only from the loopback Lab.' });
      return;
    }

    if (pathname === '/' && req.method === 'GET') {
      if (!isSameOriginRequest(req)) {
        res.statusCode = 403;
        sendJson(res, { error: 'Local CDN inventory requires a same-origin Lab request.' });
        return;
      }
      try {
        sendJson(res, await store.inventory());
      } catch {
        res.statusCode = 409;
        sendJson(res, { error: 'Local CDN inventory could not be validated.' });
      }
      return;
    }

    if (pathname === '/' || req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', pathname === '/' ? 'GET' : 'POST');
      sendJson(res, { error: 'Method not allowed.' });
      return;
    }
    if (!verifyStateChangingLabRequest(req, res)) {
      return;
    }

    try {
      const body = await readJsonBody(req, maximumAdminBodyBytes);
      if (pathname === '/publish') {
        assertExactBodyKeys(body, ['sourceId']);
        const result = await store.publish(requiredBodyString(body.sourceId, 'sourceId'));
        res.statusCode = result.published ? 201 : 200;
        sendJson(res, result);
        return;
      }
      assertExactBodyKeys(body, ['appId', 'releaseId']);
      sendJson(res, await store.select(requiredBodyString(body.appId, 'appId'), requiredBodyString(body.releaseId, 'releaseId')));
    } catch (error) {
      const requestError = error instanceof LocalCdnAdminRequestError ? error : undefined;
      const bodyError = error instanceof JsonBodyError ? error : undefined;
      res.statusCode = requestError?.statusCode || bodyError?.statusCode || 409;
      sendJson(res, {
        error:
          requestError?.message ||
          (bodyError
            ? bodyError.statusCode === 413
              ? 'Local CDN administration request is too large.'
              : 'Local CDN administration request must contain valid JSON.'
            : pathname === '/publish'
              ? 'The staged release was rejected by canonical mock-CDN validation.'
              : 'The requested immutable release could not be selected.')
      });
    }
  };
}

export function createLocalCdnAdminStore(workspaceRoot: string, options: LocalCdnAdminOptions = {}) {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const bucketRoot = resolveMockCdnBucketRoot(resolvedWorkspaceRoot, options.bucketRoot || DEFAULT_MOCK_CDN_BUCKET_PATH);
  const origin = normalizeMockCdnOrigin(options.mockCdnOrigin || DEFAULT_MOCK_CDN_ORIGIN);
  const approvedSources = new Map<string, ApprovedPublishSource>();

  return {
    async inventory() {
      const [inventory, publishSources] = await Promise.all([
        getMockCdnBucketInventory({ bucketRoot, origin }),
        enumerateApprovedPublishSources(resolvedWorkspaceRoot, origin, approvedSources)
      ]);
      return { ...inventory, publishSources };
    },

    async publish(sourceId: string) {
      await enumerateApprovedPublishSources(resolvedWorkspaceRoot, origin, approvedSources);
      const source = approvedSources.get(sourceId);
      if (!source || source.status !== 'verified') {
        throw new LocalCdnAdminRequestError(409, 'Refresh the inventory and choose a verified staged release source.');
      }
      await assertApprovedStageSource(resolvedWorkspaceRoot, source.stageDir);
      const revalidated = await inspectMockCdnAppStage({ origin, stageDir: source.stageDir });
      if (
        source.appId !== revalidated.appId ||
        source.releaseId !== revalidated.releaseId ||
        source.manifestSha256 !== revalidated.manifestSha256
      ) {
        approvedSources.delete(sourceId);
        throw new LocalCdnAdminRequestError(
          409,
          'The staged release changed after inventory refresh. Refresh and choose it again.'
        );
      }
      return publishMockCdnAppStage({
        bucketRoot,
        origin,
        stageDir: source.stageDir,
        select: false,
        expectedManifestSha256: source.manifestSha256
      });
    },

    async select(appId: string, releaseId: string) {
      const pointer = await selectMockCdnAppRelease({ bucketRoot, origin, appId, releaseId });
      return {
        appId: pointer.appId,
        releaseId: pointer.releaseId,
        manifestSha256: pointer.deploymentManifestSha256,
        status: 'selected-and-verified'
      };
    }
  };
}

async function enumerateApprovedPublishSources(
  workspaceRoot: string,
  origin: string,
  registry: Map<string, ApprovedPublishSource>
): Promise<Array<Omit<ApprovedPublishSource, 'stageDir'>>> {
  registry.clear();
  const exportsRoot = path.join(workspaceRoot, '.spfx-kit', 'exports');
  try {
    await assertRealDirectoryWithin(workspaceRoot, exportsRoot, 'SPFx Kit exports root');
  } catch (error) {
    if (isMissingError(error)) {
      return [];
    }
    throw error;
  }

  const stageDirs: string[] = [];
  let visitedEntries = 0;
  async function listRealChildren(directory: string, label: string): Promise<string[]> {
    const children: string[] = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      visitedEntries += 1;
      if (visitedEntries > maximumExportEntries) {
        throw new Error('SPFx Kit exports inventory is too large to enumerate safely.');
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const candidate = path.join(directory, entry.name);
      await assertRealDirectoryWithin(exportsRoot, candidate, label);
      children.push(candidate);
    }
    return children;
  }
  for (const appDirectory of await listRealChildren(exportsRoot, 'SPFx Kit export app directory')) {
    for (const exportDirectory of await listRealChildren(appDirectory, 'SPFx Kit immutable export directory')) {
      const stageDir = path.join(exportDirectory, 'staging-cdn');
      try {
        await assertRealDirectoryWithin(exportsRoot, stageDir, 'Staged release source');
        stageDirs.push(stageDir);
      } catch (error) {
        if (!isMissingError(error)) {
          continue;
        }
      }
    }
  }

  const sources: Array<Omit<ApprovedPublishSource, 'stageDir'>> = [];
  for (const stageDir of stageDirs.sort()) {
    const label = path.relative(workspaceRoot, stageDir).replaceAll(path.sep, '/');
    let source: ApprovedPublishSource;
    try {
      const inspected = await inspectMockCdnAppStage({ origin, stageDir });
      const sourceId = deterministicSourceId(label, inspected.appId, inspected.releaseId, inspected.manifestSha256);
      source = {
        sourceId,
        label,
        stageDir,
        status: 'verified',
        appId: inspected.appId,
        releaseId: inspected.releaseId,
        releaseBaseUrl: inspected.releaseBaseUrl,
        generatedAt: inspected.manifest.generatedAt,
        manifestSha256: inspected.manifestSha256,
        files: inspected.manifest.files.length
      };
    } catch {
      const sourceId = deterministicSourceId(label, 'invalid', 'invalid', 'invalid');
      source = { sourceId, label, stageDir, status: 'invalid' };
    }
    registry.set(source.sourceId, source);
    sources.push(
      source.status === 'verified'
        ? {
            sourceId: source.sourceId,
            label: source.label,
            status: source.status,
            appId: source.appId,
            releaseId: source.releaseId,
            releaseBaseUrl: source.releaseBaseUrl,
            generatedAt: source.generatedAt,
            manifestSha256: source.manifestSha256,
            files: source.files
          }
        : { sourceId: source.sourceId, label: source.label, status: source.status }
    );
  }
  return sources;
}

function deterministicSourceId(label: string, appId: string, releaseId: string, manifestSha256: string): string {
  return `stage_${createHash('sha256').update(`${label}\0${appId}\0${releaseId}\0${manifestSha256}`).digest('hex')}`;
}

async function assertApprovedStageSource(workspaceRoot: string, stageDir: string): Promise<void> {
  const exportsRoot = path.join(workspaceRoot, '.spfx-kit', 'exports');
  await assertRealDirectoryWithin(workspaceRoot, exportsRoot, 'SPFx Kit exports root');
  await assertRealDirectoryWithin(exportsRoot, stageDir, 'Staged release source');
  if (path.basename(stageDir) !== 'staging-cdn') {
    throw new Error('Approved staged release source must be a staging-cdn directory.');
  }
}

async function assertRealDirectoryWithin(root: string, directory: string, label: string): Promise<void> {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  const relative = path.relative(realRoot, realDirectory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
}

function isLoopbackAdminRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host) {
    return false;
  }
  try {
    if (new URL(`http://${host}`).hostname !== '127.0.0.1') {
      return false;
    }
  } catch {
    return false;
  }
  const remoteAddress = req.socket.remoteAddress;
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

function assertExactBodyKeys(body: Record<string, unknown>, keys: string[]): void {
  if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify([...keys].sort())) {
    throw new LocalCdnAdminRequestError(400, 'Local CDN administration request has unsupported or missing fields.');
  }
}

function requiredBodyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 256) {
    throw new LocalCdnAdminRequestError(400, `Local CDN ${name} must be a normalized string.`);
  }
  return value;
}

function isMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

class LocalCdnAdminRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}
