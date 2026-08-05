import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { safeLocalPath } from './cdn-stage-paths.mjs';
import { parseCdnStageManifestV1 } from './cdn-stage-contract.mjs';
import { normalizeGitHubStagingSourceDescriptor } from './github-staging-source-contract.mjs';

export async function withMockCdnSourceSnapshot(
  { sourceRoot, stageDir, sourceProvenance, hooks },
  consumeSnapshot
) {
  if (!sourceProvenance) {
    return consumeSnapshot({ stageDir, sourceProvenance });
  }
  if (!sourceRoot) {
    throw new Error('A staging-source publish requires its materialization containment root.');
  }
  const descriptor = normalizeGitHubStagingSourceDescriptor(sourceProvenance.descriptor);
  const snapshotDir = await createMockCdnSourceSnapshot({
    containmentRoot: path.resolve(sourceRoot),
    sourceDir: path.resolve(stageDir),
    descriptor,
    hooks
  });
  try {
    return await consumeSnapshot({
      stageDir: snapshotDir,
      sourceProvenance: Object.freeze({ descriptor, descriptorSha256: sourceProvenance.descriptorSha256 })
    });
  } finally {
    await removeMockCdnSourceSnapshot(snapshotDir);
  }
}

export async function createMockCdnSourceSnapshot({ containmentRoot, sourceDir, descriptor, hooks }) {
  const snapshotDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-staging-source-'));
  try {
    await chmod(snapshotDir, 0o700);
    const sourceRootAnchor = await capturePathChain(containmentRoot, sourceDir, 'Mock CDN publish source');
    if (!sourceRootAnchor.at(-1).stats.isDirectory()) {
      throw new Error('Mock CDN publish source must be a real directory.');
    }
    for (const entry of descriptor.files) {
      const sourceFile = safeLocalPath(sourceDir, entry.path);
      const bytes = await readStableContainedFile({
        containmentRoot,
        file: sourceFile,
        expectedBytes: entry.bytes,
        expectedSha256: entry.sha256,
        label: `Mock CDN publish source file ${entry.path}`,
        relativePath: entry.path,
        hooks
      });
      const targetFile = safeLocalPath(snapshotDir, entry.path);
      await mkdir(path.dirname(targetFile), { recursive: true, mode: 0o700 });
      await writeFile(targetFile, bytes, { flag: 'wx', mode: 0o600 });
    }
    const manifest = parseCdnStageManifestV1(
      JSON.parse(await readFile(safeLocalPath(snapshotDir, descriptor.releaseManifest.path), 'utf8')),
      { allowLocalMockCdn: true }
    );
    for (const closureRoot of [manifest.uploadRoot, manifest.manifests.root].filter(Boolean)) {
      const livePaths = await listStableRealFiles(
        containmentRoot,
        sourceDir,
        closureRoot,
        'Mock CDN publish directory closure'
      );
      const describedPaths = descriptor.files
        .map((entry) => entry.path)
        .filter((filePath) => filePath.startsWith(`${closureRoot}/`));
      if (JSON.stringify(livePaths) !== JSON.stringify(describedPaths)) {
        throw new Error('GitHub staging-source checksum closure does not exactly match the live canonical tree.');
      }
    }
    await assertPathChainUnchanged(
      sourceRootAnchor,
      await capturePathChain(containmentRoot, sourceDir, 'Mock CDN publish source'),
      'Mock CDN publish source'
    );
    return snapshotDir;
  } catch (error) {
    await rm(snapshotDir, { recursive: true, force: true });
    throw error;
  }
}

