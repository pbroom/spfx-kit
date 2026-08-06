const CDN_DESCRIPTOR_ENDPOINT = '/api/lab-packages/cdn';
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CdnPackageDescriptor {
  mode: 'cdn';
  appId: string;
  releaseId: string;
  generatedAt: string;
  cdnBasePath: string;
  delivery: CdnPackageDelivery;
  packagePath: string;
  assets: CdnPackageScriptAsset[];
  deferredResources: CdnPackageDeferredResource[];
}

export interface CdnPackageDelivery {
  kind: 'local-mock-cdn';
  origin: string;
  bucketBaseUrl: string;
  namespaceKind: 'app-release';
  namespacePath: string;
  releaseBaseUrl: string;
  releaseManifestUrl: string;
  status: 'published-and-verified';
}

export interface CdnPackageScriptAsset {
  role: 'dependency' | 'entry';
  moduleId: string;
  assetPath: string;
  assetUrl: string;
  bytes: number;
  sha256: string;
  stageStatus: 'allowed-and-verified';
}

export interface CdnPackageDeferredResource {
  moduleId: string;
  kind: 'spfx-component';
  componentId: string;
  version: string;
  status: 'deferred';
  reason: 'sharepoint-loader-not-exercised';
}

export async function loadCdnPackageDescriptor(
  appId: string,
  componentId: string | undefined,
  signal: AbortSignal
): Promise<CdnPackageDescriptor> {
  const normalizedAppId = appId.trim();
  if (!normalizedAppId) {
    throw new Error('A managed app id is required to check the staged CDN bundle.');
  }
  if (componentId !== undefined && !componentId.trim()) {
    throw new Error('The staged CDN component id cannot be empty.');
  }

  const query = new URLSearchParams({ app: normalizedAppId });
  if (componentId !== undefined) {
    query.set('component', componentId.trim());
  }

  const response = await fetch(`${CDN_DESCRIPTOR_ENDPOINT}?${query}`, {
    cache: 'no-store',
    redirect: 'error',
    signal
  });
  const descriptorValue = await readJsonResponse(response, 'Staged CDN descriptor');
  return validateCdnPackageDescriptor(descriptorValue, normalizedAppId);
}

export function validateCdnPackageDescriptor(value: unknown, expectedAppId: string): CdnPackageDescriptor {
  if (!isRecord(value)) {
    throw new Error('Staged CDN descriptor must be an object.');
  }
  if (value.mode !== 'cdn') {
    throw new Error('Staged CDN descriptor has an invalid mode.');
  }

  const appId = requireString(value.appId, 'appId');
  if (appId !== expectedAppId) {
    throw new Error('Staged CDN descriptor does not match the selected app.');
  }

  const releaseId = requireString(value.releaseId, 'releaseId');
  if (!RELEASE_ID_PATTERN.test(releaseId) || !/\d/.test(releaseId)) {
    throw new Error('Staged CDN descriptor releaseId is invalid.');
  }

  const generatedAt = requireString(value.generatedAt, 'generatedAt');
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Staged CDN descriptor generatedAt is invalid.');
  }

  const packagePath = validatePortablePath(requireString(value.packagePath, 'packagePath'), 'packagePath');

  const delivery = validateDelivery(value.delivery, appId, releaseId, getLabOrigin());
  const cdnBasePath = validateCdnBasePath(requireString(value.cdnBasePath, 'cdnBasePath'), delivery.releaseBaseUrl);

  if (!Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > 100) {
    throw new Error('Staged CDN descriptor assets must contain between 1 and 100 items.');
  }
  const assets = value.assets.map((asset, index) => validateScriptAsset(asset, index, delivery));
  const assetModuleIds = new Set<string>();
  const assetPaths = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    if (assetModuleIds.has(asset.moduleId) || assetPaths.has(asset.assetPath)) {
      throw new Error('Staged CDN descriptor contains duplicate script assets.');
    }
    if (asset.role === 'entry' && index !== assets.length - 1) {
      throw new Error('Staged CDN descriptor entry asset must be last.');
    }
    assetModuleIds.add(asset.moduleId);
    assetPaths.add(asset.assetPath);
  }
  if (assets[assets.length - 1].role !== 'entry' || assets.slice(0, -1).some((asset) => asset.role !== 'dependency')) {
    throw new Error('Staged CDN descriptor must contain dependencies followed by exactly one entry asset.');
  }

  if (!Array.isArray(value.deferredResources) || value.deferredResources.length > 100) {
    throw new Error('Staged CDN descriptor deferredResources must be an array with at most 100 items.');
  }
  const deferredResources = value.deferredResources.map((resource, index) => validateDeferredResource(resource, index));
  const deferredModuleIds = new Set<string>();
  for (const resource of deferredResources) {
    if (deferredModuleIds.has(resource.moduleId) || assetModuleIds.has(resource.moduleId)) {
      throw new Error('Staged CDN descriptor contains duplicate resource module ids.');
    }
    deferredModuleIds.add(resource.moduleId);
  }

  return {
    mode: 'cdn',
    appId,
    releaseId,
    generatedAt,
    cdnBasePath,
    delivery,
    packagePath,
    assets,
    deferredResources
  };
}

