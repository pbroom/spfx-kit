import { labApiWriteHeaders, readApiJson } from './labApi';

const LOCAL_CDN_ENDPOINT = '/api/local-cdn';
const BUCKET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^stage_[a-f0-9]{64}$/;
const MAX_RELEASES = 250;
const MAX_ASSETS_PER_RELEASE = 2_000;
const MAX_TOTAL_ASSETS = 10_000;
const MAX_POINTERS = 500;
const MAX_PUBLISH_SOURCES = 500;

export interface LocalCdnBucketInventory {
  schemaVersion: 1;
  origin: string;
  namespaces: {
    apps: { status: 'supported'; releases: LocalCdnAppRelease[] };
    shared: { status: 'reserved-unsupported'; message: string; releases: [] };
  };
  selectedPointers: LocalCdnSelectedPointer[];
  publishSources: LocalCdnPublishSource[];
}

export type LocalCdnAppRelease = LocalCdnInspectableRelease | LocalCdnInvalidRelease;

interface LocalCdnReleaseIdentity {
  namespace: 'app';
  appId: string;
  releaseId: string;
  namespacePath: string;
  releaseBaseUrl: string;
  selected: boolean;
}

export interface LocalCdnInspectableRelease extends LocalCdnReleaseIdentity {
  status: 'verified' | 'anchored' | 'recorded';
  generatedAt: string;
  releaseLabel: string;
  manifestSha256: string;
  manifestBytes: number;
  proof: {
    localArtifact: 'passed';
    remoteCdn: 'not-run';
    sharePointAppCatalog: 'not-run';
  };
  package: {
    path: string;
    bytes: number;
    sha256: string;
    status: 'verified' | 'anchored' | 'recorded';
  };
  components: {
    package: string[];
    generated: string[];
  };
  assets: LocalCdnBucketAsset[];
  sourceProvenance?: GitHubStagingSourceProvenance;
}

export interface GitHubStagingSourceProvenance {
  kind: 'github-directory';
  visibility: 'private';
  repository: string;
  commit: string;
  path: string;
  descriptorSha256: string;
  sourceManifestSha256: string;
  releaseManifestSha256: string;
  files: number;
  status: 'staging-closure-verified';
}

export interface LocalCdnInvalidRelease extends LocalCdnReleaseIdentity {
  status: 'invalid';
}

export interface LocalCdnBucketAsset {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  referencedBy: string[];
  status: 'verified' | 'anchored' | 'recorded';
}

export type LocalCdnSelectedPointer =
  | { appId: string; status: 'none' }
  | { appId: string; releaseId?: string; status: 'invalid' }
  | { appId: string; releaseId: string; manifestSha256: string; status: 'selected-and-verified' };

export type LocalCdnPublishSource =
  | { sourceId: string; label: string; status: 'invalid' }
  | {
      sourceId: string;
      label: string;
      status: 'verified';
      appId: string;
      releaseId: string;
      releaseBaseUrl: string;
      generatedAt: string;
      manifestSha256: string;
      files: number;
    };

export async function loadLocalCdnBucketInventory(signal?: AbortSignal): Promise<LocalCdnBucketInventory> {
  const response = await fetch(LOCAL_CDN_ENDPOINT, { cache: 'no-store', redirect: 'error', signal });
  return validateLocalCdnBucketInventory(await readApiJson<unknown>(response));
}

export async function publishLocalCdnSource(sourceId: string): Promise<void> {
  await requestBucketMutation('/publish', { sourceId });
}

export async function selectLocalCdnRelease(appId: string, releaseId: string): Promise<void> {
  await requestBucketMutation('/select', { appId, releaseId });
}

export function selectedLocalCdnRelease(
  inventory: LocalCdnBucketInventory | undefined,
  appId: string
): LocalCdnInspectableRelease | undefined {
  return inventory?.namespaces.apps.releases.find(
    (release): release is LocalCdnInspectableRelease =>
      release.appId === appId && release.selected && release.status === 'verified'
  );
}

