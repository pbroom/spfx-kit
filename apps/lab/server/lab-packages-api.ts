import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import { verifyCdnStage } from '../../../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import { assertPortableAssetPath, safeLocalPath } from '../../../packages/spfx-tools/src/lib/cdn-stage-paths.mjs';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import { readSppkgComponentManifests } from '../../../packages/spfx-tools/src/lib/sppkg.mjs';
import { isSameOriginRequest, sendJson } from './http';
import { rootDir } from './paths';
import { sanitizeSlug } from './sanitize';

const apiRoot = '/api/lab-packages';
const cdnAssetRoute = '/cdn-assets/';
const maximumManifestBytes = 10 * 1024 * 1024;

interface CdnStageFile {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  referencedBy: string[];
}

interface ValidatedCdnStageManifest {
  generatedAt: string;
  slug: string;
  releaseId: string;
  cdnBasePath: string;
  uploadRoot: string;
  package: {
    path: string;
  };
  files: CdnStageFile[];
}

interface ValidatedCdnStage {
  stageDir: string;
  manifest: ValidatedCdnStageManifest;
}

export interface CdnRuntimeDescriptor {
  mode: 'cdn';
  appId: string;
  releaseId: string;
  generatedAt: string;
  cdnBasePath: string;
  assetBaseUrl: string;
  entryAssetPath: string;
  entryAssetUrl: string;
  dependencyAssets: Array<{
    moduleId: string;
    assetPath: string;
    assetUrl: string;
  }>;
  packagePath: string;
}

export interface CdnRuntimeAsset {
  bytes: Buffer;
  contentType: string;
  etag: string;
}

export function spfxLabPackagesApi(): Plugin {
  return {
    name: 'spfx-kit-lab-packages-api',
    configureServer(server) {
      server.middlewares.use(apiRoot, createLabPackagesRequestHandler(rootDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiRoot, createLabPackagesRequestHandler(rootDir));
    }
  };
}

export function createLabPackagesRequestHandler(workspaceRoot: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const rawPath = requestPath(req.url);
    const descriptorRequest = rawPath === '/cdn';
    const assetRequest = rawPath.startsWith(cdnAssetRoute);
    if (!descriptorRequest && !assetRequest) {
      next();
      return;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      sendJson(res, { error: 'Method not allowed.' });
      return;
    }
    if (!isSameOriginRequest(req)) {
      res.statusCode = 403;
      sendJson(res, { error: 'Lab package assets require a same-origin request.' });
      return;
    }

    try {
      if (descriptorRequest) {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const appId = requiredSingleQueryValue(url, 'app');
        const componentId = optionalSingleQueryValue(url, 'component');
        const descriptor = await resolveCdnRuntimeDescriptor(workspaceRoot, appId, componentId);
        res.setHeader('Cache-Control', 'no-store');
        sendJson(res, descriptor);
        return;
      }

      const route = parseCdnAssetRoute(rawPath);
      const asset = await readCdnRuntimeAsset(workspaceRoot, route.appId, route.releaseId, route.assetPath);
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.setHeader('Content-Type', asset.contentType);
      res.setHeader('Content-Length', String(asset.bytes.length));
      res.setHeader('ETag', asset.etag);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(asset.bytes);
    } catch (error) {
      const requestError = error instanceof LabPackageRequestError ? error : undefined;
      res.statusCode = requestError?.statusCode || 409;
      res.setHeader('Cache-Control', 'no-store');
      sendJson(res, {
        error: requestError?.publicMessage || 'CDN package runtime artifact is unavailable.'
      });
    }
  };
}

