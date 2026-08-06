import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import * as mockCdnBucket from '../../../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';
const {
  DEFAULT_MOCK_CDN_BUCKET_PATH,
  DEFAULT_MOCK_CDN_ORIGIN,
  normalizeMockCdnOrigin,
  normalizeMockCdnPublicOrigin,
  resolveMockCdnBucketRoot,
  resolveSelectedMockCdnAppRelease
} = mockCdnBucket;
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import { assetUrl, safeLocalPath } from '../../../packages/spfx-tools/src/lib/cdn-stage-paths.mjs';
// @ts-expect-error The shared SPFx tooling is an untyped ESM package.
import { readSppkgComponentManifestsFromBytes } from '../../../packages/spfx-tools/src/lib/sppkg.mjs';
import { isSameOriginRequest, sendJson } from './http';
import { rootDir } from './paths';
import { sanitizeSlug } from './sanitize';

const apiRoot = '/api/lab-packages';

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
  package: { path: string; bytes: number; sha256: string };
  files: CdnStageFile[];
}

interface SelectedMockCdnRelease {
  appId: string;
  releaseId: string;
  releaseBaseUrl: string;
  releaseDir: string;
  manifest: ValidatedCdnStageManifest;
  manifestSha256: string;
}

interface ValidatedSelectedRelease extends SelectedMockCdnRelease {
  componentManifests: ReadonlyArray<{
    manifest?: { id?: unknown; loaderConfig?: unknown };
    source: string;
  }>;
}

export interface CdnRuntimeSessionStoreOptions {
  bucketRoot?: string;
  mockCdnOrigin?: string;
  publicMockCdnOrigin?: string;
}

export interface CdnRuntimeDescriptor {
  mode: 'cdn';
  appId: string;
  releaseId: string;
  generatedAt: string;
  cdnBasePath: string;
  delivery: {
    kind: 'local-mock-cdn';
    origin: string;
    bucketBaseUrl: string;
    namespaceKind: 'app-release';
    namespacePath: string;
    releaseBaseUrl: string;
    releaseManifestUrl: string;
    status: 'published-and-verified';
  };
  assets: Array<{
    role: 'dependency' | 'entry';
    moduleId: string;
    assetPath: string;
    assetUrl: string;
    bytes: number;
    sha256: string;
    stageStatus: 'allowed-and-verified';
  }>;
  deferredResources: Array<{
    moduleId: string;
    kind: 'spfx-component';
    componentId: string;
    version: string;
    status: 'deferred';
    reason: 'sharepoint-loader-not-exercised';
  }>;
  packagePath: string;
}

export function spfxLabPackagesApi(): Plugin {
  const options: CdnRuntimeSessionStoreOptions = {
    bucketRoot: process.env.SPFX_KIT_MOCK_CDN_ROOT || DEFAULT_MOCK_CDN_BUCKET_PATH,
    mockCdnOrigin: process.env.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN,
    publicMockCdnOrigin:
      process.env.SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN || process.env.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN
  };
  return {
    name: 'spfx-kit-lab-packages-api',
    configureServer(server) {
      server.middlewares.use(apiRoot, createLabPackagesRequestHandler(rootDir, options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiRoot, createLabPackagesRequestHandler(rootDir, options));
    }
  };
}

export function createLabPackagesRequestHandler(workspaceRoot: string, options: CdnRuntimeSessionStoreOptions = {}) {
  const sessionStore = createCdnRuntimeSessionStore(workspaceRoot, options);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const rawPath = requestPath(req.url);
    if (rawPath !== '/cdn') {
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
      sendJson(res, { error: 'Lab package descriptors require a same-origin request.' });
      return;
    }

    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const descriptor = await sessionStore.resolveDescriptor(
        requiredSingleQueryValue(url, 'app'),
        optionalSingleQueryValue(url, 'component')
      );
      res.setHeader('Cache-Control', 'no-store');
      sendJson(res, descriptor);
    } catch (error) {
      const requestError = error instanceof LabPackageRequestError ? error : undefined;
      res.statusCode = requestError?.statusCode || 409;
      res.setHeader('Cache-Control', 'no-store');
      sendJson(res, {
        error: requestError?.publicMessage || 'Local mock CDN release is unavailable.'
      });
    }
  };
}

