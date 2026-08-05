import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { safeLocalPath } from './cdn-stage-paths.mjs';
import {
  gitHubStagingSourceDescriptorSha256,
  normalizeGitHubStagingSourceDescriptor
} from './github-staging-source-contract.mjs';
import { inspectMockCdnAppStage, publishMockCdnAppStage } from './mock-cdn-bucket.mjs';
import { readStableNoFollowFile } from './mock-cdn-source-snapshot.mjs';

const maximumDescriptorBytes = 10 * 1024 * 1024;

export async function publishGitHubStagingSource({
  bucketRoot,
  origin,
  descriptorFile,
  materializationDir,
  select = false,
  _sourceSnapshotTestHooks
}) {
  const resolvedDescriptorFile = path.resolve(descriptorFile);
  const descriptorBytes = await readStableNoFollowFile(
    resolvedDescriptorFile,
    maximumDescriptorBytes,
    'GitHub staging-source descriptor'
  );
  const descriptor = normalizeGitHubStagingSourceDescriptor(parseJson(descriptorBytes));
  const resolvedMaterializationRoot = path.resolve(materializationDir);
  await assertRealDirectory(resolvedMaterializationRoot, 'GitHub staging-source materialization');
  const resolvedMaterializationDir = safeLocalPath(
    resolvedMaterializationRoot,
    descriptor.source.path === '.' ? '' : descriptor.source.path
  );
  await assertRealDirectoryWithin(
    resolvedMaterializationRoot,
    resolvedMaterializationDir,
    'GitHub staging-source repository path'
  );

  const inspected = await inspectMockCdnAppStage({ origin, stageDir: resolvedMaterializationDir });
  if (descriptor.releaseManifest.sha256 !== inspected.manifestSha256) {
    throw new Error('GitHub staging-source release manifest does not match the validated materialization.');
  }
  const descriptorSha256 = gitHubStagingSourceDescriptorSha256(descriptor);
  const published = await publishMockCdnAppStage({
    bucketRoot,
    origin,
    stageDir: resolvedMaterializationDir,
    sourceRoot: resolvedMaterializationRoot,
    select,
    expectedManifestSha256: inspected.manifestSha256,
    sourceProvenance: { descriptor, descriptorSha256 },
    _sourceSnapshotTestHooks
  });
  return {
    ...published,
    source: {
      kind: descriptor.source.kind,
      visibility: descriptor.source.visibility,
      repository: descriptor.source.repository,
      commit: descriptor.source.commit,
      path: descriptor.source.path,
      descriptorSha256
    }
  };
}

async function assertRealDirectory(directory, label) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

async function assertRealDirectoryWithin(root, directory, label) {
  await assertRealDirectory(directory, label);
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
  const segments = relative ? relative.split(path.sep) : [];
  for (const segment of ['', ...segments]) {
    if (segment) current = path.join(current, segment);
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

function parseJson(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('GitHub staging-source descriptor is not valid JSON.', { cause: error });
  }
}