export async function resolveCdnRuntimeDescriptor(
  workspaceRoot: string,
  requestedAppId: string,
  requestedComponentId?: string
): Promise<CdnRuntimeDescriptor> {
  const appId = sanitizeRuntimeAppId(requestedAppId);
  const componentId = requestedComponentId === undefined ? undefined : sanitizeComponentId(requestedComponentId);
  const stage = await selectLatestValidatedCdnStage(workspaceRoot, appId);
  const packageFile = safeLocalPath(stage.stageDir, stage.manifest.package.path);
  const packagedComponents = await readSppkgComponentManifests(packageFile);
  const componentManifests = componentId
    ? packagedComponents.filter(
        ({ manifest }: { manifest?: { id?: unknown } }) => String(manifest?.id || '').trim() === componentId
      )
    : packagedComponents;
  if (!componentId && componentManifests.length > 1) {
    throw new LabPackageRequestError(
      409,
      'This package contains multiple SPFx components; the Lab adapter must supply a component id.'
    );
  }
  if (componentManifests.length !== 1) {
    throw unavailable(componentManifests.length ? 'Component manifest is ambiguous.' : 'Component manifest was not found.');
  }

  const componentManifest = componentManifests[0].manifest as {
    loaderConfig?: {
      entryModuleId?: unknown;
      scriptResources?: Record<string, unknown>;
    };
  };
  const entryModuleId = componentManifest.loaderConfig?.entryModuleId;
  const scriptResources = componentManifest.loaderConfig?.scriptResources;
  if (typeof entryModuleId !== 'string' || !scriptResources || Array.isArray(scriptResources)) {
    throw unavailable('Component entry module is invalid.');
  }
  const entryResource = scriptResources[entryModuleId];
  const entryResourcePath = resolveScriptResourcePath(entryResource);
  if (!entryResourcePath) {
    throw unavailable('Component entry module must resolve to one path asset.');
  }

  const releaseId = stage.manifest.releaseId;
  const assetBaseUrl = `${apiRoot}${cdnAssetRoute}${encodeURIComponent(appId)}/${encodeURIComponent(releaseId)}/`;
  const entryAssetPath = resolveUniqueManifestAsset(stage.manifest, entryResourcePath, 'Component entry asset').path;
  const dependencyAssets = Object.entries(scriptResources)
    .filter(([moduleId, resource]) => moduleId !== entryModuleId && (!isRecord(resource) || resource.type !== 'component'))
    .map(([moduleId, resource]) => {
      const resourcePath = resolveScriptResourcePath(resource);
      if (!resourcePath) {
        throw unavailable(`Component dependency ${moduleId} does not resolve to one path asset.`);
      }
      const assetPath = resolveUniqueManifestAsset(stage.manifest, resourcePath, `Component dependency ${moduleId}`).path;
      return {
        moduleId,
        assetPath,
        assetUrl: `${assetBaseUrl}${encodePortablePath(assetPath)}`
      };
    })
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  return {
    mode: 'cdn',
    appId,
    releaseId,
    generatedAt: stage.manifest.generatedAt,
    cdnBasePath: stage.manifest.cdnBasePath,
    assetBaseUrl,
    entryAssetPath,
    entryAssetUrl: `${assetBaseUrl}${encodePortablePath(entryAssetPath)}`,
    dependencyAssets,
    packagePath: stage.manifest.package.path
  };
}

export async function readCdnRuntimeAsset(
  workspaceRoot: string,
  requestedAppId: string,
  requestedReleaseId: string,
  requestedAssetPath: string
): Promise<CdnRuntimeAsset> {
  const appId = sanitizeRuntimeAppId(requestedAppId);
  const releaseId = sanitizeReleaseId(requestedReleaseId);
  assertPortableAssetPath(requestedAssetPath, 'CDN runtime asset path');
  const stages = await discoverValidatedCdnStages(workspaceRoot, appId);
  const matches = stages.filter((stage) => stage.manifest.releaseId === releaseId);
  if (matches.length !== 1) {
    throw unavailable(matches.length ? 'CDN release is ambiguous.' : 'CDN release was not found.');
  }

  const stage = matches[0];
  const fileDescriptors = stage.manifest.files.filter((file) => file.path === requestedAssetPath);
  if (fileDescriptors.length !== 1) {
    throw unavailable(fileDescriptors.length ? 'CDN asset is ambiguous.' : 'CDN asset is not allowlisted.');
  }
  const fileDescriptor = fileDescriptors[0];
  const uploadDir = safeLocalPath(stage.stageDir, stage.manifest.uploadRoot);
  const filePath = safeLocalPath(uploadDir, requestedAssetPath);
  await assertRealFileWithin(uploadDir, filePath);
  const bytes = await readFile(filePath);
  const digest = sha256(bytes);
  if (bytes.length !== fileDescriptor.bytes || digest !== fileDescriptor.sha256) {
    throw unavailable('CDN asset no longer matches its validated manifest.');
  }

  return {
    bytes,
    contentType: contentTypeFor(requestedAssetPath),
    etag: `"sha256-${digest}"`
  };
}