export function createCdnRuntimeSessionStore(
  workspaceRoot: string,
  options: CdnRuntimeSessionStoreOptions = {}
): {
  resolveDescriptor(requestedAppId: string, requestedComponentId?: string): Promise<CdnRuntimeDescriptor>;
} {
  const bucketRoot = resolveMockCdnBucketRoot(workspaceRoot, options.bucketRoot || DEFAULT_MOCK_CDN_BUCKET_PATH);
  const mockCdnOrigin = normalizeMockCdnOrigin(options.mockCdnOrigin || DEFAULT_MOCK_CDN_ORIGIN);
  const publicMockCdnOrigin = normalizeMockCdnPublicOrigin(options.publicMockCdnOrigin || mockCdnOrigin);

  return {
    async resolveDescriptor(requestedAppId, requestedComponentId) {
      const appId = sanitizeRuntimeAppId(requestedAppId);
      let release: SelectedMockCdnRelease;
      try {
        release = (await resolveSelectedMockCdnAppRelease({
          bucketRoot,
          origin: mockCdnOrigin,
          appId
        })) as SelectedMockCdnRelease;
      } catch {
        throw unavailable();
      }
      return describeSelectedMockCdnRelease(await validateSelectedPackage(release), requestedComponentId, publicMockCdnOrigin);
    }
  };
}

async function validateSelectedPackage(release: SelectedMockCdnRelease): Promise<ValidatedSelectedRelease> {
  const packageFile = safeLocalPath(release.releaseDir, release.manifest.package.path);
  await assertRealFileWithin(release.releaseDir, packageFile);
  const packageBytes = await readFile(packageFile);
  if (packageBytes.length !== release.manifest.package.bytes || sha256(packageBytes) !== release.manifest.package.sha256) {
    throw unavailable();
  }
  const componentManifests = Object.freeze(
    readSppkgComponentManifestsFromBytes(packageBytes, 'selected local mock CDN SPFx package')
  );
  return { ...release, componentManifests };
}

async function describeSelectedMockCdnRelease(
  release: ValidatedSelectedRelease,
  requestedComponentId: string | undefined,
  publicMockCdnOrigin: string
): Promise<CdnRuntimeDescriptor> {
  const componentId = requestedComponentId === undefined ? undefined : sanitizeComponentId(requestedComponentId);
  const componentManifests = componentId
    ? release.componentManifests.filter(({ manifest }) => String(manifest?.id || '').trim() === componentId)
    : release.componentManifests;
  if (!componentId && componentManifests.length > 1) {
    throw new LabPackageRequestError(
      409,
      'This package contains multiple SPFx components; the Lab adapter must supply a component id.'
    );
  }
  if (componentManifests.length !== 1) {
    throw unavailable();
  }

  const componentManifest = componentManifests[0].manifest as {
    loaderConfig?: { entryModuleId?: unknown; scriptResources?: Record<string, unknown> };
  };
  const entryModuleId = componentManifest.loaderConfig?.entryModuleId;
  const scriptResources = componentManifest.loaderConfig?.scriptResources;
  if (typeof entryModuleId !== 'string' || !scriptResources || Array.isArray(scriptResources)) {
    throw unavailable();
  }
  const validatedEntryModuleId = validateRuntimeResourceIdentity(entryModuleId, 'Component entry module id');
  const entryResourcePath = resolveScriptResourcePath(scriptResources[entryModuleId]);
  if (!entryResourcePath) {
    throw unavailable();
  }

  const namespacePath = `apps/${release.appId}/versions/${release.releaseId}/`;
  // The release was verified against the local bucket before reaching this
  // point. Browser-facing descriptor URLs must use the configured public
  // forwarder rather than leaking an unreachable loopback address to a cloud
  // preview.
  const releaseBaseUrl = new URL(namespacePath, `${publicMockCdnOrigin}/`).href;
  const entryAsset = resolveUniqueManifestAsset(release.manifest, entryResourcePath);
  const dependencyAssets = Object.entries(scriptResources)
    .filter(([moduleId, resource]) => moduleId !== entryModuleId && !isComponentScriptResource(resource))
    .map(([moduleId, resource]) => {
      const asset = resolveUniqueManifestAsset(release.manifest, requireScriptResourcePath(resource));
      return describeAsset(
        'dependency',
        validateRuntimeResourceIdentity(moduleId, 'Component dependency module id'),
        asset,
        releaseBaseUrl
      );
    })
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  const assets = [...dependencyAssets, describeAsset('entry', validatedEntryModuleId, entryAsset, releaseBaseUrl)];
  assertUniqueRuntimeAssets(assets);
  const deferredResources = Object.entries(scriptResources)
    .filter((entry): entry is [string, Record<string, unknown>] => isComponentScriptResource(entry[1]))
    .map(([moduleId, resource]) => describeDeferredComponentResource(moduleId, resource))
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId));

  return {
    mode: 'cdn',
    appId: release.appId,
    releaseId: release.releaseId,
    generatedAt: release.manifest.generatedAt,
    cdnBasePath: releaseBaseUrl,
    delivery: {
      kind: 'local-mock-cdn',
      origin: publicMockCdnOrigin,
      bucketBaseUrl: `${publicMockCdnOrigin}/`,
      namespaceKind: 'app-release',
      namespacePath,
      releaseBaseUrl,
      releaseManifestUrl: new URL('deployment-manifest.json', releaseBaseUrl).href,
      status: 'published-and-verified'
    },
    assets,
    deferredResources,
    packagePath: release.manifest.package.path
  };
}