function validateScriptAsset(value: unknown, index: number, delivery: CdnPackageDelivery): CdnPackageScriptAsset {
  if (!isRecord(value)) {
    throw new Error(`Staged CDN asset ${index} must be an object.`);
  }
  if (value.role !== 'dependency' && value.role !== 'entry') {
    throw new Error(`Staged CDN asset ${index} has an invalid role.`);
  }
  const moduleId = requireString(value.moduleId, `assets[${index}].moduleId`);
  if (moduleId.length > 200 || hasControlCharacter(moduleId)) {
    throw new Error(`Staged CDN asset ${index} has an invalid moduleId.`);
  }
  const assetPath = validatePortablePath(
    requireString(value.assetPath, `assets[${index}].assetPath`),
    `assets[${index}].assetPath`
  );
  if (!/\.(?:m?js)$/i.test(assetPath)) {
    throw new Error(`Staged CDN asset ${index} must name a JavaScript asset.`);
  }
  const assetUrl = validateMockCdnUrl(
    requireString(value.assetUrl, `assets[${index}].assetUrl`),
    delivery.origin,
    `assets[${index}].assetUrl`
  );
  const expectedAssetUrl = new URL(encodePortablePath(assetPath), delivery.releaseBaseUrl);
  if (assetUrl.href !== expectedAssetUrl.href) {
    throw new Error(`Staged CDN asset ${index} URL does not match its assetPath.`);
  }
  if (value.stageStatus !== 'allowed-and-verified') {
    throw new Error(`Staged CDN asset ${index} has an invalid stageStatus.`);
  }
  return {
    role: value.role,
    moduleId,
    assetPath,
    assetUrl: assetUrl.href,
    bytes: validateByteLength(value.bytes, `assets[${index}].bytes`),
    sha256: validateSha256(value.sha256, `assets[${index}].sha256`),
    stageStatus: value.stageStatus
  };
}