async function requestBucketMutation(path: string, body: Record<string, string>): Promise<void> {
  const response = await fetch(`${LOCAL_CDN_ENDPOINT}${path}`, {
    method: 'POST',
    headers: labApiWriteHeaders,
    redirect: 'error',
    body: JSON.stringify(body)
  });
  await readApiJson<unknown>(response);
}

export function validateLocalCdnBucketInventory(value: unknown): LocalCdnBucketInventory {
  const root = requireRecord(value, 'Local CDN bucket inventory');
  if (root.schemaVersion !== 1) {
    throw new Error('Local CDN bucket inventory has an unsupported schema version.');
  }
  const origin = validateOrigin(root.origin);
  const namespaces = requireRecord(root.namespaces, 'Local CDN bucket namespaces');
  const apps = requireRecord(namespaces.apps, 'Local CDN app namespace');
  const shared = requireRecord(namespaces.shared, 'Local CDN shared namespace');
  if (apps.status !== 'supported' || !Array.isArray(apps.releases)) {
    throw new Error('Local CDN app namespace is invalid.');
  }
  if (
    shared.status !== 'reserved-unsupported' ||
    !Array.isArray(shared.releases) ||
    shared.releases.length ||
    typeof shared.message !== 'string'
  ) {
    throw new Error('Local CDN shared namespace must remain empty and reserved.');
  }
  if (!Array.isArray(root.selectedPointers) || !Array.isArray(root.publishSources)) {
    throw new Error('Local CDN bucket inventory is missing pointers or approved publish sources.');
  }
  if (
    apps.releases.length > MAX_RELEASES ||
    root.selectedPointers.length > MAX_POINTERS ||
    root.publishSources.length > MAX_PUBLISH_SOURCES
  ) {
    throw new Error('Local CDN bucket inventory exceeds the supported browser inspection limits.');
  }

  const releases = apps.releases.map((release, index) => validateRelease(release, origin, index));
  const uniqueReleases = new Set<string>();
  for (const release of releases) {
    const key = `${release.appId}:${release.releaseId}`;
    if (uniqueReleases.has(key)) {
      throw new Error('Local CDN bucket inventory contains a duplicate immutable release.');
    }
    uniqueReleases.add(key);
  }
  if (
    releases.reduce((count, release) => count + (release.status === 'invalid' ? 0 : release.assets.length), 0) > MAX_TOTAL_ASSETS
  ) {
    throw new Error('Local CDN bucket inventory contains too many assets for browser inspection.');
  }
  const selectedPointers = root.selectedPointers.map((pointer, index) => validatePointer(pointer, index));
  assertUnique(
    selectedPointers.map((pointer) => pointer.appId),
    'selected app pointers'
  );
  const publishSources = root.publishSources.map((source, index) => validatePublishSource(source, origin, index));
  assertUnique(
    publishSources.map((source) => source.sourceId),
    'approved publish sources'
  );

  return {
    schemaVersion: 1,
    origin,
    namespaces: {
      apps: { status: 'supported', releases },
      shared: { status: 'reserved-unsupported', message: requireString(shared.message, 'shared namespace message'), releases: [] }
    },
    selectedPointers,
    publishSources
  };
}

