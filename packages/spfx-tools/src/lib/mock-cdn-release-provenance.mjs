import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  describeGitHubStagingSource,
  normalizeGitHubStagingSourceDescriptor,
  normalizePersistedGitHubStagingSource
} from './github-staging-source-contract.mjs';
import { safeLocalPath } from './cdn-stage-paths.mjs';

export const MOCK_CDN_RELEASE_RECORD_FILE = 'release-record.json';
export const MOCK_CDN_SOURCE_PROVENANCE_FILE = 'staging-source.json';
export const MAXIMUM_MOCK_CDN_RELEASE_RECORD_BYTES = 16 * 1024;
export const MAXIMUM_MOCK_CDN_SOURCE_PROVENANCE_BYTES = 10 * 1024 * 1024;
const maximumClosureFiles = 5_000;

export async function verifyMockCdnSourceProvenanceClosure({
  stageDir,
  manifest,
  sourceManifestSha256,
  sourceProvenance
}) {
  if (!sourceProvenance) {
    return undefined;
  }
  const normalizedDescriptor = normalizeGitHubStagingSourceDescriptor(sourceProvenance.descriptor);
  const summary = describeGitHubStagingSource(
    normalizedDescriptor,
    sourceProvenance.descriptorSha256
  );
  if (summary.sourceManifestSha256 !== sourceManifestSha256) {
    throw new Error('GitHub staging-source release manifest does not match the validated materialization.');
  }
  const expectedPaths = new Set([
    'deployment-manifest.json',
    manifest.package.path,
    ...manifest.files.map((file) => `${manifest.uploadRoot}/${file.path}`)
  ]);
  if (manifest.manifests.root) {
    for (const file of await listRealFiles(stageDir, manifest.manifests.root)) {
      expectedPaths.add(file);
    }
  }
  if (expectedPaths.size > maximumClosureFiles) {
    throw new Error('GitHub staging-source canonical publish closure is too large.');
  }
  const normalizedExpectedPaths = [...expectedPaths].sort();
  const describedPaths = normalizedDescriptor.files.map((entry) => entry.path);
  if (JSON.stringify(describedPaths) !== JSON.stringify(normalizedExpectedPaths)) {
    throw new Error('GitHub staging-source checksum closure does not exactly match the canonical publish closure.');
  }
  for (const entry of normalizedDescriptor.files) {
    const bytes = await readBoundedRealFileWithin(
      stageDir,
      entry.path,
      entry.bytes,
      `GitHub staging-source file ${entry.path}`
    );
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`GitHub staging-source file changed or does not match its checksum closure: ${entry.path}`);
    }
  }
  return Object.freeze({
    descriptor: normalizedDescriptor,
    descriptorSha256: summary.descriptorSha256
  });
}

export function createMockCdnReleaseProvenance({
  schemaVersion,
  appId,
  releaseId,
  deploymentManifestSha256,
  sourceProvenance
}) {
  const persistedSourceProvenance = sourceProvenance
    ? normalizePersistedGitHubStagingSource({
        schemaVersion: 1,
        descriptorSha256: sourceProvenance.descriptorSha256,
        releaseManifestSha256: deploymentManifestSha256,
        descriptor: sourceProvenance.descriptor
      })
    : undefined;
  const sourceProvenanceBytes = persistedSourceProvenance
    ? Buffer.from(`${JSON.stringify(persistedSourceProvenance, null, 2)}\n`)
    : undefined;
  const releaseRecord = {
    schemaVersion,
    namespace: 'app',
    appId,
    releaseId,
    deploymentManifestSha256,
    sourceProvenanceSha256: sourceProvenanceBytes ? sha256(sourceProvenanceBytes) : null
  };
  return Object.freeze({
    releaseRecordBytes: Buffer.from(`${JSON.stringify(releaseRecord, null, 2)}\n`),
    sourceProvenanceBytes,
    sourceProvenanceSummary: persistedSourceProvenance
      ? describeGitHubStagingSource(
          persistedSourceProvenance.descriptor,
          persistedSourceProvenance.descriptorSha256,
          persistedSourceProvenance.releaseManifestSha256
        )
      : undefined
  });
}

