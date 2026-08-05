const CDN_DESCRIPTOR_ENDPOINT = '/api/lab-packages/cdn';
const CDN_ASSET_API_PREFIX = '/api/lab-packages/cdn-assets/';
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CdnPackageDescriptor {
  mode: 'cdn';
  appId: string;
  releaseId: string;
  generatedAt: string;
  cdnBasePath: string;
  assetBaseUrl: string;
  entryAssetPath: string;
  entryAssetUrl: string;
  entryAssetBytes: number;
  entryAssetSha256: string;
  packagePath: string;
  dependencyAssets: CdnPackageScriptAsset[];
}

export interface CdnPackageScriptAsset {
  moduleId: string;
  assetPath: string;
  assetUrl: string;
  bytes: number;
  sha256: string;
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

  const cdnBasePath = validateCdnBasePath(requireString(value.cdnBasePath, 'cdnBasePath'));
  const entryAssetPath = validatePortablePath(requireString(value.entryAssetPath, 'entryAssetPath'), 'entryAssetPath');
  const packagePath = validatePortablePath(requireString(value.packagePath, 'packagePath'), 'packagePath');
  if (!/\.(?:m?js)$/i.test(entryAssetPath)) {
    throw new Error('Staged CDN descriptor entryAssetPath must name a JavaScript asset.');
  }

  const labOrigin = getLabOrigin();
  const assetBaseUrl = validateSimulationUrl(requireString(value.assetBaseUrl, 'assetBaseUrl'), labOrigin, 'assetBaseUrl');
  if (!assetBaseUrl.pathname.endsWith('/')) {
    throw new Error('Staged CDN descriptor assetBaseUrl must end with a slash.');
  }
  const entryAssetUrl = validateSimulationUrl(requireString(value.entryAssetUrl, 'entryAssetUrl'), labOrigin, 'entryAssetUrl');
  const expectedEntryUrl = new URL(encodePortablePath(entryAssetPath), assetBaseUrl);
  if (entryAssetUrl.href !== expectedEntryUrl.href) {
    throw new Error('Staged CDN descriptor entryAssetUrl does not match entryAssetPath.');
  }
  const entryAssetBytes = validateByteLength(value.entryAssetBytes, 'entryAssetBytes');
  const entryAssetSha256 = validateSha256(value.entryAssetSha256, 'entryAssetSha256');

  if (!Array.isArray(value.dependencyAssets)) {
    throw new Error('Staged CDN descriptor dependencyAssets must be an array.');
  }
  const dependencyAssets = value.dependencyAssets.map((asset, index) => validateDependencyAsset(asset, index, assetBaseUrl));
  const dependencyModuleIds = new Set<string>();
  const dependencyPaths = new Set<string>();
  for (const dependency of dependencyAssets) {
    if (dependencyModuleIds.has(dependency.moduleId) || dependencyPaths.has(dependency.assetPath)) {
      throw new Error('Staged CDN descriptor contains duplicate dependency assets.');
    }
    if (dependency.assetPath === entryAssetPath) {
      throw new Error('Staged CDN descriptor lists its entry asset as a dependency.');
    }
    dependencyModuleIds.add(dependency.moduleId);
    dependencyPaths.add(dependency.assetPath);
  }

  return {
    mode: 'cdn',
    appId,
    releaseId,
    generatedAt,
    cdnBasePath,
    assetBaseUrl: assetBaseUrl.href,
    entryAssetPath,
    entryAssetUrl: entryAssetUrl.href,
    entryAssetBytes,
    entryAssetSha256,
    packagePath,
    dependencyAssets
  };
}

function validateDependencyAsset(value: unknown, index: number, assetBaseUrl: URL): CdnPackageScriptAsset {
  if (!isRecord(value)) {
    throw new Error(`Staged CDN dependency ${index} must be an object.`);
  }
  const moduleId = requireString(value.moduleId, `dependencyAssets[${index}].moduleId`);
  if (moduleId.length > 200 || hasControlCharacter(moduleId)) {
    throw new Error(`Staged CDN dependency ${index} has an invalid moduleId.`);
  }
  const assetPath = validatePortablePath(
    requireString(value.assetPath, `dependencyAssets[${index}].assetPath`),
    `dependencyAssets[${index}].assetPath`
  );
  if (!/\.(?:m?js)$/i.test(assetPath)) {
    throw new Error(`Staged CDN dependency ${index} must name a JavaScript asset.`);
  }
  const assetUrl = validateSimulationUrl(
    requireString(value.assetUrl, `dependencyAssets[${index}].assetUrl`),
    assetBaseUrl.origin,
    `dependencyAssets[${index}].assetUrl`
  );
  const expectedAssetUrl = new URL(encodePortablePath(assetPath), assetBaseUrl);
  if (assetUrl.href !== expectedAssetUrl.href) {
    throw new Error(`Staged CDN dependency ${index} URL does not match its assetPath.`);
  }
  return {
    moduleId,
    assetPath,
    assetUrl: assetUrl.href,
    bytes: validateByteLength(value.bytes, `dependencyAssets[${index}].bytes`),
    sha256: validateSha256(value.sha256, `dependencyAssets[${index}].sha256`)
  };
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

function validateCdnBasePath(value: string): string {
  const url = tryParseUrl(value);
  if (!url) {
    throw new Error('Staged CDN descriptor cdnBasePath must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Staged CDN descriptor cdnBasePath must be a credential-free HTTPS URL.');
  }
  if (!url.pathname.endsWith('/')) {
    throw new Error('Staged CDN descriptor cdnBasePath must end with a slash.');
  }
  return url.href;
}

function validateSimulationUrl(value: string, labOrigin: string, label: string): URL {
  const url = tryParseUrl(value, labOrigin);
  if (!url) {
    throw new Error(`Staged CDN descriptor ${label} is not a valid URL.`);
  }
  if (
    url.origin !== labOrigin ||
    !url.pathname.startsWith(CDN_ASSET_API_PREFIX) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hasUnsafeEncodedPath(url.pathname)
  ) {
    throw new Error(`Staged CDN descriptor ${label} must stay within the Lab CDN asset API.`);
  }
  return url;
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