export function parseCdnAssetRoute(rawPath: string): { appId: string; releaseId: string; assetPath: string } {
  if (!rawPath.startsWith(cdnAssetRoute)) {
    throw badRequest('Invalid CDN asset route.');
  }
  const encodedSegments = rawPath.slice(cdnAssetRoute.length).split('/');
  if (encodedSegments.length < 3 || encodedSegments.some((segment) => !segment)) {
    throw badRequest('Invalid CDN asset route.');
  }
  const segments = encodedSegments.map((segment) => decodeRouteSegment(segment));
  const appId = sanitizeRuntimeAppId(segments[0]);
  const releaseId = sanitizeReleaseId(segments[1]);
  const assetPath = segments.slice(2).join('/');
  assertPortableAssetPath(assetPath, 'CDN runtime asset path');
  return { appId, releaseId, assetPath };
}

async function selectLatestValidatedCdnStage(workspaceRoot: string, appId: string): Promise<ValidatedCdnStage> {
  const stages = await discoverValidatedCdnStages(workspaceRoot, appId);
  const sorted = [...stages].sort((left, right) => right.manifest.generatedAt.localeCompare(left.manifest.generatedAt));
  if (!sorted.length) {
    throw unavailable('No validated staging CDN artifact was found.');
  }
  if (sorted[1]?.manifest.generatedAt === sorted[0].manifest.generatedAt) {
    throw unavailable('Latest staging CDN artifact is ambiguous.');
  }
  return sorted[0];
}

async function discoverValidatedCdnStages(workspaceRoot: string, appId: string): Promise<ValidatedCdnStage[]> {
  const appExportsDir = path.join(workspaceRoot, '.spfx-kit', 'exports', appId);
  let entries;
  try {
    entries = await readdir(appExportsDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return [];
    }
    throw unavailable('Could not inspect staging CDN artifacts.');
  }

  const stages: ValidatedCdnStage[] = [];
  const releases = new Set<string>();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) {
      throw unavailable('Export artifact directories may not be symbolic links.');
    }
    if (!entry.isDirectory()) {
      continue;
    }
    const exportDir = path.join(appExportsDir, entry.name);
    const stageDir = path.join(exportDir, 'staging-cdn');
    let stageStats;
    try {
      stageStats = await lstat(stageDir);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        continue;
      }
      throw unavailable('Could not inspect a staging CDN artifact.');
    }
    if (!stageStats.isDirectory() || stageStats.isSymbolicLink()) {
      throw unavailable('Staging CDN artifact must be a real directory.');
    }
    await assertRealDirectoryWithin(appExportsDir, stageDir);

    const manifestFile = path.join(stageDir, 'deployment-manifest.json');
    let manifestBytes: Buffer;
    try {
      const manifestStats = await stat(manifestFile);
      if (!manifestStats.isFile() || manifestStats.size <= 0 || manifestStats.size > maximumManifestBytes) {
        throw unavailable('Staging CDN deployment manifest has an invalid size.');
      }
      manifestBytes = await readFile(manifestFile);
    } catch (error) {
      if (error instanceof LabPackageRequestError) {
        throw error;
      }
      throw unavailable('Staging CDN deployment manifest is missing or unreadable.');
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch {
      throw unavailable('Staging CDN deployment manifest is invalid JSON.');
    }
    let rebuilt: ValidatedCdnStageManifest;
    try {
      rebuilt = (await verifyCdnStage(stageDir, manifest)) as ValidatedCdnStageManifest;
    } catch {
      throw unavailable('Staging CDN deployment manifest did not validate.');
    }
    const persistedGeneratedAt = (manifest as { generatedAt: string }).generatedAt;
    const verified = { ...rebuilt, generatedAt: persistedGeneratedAt };
    if (verified.slug !== appId) {
      throw unavailable('Staging CDN artifact does not match the requested app.');
    }
    if (releases.has(verified.releaseId)) {
      throw unavailable('Staging CDN release is ambiguous.');
    }
    releases.add(verified.releaseId);
    stages.push({ stageDir, manifest: verified });
  }
  return stages;
}