function validateDelivery(value: unknown, appId: string, releaseId: string, labOrigin: string): CdnPackageDelivery {
  if (!isRecord(value)) {
    throw new Error('Staged CDN descriptor delivery must be an object.');
  }
  if (value.kind !== 'local-mock-cdn' || value.namespaceKind !== 'app-release' || value.status !== 'published-and-verified') {
    throw new Error('Staged CDN descriptor delivery has invalid status metadata.');
  }
  const originUrl = validateMockCdnOrigin(requireString(value.origin, 'delivery.origin'), labOrigin);
  const bucketBaseUrl = validateMockCdnUrl(
    requireString(value.bucketBaseUrl, 'delivery.bucketBaseUrl'),
    originUrl.origin,
    'delivery.bucketBaseUrl'
  );
  if (bucketBaseUrl.href !== `${originUrl.origin}/`) {
    throw new Error('Staged CDN descriptor delivery.bucketBaseUrl must be the mock CDN origin root.');
  }
  if (encodeURIComponent(appId) !== appId) {
    throw new Error('Staged CDN descriptor appId cannot identify a safe mock CDN namespace.');
  }
  const expectedNamespacePath = `apps/${appId}/versions/${releaseId}/`;
  const namespacePath = validatePortableDirectoryPath(
    requireString(value.namespacePath, 'delivery.namespacePath'),
    'delivery.namespacePath'
  );
  if (namespacePath !== expectedNamespacePath) {
    throw new Error('Staged CDN descriptor delivery namespace does not match the selected app and release.');
  }
  const releaseBaseUrl = validateMockCdnUrl(
    requireString(value.releaseBaseUrl, 'delivery.releaseBaseUrl'),
    originUrl.origin,
    'delivery.releaseBaseUrl'
  );
  const expectedReleaseBaseUrl = new URL(encodePortablePath(namespacePath), bucketBaseUrl);
  if (releaseBaseUrl.href !== expectedReleaseBaseUrl.href || !releaseBaseUrl.pathname.endsWith('/')) {
    throw new Error('Staged CDN descriptor delivery.releaseBaseUrl does not match its immutable namespace.');
  }
  const releaseManifestUrl = validateMockCdnUrl(
    requireString(value.releaseManifestUrl, 'delivery.releaseManifestUrl'),
    originUrl.origin,
    'delivery.releaseManifestUrl'
  );
  if (releaseManifestUrl.href !== new URL('deployment-manifest.json', releaseBaseUrl).href) {
    throw new Error('Staged CDN descriptor delivery.releaseManifestUrl does not match its immutable release.');
  }
  return {
    kind: value.kind,
    origin: originUrl.origin,
    bucketBaseUrl: bucketBaseUrl.href,
    namespaceKind: value.namespaceKind,
    namespacePath,
    releaseBaseUrl: releaseBaseUrl.href,
    releaseManifestUrl: releaseManifestUrl.href,
    status: value.status
  };
}

function validateDeferredResource(value: unknown, index: number): CdnPackageDeferredResource {
  if (!isRecord(value)) {
    throw new Error(`Staged CDN deferred resource ${index} must be an object.`);
  }
  const moduleId = validateResourceIdentity(value.moduleId, `deferredResources[${index}].moduleId`);
  const componentId = validateResourceIdentity(value.componentId, `deferredResources[${index}].componentId`);
  const version = validateResourceIdentity(value.version, `deferredResources[${index}].version`);
  if (value.kind !== 'spfx-component' || value.status !== 'deferred' || value.reason !== 'sharepoint-loader-not-exercised') {
    throw new Error(`Staged CDN deferred resource ${index} has invalid status metadata.`);
  }
  return {
    moduleId,
    kind: value.kind,
    componentId,
    version,
    status: value.status,
    reason: value.reason
  };
}

function validateResourceIdentity(value: unknown, field: string): string {
  const identity = requireString(value, field);
  if (identity.length > 200 || hasControlCharacter(identity)) {
    throw new Error(`Staged CDN descriptor ${field} is invalid.`);
  }
  return identity;
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let serverMessage = '';
    const value = tryParseJson(text);
    if (isRecord(value) && typeof value.error === 'string') {
      serverMessage = value.error.trim();
    } else if (value === undefined) {
      serverMessage = text.trim();
    }
    throw new Error(`${label} request failed with status ${response.status}${serverMessage ? `: ${serverMessage}` : '.'}`);
  }
  if (!text.trim()) {
    throw new Error(`${label} response is empty.`);
  }
  const value = tryParseJson(text);
  if (value === undefined) {
    throw new Error(`${label} response is not valid JSON.`);
  }
  return value;
}