export function parseMockCdnReleaseRecord(
  bytes,
  { schemaVersion, appId, releaseId, deploymentManifestSha256 }
) {
  const value = parseJson(bytes, 'Mock CDN release record');
  const expectedKeys = [
    'appId',
    'deploymentManifestSha256',
    'namespace',
    'releaseId',
    'schemaVersion',
    'sourceProvenanceSha256'
  ];
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('Mock CDN release record has unsupported or missing fields.');
  }
  if (
    value.schemaVersion !== schemaVersion ||
    value.namespace !== 'app' ||
    value.appId !== appId ||
    value.releaseId !== releaseId ||
    value.deploymentManifestSha256 !== deploymentManifestSha256
  ) {
    throw new Error('Mock CDN release record does not match its immutable namespace or deployment manifest.');
  }
  if (value.sourceProvenanceSha256 !== null && !/^[a-f0-9]{64}$/.test(value.sourceProvenanceSha256)) {
    throw new Error('Mock CDN release record has an invalid source-provenance checksum.');
  }
  return Object.freeze({
    schemaVersion,
    namespace: 'app',
    appId,
    releaseId,
    deploymentManifestSha256,
    sourceProvenanceSha256: value.sourceProvenanceSha256
  });
}

export function parseAnchoredMockCdnSourceProvenance(bytes, releaseRecord, deploymentManifestSha256) {
  if (!bytes) {
    if (releaseRecord?.sourceProvenanceSha256) {
      throw new Error('GitHub staging-source provenance is missing from the immutable release.');
    }
    return undefined;
  }
  if (!releaseRecord?.sourceProvenanceSha256) {
    throw new Error('GitHub staging-source provenance is not anchored by immutable release metadata.');
  }
  if (sha256(bytes) !== releaseRecord.sourceProvenanceSha256) {
    throw new Error('GitHub staging-source provenance does not match the immutable release record.');
  }
  const persisted = normalizePersistedGitHubStagingSource(
    parseJson(bytes, 'GitHub staging-source provenance')
  );
  if (persisted.releaseManifestSha256 !== deploymentManifestSha256) {
    throw new Error('GitHub staging-source provenance does not match the immutable deployment manifest.');
  }
  return Object.freeze({
    persisted,
    summary: describeGitHubStagingSource(
      persisted.descriptor,
      persisted.descriptorSha256,
      persisted.releaseManifestSha256
    )
  });
}

export async function loadMockCdnReleaseRecord({
  releaseDir,
  schemaVersion,
  appId,
  releaseId,
  deploymentManifestSha256,
  readBoundedRealFile
}) {
  let bytes;
  try {
    bytes = await readBoundedRealFile(
      releaseDir,
      safeLocalPath(releaseDir, MOCK_CDN_RELEASE_RECORD_FILE),
      MAXIMUM_MOCK_CDN_RELEASE_RECORD_BYTES,
      'Mock CDN release record'
    );
  } catch (error) {
    if (isMissingError(error)) {
      return undefined;
    }
    throw error;
  }
  return parseMockCdnReleaseRecord(bytes, {
    schemaVersion,
    appId,
    releaseId,
    deploymentManifestSha256
  });
}

export async function loadMockCdnSourceProvenance({
  releaseDir,
  manifest,
  deploymentManifestSha256,
  releaseRecord,
  readBoundedRealFile,
  anchorOnly = false
}) {
  let bytes;
  try {
    bytes = await readBoundedRealFile(
      releaseDir,
      safeLocalPath(releaseDir, MOCK_CDN_SOURCE_PROVENANCE_FILE),
      MAXIMUM_MOCK_CDN_SOURCE_PROVENANCE_BYTES,
      'GitHub staging-source provenance'
    );
  } catch (error) {
    if (isMissingError(error)) {
      return parseAnchoredMockCdnSourceProvenance(
        undefined,
        releaseRecord,
        deploymentManifestSha256
      );
    }
    throw error;
  }
  const sourceProvenance = parseAnchoredMockCdnSourceProvenance(
    bytes,
    releaseRecord,
    deploymentManifestSha256
  );
  const describedFiles = new Map(
    sourceProvenance.persisted.descriptor.files.map((entry) => [entry.path, entry])
  );
  const publishedFiles = [
    manifest.package,
    ...manifest.files.map((file) => ({ ...file, path: `${manifest.uploadRoot}/${file.path}` }))
  ];
  for (const publishedFile of publishedFiles) {
    const described = describedFiles.get(publishedFile.path);
    if (
      !described ||
      described.bytes !== publishedFile.bytes ||
      described.sha256 !== publishedFile.sha256
    ) {
      throw new Error(
        `GitHub staging-source provenance does not describe the immutable published file: ${publishedFile.path}`
      );
    }
  }
  const publishedPaths = new Set(publishedFiles.map((file) => file.path));
  for (const entry of sourceProvenance.persisted.descriptor.files) {
    if (
      entry.path !== 'deployment-manifest.json' &&
      !publishedPaths.has(entry.path) &&
      !entry.path.startsWith('manifests/')
    ) {
      throw new Error(`GitHub staging-source provenance contains an unsupported source-only file: ${entry.path}`);
    }
  }
  if (anchorOnly) {
    return sourceProvenance;
  }
  for (const publishedFile of publishedFiles) {
    const entry = describedFiles.get(publishedFile.path);
    const fileBytes = await readBoundedRealFile(
      releaseDir,
      safeLocalPath(releaseDir, entry.path),
      entry.bytes,
      `GitHub staging-source release file ${entry.path}`
    );
    if (fileBytes.length !== entry.bytes || sha256(fileBytes) !== entry.sha256) {
      throw new Error(`GitHub staging-source provenance checksum does not match the immutable release: ${entry.path}`);
    }
  }
  return sourceProvenance;
}