function validateRelease(value: unknown, origin: string, index: number): LocalCdnAppRelease {
  const release = requireRecord(value, `Local CDN release ${index}`);
  if (release.namespace !== 'app') {
    throw new Error(`Local CDN release ${index} has an invalid namespace.`);
  }
  const appId = validateBucketId(release.appId, `release ${index} appId`);
  const releaseId = validateBucketId(release.releaseId, `release ${index} releaseId`);
  const namespacePath = `apps/${appId}/versions/${releaseId}/`;
  if (release.namespacePath !== namespacePath) {
    throw new Error(`Local CDN release ${index} has an invalid namespace path.`);
  }
  const releaseBaseUrl = validateReleaseBaseUrl(release.releaseBaseUrl, origin, namespacePath);
  if (typeof release.selected !== 'boolean') {
    throw new Error(`Local CDN release ${index} has an invalid selected state.`);
  }
  const identity: LocalCdnReleaseIdentity = {
    namespace: 'app',
    appId,
    releaseId,
    namespacePath,
    releaseBaseUrl,
    selected: release.selected
  };
  if (release.status === 'invalid') {
    return { ...identity, status: 'invalid' };
  }
  if (release.status !== 'verified' && release.status !== 'anchored' && release.status !== 'recorded') {
    throw new Error(`Local CDN release ${index} has an invalid integrity state.`);
  }
  const integrityStatus = release.status;
  if (integrityStatus !== 'verified' && release.selected) {
    throw new Error(`Local CDN release ${index} cannot claim selection without deep verification.`);
  }

  const generatedAt = requireString(release.generatedAt, `release ${index} generatedAt`);
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`Local CDN release ${index} has an invalid generation date.`);
  }
  const proof = requireRecord(release.proof, `Local CDN release ${index} proof`);
  if (proof.localArtifact !== 'passed' || proof.remoteCdn !== 'not-run' || proof.sharePointAppCatalog !== 'not-run') {
    throw new Error(`Local CDN release ${index} has unsupported provenance claims.`);
  }
  const packageValue = requireRecord(release.package, `Local CDN release ${index} package`);
  const componentsValue = requireRecord(release.components, `Local CDN release ${index} components`);
  if (packageValue.status !== integrityStatus) {
    throw new Error(`Local CDN release ${index} package integrity state is inconsistent.`);
  }
  if (
    !Array.isArray(componentsValue.package) ||
    !Array.isArray(componentsValue.generated) ||
    componentsValue.package.length > 500 ||
    componentsValue.generated.length > 500
  ) {
    throw new Error(`Local CDN release ${index} components are invalid.`);
  }
  if (!Array.isArray(release.assets) || release.assets.length > MAX_ASSETS_PER_RELEASE) {
    throw new Error(`Local CDN release ${index} assets must be an array.`);
  }

  const assets = release.assets.map((asset, assetIndex) =>
    validateAsset(asset, releaseBaseUrl, integrityStatus, index, assetIndex)
  );
  assertUnique(
    assets.map((asset) => asset.path),
    `release ${index} asset paths`
  );

  const manifestSha256 = validateSha256(release.manifestSha256, `release ${index} manifest checksum`);
  const sourceProvenance =
    release.sourceProvenance === undefined
      ? undefined
      : validateSourceProvenance(release.sourceProvenance, manifestSha256, index);
  return {
    ...identity,
    status: integrityStatus,
    generatedAt,
    releaseLabel: requireString(release.releaseLabel, `release ${index} releaseLabel`),
    manifestSha256,
    manifestBytes: validateBytes(release.manifestBytes, `release ${index} manifest size`),
    proof: { localArtifact: 'passed', remoteCdn: 'not-run', sharePointAppCatalog: 'not-run' },
    package: {
      path: validatePortablePath(packageValue.path, `release ${index} package path`),
      bytes: validateBytes(packageValue.bytes, `release ${index} package size`),
      sha256: validateSha256(packageValue.sha256, `release ${index} package checksum`),
      status: integrityStatus
    },
    components: {
      package: componentsValue.package.map((component, componentIndex) =>
        requireString(component, `release ${index} package component ${componentIndex}`)
      ),
      generated: componentsValue.generated.map((component, componentIndex) =>
        requireString(component, `release ${index} generated component ${componentIndex}`)
      )
    },
    assets,
    ...(sourceProvenance ? { sourceProvenance } : {})
  };
}

