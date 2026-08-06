import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { link, lstat as lstatNative, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const LOCK_NAME = '.profile-generation-lock';
const CLAIM_NAME = 'recovery-claim';
const TRANSACTION_KIND = 'ui-profile-generation-v1';
const OWNER_FILE = 'owner.json';
const CLAIM_FILE = 'claim.json';
const LEASE_FILE = 'lease.json';
const LEASE_KIND = 'ui-profile-generation-lease-v1';
const DEFAULT_LEASE_MS = 60_000;
const MUTATION_GATE_NAME = 'mutation-gate';
const MUTATION_GATE_FILE = 'gate.json';
const MUTATION_GATE_KIND = 'ui-profile-generation-mutation-gate-v1';
const DIRECTORY_MARKER_FILE = '.generation-owner.json';
const CLEANUP_BINDING_FILE = 'binding.json';
const CLEANUP_BINDING_KIND = 'ui-profile-transaction-cleanup-v1';
const RETAINED_BINDING_ROOT = 'retained-payload-bindings';
const RETAINED_BINDING_KIND = 'ui-profile-retained-payload-v1';
const SESSION = Symbol('ui-profile-generation-session');
const execFileAsync = promisify(execFile);
const OPERATION_PATHS = Object.freeze({
  update: Object.freeze(['snapshots', 'normalized', 'profile.json']),
  regenerate: Object.freeze(['snapshots/canonical', 'normalized', 'profile.json'])
});

// Filesystem device and inode numbers are uint64 values on supported Node
// platforms.  The default Stats representation is Number, which can silently
// round a value above Number.MAX_SAFE_INTEGER and turn two distinct objects
// into the same cleanup identity.  All ownership fencing in this module must
// retain the exact bigint values until they are serialized as decimal strings.
async function lstat(target) {
  return lstatNative(target, { bigint: true });
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'missing';
  try {
    process.kill(pid, 0);
    return 'unknown';
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM') return 'unknown';
    if (error && typeof error === 'object' && error.code === 'ESRCH') return 'missing';
    return 'unknown';
  }
}

export async function observeGeneratedProfileProcess(
  pid,
  { platform = process.platform, read = readFile, run = execFileAsync } = {}
) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { status: 'missing' };
  if (platform === 'linux') {
    let stat;
    try {
      stat = await read(`/proc/${pid}/stat`, 'utf8');
    } catch (error) {
      if (isMissing(error)) return { status: 'missing' };
      return { status: processExists(pid) };
    }
    let bootId;
    try {
      bootId = await read('/proc/sys/kernel/random/boot_id', 'utf8');
    } catch {
      return { status: processExists(pid) };
    }
    const commandEnd = stat.lastIndexOf(')');
    const fields = commandEnd === -1 ? [] : stat.slice(commandEnd + 1).trim().split(/\s+/u);
    // A zombie retains a PID/start tick but cannot own a live session.
    if (fields[0] === 'Z') return { status: 'missing' };
    const startTicks = fields[19];
    const normalizedBootId = bootId.trim();
    if (!/^\d+$/u.test(startTicks ?? '') || !/^[a-f0-9-]{36}$/u.test(normalizedBootId)) {
      return { status: 'unknown' };
    }
    return { status: 'alive', identity: `linux-proc-v1:${normalizedBootId}:${startTicks}` };
  }
  if (platform === 'darwin') {
    try {
      const { stdout } = await run('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC0' },
        maxBuffer: 16 * 1024
      });
      const startedAt = stdout.trim();
      if (startedAt.length === 0 || /[\r\n]/u.test(startedAt)) return { status: 'unknown' };
      return { status: 'alive', identity: `darwin-ps-lstart-v1:${startedAt}` };
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 1) return { status: 'missing' };
      return { status: processExists(pid) };
    }
  }
  return { status: processExists(pid) };
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isMissing(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

function isConflict(error) {
  return Boolean(error && typeof error === 'object' && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY'));
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function sameIdentity(left, right) {
  if (typeof left?.dev !== 'bigint' || typeof left?.ino !== 'bigint' || typeof right?.dev !== 'bigint' || typeof right?.ino !== 'bigint') {
    throw new Error('Generated profile filesystem identity must use bigint device and inode values');
  }
  return left.dev === right.dev && left.ino === right.ino;
}

export function generatedProfileIdentityRecord(details) {
  if (typeof details?.dev !== 'bigint' || typeof details?.ino !== 'bigint') {
    throw new Error('Generated profile filesystem identity must use bigint device and inode values');
  }
  return { dev: String(details.dev), ino: String(details.ino) };
}

function identityRecord(details) {
  return generatedProfileIdentityRecord(details);
}

function assertIdentityRecord(identity, label) {
  if (
    !isObject(identity) ||
    typeof identity.dev !== 'string' ||
    !/^\d+$/u.test(identity.dev) ||
    typeof identity.ino !== 'string' ||
    !/^\d+$/u.test(identity.ino)
  ) {
    throw new Error(`Generated profile ${label} identity is invalid`);
  }
  return identity;
}

function sameIdentityRecord(details, expected) {
  return String(details.dev) === expected.dev && String(details.ino) === expected.ino;
}

function retainedPayloadType(details) {
  if (details.isSymbolicLink()) throw new Error('Generated profile retained payload must not be a symlink');
  if (details.isDirectory()) return 'directory';
  if (details.isFile()) return 'file';
  throw new Error('Generated profile retained payload type is unsupported');
}

function retainedRelativePath(binding) {
  if (binding.payloadKind === 'discard-child') return `discard/${binding.index}`;
  if (binding.payloadKind === 'retired-claim') {
    return `.recovery-claim-${binding.disposition}-${binding.payloadToken}`;
  }
  return `.mutation-gate-${binding.disposition}-${binding.payloadToken}`;
}

function assertRetainedBinding(binding, lockIdentity, ownerToken, ownerOperation) {
  if (
    !isObject(binding) ||
    binding.kind !== RETAINED_BINDING_KIND ||
    binding.ownerToken !== ownerToken ||
    binding.ownerOperation !== ownerOperation ||
    !['discard-child', 'retired-claim', 'retired-gate'].includes(binding.payloadKind) ||
    !['directory', 'file'].includes(binding.payloadType) ||
    !isObject(binding.lockIdentity) ||
    !sameIdentityRecord(lockIdentity, binding.lockIdentity) ||
    !isObject(binding.bindingFileIdentity) ||
    !/^[a-f0-9]{64}$/u.test(binding.payloadDigest ?? '')
  ) {
    throw new Error('Generated profile retained payload binding is invalid');
  }
  assertSafeToken(binding.bindingToken, 'retained payload binding');
  assertSafeToken(binding.payloadToken, 'retained payload');
  assertIdentityRecord(binding.payloadIdentity, 'retained payload');
  assertIdentityRecord(binding.bindingFileIdentity, 'retained binding file');
  if (binding.payloadKind === 'discard-child') {
    const index = Number(binding.payloadToken);
    if (
      binding.disposition !== 'discarded' ||
      !Number.isSafeInteger(binding.index) ||
      binding.index !== index ||
      binding.generatedPath !== OPERATION_PATHS[ownerOperation]?.[index]
    ) {
      throw new Error('Generated profile retained discard binding is invalid');
    }
  } else if (binding.payloadKind === 'retired-claim') {
    if (binding.payloadType !== 'directory' || !['stale', 'release'].includes(binding.disposition)) {
      throw new Error('Generated profile retained claim binding is invalid');
    }
  } else if (binding.payloadType !== 'directory' || !['stale', 'retired'].includes(binding.disposition)) {
    throw new Error('Generated profile retained gate binding is invalid');
  }
  return binding;
}

function retainedBindingPath(lockRoot, bindingToken) {
  assertSafeToken(bindingToken, 'retained payload binding');
  return path.join(lockRoot, RETAINED_BINDING_ROOT, `${bindingToken}.json`);
}

function retainedBindingToken(payloadKind, ownerToken, payloadToken) {
  return `${payloadKind}-${createHash('sha256').update(`${ownerToken}\0${payloadToken}`).digest('hex').slice(0, 32)}`;
}

function sameRetainedPayload(left, right) {
  const { disposition: _leftDisposition, bindingFileIdentity: _leftFileIdentity, ...leftPayload } = left;
  const { disposition: _rightDisposition, bindingFileIdentity: _rightFileIdentity, ...rightPayload } = right;
  return JSON.stringify(leftPayload) === JSON.stringify(rightPayload);
}

async function readRetainedBinding(lockRoot, lockIdentity, ownerToken, ownerOperation, bindingToken) {
  try {
    const binding = assertRetainedBinding(
      JSON.parse(await readFile(retainedBindingPath(lockRoot, bindingToken), 'utf8')),
      lockIdentity,
      ownerToken,
      ownerOperation
    );
    const details = await lstat(retainedBindingPath(lockRoot, bindingToken));
    if (!details.isFile() || details.isSymbolicLink() || !sameIdentityRecord(details, binding.bindingFileIdentity)) {
      throw new Error('Generated profile retained binding file identity changed');
    }
    return binding;
  } catch (error) {
    throw new Error(`Generated profile retained payload binding is unreadable: ${bindingToken}`, { cause: error });
  }
}

async function publishRetainedBinding({
  lockRoot,
  lockIdentity,
  ownerToken,
  ownerOperation,
  bindingToken,
  payloadKind,
  payloadToken,
  disposition,
  details,
  payloadDigest,
  index,
  generatedPath
}) {
  const bindingBase = {
    kind: RETAINED_BINDING_KIND,
    bindingToken,
    ownerToken,
    ownerOperation,
    payloadKind,
    payloadToken,
    disposition,
    payloadType: retainedPayloadType(details),
    lockIdentity: identityRecord(lockIdentity),
    payloadIdentity: identityRecord(details),
    payloadDigest,
    ...(payloadKind === 'discard-child' ? { index, generatedPath } : {})
  };
  const target = retainedBindingPath(lockRoot, bindingToken);
  if (await pathExists(target)) {
    const existing = await readRetainedBinding(lockRoot, lockIdentity, ownerToken, ownerOperation, bindingToken);
    const binding = assertRetainedBinding(
      { ...bindingBase, bindingFileIdentity: existing.bindingFileIdentity },
      lockIdentity,
      ownerToken,
      ownerOperation
    );
    if (!sameRetainedPayload(existing, binding)) {
      throw new Error(`Generated profile retained payload binding changed: ${bindingToken}`);
    }
    return existing;
  }
  const pending = path.join(lockRoot, RETAINED_BINDING_ROOT, `.pending-${bindingToken}-${randomUUID()}.json`);
  let binding;
  try {
    await writeFile(pending, '', { flag: 'wx' });
    const pendingDetails = await lstat(pending);
    if (!pendingDetails.isFile() || pendingDetails.isSymbolicLink()) {
      throw new Error('Generated profile retained binding candidate must be a regular file');
    }
    binding = assertRetainedBinding(
      { ...bindingBase, bindingFileIdentity: identityRecord(pendingDetails) },
      lockIdentity,
      ownerToken,
      ownerOperation
    );
    // A hard kill during this publication leaves a single-link candidate.
    // reconcileRetainedBindingPendingFiles removes only that verified bounded
    // candidate instead of making detached-lock cleanup permanently fail.
    await writeFile(pending, `${JSON.stringify(binding, null, 2)}\n`);
    try {
      await link(pending, target);
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  } finally {
    await unlink(pending).catch((error) => {
      if (!isMissing(error)) throw error;
    });
  }
  const published = await readRetainedBinding(lockRoot, lockIdentity, ownerToken, ownerOperation, bindingToken);
  if (!sameRetainedPayload(published, binding)) {
    throw new Error(`Generated profile retained payload binding changed during publication: ${bindingToken}`);
  }
  return published;
}

async function reconcileRetainedBindingPendingFiles(lockRoot, lockIdentity, owner) {
  const bindingRoot = path.join(lockRoot, RETAINED_BINDING_ROOT);
  for (const entry of await readdir(bindingRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith('.pending-') || !entry.name.endsWith('.json') || !entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }
    const pendingPath = path.join(bindingRoot, entry.name);
    try {
      const pending = assertRetainedBinding(
        JSON.parse(await readFile(pendingPath, 'utf8')),
        lockIdentity,
        owner.token,
        owner.operation
      );
      const prefix = `.pending-${pending.bindingToken}-`;
      const nonce = entry.name.slice(prefix.length, -'.json'.length);
      if (!entry.name.startsWith(prefix)) continue;
      assertSafeToken(nonce, 'retained payload pending publication');
      const published = await readRetainedBinding(
        lockRoot,
        lockIdentity,
        owner.token,
        owner.operation,
        pending.bindingToken
      );
      if (!sameRetainedPayload(pending, published)) continue;
      await unlink(pendingPath);
    } catch {
      // A pending binding has no published hard link yet.  Its randomized
      // candidate name lives under the identity-bound retained-binding root;
      // an unreadable single-link regular file can therefore only be an
      // interrupted candidate and is safe to unlink rather than poisoning all
      // later detached-lock cleanup.
      try {
        const details = await lstat(pendingPath);
        if (details.isFile() && !details.isSymbolicLink() && details.nlink === 1n) {
          await unlink(pendingPath);
        }
      } catch {
        // A concurrent replacement is retained for the final inventory check.
      }
    }
  }
}

async function realDirectoryIdentity(target, label) {
  const details = await lstat(target);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error(`Generated profile ${label} must be a real directory: ${target}`);
  }
  return details;
}

function assertOperation(operation) {
  if (!Object.hasOwn(OPERATION_PATHS, operation)) {
    throw new Error(`Generated profile operation is invalid: ${String(operation)}`);
  }
  return operation;
}

function assertSafeToken(token, label) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(token)) {
    throw new Error(`Generated profile ${label} token must be a nonempty path-safe string`);
  }
  return token;
}

function resolveGeneratedPath(root, relativePath) {
  return path.join(root, ...relativePath.split('/'));
}

function assertSafeRelativePaths(generatedPaths) {
  if (!Array.isArray(generatedPaths) || generatedPaths.length === 0) {
    throw new Error('Generated replacement requires at least one path');
  }
  if (new Set(generatedPaths).size !== generatedPaths.length) {
    throw new Error('Generated replacement paths must be unique');
  }
  for (const relativePath of generatedPaths) {
    if (
      typeof relativePath !== 'string' ||
      relativePath.length === 0 ||
      relativePath === '.' ||
      relativePath.includes('\\') ||
      path.posix.isAbsolute(relativePath) ||
      relativePath.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
      path.posix.normalize(relativePath) !== relativePath ||
      relativePath.split('/')[0].startsWith('.profile-')
    ) {
      throw new Error(`Unsafe generated replacement path: ${String(relativePath)}`);
    }
  }
  const normalized = generatedPaths.map((item) => `${item}/`);
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      if (normalized[left].startsWith(normalized[right]) || normalized[right].startsWith(normalized[left])) {
        throw new Error('Generated replacement paths must not overlap');
      }
    }
  }
  return generatedPaths;
}