async function listStableRealFiles(containmentRoot, sourceDir, relativeDirectory, label) {
  const directory = safeLocalPath(sourceDir, relativeDirectory);
  const beforeChain = await capturePathChain(containmentRoot, directory, label);
  if (!beforeChain.at(-1).stats.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`${label} may not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listStableRealFiles(containmentRoot, sourceDir, relativePath, label)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`${label} contains a non-regular entry: ${relativePath}`);
    }
  }
  await assertPathChainUnchanged(beforeChain, await capturePathChain(containmentRoot, directory, label), label);
  return files.sort();
}

export async function removeMockCdnSourceSnapshot(snapshotDir) {
  if (snapshotDir) {
    await rm(snapshotDir, { recursive: true, force: true });
  }
}

export async function readStableNoFollowFile(file, maximumBytes, label) {
  const before = await lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > BigInt(maximumBytes)) {
    throw new Error(`${label} must be a non-empty real file no larger than ${maximumBytes} bytes.`);
  }
  const handle = await openNoFollow(file, label);
  try {
    const beforeHandle = await handle.stat({ bigint: true });
    assertSameInode(before, beforeHandle, label);
    const bytes = await handle.readFile();
    const afterHandle = await handle.stat({ bigint: true });
    const after = await lstat(file, { bigint: true });
    assertStableOpenedFile(beforeHandle, afterHandle, label);
    assertSameInode(before, after, label);
    if (bytes.length <= 0 || bytes.length > maximumBytes) {
      throw new Error(`${label} must be a non-empty real file no larger than ${maximumBytes} bytes.`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readStableContainedFile({
  containmentRoot,
  file,
  expectedBytes,
  expectedSha256,
  label,
  relativePath,
  hooks
}) {
  const beforeChain = await capturePathChain(containmentRoot, file, label);
  const handle = await openNoFollow(file, label);
  try {
    const beforeHandle = await handle.stat({ bigint: true });
    assertRegularFileStat(beforeHandle, expectedBytes, label);
    assertSameInode(beforeChain.at(-1).stats, beforeHandle, label);
    await hooks?.afterOpen?.({ relativePath, sourceFile: file });
    const bytes = await handle.readFile();
    await hooks?.afterRead?.({ relativePath, sourceFile: file });
    const afterHandle = await handle.stat({ bigint: true });
    assertStableOpenedFile(beforeHandle, afterHandle, label);
    const afterChain = await capturePathChain(containmentRoot, file, label);
    await assertPathChainUnchanged(beforeChain, afterChain, label);
    if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) {
      throw new Error(`${label} changed or does not match its checksum closure.`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function openNoFollow(file, label) {
  if (typeof constants.O_NOFOLLOW !== 'number') {
    throw new Error(`${label} cannot be read safely because this platform does not support no-follow file handles.`);
  }
  try {
    return await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`${label} could not be opened through a no-follow file handle.`, { cause: error });
  }
}

async function capturePathChain(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
  const chain = [];
  let current = resolvedRoot;
  for (const segment of ['', ...(relative ? relative.split(path.sep) : [])]) {
    if (segment) current = path.join(current, segment);
    const stats = await lstat(current, { bigint: true });
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} may not traverse symbolic links.`);
    }
    chain.push({ path: current, stats });
  }
  const [realRoot, realTarget] = await Promise.all([realpath(resolvedRoot), realpath(resolvedTarget)]);
  assertContained(realRoot, realTarget, label);
  return chain;
}

async function assertPathChainUnchanged(before, after, label) {
  if (before.length !== after.length) {
    throw new Error(`${label} changed while the staging snapshot was created.`);
  }
  for (let index = 0; index < before.length; index += 1) {
    if (before[index].path !== after[index].path) {
      throw new Error(`${label} changed while the staging snapshot was created.`);
    }
    assertSameInode(before[index].stats, after[index].stats, label);
    if (
      before[index].stats.isDirectory() &&
      (before[index].stats.mtimeNs !== after[index].stats.mtimeNs ||
        before[index].stats.ctimeNs !== after[index].stats.ctimeNs)
    ) {
      throw new Error(`${label} changed while the staging snapshot was created.`);
    }
  }
}

function assertRegularFileStat(stats, expectedBytes, label) {
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== BigInt(expectedBytes)) {
    throw new Error(`${label} must remain a real file with its declared size.`);
  }
}

function assertSameInode(before, after, label) {
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode) {
    throw new Error(`${label} changed inode or file type while the staging snapshot was created.`);
  }
}

function assertStableOpenedFile(before, after, label) {
  assertSameInode(before, after, label);
  if (
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs ||
    before.nlink !== after.nlink
  ) {
    throw new Error(`${label} changed while the staging snapshot was created.`);
  }
}

function assertContained(realRoot, realTarget, label) {
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its configured root.`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
