import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyCdnStage } from './cdn-stage.mjs';
import { assertPortableAssetPath, normalizeCdnReleaseId, safeLocalPath } from './cdn-stage-paths.mjs';

export const MOCK_CDN_BUCKET_SCHEMA_VERSION = 1;
export const DEFAULT_MOCK_CDN_ORIGIN = 'http://127.0.0.1:5174';
export const DEFAULT_MOCK_CDN_BUCKET_PATH = '.spfx-kit/mock-cdn/v1';

const selectedFileName = 'selected.json';
const deploymentManifestFileName = 'deployment-manifest.json';
const maximumSelectedBytes = 16 * 1024;

export function resolveMockCdnBucketRoot(workspaceRoot, configuredRoot = DEFAULT_MOCK_CDN_BUCKET_PATH) {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedBucketRoot = path.resolve(resolvedWorkspaceRoot, String(configuredRoot || '').trim());
  const relative = path.relative(resolvedWorkspaceRoot, resolvedBucketRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The mock CDN bucket root must resolve inside the workspace.');
  }
  return resolvedBucketRoot;
}

export function normalizeMockCdnOrigin(value = DEFAULT_MOCK_CDN_ORIGIN) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Mock CDN origin must be a valid loopback HTTP origin: ${value}`);
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Mock CDN origin must be a credential-free loopback HTTP origin with no path: ${value}`);
  }
  return url.origin;
}

export function mockCdnAppReleaseBaseUrl(origin, appId, releaseId) {
  const normalizedOrigin = normalizeMockCdnOrigin(origin);
  const normalizedAppId = normalizeBucketName(appId, 'app id');
  const normalizedReleaseId = normalizeCdnReleaseId(releaseId);
  return `${normalizedOrigin}/apps/${encodeURIComponent(normalizedAppId)}/versions/${encodeURIComponent(normalizedReleaseId)}/`;
}

export function mockCdnSharedReleaseBaseUrl(origin, bundleId, releaseId) {
  const normalizedOrigin = normalizeMockCdnOrigin(origin);
  const normalizedBundleId = normalizeBucketName(bundleId, 'shared bundle id');
  const normalizedReleaseId = normalizeCdnReleaseId(releaseId);
  return `${normalizedOrigin}/shared/${encodeURIComponent(normalizedBundleId)}/versions/${encodeURIComponent(normalizedReleaseId)}/`;
}

export async function publishMockCdnAppStage({ bucketRoot, origin, stageDir, select = false }) {
  const resolvedBucketRoot = path.resolve(bucketRoot);
  const resolvedStageDir = path.resolve(stageDir);
  const sourceManifestBytes = await readBoundedFile(
    path.join(resolvedStageDir, deploymentManifestFileName),
    10 * 1024 * 1024,
    'CDN stage deployment manifest'
  );
  const sourceManifestValue = parseJson(sourceManifestBytes, 'CDN stage deployment manifest');
  const sourceManifest = await verifyCdnStage(resolvedStageDir, sourceManifestValue, { allowLocalMockCdn: true });
  const appId = normalizeBucketName(sourceManifest.slug, 'app id');
  const releaseId = normalizeCdnReleaseId(sourceManifest.releaseId);
  const expectedBaseUrl = mockCdnAppReleaseBaseUrl(origin, appId, releaseId);
  if (sourceManifest.cdnBasePath !== expectedBaseUrl) {
    throw new Error(`Staged CDN base path must exactly match the configured mock CDN release URL: ${expectedBaseUrl}`);
  }

  await ensureSafeDirectory(resolvedBucketRoot, '');
  const versionsRelative = appVersionsRelativePath(appId);
  await ensureSafeDirectory(resolvedBucketRoot, versionsRelative);
  const releaseRelative = `${versionsRelative}/${releaseId}`;
  const releaseDir = safeLocalPath(resolvedBucketRoot, releaseRelative);
  const temporaryDir = safeLocalPath(resolvedBucketRoot, `${versionsRelative}/.${releaseId}.tmp-${randomUUID()}`);
  let published = false;

  try {
    await mkdir(temporaryDir);
    await copyValidatedStage(resolvedStageDir, temporaryDir, sourceManifest);
    const copiedManifestBytes = await readFile(path.join(temporaryDir, deploymentManifestFileName));
    const copiedManifest = await verifyCdnStage(
      temporaryDir,
      parseJson(copiedManifestBytes, 'Published CDN deployment manifest'),
      { allowLocalMockCdn: true }
    );
    if (copiedManifest.cdnBasePath !== expectedBaseUrl) {
      throw new Error('Published CDN stage changed its configured release URL during intake.');
    }

    try {
      await rename(temporaryDir, releaseDir);
      published = true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      await assertIdenticalPublishedRelease(releaseDir, sourceManifestBytes, expectedBaseUrl);
    }
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }

  const manifestSha256 = sha256(sourceManifestBytes);
  if (select) {
    await selectMockCdnAppRelease({ bucketRoot: resolvedBucketRoot, origin, appId, releaseId });
  }
  return {
    namespace: 'app',
    appId,
    releaseId,
    releaseBaseUrl: expectedBaseUrl,
    manifestSha256,
    files: sourceManifest.files.length,
    published,
    selected: Boolean(select)
  };
}

