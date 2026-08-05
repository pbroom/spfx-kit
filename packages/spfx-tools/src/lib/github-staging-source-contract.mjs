import { createHash, timingSafeEqual } from 'node:crypto';
import { assertPortableAssetPath } from './cdn-stage-paths.mjs';

export const GITHUB_STAGING_SOURCE_SCHEMA_VERSION = 1;
export const GITHUB_STAGING_SOURCE_KIND = 'github-directory';

const maximumFiles = 5_000;
const maximumFileBytes = 512 * 1024 * 1024;
const maximumClosureBytes = 2 * 1024 * 1024 * 1024;
const repositoryPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

export function normalizeGitHubStagingSourceDescriptor(value) {
  assertExactRecord(value, ['files', 'releaseManifest', 'schemaVersion', 'source'], 'GitHub staging-source descriptor');
  if (value.schemaVersion !== GITHUB_STAGING_SOURCE_SCHEMA_VERSION) {
    throw new Error('GitHub staging-source descriptor has an unsupported schema version.');
  }
  const source = normalizeSource(value.source);
  const releaseManifest = normalizeReleaseManifest(value.releaseManifest);
  if (!Array.isArray(value.files) || !value.files.length || value.files.length > maximumFiles) {
    throw new Error(`GitHub staging-source descriptor files must contain 1-${maximumFiles} entries.`);
  }
  const files = value.files.map((entry, index) => normalizeFile(entry, index));
  if (files.reduce((total, entry) => total + entry.bytes, 0) > maximumClosureBytes) {
    throw new Error('GitHub staging-source descriptor checksum closure is too large.');
  }
  const paths = files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error('GitHub staging-source descriptor contains duplicate file paths.');
  }
  if (new Set(paths.map((filePath) => filePath.toLocaleLowerCase('en-US'))).size !== paths.length) {
    throw new Error('GitHub staging-source descriptor contains case-colliding file paths.');
  }
  const sortedPaths = [...paths].sort();
  if (JSON.stringify(paths) !== JSON.stringify(sortedPaths)) {
    throw new Error('GitHub staging-source descriptor files must be sorted by portable path.');
  }
  const manifestEntry = files.find((entry) => entry.path === releaseManifest.path);
  if (!manifestEntry || manifestEntry.sha256 !== releaseManifest.sha256) {
    throw new Error('GitHub staging-source release manifest checksum must match its file closure entry.');
  }
  return Object.freeze({
    schemaVersion: GITHUB_STAGING_SOURCE_SCHEMA_VERSION,
    source,
    releaseManifest,
    files: Object.freeze(files)
  });
}

export function describeGitHubStagingSource(descriptor, descriptorSha256, releaseManifestSha256 = descriptor.releaseManifest?.sha256) {
  const normalized = normalizeGitHubStagingSourceDescriptor(descriptor);
  if (!isMatchingDescriptorSha256(normalized, descriptorSha256)) {
    throw new Error('GitHub staging-source descriptor checksum is invalid.');
  }
  const normalizedReleaseManifestSha256 = normalizeSha256(
    releaseManifestSha256,
    'published release manifest checksum'
  );
  return Object.freeze({
    kind: GITHUB_STAGING_SOURCE_KIND,
    visibility: normalized.source.visibility,
    repository: normalized.source.repository,
    commit: normalized.source.commit,
    path: normalized.source.path,
    descriptorSha256,
    sourceManifestSha256: normalized.releaseManifest.sha256,
    releaseManifestSha256: normalizedReleaseManifestSha256,
    files: normalized.files.length,
    status: 'staging-closure-verified'
  });
}