function requestPath(requestUrl: string | undefined): string {
  return (requestUrl || '/').split('?', 1)[0] || '/';
}

function requiredSingleQueryValue(url: URL, name: string): string {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || !values[0]) {
    throw badRequest(`Query parameter ${name} is required exactly once.`);
  }
  return values[0];
}

function optionalSingleQueryValue(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (!values.length) {
    return undefined;
  }
  if (values.length !== 1 || !values[0]) {
    throw badRequest(`Query parameter ${name} may be supplied at most once.`);
  }
  return values[0];
}

function sanitizeRuntimeAppId(value: string): string {
  try {
    return sanitizeSlug(value);
  } catch {
    throw badRequest('Invalid app id.');
  }
}

function sanitizeComponentId(value: string): string {
  const componentId = value.trim();
  if (!componentId || componentId.length > 200 || [...componentId].some(isControlCharacter)) {
    throw badRequest('Invalid component id.');
  }
  return componentId;
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0) || 0;
  return codePoint <= 0x1f || codePoint === 0x7f;
}

function sanitizeReleaseId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || !/\d/.test(value)) {
    throw badRequest('Invalid CDN release id.');
  }
  return value;
}

function decodeRouteSegment(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw badRequest('Invalid CDN asset route encoding.');
  }
  if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
    throw badRequest('Invalid CDN asset route segment.');
  }
  return decoded;
}

function encodePortablePath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function assertRealDirectoryWithin(root: string, directory: string): Promise<void> {
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  assertContained(realRoot, realDirectory);
}

async function assertRealFileWithin(root: string, file: string): Promise<void> {
  const fileStats = await lstat(file);
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw unavailable('CDN asset must be a real file.');
  }
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
  assertContained(realRoot, realFile);
}

function assertContained(realRoot: string, realTarget: string): void {
  const relative = path.relative(realRoot, realTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw unavailable('CDN artifact path is outside its validated root.');
  }
}

function contentTypeFor(filePath: string): string {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.wasm':
      return 'application/wasm';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveScriptResourcePath(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.type === 'path' && typeof value.path === 'string') {
    return value.path;
  }
  if (value.type === 'localizedPath' && typeof value.defaultPath === 'string') {
    return value.defaultPath;
  }
  return undefined;
}

function resolveUniqueManifestAsset(manifest: ValidatedCdnStageManifest, resourcePath: string, _label: string): CdnStageFile {
  const resourceUrl = new URL(resourcePath, manifest.cdnBasePath).href;
  const matches = manifest.files.filter((file) => file.url === resourceUrl);
  if (matches.length !== 1) {
    throw unavailable('Component script asset is missing or ambiguous.');
  }
  return matches[0];
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function badRequest(message: string): LabPackageRequestError {
  return new LabPackageRequestError(400, message);
}

function unavailable(_internalMessage: string): LabPackageRequestError {
  return new LabPackageRequestError(
    409,
    'The local staging CDN artifact is missing, invalid, or incomplete. Export a new staging-cdn package and retry.'
  );
}

class LabPackageRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}