export async function selectMockCdnAppRelease({ bucketRoot, origin, appId, releaseId }) {
  const resolvedBucketRoot = path.resolve(bucketRoot);
  const normalizedAppId = normalizeBucketName(appId, 'app id');
  const normalizedReleaseId = normalizeCdnReleaseId(releaseId);
  const release = await loadMockCdnAppRelease({
    bucketRoot: resolvedBucketRoot,
    origin,
    appId: normalizedAppId,
    releaseId: normalizedReleaseId
  });
  const appDir = await ensureSafeDirectory(resolvedBucketRoot, `apps/${normalizedAppId}`);
  const pointer = {
    schemaVersion: MOCK_CDN_BUCKET_SCHEMA_VERSION,
    namespace: 'app',
    appId: normalizedAppId,
    releaseId: normalizedReleaseId,
    deploymentManifestSha256: release.manifestSha256
  };
  await writeJsonAtomically(appDir, selectedFileName, pointer);
  return pointer;
}

export async function readSelectedMockCdnAppReference({ bucketRoot, appId }) {
  const resolvedBucketRoot = path.resolve(bucketRoot);
  const normalizedAppId = normalizeBucketName(appId, 'app id');
  const appDir = safeLocalPath(resolvedBucketRoot, `apps/${normalizedAppId}`);
  await assertRealDirectoryWithin(resolvedBucketRoot, appDir, 'Mock CDN app bucket');
  const pointerFile = safeLocalPath(appDir, selectedFileName);
  const bytes = await readBoundedRealFile(
    resolvedBucketRoot,
    pointerFile,
    maximumSelectedBytes,
    'Mock CDN selected release pointer'
  );
  return parseSelectedPointer(parseJson(bytes, 'Mock CDN selected release pointer'), normalizedAppId);
}

export async function resolveSelectedMockCdnAppRelease({ bucketRoot, origin, appId }) {
  const selected = await readSelectedMockCdnAppReference({ bucketRoot, appId });
  const release = await loadMockCdnAppRelease({
    bucketRoot,
    origin,
    appId: selected.appId,
    releaseId: selected.releaseId
  });
  if (release.manifestSha256 !== selected.deploymentManifestSha256) {
    throw new Error('Selected mock CDN release manifest does not match its pinned checksum.');
  }
  return release;
}