function validateSourceProvenance(value: unknown, manifestSha256: string, releaseIndex: number): GitHubStagingSourceProvenance {
  const provenance = requireRecord(value, `Local CDN release ${releaseIndex} source provenance`);
  const expectedKeys = [
    'commit',
    'descriptorSha256',
    'files',
    'kind',
    'path',
    'releaseManifestSha256',
    'repository',
    'sourceManifestSha256',
    'status',
    'visibility'
  ];
  if (JSON.stringify(Object.keys(provenance).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Local CDN release ${releaseIndex} source provenance has unsupported or missing fields.`);
  }
  if (provenance.kind !== 'github-directory') {
    throw new Error(`Local CDN release ${releaseIndex} source provenance kind is invalid.`);
  }
  if (provenance.status !== 'staging-closure-verified') {
    throw new Error(`Local CDN release ${releaseIndex} source provenance status is invalid.`);
  }
  if (provenance.visibility !== 'private') {
    throw new Error(`Local CDN release ${releaseIndex} source visibility is invalid.`);
  }
  const repository = requireString(provenance.repository, `release ${releaseIndex} source repository`);
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(repository) ||
    repository.includes('..')
  ) {
    throw new Error(`Local CDN release ${releaseIndex} source repository is invalid.`);
  }
  const commit = requireString(provenance.commit, `release ${releaseIndex} source commit`);
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Local CDN release ${releaseIndex} source commit is not pinned.`);
  }
  const sourcePath = requireString(provenance.path, `release ${releaseIndex} source path`);
  if (sourcePath !== '.') {
    validatePortablePath(sourcePath, `release ${releaseIndex} source path`);
  }
  const releaseManifestSha256 = validateSha256(
    provenance.releaseManifestSha256,
    `release ${releaseIndex} source release-manifest checksum`
  );
  if (releaseManifestSha256 !== manifestSha256) {
    throw new Error(`Local CDN release ${releaseIndex} source provenance is desynchronized from its manifest.`);
  }
  const sourceManifestSha256 = validateSha256(
    provenance.sourceManifestSha256,
    `release ${releaseIndex} source materialization manifest checksum`
  );
  const files = validateNonNegativeInteger(provenance.files, `release ${releaseIndex} source file count`);
  if (!files) {
    throw new Error(`Local CDN release ${releaseIndex} source file count is invalid.`);
  }
  return {
    kind: 'github-directory',
    visibility: 'private',
    repository,
    commit,
    path: sourcePath,
    descriptorSha256: validateSha256(provenance.descriptorSha256, `release ${releaseIndex} source descriptor checksum`),
    sourceManifestSha256,
    releaseManifestSha256,
    files,
    status: 'staging-closure-verified'
  };
}

function validateAsset(
  value: unknown,
  releaseBaseUrl: string,
  integrityStatus: 'verified' | 'anchored' | 'recorded',
  releaseIndex: number,
  assetIndex: number
): LocalCdnBucketAsset {
  const asset = requireRecord(value, `Local CDN release ${releaseIndex} asset ${assetIndex}`);
  const path = validatePortablePath(asset.path, `release ${releaseIndex} asset ${assetIndex} path`);
  const url = requireString(asset.url, `release ${releaseIndex} asset ${assetIndex} URL`);
  if (url !== new URL(path.split('/').map(encodeURIComponent).join('/'), releaseBaseUrl).href) {
    throw new Error(`Local CDN release ${releaseIndex} asset ${assetIndex} URL does not match its immutable namespace.`);
  }
  if (asset.status !== integrityStatus || !Array.isArray(asset.referencedBy)) {
    throw new Error(`Local CDN release ${releaseIndex} asset ${assetIndex} has invalid integrity metadata.`);
  }
  return {
    path,
    url,
    bytes: validateBytes(asset.bytes, `release ${releaseIndex} asset ${assetIndex} size`),
    sha256: validateSha256(asset.sha256, `release ${releaseIndex} asset ${assetIndex} checksum`),
    referencedBy: asset.referencedBy.map((reference, referenceIndex) =>
      requireString(reference, `release ${releaseIndex} asset ${assetIndex} reference ${referenceIndex}`)
    ),
    status: integrityStatus
  };
}