export function normalizePersistedGitHubStagingSource(value) {
  assertExactRecord(
    value,
    ['descriptor', 'descriptorSha256', 'releaseManifestSha256', 'schemaVersion'],
    'Persisted GitHub staging-source provenance'
  );
  if (value.schemaVersion !== GITHUB_STAGING_SOURCE_SCHEMA_VERSION) {
    throw new Error('Persisted GitHub staging-source provenance has an unsupported schema version.');
  }
  const descriptorSha256 = normalizeSha256(value.descriptorSha256, 'descriptor checksum');
  const releaseManifestSha256 = normalizeSha256(
    value.releaseManifestSha256,
    'published release manifest checksum'
  );
  const descriptor = normalizeGitHubStagingSourceDescriptor(value.descriptor);
  if (!isMatchingDescriptorSha256(descriptor, descriptorSha256)) {
    throw new Error('Persisted GitHub staging-source descriptor checksum does not match its canonical descriptor.');
  }
  return Object.freeze({
    schemaVersion: GITHUB_STAGING_SOURCE_SCHEMA_VERSION,
    descriptorSha256,
    releaseManifestSha256,
    descriptor
  });
}

export function gitHubStagingSourceDescriptorSha256(descriptor) {
  const normalized = normalizeGitHubStagingSourceDescriptor(descriptor);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function isMatchingDescriptorSha256(descriptor, value) {
  if (!sha256Pattern.test(String(value || ''))) {
    return false;
  }
  const expected = Buffer.from(gitHubStagingSourceDescriptorSha256(descriptor), 'hex');
  const actual = Buffer.from(value, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeSource(value) {
  assertExactRecord(value, ['commit', 'kind', 'path', 'repository', 'visibility'], 'GitHub staging-source identity');
  if (value.kind !== GITHUB_STAGING_SOURCE_KIND) {
    throw new Error(`GitHub staging-source kind must be ${GITHUB_STAGING_SOURCE_KIND}.`);
  }
  if (value.visibility !== 'private') {
    throw new Error('GitHub staging-source visibility must be declared private.');
  }
  const repository = requireNormalizedString(value.repository, 'GitHub staging-source repository');
  if (!repositoryPattern.test(repository) || repository.includes('..')) {
    throw new Error('GitHub staging-source repository must use owner/name without a URL or credentials.');
  }
  const commit = requireNormalizedString(value.commit, 'GitHub staging-source commit');
  if (!commitPattern.test(commit)) {
    throw new Error('GitHub staging-source commit must be a full 40-character lowercase commit SHA.');
  }
  const sourcePath = requireNormalizedString(value.path, 'GitHub staging-source path');
  if (sourcePath !== '.') {
    normalizePortablePath(sourcePath, 'GitHub staging-source path');
  }
  return Object.freeze({ kind: GITHUB_STAGING_SOURCE_KIND, visibility: 'private', repository, commit, path: sourcePath });
}

function normalizeReleaseManifest(value) {
  assertExactRecord(value, ['path', 'sha256'], 'GitHub staging-source release manifest');
  if (value.path !== 'deployment-manifest.json') {
    throw new Error('GitHub staging-source release manifest must be deployment-manifest.json.');
  }
  return Object.freeze({ path: value.path, sha256: normalizeSha256(value.sha256, 'release manifest checksum') });
}

function normalizeFile(value, index) {
  assertExactRecord(value, ['bytes', 'path', 'sha256'], `GitHub staging-source file ${index}`);
  normalizePortablePath(value.path, `GitHub staging-source file ${index} path`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > maximumFileBytes) {
    throw new Error(`GitHub staging-source file ${index} size must be between 1 and ${maximumFileBytes} bytes.`);
  }
  return Object.freeze({
    path: value.path,
    bytes: value.bytes,
    sha256: normalizeSha256(value.sha256, `file ${index} checksum`)
  });
}

function normalizePortablePath(value, label) {
  if (typeof value !== 'string' || value !== value.normalize('NFC') || /[\0-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} must use normalized portable text.`);
  }
  assertPortableAssetPath(value, label);
  return value;
}

function normalizeSha256(value, label) {
  const normalized = requireNormalizedString(value, `GitHub staging-source ${label}`);
  if (!sha256Pattern.test(normalized)) {
    throw new Error(`GitHub staging-source ${label} must be a lowercase SHA-256 digest.`);
  }
  return normalized;
}

function requireNormalizedString(value, label) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512 || /[\0-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} must be a normalized string.`);
  }
  return value;
}

function assertExactRecord(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
}