export async function loadMockCdnAppRelease({ bucketRoot, origin, appId, releaseId }) {
  const resolvedBucketRoot = path.resolve(bucketRoot);
  const normalizedAppId = normalizeBucketName(appId, 'app id');
  const normalizedReleaseId = normalizeCdnReleaseId(releaseId);
  const releaseDir = safeLocalPath(resolvedBucketRoot, appReleaseRelativePath(normalizedAppId, normalizedReleaseId));
  await assertRealDirectoryWithin(resolvedBucketRoot, releaseDir, 'Mock CDN app release');
  const manifestFile = safeLocalPath(releaseDir, deploymentManifestFileName);
  const manifestBytes = await readBoundedRealFile(
    releaseDir,
    manifestFile,
    10 * 1024 * 1024,
    'Mock CDN deployment manifest'
  );
  const persistedManifest = parseJson(manifestBytes, 'Mock CDN deployment manifest');
  const rebuiltManifest = await verifyCdnStage(releaseDir, persistedManifest, {
    allowLocalMockCdn: true
  });
  const expectedBaseUrl = mockCdnAppReleaseBaseUrl(origin, normalizedAppId, normalizedReleaseId);
  if (
    rebuiltManifest.slug !== normalizedAppId ||
    rebuiltManifest.releaseId !== normalizedReleaseId ||
    rebuiltManifest.cdnBasePath !== expectedBaseUrl
  ) {
    throw new Error('Mock CDN release identity or base URL does not match its immutable namespace.');
  }
  const manifest = Object.freeze({
    ...rebuiltManifest,
    generatedAt: persistedManifest.generatedAt
  });
  return Object.freeze({
    namespace: 'app',
    appId: normalizedAppId,
    releaseId: normalizedReleaseId,
    releaseBaseUrl: expectedBaseUrl,
    releaseDir,
    manifest,
    manifestSha256: sha256(manifestBytes)
  });
}

export async function readMockCdnReleaseAsset(release, assetPath) {
  assertPortableAssetPath(assetPath, 'Mock CDN asset path');
  const matches = release.manifest.files.filter((file) => file.path === assetPath);
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'Mock CDN asset path is ambiguous.' : 'Mock CDN asset is not allowlisted.');
  }
  const descriptor = matches[0];
  const uploadDir = safeLocalPath(release.releaseDir, release.manifest.uploadRoot);
  const assetFile = safeLocalPath(uploadDir, assetPath);
  const bytes = await readBoundedRealFile(uploadDir, assetFile, descriptor.bytes, 'Mock CDN asset');
  const digest = sha256(bytes);
  if (bytes.length !== descriptor.bytes || digest !== descriptor.sha256) {
    throw new Error('Mock CDN asset no longer matches its immutable release manifest.');
  }
  return {
    bytes,
    sha256: digest,
    etag: `"sha256-${digest}"`,
    contentType: contentTypeFor(assetPath)
  };
}

export async function readMockCdnReleaseManifest(release) {
  const manifestFile = safeLocalPath(release.releaseDir, deploymentManifestFileName);
  const bytes = await readBoundedRealFile(
    release.releaseDir,
    manifestFile,
    10 * 1024 * 1024,
    'Mock CDN deployment manifest'
  );
  const digest = sha256(bytes);
  if (digest !== release.manifestSha256) {
    throw new Error('Mock CDN deployment manifest no longer matches its immutable release checksum.');
  }
  return {
    bytes,
    sha256: digest,
    etag: `"sha256-${digest}"`,
    contentType: 'application/json; charset=utf-8'
  };
}