async function assertPackageRoot(packageRoot) {
  if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot)) {
    throw new Error('Generated profile package root must be absolute');
  }
  const resolved = path.resolve(packageRoot);
  const canonical = await realpath(resolved);
  await realDirectoryIdentity(canonical, 'package root');
  return canonical;
}

/**
 * Reject a path whose existing ancestry escapes an owned root through a
 * symlink.  `path.join` alone only constrains the spelling of a path; a
 * symlinked `snapshots` or `normalized` ancestor would otherwise let a later
 * mkdir/rename mutate a location outside the package or transaction lock.
 *
 * Missing trailing ancestors are permitted because replacement creates them,
 * but every existing component is checked immediately before the mutation.
 */
async function assertContainedRealPath(root, target, label, { includeTarget = false } = {}) {
  const relative = path.relative(root, target);
  if (
    relative === '' ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    relative.split(path.sep).some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Generated profile ${label} is outside its owned root`);
  }
  const rootDetails = await realDirectoryIdentity(root, `${label} root`);
  const segments = relative.split(path.sep);
  const limit = includeTarget ? segments.length : segments.length - 1;
  let current = root;
  for (let index = 0; index < limit; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const details = await lstat(current);
      const isTerminal = index === segments.length - 1;
      if (details.isSymbolicLink() || (!isTerminal && !details.isDirectory())) {
        throw new Error(`Generated profile ${label} has a non-directory or symlinked ancestor: ${current}`);
      }
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
  }
  const finalRoot = await realDirectoryIdentity(root, `${label} root`);
  if (!sameIdentity(rootDetails, finalRoot)) {
    throw new Error(`Generated profile ${label} root identity changed while checking containment`);
  }
}

function assertStagingRoot(lockRoot, stagingRoot) {
  if (typeof stagingRoot !== 'string' || path.resolve(stagingRoot) !== path.join(lockRoot, 'staging')) {
    throw new Error('Generated profile transaction staging path is outside its owner lock');
  }
}

function assertTransaction(transaction, { packageRoot, lockRoot, ownerToken, ownerOperation }) {
  if (!isObject(transaction) || transaction.kind !== TRANSACTION_KIND || transaction.token !== ownerToken) {
    throw new Error('Generated profile transaction metadata is invalid');
  }
  if (
    transaction.packageRoot !== packageRoot ||
    transaction.operation !== ownerOperation ||
    !['active', 'committed'].includes(transaction.phase)
  ) {
    throw new Error('Generated profile transaction identity is invalid');
  }
  assertStagingRoot(lockRoot, transaction.stagingRoot);
  assertIdentityRecord(transaction.lockIdentity, 'transaction lock');
  assertIdentityRecord(transaction.stagingIdentity, 'transaction staging');
  assertIdentityRecord(transaction.backupIdentity, 'transaction backup');
  if (transaction.backupRoot !== path.join(lockRoot, 'backup')) {
    throw new Error('Generated profile transaction backup path is not bound to its owner lock');
  }
  const generatedPaths = assertSafeRelativePaths(transaction.generatedPaths);
  const expectedPaths = OPERATION_PATHS[ownerOperation];
  if (
    generatedPaths.length !== expectedPaths.length ||
    generatedPaths.some((relativePath, index) => relativePath !== expectedPaths[index])
  ) {
    throw new Error(`Generated profile transaction targets do not match the ${ownerOperation} operation`);
  }
  if (
    !isObject(transaction.existed) ||
    !isObject(transaction.priorDigests) ||
    !isObject(transaction.nextDigests) ||
    Object.keys(transaction.existed).length !== generatedPaths.length ||
    Object.keys(transaction.priorDigests).length !== generatedPaths.length ||
    Object.keys(transaction.nextDigests).length !== generatedPaths.length
  ) {
    throw new Error('Generated profile transaction integrity inventory is invalid');
  }
  for (const relativePath of generatedPaths) {
    const existed = transaction.existed[relativePath];
    const priorDigest = transaction.priorDigests[relativePath];
    const nextDigest = transaction.nextDigests[relativePath];
    if (
      typeof existed !== 'boolean' ||
      (existed ? !/^[a-f0-9]{64}$/u.test(priorDigest ?? '') : priorDigest !== null) ||
      !/^[a-f0-9]{64}$/u.test(nextDigest ?? '')
    ) {
      throw new Error('Generated profile transaction integrity inventory is invalid');
    }
  }
  return transaction;
}

async function digestPath(target) {
  const details = await lstat(target);
  if (details.isSymbolicLink()) throw new Error(`Generated profile transaction does not accept symlinks: ${target}`);
  if (details.isFile()) {
    return createHash('sha256')
      .update('file\0')
      .update(await readFile(target))
      .digest('hex');
  }
  if (!details.isDirectory()) throw new Error(`Generated profile transaction accepts only files and directories: ${target}`);
  const digest = createHash('sha256').update('directory\0');
  const entries = await readdir(target, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`Generated profile transaction does not accept symlinks: ${path.join(target, entry.name)}`);
    digest.update(entry.name.length.toString(10)).update(':').update(entry.name).update('\0');
    digest.update(await digestPath(path.join(target, entry.name))).update('\0');
  }
  return digest.digest('hex');
}

async function inventoryOwnedTree(root, { ignoreRootMarker = false } = {}) {
  const inventory = [];
  async function visit(current, prefix) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (ignoreRootMarker && prefix === '' && entry.name === DIRECTORY_MARKER_FILE) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(current, entry.name);
      const details = await lstat(target);
      const payloadType = retainedPayloadType(details);
      inventory.push({
        relativePath,
        payloadType,
        identity: identityRecord(details),
        ...(payloadType === 'file' ? { digest: await digestPath(target) } : {})
      });
      if (payloadType === 'directory') await visit(target, relativePath);
    }
  }
  await visit(root, '');
  return inventory;
}

function assertOwnedTreeInventory(inventory, label) {
  if (!Array.isArray(inventory)) throw new Error(`Generated profile ${label} descendant inventory is invalid`);
  const paths = new Set();
  for (const record of inventory) {
    if (
      !isObject(record) ||
      typeof record.relativePath !== 'string' ||
      !['directory', 'file'].includes(record.payloadType) ||
      !isObject(record.identity) ||
      (record.payloadType === 'file' ? !/^[a-f0-9]{64}$/u.test(record.digest ?? '') : record.digest !== undefined)
    ) {
      throw new Error(`Generated profile ${label} descendant inventory is invalid`);
    }
    assertIdentityRecord(record.identity, `${label} descendant`);
    const segments = record.relativePath.split('/');
    if (
      segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
      record.relativePath.includes('\\') ||
      path.posix.isAbsolute(record.relativePath) ||
      path.posix.normalize(record.relativePath) !== record.relativePath ||
      paths.has(record.relativePath)
    ) {
      throw new Error(`Generated profile ${label} descendant path is invalid`);
    }
    paths.add(record.relativePath);
  }
  return inventory;
}

async function assertOwnedTreeInventoryMatches(root, expected, label, { ignoreRootMarker = true } = {}) {
  const actual = await inventoryOwnedTree(root, { ignoreRootMarker });
  if (actual.length !== expected.length) {
    throw new Error(`Generated profile ${label} descendant inventory changed`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (JSON.stringify(actual[index]) !== JSON.stringify(expected[index])) {
      throw new Error(`Generated profile ${label} descendant inventory changed at ${actual[index].relativePath}`);
    }
  }
}

export async function captureGeneratedProfileTemporaryCandidate(root, previousBinding, label = 'temporary candidate') {
  const before = await realDirectoryIdentity(root, label);
  if (previousBinding && !sameIdentityRecord(before, previousBinding.rootIdentity)) {
    throw new Error(`Generated profile ${label} identity changed`);
  }
  const descendantInventory = await inventoryOwnedTree(root);
  const after = await realDirectoryIdentity(root, label);
  if (!sameIdentity(before, after) || (previousBinding && !sameIdentityRecord(after, previousBinding.rootIdentity))) {
    throw new Error(`Generated profile ${label} identity changed while inventorying`);
  }
  return {
    rootIdentity: previousBinding?.rootIdentity ?? identityRecord(after),
    descendantInventory
  };
}

export async function removeGeneratedProfileTemporaryCandidate(root, binding, label = 'temporary candidate') {
  try {
    assertIdentityRecord(binding?.rootIdentity, `${label} root`);
    assertOwnedTreeInventory(binding?.descendantInventory, label);
    const before = await realDirectoryIdentity(root, label);
    if (!sameIdentityRecord(before, binding.rootIdentity)) {
      throw new Error(`Generated profile ${label} identity changed`);
    }
    await assertOwnedTreeInventoryMatches(root, binding.descendantInventory, label, { ignoreRootMarker: false });
    const after = await realDirectoryIdentity(root, label);
    if (!sameIdentityRecord(after, binding.rootIdentity)) {
      throw new Error(`Generated profile ${label} identity changed after inventory validation`);
    }
  } catch (error) {
    throw new Error(`Generated profile ${label} recursive removal skipped at ${root}`, { cause: error });
  }
  try {
    await rm(root, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Generated profile ${label} recursive removal failed at ${root}`, { cause: error });
  }
}