export async function writeMockCdnReleaseProvenance({
  targetDir,
  releaseRecordBytes,
  sourceProvenanceBytes
}) {
  await writeFile(safeLocalPath(targetDir, MOCK_CDN_RELEASE_RECORD_FILE), releaseRecordBytes, {
    flag: 'wx',
    mode: 0o600
  });
  if (sourceProvenanceBytes) {
    await writeFile(safeLocalPath(targetDir, MOCK_CDN_SOURCE_PROVENANCE_FILE), sourceProvenanceBytes, {
      flag: 'wx',
      mode: 0o600
    });
  }
}

export async function assertIdenticalMockCdnReleaseProvenance({
  releaseDir,
  schemaVersion,
  appId,
  releaseId,
  manifest,
  deploymentManifestSha256,
  releaseRecordBytes,
  sourceProvenanceBytes,
  readBoundedRealFile
}) {
  const existingRecord = await loadMockCdnReleaseRecord({
    releaseDir,
    schemaVersion,
    appId,
    releaseId,
    deploymentManifestSha256,
    readBoundedRealFile
  });
  if (existingRecord) {
    const existingRecordBytes = await readBoundedRealFile(
      releaseDir,
      safeLocalPath(releaseDir, MOCK_CDN_RELEASE_RECORD_FILE),
      MAXIMUM_MOCK_CDN_RELEASE_RECORD_BYTES,
      'Existing mock CDN release record'
    );
    if (!existingRecordBytes.equals(releaseRecordBytes)) {
      throw new Error('Mock CDN release already exists with different release metadata; immutable releases cannot be overwritten.');
    }
  } else if (sourceProvenanceBytes) {
    throw new Error('Mock CDN release already exists without the requested source provenance; immutable releases cannot be rewritten.');
  }
  if (sourceProvenanceBytes) {
    let existingProvenanceBytes;
    try {
      existingProvenanceBytes = await readBoundedRealFile(
        releaseDir,
        safeLocalPath(releaseDir, MOCK_CDN_SOURCE_PROVENANCE_FILE),
        MAXIMUM_MOCK_CDN_SOURCE_PROVENANCE_BYTES,
        'Existing GitHub staging-source provenance'
      );
    } catch (error) {
      if (isMissingError(error)) {
        throw new Error(
          'Mock CDN release already exists without the requested source provenance; immutable releases cannot be rewritten.'
        );
      }
      throw error;
    }
    if (!existingProvenanceBytes.equals(sourceProvenanceBytes)) {
      throw new Error(
        'Mock CDN release already exists with different source provenance; immutable releases cannot be overwritten.'
      );
    }
  }
  await loadMockCdnSourceProvenance({
    releaseDir,
    manifest,
    deploymentManifestSha256,
    releaseRecord: existingRecord,
    readBoundedRealFile
  });
}

async function listRealFiles(root, relativeDirectory) {
  const directory = safeLocalPath(root, relativeDirectory);
  await assertRealDirectoryWithin(root, directory, 'GitHub staging-source manifest directory');
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`GitHub staging-source materialization may not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listRealFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`GitHub staging-source materialization contains a non-regular entry: ${relativePath}`);
    }
    if (files.length > maximumClosureFiles) {
      throw new Error('GitHub staging-source canonical publish closure is too large.');
    }
  }
  return files;
}

async function readBoundedRealFileWithin(root, relativePath, maximumBytes, label) {
  const file = safeLocalPath(root, relativePath);
  const stats = await lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0 || stats.size > maximumBytes) {
    throw new Error(`${label} must be a non-empty real file no larger than ${maximumBytes} bytes.`);
  }
  await assertNoSymbolicLinkComponents(root, file, label);
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
  assertContained(realRoot, realFile, label);
  return readFile(file);
}

async function assertRealDirectoryWithin(root, directory, label) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
  await assertNoSymbolicLinkComponents(root, directory, label);
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  assertContained(realRoot, realDirectory, label);
}

async function assertNoSymbolicLinkComponents(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
  let current = resolvedRoot;
  for (const segment of ['', ...(relative ? relative.split(path.sep) : [])]) {
    if (segment) {
      current = path.join(current, segment);
    }
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} may not traverse symbolic links.`);
    }
  }
}

function assertContained(realRoot, realTarget, label) {
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isMissingError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