export async function getMockCdnBucketStatus({ bucketRoot, origin, appId } = {}) {
  const resolvedBucketRoot = path.resolve(bucketRoot);
  if (appId) {
    const release = await resolveSelectedMockCdnAppRelease({ bucketRoot: resolvedBucketRoot, origin, appId });
    return {
      bucketRoot: resolvedBucketRoot,
      origin: normalizeMockCdnOrigin(origin),
      apps: [describeRelease(release)]
    };
  }
  let entries;
  const appsDir = safeLocalPath(resolvedBucketRoot, 'apps');
  try {
    await assertRealDirectoryWithin(resolvedBucketRoot, appsDir, 'Mock CDN apps bucket');
    entries = await readdir(appsDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingError(error)) {
      return { bucketRoot: resolvedBucketRoot, origin: normalizeMockCdnOrigin(origin), apps: [] };
    }
    throw error;
  }
  const apps = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }
    let normalizedAppId;
    try {
      normalizedAppId = normalizeBucketName(entry.name, 'app id');
    } catch {
      continue;
    }
    try {
      const release = await resolveSelectedMockCdnAppRelease({
        bucketRoot: resolvedBucketRoot,
        origin,
        appId: normalizedAppId
      });
      apps.push(describeRelease(release));
    } catch {
      apps.push({ appId: normalizedAppId, status: 'invalid-or-unselected' });
    }
  }
  return { bucketRoot: resolvedBucketRoot, origin: normalizeMockCdnOrigin(origin), apps };
}

function describeRelease(release) {
  return {
    appId: release.appId,
    releaseId: release.releaseId,
    releaseBaseUrl: release.releaseBaseUrl,
    files: release.manifest.files.length,
    manifestSha256: release.manifestSha256,
    status: 'selected-and-verified'
  };
}

async function copyValidatedStage(sourceDir, targetDir, manifest) {
  await writeFile(
    path.join(targetDir, deploymentManifestFileName),
    await readFile(path.join(sourceDir, deploymentManifestFileName))
  );
  await copyRealFile(sourceDir, targetDir, manifest.package.path);
  for (const file of manifest.files) {
    await copyRealFile(sourceDir, targetDir, `${manifest.uploadRoot}/${file.path}`);
  }
  if (manifest.manifests.root) {
    await copyRealDirectory(sourceDir, targetDir, manifest.manifests.root);
  }
}

async function copyRealFile(sourceRoot, targetRoot, relativePath) {
  const source = safeLocalPath(sourceRoot, relativePath);
  const target = safeLocalPath(targetRoot, relativePath);
  await assertRealFileWithin(sourceRoot, source, 'Published mock CDN source file');
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function copyRealDirectory(sourceRoot, targetRoot, relativePath) {
  const source = safeLocalPath(sourceRoot, relativePath);
  await assertRealDirectoryWithin(sourceRoot, source, 'Published mock CDN source directory');
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(safeLocalPath(targetRoot, relativePath), { recursive: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRelativePath = `${relativePath}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Published mock CDN source may not contain symbolic links: ${entryRelativePath}`);
    }
    if (entry.isDirectory()) {
      await copyRealDirectory(sourceRoot, targetRoot, entryRelativePath);
    } else if (entry.isFile()) {
      await copyRealFile(sourceRoot, targetRoot, entryRelativePath);
    } else {
      throw new Error(`Published mock CDN source contains a non-regular entry: ${entryRelativePath}`);
    }
  }
}

async function assertIdenticalPublishedRelease(releaseDir, sourceManifestBytes, expectedBaseUrl) {
  const existingManifestFile = safeLocalPath(releaseDir, deploymentManifestFileName);
  const existingManifestBytes = await readBoundedRealFile(
    releaseDir,
    existingManifestFile,
    10 * 1024 * 1024,
    'Existing mock CDN deployment manifest'
  );
  if (!existingManifestBytes.equals(sourceManifestBytes)) {
    throw new Error('Mock CDN release already exists with different manifest bytes; immutable releases cannot be overwritten.');
  }
  const existing = await verifyCdnStage(
    releaseDir,
    parseJson(existingManifestBytes, 'Existing mock CDN deployment manifest'),
    { allowLocalMockCdn: true }
  );
  if (existing.cdnBasePath !== expectedBaseUrl) {
    throw new Error('Existing mock CDN release has a different configured base URL.');
  }
}