async function finishGeneratedProfileTemporaryCandidate(root, binding, label, actionError) {
  let cleanupError;
  if (!binding) {
    cleanupError = new Error(`Generated profile ${label} has no authoritative binding; recursive removal skipped at ${root}`);
  } else {
    try {
      await removeGeneratedProfileTemporaryCandidate(root, binding, label);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (!cleanupError) return;
  if (actionError) {
    throw new AggregateError(
      [actionError, cleanupError],
      `Generated profile ${label} creation failed; temporary candidate preserved`
    );
  }
  throw cleanupError;
}

async function assertPathDigest(target, expected, label) {
  const actual = await digestPath(target);
  if (actual !== expected) throw new Error(`Generated profile ${label} digest differs at ${target}`);
}

async function assertJournaledTarget(target, existed, priorDigest) {
  const present = await pathExists(target);
  if (present !== existed) {
    throw new Error(`Generated profile journaled target existence changed at ${target}`);
  }
  if (present) await assertPathDigest(target, priorDigest, 'journaled target');
}

async function writeDirectoryMarker(target, kind, session, directoryIdentity) {
  const marker = {
    kind,
    token: session.token,
    operation: session.operation,
    lockIdentity: identityRecord(session.identity),
    directoryIdentity: identityRecord(directoryIdentity)
  };
  await writeFile(path.join(target, DIRECTORY_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx' });
}

async function assertDirectoryMarker(target, kind, transaction, details) {
  let marker;
  try {
    marker = JSON.parse(await readFile(path.join(target, DIRECTORY_MARKER_FILE), 'utf8'));
  } catch (error) {
    throw new Error(`Generated profile ${kind} marker is unreadable at ${target}`, { cause: error });
  }
  if (
    !isObject(marker) ||
    marker.kind !== kind ||
    marker.token !== transaction.token ||
    marker.operation !== transaction.operation ||
    !isObject(marker.lockIdentity) ||
    !isObject(marker.directoryIdentity) ||
    marker.lockIdentity.dev !== transaction.lockIdentity.dev ||
    marker.lockIdentity.ino !== transaction.lockIdentity.ino ||
    marker.directoryIdentity.dev !== String(details.dev) ||
    marker.directoryIdentity.ino !== String(details.ino)
  ) {
    throw new Error(`Generated profile ${kind} marker does not match its transaction`);
  }
}

function assertProcessIdentity(record, label) {
  if (
    (record.processIdentity !== null &&
      (typeof record.processIdentity !== 'string' ||
        record.processIdentity.length === 0 ||
        record.processIdentity.length > 512 ||
        /[\u0000-\u001f\u007f]/u.test(record.processIdentity))) ||
    typeof record.instanceId !== 'string'
  ) {
    throw new Error(`Generated profile ${label} process identity is invalid`);
  }
  assertSafeToken(record.instanceId, `${label} process instance`);
}

async function createProcessIdentity(pid, observer, createInstanceId = randomUUID) {
  const observed = await observer(pid);
  if (!isObject(observed) || observed.status === 'missing') {
    throw new Error(`Generated profile cannot establish process identity for pid ${pid}`);
  }
  const record = {
    processIdentity: observed.status === 'alive' && typeof observed.identity === 'string' ? observed.identity : null,
    instanceId: createInstanceId()
  };
  assertProcessIdentity(record, 'process');
  return record;
}

function assertLease(lease, { scope, ownerToken, claimToken, instanceId }) {
  if (
    !isObject(lease) ||
    lease.kind !== LEASE_KIND ||
    lease.scope !== scope ||
    lease.ownerToken !== ownerToken ||
    lease.instanceId !== instanceId ||
    (scope === 'claim' && lease.claimToken !== claimToken) ||
    !Number.isFinite(lease.renewedAt) ||
    !Number.isFinite(lease.expiresAt) ||
    lease.expiresAt <= lease.renewedAt
  ) {
    throw new Error(`Generated profile ${scope} lease is invalid`);
  }
  return lease;
}

function createLease({ scope, ownerToken, claimToken, instanceId, now, leaseMs }) {
  const renewedAt = now();
  return assertLease(
    {
      kind: LEASE_KIND,
      scope,
      ownerToken,
      ...(claimToken ? { claimToken } : {}),
      instanceId,
      renewedAt,
      expiresAt: renewedAt + leaseMs
    },
    { scope, ownerToken, claimToken, instanceId }
  );
}

async function readLease(root, binding) {
  try {
    return assertLease(JSON.parse(await readFile(path.join(root, LEASE_FILE), 'utf8')), binding);
  } catch (error) {
    throw new Error(`Generated profile ${binding.scope} lease is unreadable at ${root}`, { cause: error });
  }
}

async function writeLease(root, lease) {
  const pending = path.join(root, `.lease-${randomUUID()}.json`);
  let pendingOwned = true;
  try {
    await writeFile(pending, `${JSON.stringify(lease, null, 2)}\n`, { flag: 'wx' });
    await rename(pending, path.join(root, LEASE_FILE));
    pendingOwned = false;
  } finally {
    if (pendingOwned) await rm(pending, { force: true });
  }
}

async function processInstanceIsActive(
  record,
  leaseRoot,
  binding,
  { observeProcess = observeGeneratedProfileProcess, isProcessAlive, now = () => Date.now() } = {}
) {
  if (record.recoveryRequired === true) return false;
  const lease = await readLease(leaseRoot, binding);
  let observed;
  if (typeof isProcessAlive === 'function') {
    observed = (await isProcessAlive(record.pid)) ? { status: 'unknown' } : { status: 'missing' };
  } else {
    try {
      observed = await observeProcess(record.pid);
    } catch {
      observed = { status: 'unknown' };
    }
  }
  if (isObject(observed) && observed.status === 'missing') return false;
  if (isObject(observed) && observed.status === 'alive' && record.processIdentity !== null) {
    return observed.identity === record.processIdentity;
  }
  return now() < lease.expiresAt;
}

export function startGeneratedProfileLeaseHeartbeat(
  refresh,
  leaseMs,
  { setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}
) {
  let failure;
  let pending = Promise.resolve();
  const timer = setIntervalFn(() => {
    pending = pending.then(refresh).catch((error) => {
      failure ??= error;
    });
  }, Math.max(100, Math.floor(leaseMs / 3)));
  timer.unref?.();
  return {
    async assertHealthy() {
      if (failure) throw failure;
    },
    async stopAndDrain() {
      clearIntervalFn(timer);
      await pending;
      if (failure) throw failure;
    }
  };
}

function assertOwner(owner, packageRoot, lockRoot) {
  if (!isObject(owner)) throw new Error('Generated profile lock owner must be an object');
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
    throw new Error('Generated profile lock owner pid must be a positive safe integer');
  }
  assertSafeToken(owner.token, 'lock owner');
  if (typeof owner.startedAt !== 'string' || !Number.isFinite(Date.parse(owner.startedAt))) {
    throw new Error('Generated profile lock owner startedAt must be a valid date');
  }
  assertProcessIdentity(owner, 'lock owner');
  assertIdentityRecord(owner.retainedBindingRootIdentity, 'retained binding root');
  if (owner.stagingPending !== undefined && owner.stagingPending !== true) {
    throw new Error('Generated profile lock owner staging state is invalid');
  }
  if (owner.stagingIdentity !== undefined) assertIdentityRecord(owner.stagingIdentity, 'pre-journal staging');
  if (owner.stagingPending === true && (owner.stagingIdentity !== undefined || owner.transaction !== undefined)) {
    throw new Error('Generated profile lock owner staging state is invalid');
  }
  if (owner.preJournalBackupIdentity !== undefined) {
    assertIdentityRecord(owner.preJournalBackupIdentity, 'pre-journal backup');
    if (owner.transaction !== undefined) {
      throw new Error('Generated profile lock owner cannot retain a pre-journal backup with a transaction');
    }
  }
  if (owner.recoveryRequired !== undefined && owner.recoveryRequired !== true) {
    throw new Error('Generated profile lock owner recovery state is invalid');
  }
  assertOperation(owner.operation);
  if (owner.transaction !== undefined) {
    assertTransaction(owner.transaction, {
      packageRoot,
      lockRoot,
      ownerToken: owner.token,
      ownerOperation: owner.operation
    });
  }
  return owner;
}

function assertClaim(claim) {
  if (!isObject(claim)) throw new Error('Generated profile recovery claim must be an object');
  if (!Number.isSafeInteger(claim.pid) || claim.pid <= 0) {
    throw new Error('Generated profile recovery claim pid must be a positive safe integer');
  }
  for (const field of ['token', 'ownerToken']) {
    assertSafeToken(claim[field], `recovery claim ${field}`);
  }
  if (typeof claim.startedAt !== 'string' || !Number.isFinite(Date.parse(claim.startedAt))) {
    throw new Error('Generated profile recovery claim startedAt must be a valid date');
  }
  assertProcessIdentity(claim, 'recovery claim');
  return claim;
}

async function readOwner(lockRoot, packageRoot) {
  const owner = assertOwner(JSON.parse(await readFile(path.join(lockRoot, OWNER_FILE), 'utf8')), packageRoot, lockRoot);
  const bindingRoot = await realDirectoryIdentity(path.join(lockRoot, RETAINED_BINDING_ROOT), 'retained binding root');
  if (!sameIdentityRecord(bindingRoot, owner.retainedBindingRootIdentity)) {
    throw new Error('Generated profile retained binding root identity changed');
  }
  return owner;
}

async function readClaimRoot(claimRoot) {
  return assertClaim(JSON.parse(await readFile(path.join(claimRoot, CLAIM_FILE), 'utf8')));
}

async function readClaim(lockRoot) {
  return readClaimRoot(path.join(lockRoot, CLAIM_NAME));
}

function ownerLeaseBinding(owner) {
  return { scope: 'owner', ownerToken: owner.token, instanceId: owner.instanceId };
}

function claimLeaseBinding(claim) {
  return {
    scope: 'claim',
    ownerToken: claim.ownerToken,
    claimToken: claim.token,
    instanceId: claim.instanceId
  };
}

function assertMutationGate(gate, lockIdentity) {
  if (
    !isObject(gate) ||
    gate.kind !== MUTATION_GATE_KIND ||
    !['owner', 'claim', 'contender'].includes(gate.actorScope) ||
    !Number.isSafeInteger(gate.pid) ||
    gate.pid <= 0 ||
    !Number.isFinite(gate.renewedAt) ||
    !Number.isFinite(gate.expiresAt) ||
    gate.expiresAt < gate.renewedAt ||
    gate.ownerToken === undefined ||
    (gate.actorScope !== 'owner' && gate.claimToken === undefined) ||
    !isObject(gate.lockIdentity) ||
    !sameIdentityRecord(lockIdentity, gate.lockIdentity)
  ) {
    throw new Error('Generated profile mutation gate metadata is invalid');
  }
  assertSafeToken(gate.actionToken, 'mutation gate action');
  assertSafeToken(gate.ownerToken, 'mutation gate owner');
  if (gate.claimToken !== undefined) assertSafeToken(gate.claimToken, 'mutation gate claim');
  assertProcessIdentity(gate, 'mutation gate');
  return gate;
}

async function readMutationGate(gateRoot, lockIdentity) {
  try {
    return assertMutationGate(
      JSON.parse(await readFile(path.join(gateRoot, MUTATION_GATE_FILE), 'utf8')),
      lockIdentity
    );
  } catch (error) {
    throw new Error(`Generated profile mutation gate is unreadable at ${gateRoot}`, { cause: error });
  }
}

async function writeMutationGate(gateRoot, gate) {
  const pending = path.join(gateRoot, `.gate-${randomUUID()}.json`);
  let pendingOwned = true;
  try {
    await writeFile(pending, `${JSON.stringify(gate, null, 2)}\n`, { flag: 'wx' });
    await rename(pending, path.join(gateRoot, MUTATION_GATE_FILE));
    pendingOwned = false;
  } finally {
    if (pendingOwned) await rm(pending, { force: true });
  }
}

async function renewMutationGateLease(context) {
  if (!context.gate) throw new Error('Generated profile mutation gate is not held');
  const current = await realDirectoryIdentity(context.gate.gateRoot, 'mutation gate');
  const gate = await readMutationGate(context.gate.gateRoot, context.identity);
  if (!sameIdentity(current, context.gate.gateIdentity) || gate.actionToken !== context.gate.gate.actionToken) {
    throw new Error('Generated profile mutation gate ownership was lost');
  }
  const renewedAt = context.now();
  const renewed = assertMutationGate(
    { ...gate, renewedAt, expiresAt: renewedAt + context.leaseMs },
    context.identity
  );
  await writeMutationGate(context.gate.gateRoot, renewed);
  context.gate.gate = renewed;
}

async function assertActorAuthority(context) {
  const owner = await assertOuterOwner(context.lockRoot, context.packageRoot, context.identity, context.ownerToken);
  if (context.actorScope === 'owner') {
    await assertNoRecoveryClaim(context.lockRoot);
    if (owner.instanceId !== context.actorRecord.instanceId) {
      throw new Error('Generated profile owner process instance changed');
    }
    return owner;
  }
  if (context.actorScope === 'claim') {
    const claim = await readClaim(context.lockRoot);
    if (
      claim.ownerToken !== context.ownerToken ||
      claim.token !== context.actorRecord.token ||
      claim.instanceId !== context.actorRecord.instanceId
    ) {
      throw new Error('Generated profile recovery claim ownership was lost');
    }
    return owner;
  }
  return owner;
}

async function gateHolderIsGone(gate, context) {
  let observed;
  if (typeof context.isProcessAlive === 'function') {
    observed = (await context.isProcessAlive(gate.pid)) ? { status: 'unknown' } : { status: 'missing' };
  } else {
    try {
      observed = await context.observeProcess(gate.pid);
    } catch {
      observed = { status: 'unknown' };
    }
  }
  if (isObject(observed) && observed.status === 'missing') return true;
  if (
    isObject(observed) &&
      observed.status === 'alive' &&
      gate.processIdentity !== null &&
      observed.identity !== gate.processIdentity
  ) {
    return true;
  }
  // Unknown process observations cannot distinguish a recycled PID.  A
  // holder without a stable identity therefore has to keep a renewable gate
  // lease current, just like owner and recovery-claim records do.
  return gate.processIdentity === null && context.now() >= gate.expiresAt;
}

function createMutationGateRecord(context, actionToken = randomUUID()) {
  const actor = context.actorRecord;
  const renewedAt = context.now();
  return assertMutationGate(
    {
      kind: MUTATION_GATE_KIND,
      actionToken,
      actorScope: context.actorScope,
      ownerToken: context.ownerToken,
      ...(context.actorScope === 'owner' ? {} : { claimToken: actor.token }),
      pid: actor.pid,
      processIdentity: actor.processIdentity,
      instanceId: actor.instanceId,
      renewedAt,
      expiresAt: renewedAt + context.leaseMs,
      lockIdentity: identityRecord(context.identity)
    },
    context.identity
  );
}

async function bindRetiredGate(context, gate, disposition, source, details) {
  const binding = await publishRetainedBinding({
    lockRoot: context.lockRoot,
    lockIdentity: context.identity,
    ownerToken: context.ownerToken,
    ownerOperation: context.operation,
    bindingToken: retainedBindingToken('retired-gate', context.ownerToken, gate.actionToken),
    payloadKind: 'retired-gate',
    payloadToken: gate.actionToken,
    disposition,
    details,
    payloadDigest: await digestPath(source)
  });
  return { binding, destination: path.join(context.lockRoot, retainedRelativePath(binding)) };
}

async function createInitialMutationGate(lockRoot, context) {
  const gateRoot = path.join(lockRoot, MUTATION_GATE_NAME);
  await mkdir(gateRoot);
  const gate = createMutationGateRecord(context);
  await writeFile(path.join(gateRoot, MUTATION_GATE_FILE), `${JSON.stringify(gate, null, 2)}\n`, { flag: 'wx' });
  return { gateRoot, gateIdentity: await realDirectoryIdentity(gateRoot, 'mutation gate'), gate };
}

async function acquireMutationGate(context) {
  const gateRoot = path.join(context.lockRoot, MUTATION_GATE_NAME);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const actionToken = randomUUID();
    const gate = createMutationGateRecord(context, actionToken);
    const temporary = await mkdtemp(path.join(context.lockRoot, '.mutation-gate-acquire-'));
    let temporaryOwned = true;
    let candidateBinding;
    let actionError;
    try {
      candidateBinding = await captureGeneratedProfileTemporaryCandidate(
        temporary,
        undefined,
        'mutation gate candidate'
      );
      await writeFile(path.join(temporary, MUTATION_GATE_FILE), `${JSON.stringify(gate, null, 2)}\n`, { flag: 'wx' });
      candidateBinding = await captureGeneratedProfileTemporaryCandidate(
        temporary,
        candidateBinding,
        'mutation gate candidate'
      );
      try {
        await rename(temporary, gateRoot);
        temporaryOwned = false;
        const gateIdentity = await realDirectoryIdentity(gateRoot, 'mutation gate');
        const published = await readMutationGate(gateRoot, context.identity);
        if (published.actionToken !== actionToken) {
          throw new Error('Generated profile mutation gate changed during publication');
        }
        return { gateRoot, gateIdentity, gate };
      } catch (error) {
        if (!isConflict(error)) throw error;
      }
    } catch (error) {
      actionError = error;
      throw error;
    } finally {
      if (temporaryOwned) {
        await finishGeneratedProfileTemporaryCandidate(
          temporary,
          candidateBinding,
          'mutation gate candidate',
          actionError
        );
      }
    }

    const before = await realDirectoryIdentity(gateRoot, 'mutation gate');
    const existing = await readMutationGate(gateRoot, context.identity);
    const after = await realDirectoryIdentity(gateRoot, 'mutation gate');
    if (!sameIdentity(before, after)) continue;
    if (!(await gateHolderIsGone(existing, context))) {
      throw new Error(`Generated profile mutation gate is held by pid ${existing.pid}`);
    }
    const finalIdentity = await realDirectoryIdentity(gateRoot, 'mutation gate');
    if (!sameIdentity(finalIdentity, before)) continue;
    const { destination: retired } = await bindRetiredGate(context, existing, 'stale', gateRoot, before);
    if (await pathExists(retired)) {
      throw new Error(`Generated profile retained mutation gate destination already exists: ${retired}`);
    }
    try {
      await rename(gateRoot, retired);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    const moved = await realDirectoryIdentity(retired, 'retired mutation gate');
    if (!sameIdentity(moved, before)) {
      throw new Error(`Generated profile stale mutation gate changed during retirement; preserved at ${retired}`);
    }
  }
  throw new Error('Generated profile mutation gate contention did not settle');
}

async function releaseMutationGate(context, acquired) {
  const current = await realDirectoryIdentity(acquired.gateRoot, 'mutation gate');
  const gate = await readMutationGate(acquired.gateRoot, context.identity);
  if (!sameIdentity(current, acquired.gateIdentity) || gate.actionToken !== acquired.gate.actionToken) {
    throw new Error('Generated profile mutation gate ownership changed before release');
  }
  const { destination: retired } = await bindRetiredGate(
    context,
    gate,
    'retired',
    acquired.gateRoot,
    acquired.gateIdentity
  );
  if (await pathExists(retired)) {
    throw new Error(`Generated profile retained mutation gate destination already exists: ${retired}`);
  }
  await rename(acquired.gateRoot, retired);
  const moved = await realDirectoryIdentity(retired, 'retired mutation gate');
  if (!sameIdentity(moved, acquired.gateIdentity)) {
    throw new Error(`Generated profile mutation gate changed during release; preserved at ${retired}`);
  }
}

async function assertHeldMutationGate(context) {
  if (!context.gate) throw new Error('Generated profile mutation gate is not held');
  const current = await realDirectoryIdentity(context.gate.gateRoot, 'mutation gate');
  const gate = await readMutationGate(context.gate.gateRoot, context.identity);
  if (!sameIdentity(current, context.gate.gateIdentity) || gate.actionToken !== context.gate.gate.actionToken) {
    throw new Error('Generated profile mutation gate ownership was lost');
  }
  return gate;
}

async function withMutationGateOnce(context, action) {
  await assertHeldMutationGate(context);
  const owner = await assertActorAuthority(context);
  const result = await action(owner, context.gate);
  await assertActorAuthority(context);
  await assertHeldMutationGate(context);
  return result;
}

function initializeMutationContext(context, gate) {
  context.gate = gate;
  context.gateTail = Promise.resolve();
  context.withMutation = (action) => {
    const result = context.gateTail.then(() => withMutationGateOnce(context, action));
    context.gateTail = result.catch(() => {});
    return result;
  };
  return context;
}

async function releaseContextMutationGate(context) {
  await context.gateTail;
  await releaseMutationGate(context, context.gate);
  context.gate = undefined;
}

async function assertOuterOwner(lockRoot, packageRoot, identity, ownerToken) {
  const before = await realDirectoryIdentity(lockRoot, 'lock');
  if (!sameIdentity(before, identity)) throw new Error('Generated profile lock identity changed');
  const owner = await readOwner(lockRoot, packageRoot);
  const after = await realDirectoryIdentity(lockRoot, 'lock');
  if (!sameIdentity(after, identity) || owner.token !== ownerToken) {
    throw new Error('Generated profile lock ownership changed');
  }
  return owner;
}

async function assertNoRecoveryClaim(lockRoot) {
  if (await pathExists(path.join(lockRoot, CLAIM_NAME))) {
    throw new Error('Generated profile owner is fenced by a recovery claim');
  }
}

async function refreshOwnerLease(session) {
  await session.withMutation(async (owner) => {
    const lease = createLease({
      ...ownerLeaseBinding(owner),
      now: session.now,
      leaseMs: session.leaseMs
    });
    await writeLease(session.lockRoot, lease);
    await renewMutationGateLease(session);
  });
}

async function assertSessionMutation(session) {
  await session.heartbeat?.assertHealthy();
  return session.withMutation(async (owner) => owner);
}

async function writeOwnerAtomically(context, owner) {
  assertOwner(owner, context.packageRoot, context.lockRoot);
  if (owner.token !== context.ownerToken) throw new Error('Generated profile owner update token differs');
  await context.withMutation(async () => {
    const pending = path.join(context.lockRoot, `.owner-${randomUUID()}.json`);
    let pendingOwned = true;
    try {
      await writeFile(pending, `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
      await rename(pending, path.join(context.lockRoot, OWNER_FILE));
      pendingOwned = false;
    } finally {
      if (pendingOwned) await rm(pending, { force: true });
    }
  });
}

async function createInitialDiscardRoot(lockCandidate, owner, lockIdentity) {
  const transactionIdentity = {
    token: owner.token,
    operation: owner.operation,
    lockIdentity: identityRecord(lockIdentity)
  };
  const discardRoot = path.join(lockCandidate, 'discard');
  await mkdir(discardRoot);
  const discardIdentity = await realDirectoryIdentity(discardRoot, 'recovery discard');
  const bindingRoot = transactionCleanupBindingPath(lockCandidate, transactionIdentity, 'discard');
  await mkdir(bindingRoot);
  const bindingRootIdentity = await realDirectoryIdentity(bindingRoot, 'discard cleanup binding root');
  const bindingFile = path.join(bindingRoot, CLEANUP_BINDING_FILE);
  await writeFile(bindingFile, '', { flag: 'wx' });
  const bindingFileIdentity = await lstat(bindingFile);
  const binding = assertCleanupBinding(
    {
      kind: CLEANUP_BINDING_KIND,
      cleanupKind: 'discard',
      token: owner.token,
      operation: owner.operation,
      lockIdentity: identityRecord(lockIdentity),
      directoryIdentity: identityRecord(discardIdentity),
      bindingRootIdentity: identityRecord(bindingRootIdentity),
      bindingFileIdentity: identityRecord(bindingFileIdentity),
      descendantInventory: []
    },
    transactionIdentity,
    'discard'
  );
  await writeFile(bindingFile, `${JSON.stringify(binding, null, 2)}\n`);
}

async function acquireLock(
  packageRoot,
  operation,
  { pid = process.pid, token = randomUUID(), startedAt } = {},
  {
    observeProcess = observeGeneratedProfileProcess,
    now = () => Date.now(),
    leaseMs = DEFAULT_LEASE_MS,
    createInstanceId = randomUUID
  } = {}
) {
  startedAt ??= new Date(now()).toISOString();
  const lockRoot = path.join(packageRoot, LOCK_NAME);
  const processIdentity = await createProcessIdentity(pid, observeProcess, createInstanceId);
  operation = assertOperation(operation);
  const temporary = await mkdtemp(`${lockRoot}.acquire-`);
  let temporaryOwned = true;
  let candidateBinding;
  let actionError;
  let initialGate;
  let owner;
  try {
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, undefined, 'lock candidate');
    const temporaryIdentity = await realDirectoryIdentity(temporary, 'lock candidate');
    const retainedBindingRoot = path.join(temporary, RETAINED_BINDING_ROOT);
    await mkdir(retainedBindingRoot);
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate');
    const retainedBindingRootIdentity = await realDirectoryIdentity(retainedBindingRoot, 'retained binding root');
    owner = assertOwner(
      {
        pid,
        token,
        startedAt,
        operation,
        ...processIdentity,
        retainedBindingRootIdentity: identityRecord(retainedBindingRootIdentity)
      },
      packageRoot,
      lockRoot
    );
    await writeFile(path.join(temporary, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate');
    await writeFile(
      path.join(temporary, LEASE_FILE),
      `${JSON.stringify(
        createLease({
          scope: 'owner',
          ownerToken: owner.token,
          instanceId: owner.instanceId,
          now,
          leaseMs
        }),
        null,
        2
      )}\n`,
      { flag: 'wx' }
    );
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate');
    await createInitialDiscardRoot(temporary, owner, temporaryIdentity);
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate');
    initialGate = await createInitialMutationGate(temporary, {
      actorScope: 'owner',
      actorRecord: owner,
      ownerToken: owner.token,
      operation: owner.operation,
      identity: temporaryIdentity,
      now,
      leaseMs
    });
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate');
    try {
      await rename(temporary, lockRoot);
      temporaryOwned = false;
    } catch (error) {
      if (!isConflict(error)) throw error;
      let existing;
      try {
        existing = await readOwner(lockRoot, packageRoot);
      } catch (readError) {
        throw new Error(`Generated profile lock metadata is unreadable at ${lockRoot}`, { cause: readError });
      }
      throw new Error(`Another generated profile session owns ${lockRoot} (pid ${existing.pid}, started ${existing.startedAt})`);
    }
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    if (temporaryOwned) {
      await finishGeneratedProfileTemporaryCandidate(temporary, candidateBinding, 'lock candidate', actionError);
    }
  }
  const identity = await realDirectoryIdentity(lockRoot, 'lock');
  return {
    lockRoot,
    owner,
    identity,
    gate: {
      gateRoot: path.join(lockRoot, MUTATION_GATE_NAME),
      gateIdentity: initialGate.gateIdentity,
      gate: initialGate.gate
    }
  };
}

async function assertUniqueClaimRoot(target, expected, candidateBinding) {
  const identity = await realDirectoryIdentity(target, 'recovery claim candidate');
  if (!sameIdentityRecord(identity, candidateBinding.rootIdentity)) {
    throw new Error('Generated profile recovery claim candidate identity changed');
  }
  const actual = await readClaimRoot(target);
  if (actual.token !== expected.token || actual.ownerToken !== expected.ownerToken) {
    throw new Error('Generated profile recovery claim candidate token changed');
  }
  await assertOwnedTreeInventoryMatches(target, candidateBinding.descendantInventory, 'recovery claim candidate');
  return identity;
}

async function removeUniqueClaimRoot(target, expected, candidateBinding) {
  try {
    await assertUniqueClaimRoot(target, expected, candidateBinding);
    await rm(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    return false;
  }
}

async function bindRetiredClaim(lockRoot, lockIdentity, ownerToken, ownerOperation, claim, disposition, source, details) {
  const binding = await publishRetainedBinding({
    lockRoot,
    lockIdentity,
    ownerToken,
    ownerOperation,
    bindingToken: retainedBindingToken('retired-claim', ownerToken, claim.token),
    payloadKind: 'retired-claim',
    payloadToken: claim.token,
    disposition,
    details,
    payloadDigest: await digestPath(source)
  });
  return { binding, destination: path.join(lockRoot, retainedRelativePath(binding)) };
}

const RECOVERY_CLAIM_CANDIDATE_NAME = /^\.recovery-claim-acquire-[A-Za-z0-9]+$/u;

async function reconcileInterruptedRecoveryClaimCandidates(lockRoot) {
  for (const entry of await readdir(lockRoot, { withFileTypes: true })) {
    if (!RECOVERY_CLAIM_CANDIDATE_NAME.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(lockRoot, entry.name);
    try {
      await assertContainedRealPath(lockRoot, candidate, 'recovery claim candidate', { includeTarget: true });
      const before = await realDirectoryIdentity(candidate, 'recovery claim candidate');
      const after = await realDirectoryIdentity(candidate, 'recovery claim candidate');
      if (!sameIdentity(before, after)) continue;
      await rm(candidate, { recursive: true, force: true });
    } catch {
      // A changed candidate remains visible and causes the final detached-lock
      // inventory to preserve the outer lock rather than deleting on a guess.
    }
  }
}

async function acquireRecoveryClaim(
  lockRoot,
  packageRoot,
  identity,
  ownerToken,
  ownerOperation,
  {
    observeProcess = observeGeneratedProfileProcess,
    isProcessAlive,
    now = () => Date.now(),
    leaseMs = DEFAULT_LEASE_MS,
    createInstanceId = randomUUID,
    onClaimPublished = async () => {},
    onClaimBoundary = async () => {}
  } = {}
) {
  const startedAt = new Date(now()).toISOString();
  const processIdentity = await createProcessIdentity(process.pid, observeProcess, createInstanceId);
  const claim = assertClaim({
    pid: process.pid,
    token: randomUUID(),
    ownerToken,
    startedAt,
    ...processIdentity
  });
  const claimRoot = path.join(lockRoot, CLAIM_NAME);
  let temporary;
  let temporaryOwned = false;
  const gateContext = {
    lockRoot,
    packageRoot,
    identity,
    ownerToken,
    operation: ownerOperation,
    actorScope: 'claim',
    actorRecord: claim,
    observeProcess,
    isProcessAlive,
    now,
    leaseMs
  };
  let gate;
  let publishedOwned = false;
  let candidateBinding;
  try {
    gate = await acquireMutationGate(gateContext);
    // The mutation gate serializes recovery claim creation.  Once held, it is
    // safe to remove only exact abandoned candidate names left by a hard kill
    // before publication; an active creator retains the gate and is skipped.
    await reconcileInterruptedRecoveryClaimCandidates(lockRoot);
    temporary = await mkdtemp(path.join(lockRoot, '.recovery-claim-acquire-'));
    temporaryOwned = true;
    await writeFile(path.join(temporary, CLAIM_FILE), `${JSON.stringify(claim, null, 2)}\n`, { flag: 'wx' });
    await writeFile(
      path.join(temporary, LEASE_FILE),
      `${JSON.stringify(
        createLease({
          scope: 'claim',
          ownerToken,
          claimToken: claim.token,
          instanceId: claim.instanceId,
          now,
          leaseMs
        }),
        null,
        2
      )}\n`,
      { flag: 'wx' }
    );
    const candidateIdentity = await realDirectoryIdentity(temporary, 'recovery claim candidate');
    candidateBinding = {
      rootIdentity: identityRecord(candidateIdentity),
      descendantInventory: await inventoryOwnedTree(temporary)
    };
    const currentOwner = await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
    if (
      await processInstanceIsActive(currentOwner, lockRoot, ownerLeaseBinding(currentOwner), {
        observeProcess,
        isProcessAlive,
        now
      })
    ) {
      throw new Error(`Another generated profile session is active (pid ${currentOwner.pid})`);
    }
    if (await pathExists(claimRoot)) {
      const claimIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
      const existing = await readClaim(lockRoot);
      if (existing.ownerToken !== ownerToken) {
        throw new Error('Generated profile recovery claim belongs to another owner');
      }
      if (
        await processInstanceIsActive(existing, claimRoot, claimLeaseBinding(existing), {
          observeProcess,
          isProcessAlive,
          now
        })
      ) {
        throw new Error(`Another generated profile recovery is active (pid ${existing.pid})`);
      }
      const { binding: staleBinding, destination: quarantine } = await bindRetiredClaim(
        lockRoot,
        identity,
        ownerToken,
        ownerOperation,
        existing,
        'stale',
        claimRoot,
        claimIdentity
      );
      await onClaimBoundary('claim-retiring', { claimRoot, claim: existing });
      const finalIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
      if (!sameIdentity(finalIdentity, claimIdentity) || (await digestPath(claimRoot)) !== staleBinding.payloadDigest) {
        throw new Error('Generated profile recovery claim changed before retirement');
      }
      if (await pathExists(quarantine)) {
        throw new Error(`Generated profile retained recovery claim destination already exists: ${quarantine}`);
      }
      await rename(claimRoot, quarantine);
      const moved = await realDirectoryIdentity(quarantine, 'retired recovery claim');
      if (!sameIdentity(moved, claimIdentity)) {
        throw new Error(`Generated profile recovery claim changed during retirement; preserved at ${quarantine}`);
      }
    }
    await onClaimBoundary('claim-publishing', { claimRoot, claim });
    await assertUniqueClaimRoot(temporary, claim, candidateBinding);
    await rename(temporary, claimRoot);
    temporaryOwned = false;
    publishedOwned = true;
    const publishedIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
    const published = await readClaim(lockRoot);
    if (
      !sameIdentity(publishedIdentity, candidateIdentity) ||
      published.token !== claim.token ||
      published.ownerToken !== ownerToken
    ) {
      throw new Error('Generated profile recovery claim changed during publication');
    }
    await onClaimPublished(claim);
    return { claim, claimIdentity: publishedIdentity, gate };
  } catch (error) {
    let claimCleanupError;
    if (publishedOwned) {
      try {
        const claimIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
        const published = await readClaim(lockRoot);
        if (published.token !== claim.token || published.ownerToken !== ownerToken) {
          throw new Error('Generated profile recovery claim changed before failed acquisition cleanup');
        }
        const finalIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
        if (!sameIdentity(finalIdentity, claimIdentity)) {
          throw new Error('Generated profile recovery claim changed before failed acquisition cleanup');
        }
        const { destination: releaseRoot } = await bindRetiredClaim(
          lockRoot,
          identity,
          ownerToken,
          ownerOperation,
          claim,
          'release',
          claimRoot,
          claimIdentity
        );
        if (await pathExists(releaseRoot)) {
          throw new Error(`Generated profile retained recovery claim destination already exists: ${releaseRoot}`);
        }
        await rename(claimRoot, releaseRoot);
        const movedIdentity = await realDirectoryIdentity(releaseRoot, 'released recovery claim');
        if (!sameIdentity(movedIdentity, claimIdentity)) {
          throw new Error(`Generated profile recovery claim changed during cleanup; preserved at ${releaseRoot}`);
        }
      } catch (cleanupError) {
        claimCleanupError = cleanupError;
      }
    }
    let gateCleanupError;
    if (gate) {
      try {
        await releaseMutationGate(gateContext, gate);
      } catch (gateError) {
        gateCleanupError = gateError;
      }
    }
    if (claimCleanupError || gateCleanupError) {
      throw new AggregateError(
        [error, ...(claimCleanupError ? [claimCleanupError] : []), ...(gateCleanupError ? [gateCleanupError] : [])],
        'Recovery claim acquisition teardown failed'
      );
    }
    throw error;
  } finally {
    if (temporaryOwned && candidateBinding) await removeUniqueClaimRoot(temporary, claim, candidateBinding);
  }
}

async function assertClaimOwnership(lockRoot, packageRoot, identity, ownerToken, claimToken) {
  const [owner, claim] = await Promise.all([assertOuterOwner(lockRoot, packageRoot, identity, ownerToken), readClaim(lockRoot)]);
  if (owner.token !== ownerToken || claim.ownerToken !== ownerToken || claim.token !== claimToken) {
    throw new Error('Generated profile recovery claim ownership was lost');
  }
}

async function refreshClaimLease(context) {
  await context.withMutation(async () => {
    const lease = createLease({
      ...claimLeaseBinding(context.claim),
      now: context.now,
      leaseMs: context.leaseMs
    });
    await writeLease(path.join(context.lockRoot, CLAIM_NAME), lease);
    await renewMutationGateLease(context);
  });
}

async function assertClaimMutation(context) {
  await context.heartbeat?.assertHealthy();
  return context.withMutation(async (owner) => owner);
}

async function releaseOwnedRecoveryClaim(context) {
  let actionError;
  try {
    await context.gateTail;
    await assertHeldMutationGate(context);
    await assertActorAuthority(context);
    const claimRoot = path.join(context.lockRoot, CLAIM_NAME);
    const claimIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
    const claim = await readClaim(context.lockRoot);
    if (claim.token !== context.claim.token || claim.ownerToken !== context.ownerToken) {
      throw new Error('Generated profile recovery claim ownership was lost');
    }
    const { binding: releaseBinding, destination: releaseRoot } = await bindRetiredClaim(
      context.lockRoot,
      context.identity,
      context.ownerToken,
      context.operation,
      claim,
      'release',
      claimRoot,
      claimIdentity
    );
    await context.onClaimBoundary('claim-releasing', { claimRoot, claim });
    const finalIdentity = await realDirectoryIdentity(claimRoot, 'recovery claim');
    if (!sameIdentity(finalIdentity, claimIdentity) || (await digestPath(claimRoot)) !== releaseBinding.payloadDigest) {
      throw new Error('Generated profile recovery claim changed before release');
    }
    if (await pathExists(releaseRoot)) {
      throw new Error(`Generated profile retained recovery claim destination already exists: ${releaseRoot}`);
    }
    await rename(claimRoot, releaseRoot);
    const movedIdentity = await realDirectoryIdentity(releaseRoot, 'released recovery claim');
    const movedClaim = await readClaimRoot(releaseRoot);
    if (
      !sameIdentity(movedIdentity, claimIdentity) ||
      movedClaim.token !== context.claim.token ||
      movedClaim.ownerToken !== context.ownerToken
    ) {
      throw new Error(`Generated profile recovery claim changed during release; preserved at ${releaseRoot}`);
    }
    await assertHeldMutationGate(context);
  } catch (error) {
    actionError = error;
  }
  try {
    await releaseContextMutationGate(context);
  } catch (gateError) {
    if (actionError) {
      throw new AggregateError([actionError, gateError], 'Recovery claim and mutation gate release both failed');
    }
    throw gateError;
  }
  if (actionError) throw actionError;
}

async function readCompleteRetainedInventory(lockRoot, lockIdentity, owner) {
  const bindingRoot = path.join(lockRoot, RETAINED_BINDING_ROOT);
  const bindingRootIdentity = await realDirectoryIdentity(bindingRoot, 'retained binding root');
  if (!sameIdentityRecord(bindingRootIdentity, owner.retainedBindingRootIdentity)) {
    throw new Error('Generated profile retained binding root identity changed');
  }
  const bindingsByPath = new Map();
  const entries = await readdir(bindingRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) {
      throw new Error(`Generated profile retained payload inventory has an unexpected entry: ${entry.name}`);
    }
    const bindingToken = entry.name.slice(0, -'.json'.length);
    const binding = await readRetainedBinding(
      lockRoot,
      lockIdentity,
      owner.token,
      owner.operation,
      bindingToken
    );
    if (
      entry.name !== `${binding.bindingToken}.json` ||
      binding.bindingToken !== retainedBindingToken(binding.payloadKind, owner.token, binding.payloadToken)
    ) {
      throw new Error(`Generated profile retained payload inventory key changed: ${entry.name}`);
    }
    const relativePath = retainedRelativePath(binding);
    if (bindingsByPath.has(relativePath)) {
      throw new Error(`Generated profile retained payload inventory duplicates ${relativePath}`);
    }
    bindingsByPath.set(relativePath, binding);
  }
  return bindingsByPath;
}

async function assertRetainedPayload(lockRoot, lockIdentity, owner, relativePath, binding) {
  const payload = path.join(lockRoot, ...relativePath.split('/'));
  const details = await lstat(payload);
  if (
    retainedPayloadType(details) !== binding.payloadType ||
    !sameIdentityRecord(details, binding.payloadIdentity) ||
    (await digestPath(payload)) !== binding.payloadDigest
  ) {
    throw new Error(`Generated profile retained payload inventory mismatch at ${relativePath}`);
  }
  if (binding.payloadKind === 'retired-claim') {
    const claim = await readClaimRoot(payload);
    if (claim.token !== binding.payloadToken || claim.ownerToken !== owner.token) {
      throw new Error(`Generated profile retained claim token changed at ${relativePath}`);
    }
  } else if (binding.payloadKind === 'retired-gate') {
    const gate = await readMutationGate(payload, lockIdentity);
    if (gate.actionToken !== binding.payloadToken || gate.ownerToken !== owner.token) {
      throw new Error(`Generated profile retained gate token changed at ${relativePath}`);
    }
  }
}

async function assertCleanupInventory(lockRoot, lockIdentity, owner, allowedNames) {
  const transactionIdentity = {
    token: owner.token,
    operation: owner.operation,
    lockIdentity: identityRecord(lockIdentity)
  };
  for (const kind of ['discard', 'backup', 'staging']) {
    const payload = kind === 'discard' ? path.join(lockRoot, 'discard') : transactionCleanupPath(lockRoot, transactionIdentity, kind);
    const bindingRoot = transactionCleanupBindingPath(lockRoot, transactionIdentity, kind);
    const payloadExists = await pathExists(payload);
    const bindingExists = await pathExists(bindingRoot);
    if ((kind === 'discard' && (!payloadExists || !bindingExists)) || (kind !== 'discard' && payloadExists !== bindingExists)) {
      throw new Error(`Generated profile ${kind} cleanup inventory is incomplete`);
    }
    if (!payloadExists) continue;
    const details = await realDirectoryIdentity(payload, `${kind} cleanup payload`);
    const binding = await readCleanupBinding(bindingRoot, transactionIdentity, kind);
    if (!sameIdentityRecord(details, binding.directoryIdentity)) {
      throw new Error(`Generated profile ${kind} cleanup inventory identity changed`);
    }
    if (kind !== 'discard') {
      if (await pathExists(path.join(payload, DIRECTORY_MARKER_FILE))) {
        await assertDirectoryMarker(payload, kind, transactionIdentity, details);
      }
      await assertOwnedTreeInventoryMatches(payload, binding.descendantInventory, `${kind} cleanup`);
    }
    allowedNames.add(path.basename(payload));
    allowedNames.add(path.basename(bindingRoot));
  }
}

async function assertDetachedLockInventory(lockRoot, context) {
  const rootIdentity = await realDirectoryIdentity(lockRoot, 'released lock');
  if (!sameIdentity(rootIdentity, context.identity)) {
    throw new Error('Generated profile detached lock identity changed');
  }
  const owner = await readOwner(lockRoot, context.packageRoot);
  if (
    owner.token !== context.ownerToken ||
    owner.operation !== context.operation ||
    owner.retainedBindingRootIdentity.dev !== context.retainedBindingRootIdentity.dev ||
    owner.retainedBindingRootIdentity.ino !== context.retainedBindingRootIdentity.ino
  ) {
    throw new Error('Generated profile detached lock owner changed');
  }
  const gateRoot = path.join(lockRoot, MUTATION_GATE_NAME);
  const gateIdentity = await realDirectoryIdentity(gateRoot, 'released mutation gate');
  const gate = await readMutationGate(gateRoot, context.identity);
  if (
    !sameIdentity(gateIdentity, context.gate.gateIdentity) ||
    gate.actionToken !== context.gate.gate.actionToken ||
    gate.ownerToken !== context.ownerToken
  ) {
    throw new Error('Generated profile detached mutation gate changed');
  }
  const allowedNames = new Set([OWNER_FILE, LEASE_FILE, MUTATION_GATE_NAME, RETAINED_BINDING_ROOT]);
  if (context.actorScope === 'claim') {
    const claimRoot = path.join(lockRoot, CLAIM_NAME);
    const claimIdentity = await realDirectoryIdentity(claimRoot, 'released recovery claim');
    const claim = await readClaimRoot(claimRoot);
    if (
      !sameIdentity(claimIdentity, context.claimIdentity) ||
      claim.token !== context.claim.token ||
      claim.ownerToken !== context.ownerToken
    ) {
      throw new Error('Generated profile detached recovery claim changed');
    }
    allowedNames.add(CLAIM_NAME);
  }
  const bindingsByPath = await readCompleteRetainedInventory(lockRoot, context.identity, owner);
  for (const [relativePath, binding] of bindingsByPath) {
    await assertRetainedPayload(lockRoot, context.identity, owner, relativePath, binding);
    if (!relativePath.includes('/')) allowedNames.add(relativePath);
  }
  const discardEntries = await readdir(path.join(lockRoot, 'discard'), { withFileTypes: true });
  for (const entry of discardEntries) {
    const relativePath = `discard/${entry.name}`;
    if (!bindingsByPath.has(relativePath)) {
      throw new Error(`Generated profile discard payload is not bound: ${relativePath}`);
    }
  }
  for (const [relativePath, binding] of bindingsByPath) {
    if (binding.payloadKind === 'discard-child' && !discardEntries.some((entry) => `discard/${entry.name}` === relativePath)) {
      throw new Error(`Generated profile retained discard payload is missing: ${relativePath}`);
    }
  }
  await assertCleanupInventory(lockRoot, context.identity, owner, allowedNames);
  const backupRoot = path.join(lockRoot, 'backup');
  if (await pathExists(backupRoot)) {
    const backupIdentity = await realDirectoryIdentity(backupRoot, 'pre-journal backup');
    if (!owner.preJournalBackupIdentity || !sameIdentityRecord(backupIdentity, owner.preJournalBackupIdentity)) {
      throw new Error('Generated profile pre-journal backup identity changed');
    }
    await assertDirectoryMarker(
      backupRoot,
      'backup',
      { token: owner.token, operation: owner.operation, lockIdentity: identityRecord(context.identity) },
      backupIdentity
    );
    allowedNames.add('backup');
  }
  const stagingRoot = path.join(lockRoot, 'staging');
  if (await pathExists(stagingRoot)) {
    const stagingIdentity = await realDirectoryIdentity(stagingRoot, 'pre-journal staging');
    if (
      (owner.stagingIdentity && !sameIdentityRecord(stagingIdentity, owner.stagingIdentity)) ||
      (!owner.stagingIdentity && owner.stagingPending !== true)
    ) {
      throw new Error('Generated profile pre-journal staging identity changed');
    }
    allowedNames.add('staging');
  }
  const topEntries = await readdir(lockRoot, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!allowedNames.has(entry.name)) {
      throw new Error(`Generated profile detached lock inventory has an unexpected entry: ${entry.name}`);
    }
  }
}

async function assertDetachedLockCanBeRemoved(lockRoot, context) {
  try {
    await assertDetachedLockInventory(lockRoot, context);
  } catch (error) {
    throw new Error(`Generated profile detached lock cleanup retained at ${lockRoot}`, { cause: error });
  }
}

const RELEASED_LOCK_NAME = /^\.profile-generation-lock\.release-[0-9a-f-]{36}$/u;

/**
 * A process can die after atomically detaching its fully settled lock but
 * before the final recursive remove.  The canonical lock name is then free,
 * so the next session used to leave the owned release directory behind
 * forever.  Rediscover only names made by releaseOwnedLock, reconstruct the
 * exact inode bindings, and remove a candidate only when the same exhaustive
 * detached-lock inventory used by the original releaser still passes.
 */
async function resumeReleasedLockCleanup(
  packageRoot,
  { observeProcess = observeGeneratedProfileProcess, isProcessAlive, now = () => Date.now() } = {}
) {
  const candidates = [];
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (!RELEASED_LOCK_NAME.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    candidates.push(path.join(packageRoot, entry.name));
  }
  let removed = false;
  for (const lockRoot of candidates) {
    try {
      await assertContainedRealPath(packageRoot, lockRoot, 'released lock');
      const identity = await realDirectoryIdentity(lockRoot, 'released lock');
      const owner = await readOwner(lockRoot, packageRoot);
      // A detached lock is recoverable only after the transaction journal was
      // settled.  An active journal remains preserved for explicit recovery.
      if (owner.transaction) continue;
      const gateRoot = path.join(lockRoot, MUTATION_GATE_NAME);
      const gateIdentity = await realDirectoryIdentity(gateRoot, 'released mutation gate');
      const gate = await readMutationGate(gateRoot, identity);
      const claimRoot = path.join(lockRoot, CLAIM_NAME);
      const hasClaim = await pathExists(claimRoot);
      const claim = hasClaim ? await readClaimRoot(claimRoot) : undefined;
      const claimIdentity = hasClaim ? await realDirectoryIdentity(claimRoot, 'released recovery claim') : undefined;
      const liveActor = hasClaim ? claim : owner;
      const liveBinding = hasClaim ? claimLeaseBinding(claim) : ownerLeaseBinding(owner);
      if (await processInstanceIsActive(liveActor, hasClaim ? claimRoot : lockRoot, liveBinding, {
        observeProcess,
        isProcessAlive,
        now
      })) {
        // The releaser still owns this detached lock.  A concurrent invocation
        // must leave its final inventory and recursive removal to that owner.
        continue;
      }
      const context = {
        lockRoot,
        packageRoot,
        identity,
        ownerToken: owner.token,
        operation: owner.operation,
        retainedBindingRootIdentity: owner.retainedBindingRootIdentity,
        actorScope: hasClaim ? 'claim' : 'owner',
        ...(hasClaim ? { claim, claimIdentity } : {}),
        gate: { gateRoot, gateIdentity, gate }
      };
      await assertDetachedLockCanBeRemoved(lockRoot, context);
      const finalIdentity = await realDirectoryIdentity(lockRoot, 'released lock');
      if (!sameIdentity(finalIdentity, identity)) continue;
      await assertDetachedLockCanBeRemoved(lockRoot, context);
      await rm(lockRoot, { recursive: true, force: true });
      removed = true;
    } catch {
      // A malformed, changed, or contested released lock is deliberately
      // retained.  It must never prevent a new canonical lock from being
      // acquired, and it must never be recursively removed on a guess.
    }
  }
  return removed;
}

async function markOuterLockOwnershipLost(context) {
  const ownedPath = await findBoundDirectory(
    context.packageRoot,
    identityRecord(context.identity),
    context.lockRoot
  );
  const foreignPath = (await pathExists(context.lockRoot)) ? context.lockRoot : undefined;
  context.releaseState = { phase: 'ownership-lost', ownedPath, foreignPath };
  throw new Error(
    `Generated profile lock ownership was lost after lock-releasing; owned lock preserved${
      ownedPath ? ` at ${ownedPath}` : ''
    }${foreignPath ? ` and foreign replacement preserved at ${foreignPath}` : ''}`
  );
}

async function releaseOwnedLock(context, onReleaseBoundary = async () => {}) {
  await context.gateTail;
  await assertHeldMutationGate(context);
  await assertActorAuthority(context);
  const initialIdentity = await realDirectoryIdentity(context.lockRoot, 'lock');
  if (!sameIdentity(initialIdentity, context.identity)) {
    throw new Error('Generated profile lock identity changed before release');
  }
  context.releaseState = { phase: 'attached', ownedPath: context.lockRoot };
  await onReleaseBoundary('lock-releasing', context.lockRoot);
  let postHookIdentity;
  try {
    postHookIdentity = await realDirectoryIdentity(context.lockRoot, 'lock');
  } catch {
    await markOuterLockOwnershipLost(context);
  }
  if (!sameIdentity(postHookIdentity, context.identity)) await markOuterLockOwnershipLost(context);
  await context.gateTail;
  await assertHeldMutationGate(context);
  const owner = await assertActorAuthority(context);
  await reconcileRetainedBindingPendingFiles(context.lockRoot, context.identity, owner);
  let finalIdentity;
  try {
    finalIdentity = await realDirectoryIdentity(context.lockRoot, 'lock');
  } catch {
    await markOuterLockOwnershipLost(context);
  }
  if (!sameIdentity(finalIdentity, context.identity)) await markOuterLockOwnershipLost(context);
  const releaseRoot = `${context.lockRoot}.release-${randomUUID()}`;
  await rename(context.lockRoot, releaseRoot);
  context.detachedRoot = releaseRoot;
  context.releaseState = { phase: 'detached-owned', ownedPath: releaseRoot };
  await assertDetachedLockCanBeRemoved(releaseRoot, context);
  await onReleaseBoundary('lock-detached', releaseRoot);
  let removalRoot = releaseRoot;
  let replaced = false;
  try {
    const current = await realDirectoryIdentity(releaseRoot, 'released lock');
    if (!sameIdentity(current, context.identity)) replaced = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
    replaced = true;
  }
  if (replaced) {
    removalRoot = await findBoundDirectory(context.packageRoot, identityRecord(context.identity), releaseRoot);
    if (!removalRoot) {
      context.detachedRoot = undefined;
      context.releaseState = { phase: 'ownership-lost', foreignPath: releaseRoot };
      throw new Error(
        `Generated profile detached lock location was lost; foreign replacement preserved at ${releaseRoot}`
      );
    }
    context.detachedRoot = removalRoot;
    context.releaseState = { phase: 'detached-owned', ownedPath: removalRoot, foreignPath: releaseRoot };
  }
  const removalIdentity = await realDirectoryIdentity(removalRoot, 'released lock');
  if (!sameIdentity(removalIdentity, context.identity)) {
    throw new Error(`Generated profile released lock identity changed; preserved at ${removalRoot}`);
  }
  await assertDetachedLockCanBeRemoved(removalRoot, context);
  await onReleaseBoundary('lock-removing', removalRoot);
  const finalRemovalIdentity = await realDirectoryIdentity(removalRoot, 'released lock');
  if (!sameIdentity(finalRemovalIdentity, context.identity)) {
    const relocated = await findBoundDirectory(context.packageRoot, identityRecord(context.identity), removalRoot);
    if (relocated) {
      const relocatedIdentity = await realDirectoryIdentity(relocated, 'relocated released lock');
      if (!sameIdentity(relocatedIdentity, context.identity)) {
        throw new Error(`Generated profile relocated released lock identity changed; preserved at ${relocated}`);
      }
      context.detachedRoot = relocated;
      context.releaseState = { phase: 'detached-owned', ownedPath: relocated, foreignPath: removalRoot };
      await assertDetachedLockCanBeRemoved(relocated, context);
      await rm(relocated, { recursive: true, force: true });
      context.detachedRoot = undefined;
      context.releaseState = { phase: 'owned-removed', ownedPath: relocated, foreignPath: removalRoot };
      context.gate = undefined;
    } else {
      context.detachedRoot = undefined;
      context.releaseState = { phase: 'ownership-lost', foreignPath: removalRoot };
      throw new Error(
        `Generated profile detached lock location was lost; foreign replacement preserved at ${removalRoot}`
      );
    }
    throw new Error(
      `Generated profile owned detached lock removed; foreign replacement preserved at ${removalRoot}`
    );
  }
  await assertDetachedLockCanBeRemoved(removalRoot, context);
  await rm(removalRoot, { recursive: true, force: true });
  context.detachedRoot = undefined;
  context.releaseState = replaced
    ? { phase: 'owned-removed', ownedPath: removalRoot, foreignPath: releaseRoot }
    : { phase: 'owned-removed', ownedPath: removalRoot };
  context.gate = undefined;
  if (replaced) {
    throw new Error(`Generated profile owned detached lock removed; foreign replacement preserved at ${releaseRoot}`);
  }
  context.releaseState = undefined;
}

async function validateTransactionPaths(transaction, { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation }) {
  assertTransaction(transaction, { packageRoot, lockRoot, ownerToken, ownerOperation });
  if (!sameIdentityRecord(lockIdentity, transaction.lockIdentity)) {
    throw new Error('Generated profile transaction lock identity changed');
  }
  if (await pathExists(transaction.stagingRoot)) {
    const stagingDetails = await realDirectoryIdentity(transaction.stagingRoot, 'transaction staging');
    if (!sameIdentityRecord(stagingDetails, transaction.stagingIdentity)) {
      throw new Error('Generated profile transaction staging identity changed');
    }
    await assertDirectoryMarker(transaction.stagingRoot, 'staging', transaction, stagingDetails);
  }
  if (await pathExists(transaction.backupRoot)) {
    const backupDetails = await realDirectoryIdentity(transaction.backupRoot, 'transaction backup');
    if (!sameIdentityRecord(backupDetails, transaction.backupIdentity)) {
      throw new Error('Generated profile transaction backup identity changed');
    }
    await assertDirectoryMarker(transaction.backupRoot, 'backup', transaction, backupDetails);
  }
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(packageRoot, relativePath);
    const staged = resolveGeneratedPath(transaction.stagingRoot, relativePath);
    const backup = resolveGeneratedPath(transaction.backupRoot, relativePath);
    if (
      !target.startsWith(`${packageRoot}${path.sep}`) ||
      !staged.startsWith(`${transaction.stagingRoot}${path.sep}`) ||
      !backup.startsWith(`${transaction.backupRoot}${path.sep}`)
    ) {
      throw new Error('Generated profile transaction contains an unsafe resolved path');
    }
    await assertContainedRealPath(packageRoot, target, `transaction target ${relativePath}`, { includeTarget: true });
    if (await pathExists(transaction.stagingRoot)) {
      await assertContainedRealPath(transaction.stagingRoot, staged, `transaction staging ${relativePath}`, {
        includeTarget: true
      });
    }
    if (await pathExists(transaction.backupRoot)) {
      await assertContainedRealPath(transaction.backupRoot, backup, `transaction backup ${relativePath}`, {
        includeTarget: true
      });
    }
  }
}

function transactionCleanupPath(lockRoot, transaction, kind) {
  return path.join(lockRoot, `.transaction-cleanup-${kind}-${transaction.token}`);
}

function transactionCleanupBindingPath(lockRoot, transaction, kind) {
  return path.join(lockRoot, `.transaction-cleanup-${kind}-${transaction.token}-binding`);
}

function assertCleanupBinding(binding, transaction, kind) {
  if (
    !isObject(binding) ||
    binding.kind !== CLEANUP_BINDING_KIND ||
    binding.cleanupKind !== kind ||
    binding.token !== transaction.token ||
    binding.operation !== transaction.operation ||
    !isObject(binding.lockIdentity) ||
    binding.lockIdentity.dev !== transaction.lockIdentity.dev ||
    binding.lockIdentity.ino !== transaction.lockIdentity.ino
  ) {
    throw new Error(`Generated profile ${kind} cleanup binding does not match its transaction`);
  }
  assertIdentityRecord(binding.directoryIdentity, `${kind} cleanup`);
  assertIdentityRecord(binding.bindingRootIdentity, `${kind} cleanup binding root`);
  assertIdentityRecord(binding.bindingFileIdentity, `${kind} cleanup binding file`);
  assertOwnedTreeInventory(binding.descendantInventory, `${kind} cleanup`);
  return binding;
}

async function readCleanupBinding(bindingRoot, transaction, kind) {
  const rootIdentity = await realDirectoryIdentity(bindingRoot, `${kind} cleanup binding`);
  try {
    const entries = await readdir(bindingRoot, { withFileTypes: true });
    if (
      entries.length !== 1 ||
      entries[0].name !== CLEANUP_BINDING_FILE ||
      !entries[0].isFile() ||
      entries[0].isSymbolicLink()
    ) {
      throw new Error('cleanup binding directory inventory changed');
    }
    const binding = assertCleanupBinding(
      JSON.parse(await readFile(path.join(bindingRoot, CLEANUP_BINDING_FILE), 'utf8')),
      transaction,
      kind
    );
    const fileIdentity = await lstat(path.join(bindingRoot, CLEANUP_BINDING_FILE));
    if (
      !sameIdentityRecord(rootIdentity, binding.bindingRootIdentity) ||
      !fileIdentity.isFile() ||
      fileIdentity.isSymbolicLink() ||
      !sameIdentityRecord(fileIdentity, binding.bindingFileIdentity)
    ) {
      throw new Error('cleanup binding identity changed');
    }
    return binding;
  } catch (error) {
    throw new Error(`Generated profile ${kind} cleanup binding is unreadable at ${bindingRoot}`, { cause: error });
  }
}

async function publishCleanupBinding(bindingRoot, transaction, kind, directoryIdentity, descendantInventory) {
  const temporary = await mkdtemp(`${bindingRoot}.acquire-`);
  let temporaryOwned = true;
  let candidateBinding;
  let actionError;
  try {
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(
      temporary,
      undefined,
      `${kind} cleanup binding candidate`
    );
    const bindingRootIdentity = await realDirectoryIdentity(temporary, `${kind} cleanup binding candidate`);
    const bindingFile = path.join(temporary, CLEANUP_BINDING_FILE);
    await writeFile(bindingFile, '', { flag: 'wx' });
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(
      temporary,
      candidateBinding,
      `${kind} cleanup binding candidate`
    );
    const bindingFileIdentity = await lstat(bindingFile);
    const binding = assertCleanupBinding(
      {
        kind: CLEANUP_BINDING_KIND,
        cleanupKind: kind,
        token: transaction.token,
        operation: transaction.operation,
        lockIdentity: transaction.lockIdentity,
        directoryIdentity: identityRecord(directoryIdentity),
        bindingRootIdentity: identityRecord(bindingRootIdentity),
        bindingFileIdentity: identityRecord(bindingFileIdentity),
        descendantInventory
      },
      transaction,
      kind
    );
    await writeFile(bindingFile, `${JSON.stringify(binding, null, 2)}\n`);
    candidateBinding = await captureGeneratedProfileTemporaryCandidate(
      temporary,
      candidateBinding,
      `${kind} cleanup binding candidate`
    );
    try {
      await rename(temporary, bindingRoot);
      temporaryOwned = false;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    if (temporaryOwned) {
      await finishGeneratedProfileTemporaryCandidate(
        temporary,
        candidateBinding,
        `${kind} cleanup binding candidate`,
        actionError
      );
    }
  }
  return readCleanupBinding(bindingRoot, transaction, kind);
}

async function assertBoundDiscardRootIfPresent(discardRoot, bindingRoot, transaction) {
  if (!(await pathExists(discardRoot))) return undefined;
  if (!(await pathExists(bindingRoot))) {
    throw new Error(`Generated profile recovery discard has no transaction binding: ${discardRoot}`);
  }
  const details = await realDirectoryIdentity(discardRoot, 'recovery discard');
  const binding = await readCleanupBinding(bindingRoot, transaction, 'discard');
  if (!sameIdentityRecord(details, binding.directoryIdentity)) {
    throw new Error('Generated profile recovery discard binding directory identity changed');
  }
  return binding;
}

async function ensureBoundDiscardRoot(discardRoot, bindingRoot, transaction, assertMutation) {
  const existing = await assertBoundDiscardRootIfPresent(discardRoot, bindingRoot, transaction);
  if (existing) return existing;
  await assertMutation();
  throw new Error('Generated profile recovery discard binding exists without its payload');
}

async function findBoundDirectory(lockRoot, expectedIdentity, excludedPath) {
  for (const entry of await readdir(lockRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(lockRoot, entry.name);
    if (candidate === excludedPath) continue;
    try {
      const details = await realDirectoryIdentity(candidate, 'relocated cleanup');
      if (sameIdentityRecord(details, expectedIdentity)) return candidate;
    } catch {
      // Contested entries are ignored; only the exact bound inode can be removed.
    }
  }
  return undefined;
}

async function cleanupJournalOwnedDirectory({
  source,
  kind,
  transaction,
  lockRoot,
  assertMutation,
  onBoundary = async () => {}
}) {
  const cleanup = transactionCleanupPath(lockRoot, transaction, kind);
  await assertContainedRealPath(lockRoot, source, `transaction ${kind}`);
  await assertContainedRealPath(lockRoot, cleanup, `transaction ${kind} cleanup`);
  const sourceExists = await pathExists(source);
  const cleanupExists = await pathExists(cleanup);
  if (sourceExists && cleanupExists) {
    throw new Error(`Generated profile ${kind} cleanup has both journaled and quarantined directories`);
  }
  const externalBindingRoot = transactionCleanupBindingPath(lockRoot, transaction, kind);
  let binding = (await pathExists(externalBindingRoot))
    ? await readCleanupBinding(externalBindingRoot, transaction, kind)
    : undefined;
  if (sourceExists) {
    const details = await realDirectoryIdentity(source, `transaction ${kind}`);
    if (kind === 'backup' || kind === 'staging') {
      const expected = kind === 'backup' ? transaction.backupIdentity : transaction.stagingIdentity;
      if (!sameIdentityRecord(details, expected)) {
        throw new Error(`Generated profile transaction ${kind} identity changed before cleanup`);
      }
      await assertDirectoryMarker(source, kind, transaction, details);
    }
    if (binding && !sameIdentityRecord(details, binding.directoryIdentity)) {
      throw new Error(`Generated profile ${kind} cleanup binding directory identity changed`);
    }
    if (kind === 'discard' && !binding) {
      throw new Error(`Generated profile recovery discard has no transaction binding: ${source}`);
    }
    binding ??= await publishCleanupBinding(
      externalBindingRoot,
      transaction,
      kind,
      details,
      await inventoryOwnedTree(source, { ignoreRootMarker: true })
    );
    await assertMutation();
    await rename(source, cleanup);
    await onBoundary(`cleanup-quarantined:${kind}`, transaction);
  }
  if (!(await pathExists(cleanup))) return;
  if (!binding) {
    throw new Error(`Generated profile quarantined ${kind} cleanup has no transaction binding: ${cleanup}`);
  }
  const quarantined = await realDirectoryIdentity(cleanup, `quarantined ${kind} cleanup`);
  if (!sameIdentityRecord(quarantined, binding.directoryIdentity)) {
    throw new Error(`Generated profile quarantined ${kind} cleanup identity changed`);
  }
  await onBoundary(`cleanup-removing:${kind}`, transaction);
  await assertMutation();
  const finalQuarantined = await realDirectoryIdentity(cleanup, `quarantined ${kind} cleanup`);
  if (!sameIdentityRecord(finalQuarantined, binding.directoryIdentity)) {
    const relocated = await findBoundDirectory(lockRoot, binding.directoryIdentity, cleanup);
    if (relocated) {
      await assertMutation();
      const relocatedIdentity = await realDirectoryIdentity(relocated, `relocated ${kind} cleanup`);
      if (!sameIdentityRecord(relocatedIdentity, binding.directoryIdentity)) {
        throw new Error(`Generated profile relocated ${kind} cleanup identity changed; preserved at ${relocated}`);
      }
      const finalBinding = await readCleanupBinding(externalBindingRoot, transaction, kind);
      if (JSON.stringify(finalBinding) !== JSON.stringify(binding)) {
        throw new Error(`Generated profile relocated ${kind} cleanup binding changed; preserved at ${relocated}`);
      }
      if (kind === 'discard') {
        throw new Error(`Generated profile relocated discard cleanup requires retained child verification at ${relocated}`);
      }
      if (await pathExists(path.join(relocated, DIRECTORY_MARKER_FILE))) {
        await assertDirectoryMarker(relocated, kind, transaction, relocatedIdentity);
      }
      await assertOwnedTreeInventoryMatches(relocated, binding.descendantInventory, `relocated ${kind} cleanup`);
      await rm(relocated, { recursive: true, force: true });
    }
    throw new Error(
      `Generated profile quarantined ${kind} cleanup path was replaced; the replacement was preserved at ${cleanup}`
    );
  }
  await onBoundary(`cleanup-removed:${kind}`, transaction);
}

async function assertOptionalOwnedDirectory(target, label) {
  if (await pathExists(target)) await realDirectoryIdentity(target, label);
}

async function cleanupDiscardPath({ discarded, relativePath, transaction, onRecoveryBoundary }) {
  if (!(await pathExists(discarded))) return;
  const details = await lstat(discarded);
  if (details.isSymbolicLink()) {
    throw new Error(`Generated profile recovery discard must not be a symlink: ${discarded}`);
  }
  await onRecoveryBoundary(`recovery-cleanup:${relativePath}`, transaction);
}

async function moveTargetToDiscard({
  target,
  discarded,
  index,
  lockRoot,
  lockIdentity,
  ownerToken,
  ownerOperation,
  generatedPath,
  expectedDigest,
  assertMutation
}) {
  await assertContainedRealPath(lockRoot, discarded, `recovery discard ${generatedPath}`, { includeTarget: true });
  const sourceDetails = await lstat(target);
  const payloadDigest = await digestPath(target);
  if (payloadDigest !== expectedDigest) {
    throw new Error(`Generated profile discard source digest changed before retention: ${target}`);
  }
  const binding = await publishRetainedBinding({
    lockRoot,
    lockIdentity,
    ownerToken,
    ownerOperation,
    bindingToken: retainedBindingToken('discard-child', ownerToken, String(index)),
    payloadKind: 'discard-child',
    payloadToken: String(index),
    disposition: 'discarded',
    details: sourceDetails,
    payloadDigest,
    index,
    generatedPath
  });
  const destination = path.join(lockRoot, retainedRelativePath(binding));
  if (destination !== discarded) {
    throw new Error('Generated profile discard binding destination changed');
  }
  await assertMutation();
  const finalSource = await lstat(target);
  if (
    !sameIdentity(finalSource, sourceDetails) ||
    retainedPayloadType(finalSource) !== retainedPayloadType(sourceDetails) ||
    (await digestPath(target)) !== binding.payloadDigest
  ) {
    throw new Error(`Generated profile discard source changed before retention: ${target}`);
  }
  if (await pathExists(discarded)) {
    throw new Error(`Generated profile retained discard destination already exists: ${discarded}`);
  }
  await rename(target, discarded);
  const moved = await lstat(discarded);
  if (!sameIdentity(moved, sourceDetails) || retainedPayloadType(moved) !== retainedPayloadType(sourceDetails)) {
    throw new Error(`Generated profile discard child changed during retention: ${discarded}`);
  }
}

async function recoverActiveTransaction(
  transaction,
  { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation, assertMutation, onRecoveryBoundary }
) {
  await validateTransactionPaths(transaction, { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation });
  const discardBindingRoot = transactionCleanupBindingPath(lockRoot, transaction, 'discard');
  const discardRoot = path.join(lockRoot, 'discard');
  await assertOptionalOwnedDirectory(transaction.backupRoot, 'transaction backup');
  await assertOptionalOwnedDirectory(transaction.stagingRoot, 'transaction staging');
  await assertBoundDiscardRootIfPresent(discardRoot, discardBindingRoot, transaction);
  for (let index = transaction.generatedPaths.length - 1; index >= 0; index -= 1) {
    const relativePath = transaction.generatedPaths[index];
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const backup = resolveGeneratedPath(transaction.backupRoot, relativePath);
    const discarded = path.join(discardRoot, String(index));
    const targetExists = await pathExists(target);
    const backupExists = await pathExists(backup);
    const discardExists = await pathExists(discarded);
    if (transaction.existed[relativePath]) {
      if (backupExists) {
        await assertPathDigest(backup, transaction.priorDigests[relativePath], 'prior backup');
        if (targetExists) {
          if (discardExists) {
            throw new Error(`Generated profile recovery found duplicate discard state for ${relativePath}`);
          }
          await assertPathDigest(target, transaction.nextDigests[relativePath], 'partially installed target');
          await ensureBoundDiscardRoot(discardRoot, discardBindingRoot, transaction, assertMutation);
          await moveTargetToDiscard({
            target,
            discarded,
            index,
            lockRoot,
            lockIdentity,
      ownerToken,
      ownerOperation,
      generatedPath: relativePath,
      expectedDigest: transaction.nextDigests[relativePath],
      assertMutation
          });
          await onRecoveryBoundary(`recovery-discarded:${relativePath}`, transaction);
        }
        await assertMutation();
        await assertContainedRealPath(packageRoot, target, `recovery target ${relativePath}`, { includeTarget: true });
        await assertContainedRealPath(transaction.backupRoot, backup, `recovery backup ${relativePath}`, {
          includeTarget: true
        });
        await mkdir(path.dirname(target), { recursive: true });
        await rename(backup, target);
        await onRecoveryBoundary(`recovery-restored:${relativePath}`, transaction);
        await assertPathDigest(target, transaction.priorDigests[relativePath], 'restored prior target');
        await cleanupDiscardPath({ discarded, relativePath, transaction, onRecoveryBoundary });
      } else if (!targetExists) {
        throw new Error(`Generated profile recovery is ambiguous for missing prior path ${relativePath}`);
      } else {
        await assertPathDigest(target, transaction.priorDigests[relativePath], 'preserved prior target');
        await cleanupDiscardPath({ discarded, relativePath, transaction, onRecoveryBoundary });
      }
    } else {
      if (backupExists) throw new Error(`Generated profile recovery found an unexpected backup for ${relativePath}`);
      if (targetExists) {
        if (discardExists) {
          throw new Error(`Generated profile recovery found duplicate discard state for ${relativePath}`);
        }
        await assertPathDigest(target, transaction.nextDigests[relativePath], 'fresh partially installed target');
        await ensureBoundDiscardRoot(discardRoot, discardBindingRoot, transaction, assertMutation);
        await moveTargetToDiscard({
          target,
          discarded,
          index,
          lockRoot,
          lockIdentity,
          ownerToken,
          ownerOperation,
          generatedPath: relativePath,
          expectedDigest: transaction.nextDigests[relativePath],
          assertMutation
        });
        await onRecoveryBoundary(`recovery-discarded:${relativePath}`, transaction);
      }
      await cleanupDiscardPath({ discarded, relativePath, transaction, onRecoveryBoundary });
    }
  }
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const exists = await pathExists(target);
    if (exists !== transaction.existed[relativePath]) {
      throw new Error(`Generated profile rollback did not restore ${relativePath}`);
    }
    if (exists) {
      await assertPathDigest(target, transaction.priorDigests[relativePath], 'restored prior target');
    }
  }
  for (const [kind, source] of [
    ['backup', transaction.backupRoot],
    ['staging', transaction.stagingRoot]
  ]) {
    await cleanupJournalOwnedDirectory({
      source,
      kind,
      transaction,
      lockRoot,
      assertMutation,
      onBoundary: onRecoveryBoundary
    });
  }
  return 'rolled-back';
}

async function recoverCommittedTransaction(
  transaction,
  { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation, assertMutation, onRecoveryBoundary }
) {
  await validateTransactionPaths(transaction, { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation });
  await assertOptionalOwnedDirectory(transaction.backupRoot, 'transaction backup');
  await assertOptionalOwnedDirectory(transaction.stagingRoot, 'transaction staging');
  await assertBoundDiscardRootIfPresent(
    path.join(lockRoot, 'discard'),
    transactionCleanupBindingPath(lockRoot, transaction, 'discard'),
    transaction
  );
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    if (!(await pathExists(target))) {
      throw new Error(`Committed generated profile path is missing: ${relativePath}`);
    }
    await assertPathDigest(target, transaction.nextDigests[relativePath], 'committed target');
  }
  for (const [kind, source] of [
    ['backup', transaction.backupRoot],
    ['staging', transaction.stagingRoot]
  ]) {
    await cleanupJournalOwnedDirectory({
      source,
      kind,
      transaction,
      lockRoot,
      assertMutation,
      onBoundary: onRecoveryBoundary
    });
  }
  return 'committed';
}

async function recoverTransaction(transaction, context) {
  if (transaction.phase === 'active') return recoverActiveTransaction(transaction, context);
  if (transaction.phase === 'committed') return recoverCommittedTransaction(transaction, context);
  throw new Error('Generated profile transaction phase is unsupported');
}

export async function recoverGeneratedReplacement({
  packageRoot,
  observeProcess = observeGeneratedProfileProcess,
  isProcessAlive,
  now = () => Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
  createInstanceId = randomUUID,
  startHeartbeat = startGeneratedProfileLeaseHeartbeat,
  onClaimPublished = async () => {},
  onClaimBoundary = async () => {},
  onRecoveryBoundary = async () => {},
  onReleaseBoundary = async () => {}
} = {}) {
  packageRoot = await assertPackageRoot(packageRoot);
  const lockRoot = path.join(packageRoot, LOCK_NAME);
  await resumeReleasedLockCleanup(packageRoot, { observeProcess, isProcessAlive, now });
  if (!(await pathExists(lockRoot))) return false;
  const identity = await realDirectoryIdentity(lockRoot, 'lock');
  let owner;
  try {
    owner = await readOwner(lockRoot, packageRoot);
  } catch (error) {
    throw new Error(`Generated profile lock metadata is unreadable at ${lockRoot}`, { cause: error });
  }
  if (
    await processInstanceIsActive(owner, lockRoot, ownerLeaseBinding(owner), {
      observeProcess,
      isProcessAlive,
      now
    })
  ) {
    throw new Error(`Another generated profile session is active (pid ${owner.pid}, started ${owner.startedAt})`);
  }
  const acquiredClaim = await acquireRecoveryClaim(lockRoot, packageRoot, identity, owner.token, owner.operation, {
    observeProcess,
    isProcessAlive,
    now,
    leaseMs,
    createInstanceId,
    onClaimPublished,
    onClaimBoundary
  });
  const claim = acquiredClaim.claim;
  const claimContext = initializeMutationContext({
    lockRoot,
    packageRoot,
    identity,
    ownerToken: owner.token,
    operation: owner.operation,
    retainedBindingRootIdentity: owner.retainedBindingRootIdentity,
    actorScope: 'claim',
    actorRecord: claim,
    claim,
    claimIdentity: acquiredClaim.claimIdentity,
    observeProcess,
    isProcessAlive,
    onClaimBoundary,
    now,
    leaseMs,
    heartbeat: undefined
  }, acquiredClaim.gate);
  claimContext.heartbeat = startHeartbeat(() => refreshClaimLease(claimContext), leaseMs);
  let state = 'no-transaction';
  try {
    await assertClaimMutation(claimContext);
    owner = await assertOuterOwner(lockRoot, packageRoot, identity, owner.token);
    if (owner.transaction) {
      const assertMutation = () => assertClaimMutation(claimContext);
      state = await recoverTransaction(owner.transaction, {
        packageRoot,
        lockRoot,
        lockIdentity: identity,
        ownerToken: owner.token,
        ownerOperation: owner.operation,
        assertMutation,
        onRecoveryBoundary
      });
      await assertMutation();
      const current = await assertOuterOwner(lockRoot, packageRoot, identity, owner.token);
      const { transaction: _transaction, ...cleared } = current;
      await writeOwnerAtomically(claimContext, cleared);
    }
    await claimContext.heartbeat.stopAndDrain();
    await releaseOwnedLock(claimContext, onReleaseBoundary);
    return { recovered: true, state };
  } catch (error) {
    let heartbeatError;
    try {
      await claimContext.heartbeat.stopAndDrain();
    } catch (failure) {
      heartbeatError = failure;
    }
    if (claimContext.releaseState && claimContext.releaseState.phase !== 'attached') {
      if (heartbeatError) {
        throw new AggregateError([error, heartbeatError], 'Generated profile detached lock cleanup was retained');
      }
      throw error;
    }
    try {
      await releaseOwnedRecoveryClaim(claimContext);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, ...(heartbeatError ? [heartbeatError] : []), cleanupError],
        'Generated profile recovery and claim cleanup both failed'
      );
    }
    if (heartbeatError) {
      throw new AggregateError([error, heartbeatError], 'Generated profile recovery and claim heartbeat both failed');
    }
    throw error;
  }
}

async function beginTransaction(session, { stagingRoot, generatedPaths, onBoundary = async () => {} }) {
  if (!session || session[SESSION] !== true) throw new Error('Generated replacement requires an owned generation session');
  stagingRoot = path.resolve(stagingRoot);
  assertStagingRoot(session.lockRoot, stagingRoot);
  generatedPaths = assertSafeRelativePaths(generatedPaths);
  const expectedPaths = OPERATION_PATHS[session.operation];
  if (
    generatedPaths.length !== expectedPaths.length ||
    generatedPaths.some((relativePath, index) => relativePath !== expectedPaths[index])
  ) {
    throw new Error(`Generated replacement paths do not match the ${session.operation} session`);
  }
  await realDirectoryIdentity(stagingRoot, 'staging root');
  for (const relativePath of generatedPaths) {
    const staged = resolveGeneratedPath(stagingRoot, relativePath);
    const target = resolveGeneratedPath(session.packageRoot, relativePath);
    await assertContainedRealPath(stagingRoot, staged, `transaction staging ${relativePath}`, { includeTarget: true });
    await assertContainedRealPath(session.packageRoot, target, `transaction target ${relativePath}`, { includeTarget: true });
    if (!(await pathExists(staged))) {
      throw new Error(`Staged generated path is missing: ${relativePath}`);
    }
  }
  const owner = await assertSessionMutation(session);
  if (owner.transaction) throw new Error('Generated profile session already contains a transaction');
  const backupRoot = path.join(session.lockRoot, 'backup');
  if (await pathExists(backupRoot)) throw new Error('Generated profile session contains an unjournaled backup directory');
  const stagingIdentity = await realDirectoryIdentity(stagingRoot, 'staging root');
  await writeDirectoryMarker(stagingRoot, 'staging', session, stagingIdentity);
  const existed = {};
  const priorDigests = {};
  const nextDigests = {};
  for (const relativePath of generatedPaths) {
    const target = resolveGeneratedPath(session.packageRoot, relativePath);
    const staged = resolveGeneratedPath(stagingRoot, relativePath);
    existed[relativePath] = await pathExists(target);
    priorDigests[relativePath] = existed[relativePath] ? await digestPath(target) : null;
    nextDigests[relativePath] = await digestPath(staged);
  }
  await mkdir(backupRoot);
  const backupIdentity = await realDirectoryIdentity(backupRoot, 'transaction backup');
  await writeDirectoryMarker(backupRoot, 'backup', session, backupIdentity);
  // If the process dies before the journal is published, this binding keeps
  // the backup part of the owned lock rather than an unexpected lock entry.
  await writeOwnerAtomically(session, { ...owner, preJournalBackupIdentity: identityRecord(backupIdentity) });
  await onBoundary('backup-bound', { backupRoot, backupIdentity: identityRecord(backupIdentity) });
  const transaction = {
    kind: TRANSACTION_KIND,
    token: session.token,
    packageRoot: session.packageRoot,
    operation: session.operation,
    lockIdentity: identityRecord(session.identity),
    stagingRoot,
    stagingIdentity: identityRecord(stagingIdentity),
    backupRoot,
    backupIdentity: identityRecord(backupIdentity),
    generatedPaths,
    existed,
    priorDigests,
    nextDigests,
    phase: 'active'
  };
  assertTransaction(transaction, {
    packageRoot: session.packageRoot,
    lockRoot: session.lockRoot,
    ownerToken: session.token,
    ownerOperation: session.operation
  });
  await writeOwnerAtomically(session, { ...owner, transaction });
  return transaction;
}

async function clearTransaction(session, expectedPhase) {
  const owner = await assertSessionMutation(session);
  if (!owner.transaction || owner.transaction.phase !== expectedPhase) {
    throw new Error('Generated profile transaction changed before settlement');
  }
  const { transaction: _transaction, ...cleared } = owner;
  await writeOwnerAtomically(session, cleared);
}

export async function createGeneratedProfileStaging(session) {
  if (!session || session[SESSION] !== true) {
    throw new Error('Generated profile staging requires an owned generation session');
  }
  await assertSessionMutation(session);
  const stagingRoot = path.join(session.lockRoot, 'staging');
  const owner = await assertSessionMutation(session);
  if (owner.stagingIdentity || owner.stagingPending === true) {
    throw new Error('Generated profile session already contains a staging directory');
  }
  // Publish intent before the directory becomes visible.  If the process dies
  // between mkdir and the identity update, detached-lock recovery recognizes
  // this bounded pending state and removes only the enclosing owned lock.
  await writeOwnerAtomically(session, { ...owner, stagingPending: true });
  await mkdir(stagingRoot);
  const stagingIdentity = await realDirectoryIdentity(stagingRoot, 'pre-journal staging');
  const pending = await assertSessionMutation(session);
  if (pending.stagingPending !== true || pending.stagingIdentity !== undefined) {
    throw new Error('Generated profile pre-journal staging state changed');
  }
  const { stagingPending: _stagingPending, ...boundOwner } = pending;
  await writeOwnerAtomically(session, { ...boundOwner, stagingIdentity: identityRecord(stagingIdentity) });
  return stagingRoot;
}

export async function runGeneratedReplacementTransaction({ session, stagingRoot, generatedPaths, onBoundary = async () => {} }) {
  const transaction = await beginTransaction(session, { stagingRoot, generatedPaths, onBoundary });
  await onBoundary('journaled', transaction);
  await onBoundary('backup-created', transaction);
  for (const relativePath of transaction.generatedPaths) {
    if (!transaction.existed[relativePath]) continue;
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const backup = resolveGeneratedPath(transaction.backupRoot, relativePath);
    await assertSessionMutation(session);
    await assertContainedRealPath(session.packageRoot, target, `transaction target ${relativePath}`, { includeTarget: true });
    await assertContainedRealPath(transaction.backupRoot, backup, `transaction backup ${relativePath}`, {
      includeTarget: true
    });
    await assertJournaledTarget(target, transaction.existed[relativePath], transaction.priorDigests[relativePath]);
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(target, backup);
    await onBoundary(`backed-up:${relativePath}`, transaction);
  }
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const staged = resolveGeneratedPath(transaction.stagingRoot, relativePath);
    await assertSessionMutation(session);
    await assertContainedRealPath(session.packageRoot, target, `transaction target ${relativePath}`, { includeTarget: true });
    await assertContainedRealPath(transaction.stagingRoot, staged, `transaction staging ${relativePath}`, {
      includeTarget: true
    });
    if (await pathExists(target)) {
      throw new Error(`Generated profile target was recreated before installation: ${relativePath}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    if (await pathExists(target)) {
      throw new Error(`Generated profile target was recreated before installation: ${relativePath}`);
    }
    await rename(staged, target);
    await onBoundary(`installed:${relativePath}`, transaction);
  }
  for (const relativePath of transaction.generatedPaths) {
    await assertPathDigest(
      resolveGeneratedPath(transaction.packageRoot, relativePath),
      transaction.nextDigests[relativePath],
      'installed target'
    );
  }
  const owner = await assertSessionMutation(session);
  if (!owner.transaction || owner.transaction.phase !== 'active') {
    throw new Error('Generated profile transaction changed before commit');
  }
  const committed = { ...owner.transaction, phase: 'committed' };
  await writeOwnerAtomically(session, { ...owner, transaction: committed });
  await onBoundary('committed', committed);
  const assertMutation = () => assertSessionMutation(session);
  await cleanupJournalOwnedDirectory({
    source: transaction.backupRoot,
    kind: 'backup',
    transaction: committed,
    lockRoot: session.lockRoot,
    assertMutation,
    onBoundary
  });
  await onBoundary('backup-cleaned', committed);
  await cleanupJournalOwnedDirectory({
    source: transaction.stagingRoot,
    kind: 'staging',
    transaction: committed,
    lockRoot: session.lockRoot,
    assertMutation,
    onBoundary
  });
  await onBoundary('staging-cleaned', committed);
  await clearTransaction(session, 'committed');
  await onBoundary('journal-cleared', committed);
}

async function relinquishOwnerForRecovery(session) {
  if (!(await pathExists(session.lockRoot))) return false;
  const identity = await realDirectoryIdentity(session.lockRoot, 'lock');
  if (!sameIdentity(identity, session.identity)) return false;
  const current = await session.withMutation(async (owner) => owner);
  await writeOwnerAtomically(session, { ...current, recoveryRequired: true });
  await releaseContextMutationGate(session);
  return true;
}

export async function withGeneratedProfileSession(
  {
    packageRoot,
    operation,
    observeProcess = observeGeneratedProfileProcess,
    isProcessAlive,
    now = () => Date.now(),
    leaseMs = DEFAULT_LEASE_MS,
    createInstanceId = randomUUID,
    startHeartbeat = startGeneratedProfileLeaseHeartbeat,
    onClaimPublished,
    onClaimBoundary,
    lockOptions,
    onBoundary,
    onReleaseBoundary
  } = {},
  work
) {
  packageRoot = await assertPackageRoot(packageRoot);
  operation = assertOperation(operation);
  if (typeof work !== 'function') throw new Error('Generated profile session requires a callback');
  await recoverGeneratedReplacement({
    packageRoot,
    observeProcess,
    isProcessAlive,
    now,
    leaseMs,
    createInstanceId,
    startHeartbeat,
    onClaimPublished,
    onClaimBoundary
  });
  const acquired = await acquireLock(packageRoot, operation, lockOptions, {
    observeProcess,
    now,
    leaseMs,
    createInstanceId
  });
  const session = initializeMutationContext({
    [SESSION]: true,
    packageRoot,
    lockRoot: acquired.lockRoot,
    identity: acquired.identity,
    token: acquired.owner.token,
    ownerToken: acquired.owner.token,
    retainedBindingRootIdentity: acquired.owner.retainedBindingRootIdentity,
    actorScope: 'owner',
    actorRecord: acquired.owner,
    observeProcess,
    isProcessAlive,
    operation,
    onBoundary,
    now,
    leaseMs,
    heartbeat: undefined
  }, acquired.gate);
  session.heartbeat = startHeartbeat(() => refreshOwnerLease(session), leaseMs);
  let result;
  let operationFailure;
  try {
    result = await work(session);
  } catch (error) {
    operationFailure = error;
  }

  const failures = operationFailure ? [operationFailure] : [];
  let unsafe = false;
  let releaseFailureOutcome;
  try {
    const owner = await assertSessionMutation(session);
    if (owner.transaction) {
      const assertMutation = () => assertSessionMutation(session);
      await recoverTransaction(owner.transaction, {
        packageRoot,
        lockRoot: session.lockRoot,
        lockIdentity: session.identity,
        ownerToken: session.token,
        ownerOperation: session.operation,
        assertMutation,
        onRecoveryBoundary: async () => {}
      });
      await clearTransaction(session, owner.transaction.phase);
      if (!operationFailure) failures.push(new Error('Generated profile session ended with an unsettled transaction'));
    }
  } catch (error) {
    if (error instanceof AggregateError) failures.push(...error.errors);
    else failures.push(error);
    unsafe = true;
  }

  try {
    await session.heartbeat.stopAndDrain();
  } catch (error) {
    failures.push(error);
    unsafe = true;
  }

  if (!unsafe) {
    try {
      await releaseOwnedLock(session, onReleaseBoundary);
    } catch (error) {
      failures.push(error);
      if (session.releaseState?.phase === 'detached-owned') {
        releaseFailureOutcome = 'detached lock retained for cleanup';
      } else if (session.releaseState?.phase === 'owned-removed' && session.releaseState.foreignPath) {
        releaseFailureOutcome = 'owned detached lock removed; foreign replacement preserved';
      } else if (session.releaseState?.phase === 'ownership-lost') {
        releaseFailureOutcome =
          session.releaseState.ownedPath && session.releaseState.foreignPath
            ? 'lock ownership lost; owned lock and foreign replacement preserved'
            : session.releaseState.foreignPath
              ? 'lock ownership lost; foreign replacement preserved'
              : 'lock ownership lost; owned lock preserved';
      } else {
        try {
          unsafe = await relinquishOwnerForRecovery(session);
        } catch (relinquishError) {
          failures.push(relinquishError);
          unsafe = true;
        }
      }
    }
  } else {
    try {
      await relinquishOwnerForRecovery(session);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Generated profile session failed; ${
        releaseFailureOutcome
          ? releaseFailureOutcome
          : unsafe
            ? 'transaction and lock retained for recovery'
            : 'owned lock released'
      }`
    );
  }
  return result;
}