function validateCdnBasePath(value: string, expectedReleaseBaseUrl: string): string {
  const url = tryParseUrl(value);
  if (!url) {
    throw new Error('Staged CDN descriptor cdnBasePath must be an absolute URL.');
  }
  if (url.href !== expectedReleaseBaseUrl) {
    throw new Error('Staged CDN descriptor cdnBasePath must match the selected local mock CDN release URL.');
  }
  if (!url.pathname.endsWith('/')) {
    throw new Error('Staged CDN descriptor cdnBasePath must end with a slash.');
  }
  return url.href;
}

function validateMockCdnOrigin(value: string, labOrigin: string): URL {
  const url = tryParseUrl(value);
  if (!url) {
    throw new Error('Staged CDN descriptor delivery.origin is not a valid URL.');
  }
  if (url.href !== url.origin && url.href !== `${url.origin}/`) {
    throw new Error('Staged CDN descriptor delivery.origin must contain only an origin.');
  }
  const loopback = url.protocol === 'http:' && isCanonicalLoopbackHostname(url.hostname) && Boolean(url.port);
  const forwarded =
    url.protocol === 'https:' &&
    Boolean(url.hostname) &&
    !isUnspecifiedHostname(url.hostname) &&
    !isLoopbackHostname(url.hostname);
  if ((!loopback && !forwarded) || url.origin === labOrigin || url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Staged CDN descriptor delivery.origin must be a separate credential-free loopback HTTP or forwarded HTTPS origin.'
    );
  }
  return url;
}

function isCanonicalLoopbackHostname(value: string): boolean {
  return String(value).trim().toLowerCase() === '127.0.0.1';
}

function isLoopbackHostname(value: string): boolean {
  const hostname = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === '::1' ||
    /^::(?:ffff:)?7f[\da-f]{2}:[\da-f]{1,4}$/.test(hostname)
  );
}

function isUnspecifiedHostname(value: string): boolean {
  const hostname = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    hostname === '0.0.0.0' ||
    hostname === '::' ||
    hostname === '::ffff:0:0' ||
    hostname === '::ffff:0.0.0.0' ||
    hostname === '255.255.255.255' ||
    /^(?:22[4-9]|23\d)\./.test(hostname) ||
    /^ff[0-9a-f]{2}:/i.test(hostname)
  );
}

function validateMockCdnUrl(value: string, expectedOrigin: string, label: string): URL {
  const url = tryParseUrl(value);
  if (
    !url ||
    url.origin !== expectedOrigin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hasUnsafeEncodedPath(url.pathname)
  ) {
    throw new Error(`Staged CDN descriptor ${label} must stay within the selected local mock CDN origin.`);
  }
  return url;
}

function validatePortableDirectoryPath(value: string, label: string): string {
  if (!value.endsWith('/')) {
    throw new Error(`Staged CDN descriptor ${label} must end with a slash.`);
  }
  validatePortablePath(value.slice(0, -1), label);
  return value;
}

function validatePortablePath(value: string, label: string): string {
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /^[A-Za-z]:/.test(value) ||
    hasControlCharacter(value) ||
    value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Staged CDN descriptor ${label} must be a safe relative path.`);
  }
  return value;
}

function encodePortablePath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function hasUnsafeEncodedPath(pathname: string): boolean {
  try {
    return pathname.split('/').some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
    });
  } catch {
    return true;
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function validateByteLength(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Staged CDN descriptor ${field} must be a positive integer.`);
  }
  return value as number;
}

function validateSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`Staged CDN descriptor ${field} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function tryParseUrl(value: string, base?: string): URL | undefined {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return undefined;
  }
}

function getLabOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('The Lab origin is unavailable.');
  }
  return new URL(window.location.origin).origin;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`Staged CDN descriptor ${field} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