async function writeJsonAtomically(directory, fileName, value) {
  const temporaryFile = safeLocalPath(directory, `.${fileName}.${randomUUID()}.tmp`);
  const targetFile = safeLocalPath(directory, fileName);
  try {
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporaryFile, targetFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

function parseSelectedPointer(value, expectedAppId) {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([
    'appId',
    'deploymentManifestSha256',
    'namespace',
    'releaseId',
    'schemaVersion'
  ])) {
    throw new Error('Mock CDN selected release pointer has unsupported or missing fields.');
  }
  if (
    value.schemaVersion !== MOCK_CDN_BUCKET_SCHEMA_VERSION ||
    value.namespace !== 'app' ||
    normalizeBucketName(value.appId, 'selected app id') !== expectedAppId
  ) {
    throw new Error('Mock CDN selected release pointer identity is invalid.');
  }
  const releaseId = normalizeCdnReleaseId(value.releaseId);
  if (typeof value.deploymentManifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.deploymentManifestSha256)) {
    throw new Error('Mock CDN selected release pointer checksum is invalid.');
  }
  return {
    schemaVersion: MOCK_CDN_BUCKET_SCHEMA_VERSION,
    namespace: 'app',
    appId: expectedAppId,
    releaseId,
    deploymentManifestSha256: value.deploymentManifestSha256
  };
}

async function ensureSafeDirectory(rootDir, relativePath) {
  const resolvedRoot = path.resolve(rootDir);
  await ensureDirectoryPath(resolvedRoot);
  const segments = relativePath ? relativePath.split('/') : [];
  let current = resolvedRoot;
  for (const segment of segments) {
    current = safeLocalPath(current, segment);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(`Mock CDN bucket path must be a real directory: ${current}`);
      }
    } catch (error) {
      if (!isMissingError(error)) {
        throw error;
      }
      await mkdirIfMissing(current);
    }
  }
  await assertRealDirectoryWithin(resolvedRoot, current, 'Mock CDN bucket directory');
  return current;
}

async function ensureDirectoryPath(directory) {
  const missing = [];
  let current = directory;
  while (true) {
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(`Mock CDN bucket path must be a real directory: ${current}`);
      }
      break;
    } catch (error) {
      if (!isMissingError(error)) {
        throw error;
      }
      missing.push(current);
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error(`Mock CDN bucket has no existing parent directory: ${directory}`, { cause: error });
      }
      current = parent;
    }
  }
  for (const missingDirectory of missing.reverse()) {
    await mkdirIfMissing(missingDirectory);
    const stats = await lstat(missingDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Mock CDN bucket path must be a real directory: ${missingDirectory}`);
    }
  }
}

async function mkdirIfMissing(directory) {
  try {
    await mkdir(directory);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
}

async function readBoundedFile(file, maximumBytes, label) {
  const stats = await lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0 || stats.size > maximumBytes) {
    throw new Error(`${label} must be a non-empty real file no larger than ${maximumBytes} bytes.`);
  }
  return readFile(file);
}

async function readBoundedRealFile(root, file, maximumBytes, label) {
  await assertRealFileWithin(root, file, label);
  return readBoundedFile(file, maximumBytes, label);
}

async function assertRealDirectoryWithin(root, directory, label) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  assertContained(realRoot, realDirectory, label);
}

async function assertRealFileWithin(root, file, label) {
  const stats = await lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real file.`);
  }
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
  assertContained(realRoot, realFile, label);
}

function assertContained(realRoot, realTarget, label) {
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
}

function contentTypeFor(filePath) {
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

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function normalizeBucketName(value, label) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error(`Invalid mock CDN ${label}: ${value}`);
  }
  return normalized;
}

function appVersionsRelativePath(appId) {
  return `apps/${normalizeBucketName(appId, 'app id')}/versions`;
}

function appReleaseRelativePath(appId, releaseId) {
  return `${appVersionsRelativePath(appId)}/${normalizeCdnReleaseId(releaseId)}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExistsError(error) {
  return error instanceof Error && 'code' in error && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