function describeAsset(
  role: 'dependency' | 'entry',
  moduleId: string,
  descriptor: CdnStageFile,
  releaseBaseUrl: string
): CdnRuntimeDescriptor['assets'][number] {
  return {
    role,
    moduleId,
    assetPath: descriptor.path,
    assetUrl: assetUrl(releaseBaseUrl, descriptor.path),
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
    stageStatus: 'allowed-and-verified'
  };
}

function isComponentScriptResource(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === 'component';
}

function describeDeferredComponentResource(
  moduleId: string,
  resource: Record<string, unknown>
): CdnRuntimeDescriptor['deferredResources'][number] {
  return {
    moduleId: validateRuntimeResourceIdentity(moduleId, 'Deferred component module id'),
    kind: 'spfx-component',
    componentId: validateRuntimeResourceIdentity(resource.id, `Component dependency ${moduleId} id`),
    version: validateRuntimeResourceIdentity(resource.version, `Component dependency ${moduleId} version`),
    status: 'deferred',
    reason: 'sharepoint-loader-not-exercised'
  };
}

function resolveUniqueManifestAsset(manifest: ValidatedCdnStageManifest, resourcePath: string): CdnStageFile {
  const resourceUrl = new URL(resourcePath, manifest.cdnBasePath).href;
  const matches = manifest.files.filter((file) => file.url === resourceUrl);
  if (matches.length !== 1) {
    throw unavailable();
  }
  return matches[0];
}

function requireScriptResourcePath(value: unknown): string {
  const resourcePath = resolveScriptResourcePath(value);
  if (!resourcePath) {
    throw unavailable();
  }
  return resourcePath;
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

function validateRuntimeResourceIdentity(value: unknown, _label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 200 ||
    [...value].some(isControlCharacter)
  ) {
    throw unavailable();
  }
  return value;
}

function assertUniqueRuntimeAssets(assets: CdnRuntimeDescriptor['assets']): void {
  const moduleIds = new Set<string>();
  const paths = new Set<string>();
  for (const candidate of assets) {
    if (moduleIds.has(candidate.moduleId) || paths.has(candidate.assetPath)) {
      throw unavailable();
    }
    moduleIds.add(candidate.moduleId);
    paths.add(candidate.assetPath);
  }
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

async function assertRealFileWithin(root: string, file: string): Promise<void> {
  const fileStats = await lstat(file);
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw unavailable();
  }
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw unavailable();
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function badRequest(message: string): LabPackageRequestError {
  return new LabPackageRequestError(400, message);
}

function unavailable(): LabPackageRequestError {
  return new LabPackageRequestError(
    409,
    'The selected local mock CDN release is missing, invalid, or incomplete. Export and publish a local staging-cdn release, then retry.'
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