function validatePointer(value: unknown, index: number): LocalCdnSelectedPointer {
  const pointer = requireRecord(value, `Local CDN selected pointer ${index}`);
  const appId = validateBucketId(pointer.appId, `selected pointer ${index} appId`);
  if (pointer.status === 'none') {
    return { appId, status: 'none' };
  }
  if (pointer.status === 'invalid') {
    return {
      appId,
      ...(pointer.releaseId === undefined
        ? {}
        : { releaseId: validateBucketId(pointer.releaseId, `selected pointer ${index} releaseId`) }),
      status: 'invalid'
    };
  }
  if (pointer.status !== 'selected-and-verified') {
    throw new Error(`Local CDN selected pointer ${index} has an invalid status.`);
  }
  return {
    appId,
    releaseId: validateBucketId(pointer.releaseId, `selected pointer ${index} releaseId`),
    manifestSha256: validateSha256(pointer.manifestSha256, `selected pointer ${index} checksum`),
    status: 'selected-and-verified'
  };
}

function validatePublishSource(value: unknown, origin: string, index: number): LocalCdnPublishSource {
  const source = requireRecord(value, `Local CDN publish source ${index}`);
  const sourceId = requireString(source.sourceId, `publish source ${index} sourceId`);
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new Error(`Local CDN publish source ${index} has an invalid source id.`);
  }
  const label = requireString(source.label, `publish source ${index} label`);
  if (source.status === 'invalid') {
    return { sourceId, label, status: 'invalid' };
  }
  if (source.status !== 'verified') {
    throw new Error(`Local CDN publish source ${index} has an invalid status.`);
  }
  const appId = validateBucketId(source.appId, `publish source ${index} appId`);
  const releaseId = validateBucketId(source.releaseId, `publish source ${index} releaseId`);
  const generatedAt = requireString(source.generatedAt, `publish source ${index} generatedAt`);
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`Local CDN publish source ${index} has an invalid generation date.`);
  }
  return {
    sourceId,
    label,
    status: 'verified',
    appId,
    releaseId,
    releaseBaseUrl: validateReleaseBaseUrl(source.releaseBaseUrl, origin, `apps/${appId}/versions/${releaseId}/`),
    generatedAt,
    manifestSha256: validateSha256(source.manifestSha256, `publish source ${index} checksum`),
    files: validateNonNegativeInteger(source.files, `publish source ${index} file count`)
  };
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Local CDN bucket inventory contains duplicate ${label}.`);
  }
}

function validateOrigin(value: unknown): string {
  const origin = requireString(value, 'Local CDN origin');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Local CDN origin must be a valid loopback URL.');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.href !== `${url.origin}/`) {
    throw new Error('Local CDN origin must be a loopback HTTP origin with an explicit port.');
  }
  return url.origin;
}

function validateReleaseBaseUrl(value: unknown, origin: string, namespacePath: string): string {
  const releaseBaseUrl = requireString(value, 'Local CDN release base URL');
  if (releaseBaseUrl !== `${origin}/${namespacePath}`) {
    throw new Error('Local CDN release base URL does not match its immutable namespace.');
  }
  return releaseBaseUrl;
}

function validatePortablePath(value: unknown, label: string): string {
  const path = requireString(value, label);
  if (
    path.length > 1024 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    hasControlCharacters(path)
  ) {
    throw new Error(`Local CDN ${label} is not a safe portable path.`);
  }
  return path;
}

function validateBucketId(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!BUCKET_ID_PATTERN.test(id)) {
    throw new Error(`Local CDN ${label} is invalid.`);
  }
  return id;
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`Local CDN ${label} is invalid.`);
  }
  return value;
}

function validateBytes(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`Local CDN ${label} must be a positive byte count.`);
  }
  return Number(value);
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Local CDN ${label} must be a non-negative integer.`);
  }
  return Number(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || hasControlCharacters(value)) {
    throw new Error(`${label} must be a non-empty safe string.`);
  }
  return value;
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
