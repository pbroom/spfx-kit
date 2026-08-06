import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCK_NAME = '.profile-generation-lock';
const CLAIM_NAME = 'recovery-claim';
const TRANSACTION_KIND = 'ui-profile-generation-v1';
const OWNER_FILE = 'owner.json';
const CLAIM_FILE = 'claim.json';
const DIRECTORY_MARKER_FILE = '.generation-owner.json';
const SESSION = Symbol('ui-profile-generation-session');
const OPERATION_PATHS = Object.freeze({
  update: Object.freeze(['snapshots', 'normalized', 'profile.json']),
  regenerate: Object.freeze(['snapshots/canonical', 'normalized', 'profile.json'])
});

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && error.code === 'EPERM');
  }
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
  return left.dev === right.dev && left.ino === right.ino;
}

function identityRecord(details) {
  return { dev: String(details.dev), ino: String(details.ino) };
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

function assertPackageRoot(packageRoot) {
  if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot)) {
    throw new Error('Generated profile package root must be absolute');
  }
  return path.resolve(packageRoot);
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

async function assertPathDigest(target, expected, label) {
  const actual = await digestPath(target);
  if (actual !== expected) throw new Error(`Generated profile ${label} digest differs at ${target}`);
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

function assertOwner(owner, packageRoot, lockRoot) {
  if (!isObject(owner)) throw new Error('Generated profile lock owner must be an object');
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
    throw new Error('Generated profile lock owner pid must be a positive safe integer');
  }
  assertSafeToken(owner.token, 'lock owner');
  if (typeof owner.startedAt !== 'string' || !Number.isFinite(Date.parse(owner.startedAt))) {
    throw new Error('Generated profile lock owner startedAt must be a valid date');
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
  return claim;
}

async function readOwner(lockRoot, packageRoot) {
  return assertOwner(JSON.parse(await readFile(path.join(lockRoot, OWNER_FILE), 'utf8')), packageRoot, lockRoot);
}

async function readClaimRoot(claimRoot) {
  return assertClaim(JSON.parse(await readFile(path.join(claimRoot, CLAIM_FILE), 'utf8')));
}

async function readClaim(lockRoot) {
  return readClaimRoot(path.join(lockRoot, CLAIM_NAME));
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

async function writeOwnerAtomically(lockRoot, packageRoot, identity, ownerToken, owner) {
  assertOwner(owner, packageRoot, lockRoot);
  if (owner.token !== ownerToken) throw new Error('Generated profile owner update token differs');
  await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
  const pending = path.join(lockRoot, `.owner-${randomUUID()}.json`);
  let pendingOwned = true;
  try {
    await writeFile(pending, `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
    await rename(pending, path.join(lockRoot, OWNER_FILE));
    pendingOwned = false;
  } finally {
    if (pendingOwned) await rm(pending, { force: true });
  }
}

async function acquireLock(
  packageRoot,
  operation,
  { pid = process.pid, token = randomUUID(), startedAt = new Date().toISOString() } = {}
) {
  const lockRoot = path.join(packageRoot, LOCK_NAME);
  const owner = assertOwner({ pid, token, startedAt, operation: assertOperation(operation) }, packageRoot, lockRoot);
  const temporary = await mkdtemp(`${lockRoot}.acquire-`);
  let temporaryOwned = true;
  try {
    await writeFile(path.join(temporary, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
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
  } finally {
    if (temporaryOwned) await rm(temporary, { recursive: true, force: true });
  }
  return { lockRoot, owner, identity: await realDirectoryIdentity(lockRoot, 'lock') };
}

async function removeUniqueClaimRoot(target, expected) {
  try {
    const actual = await readClaimRoot(target);
    if (actual.token !== expected.token || actual.ownerToken !== expected.ownerToken) return false;
    await rm(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    return false;
  }
}

async function acquireRecoveryClaim(lockRoot, packageRoot, identity, ownerToken, { isProcessAlive = processIsAlive } = {}) {
  const claim = assertClaim({
    pid: process.pid,
    token: randomUUID(),
    ownerToken,
    startedAt: new Date().toISOString()
  });
  const claimRoot = path.join(lockRoot, CLAIM_NAME);
  const temporary = await mkdtemp(path.join(lockRoot, '.recovery-claim-acquire-'));
  const quarantines = [];
  let temporaryOwned = true;
  try {
    await writeFile(path.join(temporary, CLAIM_FILE), `${JSON.stringify(claim, null, 2)}\n`, { flag: 'wx' });
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
      if (await pathExists(claimRoot)) {
        let existing;
        try {
          existing = await readClaim(lockRoot);
        } catch (error) {
          if (isMissing(error) && !(await pathExists(claimRoot))) continue;
          throw new Error(`Generated profile recovery claim is unreadable at ${claimRoot}`, { cause: error });
        }
        if (existing.ownerToken !== ownerToken) {
          throw new Error('Generated profile recovery claim belongs to another owner');
        }
        if (isProcessAlive(existing.pid)) {
          throw new Error(`Another generated profile recovery is active (pid ${existing.pid})`);
        }
        await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
        const quarantine = path.join(lockRoot, `.recovery-claim-stale-${randomUUID()}`);
        try {
          await rename(claimRoot, quarantine);
          quarantines.push({ target: quarantine, claim: existing });
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
      }
      await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
      try {
        await rename(temporary, claimRoot);
        temporaryOwned = false;
        const published = await readClaim(lockRoot);
        await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
        if (published.token !== claim.token || published.ownerToken !== ownerToken) {
          throw new Error('Generated profile recovery claim changed during publication');
        }
        return claim;
      } catch (error) {
        if (!isConflict(error)) throw error;
      }
    }
    throw new Error('Generated profile recovery claim contention did not settle');
  } finally {
    if (temporaryOwned) await removeUniqueClaimRoot(temporary, claim);
    await Promise.all(quarantines.map(({ target, claim: stale }) => removeUniqueClaimRoot(target, stale)));
  }
}

async function assertClaimOwnership(lockRoot, packageRoot, identity, ownerToken, claimToken) {
  const [owner, claim] = await Promise.all([assertOuterOwner(lockRoot, packageRoot, identity, ownerToken), readClaim(lockRoot)]);
  if (owner.token !== ownerToken || claim.ownerToken !== ownerToken || claim.token !== claimToken) {
    throw new Error('Generated profile recovery claim ownership was lost');
  }
}

async function releaseOwnedRecoveryClaim(lockRoot, packageRoot, identity, ownerToken, claimToken) {
  await assertClaimOwnership(lockRoot, packageRoot, identity, ownerToken, claimToken);
  const claimRoot = path.join(lockRoot, CLAIM_NAME);
  const releaseRoot = path.join(lockRoot, `.recovery-claim-release-${claimToken}`);
  await rename(claimRoot, releaseRoot);
  const movedClaim = await readClaimRoot(releaseRoot);
  if (movedClaim.token !== claimToken || movedClaim.ownerToken !== ownerToken) {
    throw new Error(`Generated profile recovery claim changed during release; preserved at ${releaseRoot}`);
  }
  await rm(releaseRoot, { recursive: true, force: true });
}

async function releaseOwnedLock(lockRoot, packageRoot, identity, ownerToken, claimToken) {
  if (claimToken) await assertClaimOwnership(lockRoot, packageRoot, identity, ownerToken, claimToken);
  else await assertOuterOwner(lockRoot, packageRoot, identity, ownerToken);
  const releaseRoot = `${lockRoot}.release-${randomUUID()}`;
  await rename(lockRoot, releaseRoot);
  const movedOwner = await readOwner(releaseRoot, packageRoot);
  if (movedOwner.token !== ownerToken) {
    throw new Error(`Generated profile lock ownership changed during release; preserved at ${releaseRoot}`);
  }
  if (claimToken) {
    const movedClaim = await readClaim(releaseRoot);
    if (movedClaim.token !== claimToken || movedClaim.ownerToken !== ownerToken) {
      throw new Error(`Generated profile recovery ownership changed during release; preserved at ${releaseRoot}`);
    }
  }
  await rm(releaseRoot, { recursive: true, force: true });
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
  }
}

async function assertOptionalOwnedDirectory(target, label) {
  if (await pathExists(target)) await realDirectoryIdentity(target, label);
}

async function cleanupDiscardPath({ discarded, relativePath, transaction, assertMutation, onRecoveryBoundary }) {
  if (!(await pathExists(discarded))) return;
  const details = await lstat(discarded);
  if (details.isSymbolicLink()) {
    throw new Error(`Generated profile recovery discard must not be a symlink: ${discarded}`);
  }
  await onRecoveryBoundary(`recovery-cleanup:${relativePath}`, transaction);
  await assertMutation();
  await rm(discarded, { recursive: true, force: true });
}

async function recoverActiveTransaction(
  transaction,
  { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation, assertMutation, onRecoveryBoundary }
) {
  await validateTransactionPaths(transaction, { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation });
  const discardRoot = path.join(lockRoot, 'discard');
  await assertOptionalOwnedDirectory(transaction.backupRoot, 'transaction backup');
  await assertOptionalOwnedDirectory(transaction.stagingRoot, 'transaction staging');
  await assertOptionalOwnedDirectory(discardRoot, 'recovery discard');
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
          await assertMutation();
          await mkdir(discardRoot, { recursive: true });
          await rename(target, discarded);
          await onRecoveryBoundary(`recovery-discarded:${relativePath}`, transaction);
        }
        await assertMutation();
        await mkdir(path.dirname(target), { recursive: true });
        await rename(backup, target);
        await onRecoveryBoundary(`recovery-restored:${relativePath}`, transaction);
        await assertPathDigest(target, transaction.priorDigests[relativePath], 'restored prior target');
        await cleanupDiscardPath({ discarded, relativePath, transaction, assertMutation, onRecoveryBoundary });
      } else if (!targetExists) {
        throw new Error(`Generated profile recovery is ambiguous for missing prior path ${relativePath}`);
      } else {
        await assertPathDigest(target, transaction.priorDigests[relativePath], 'preserved prior target');
        await cleanupDiscardPath({ discarded, relativePath, transaction, assertMutation, onRecoveryBoundary });
      }
    } else {
      if (backupExists) throw new Error(`Generated profile recovery found an unexpected backup for ${relativePath}`);
      if (targetExists) {
        if (discardExists) {
          throw new Error(`Generated profile recovery found duplicate discard state for ${relativePath}`);
        }
        await assertPathDigest(target, transaction.nextDigests[relativePath], 'fresh partially installed target');
        await assertMutation();
        await mkdir(discardRoot, { recursive: true });
        await rename(target, discarded);
        await onRecoveryBoundary(`recovery-discarded:${relativePath}`, transaction);
      }
      await cleanupDiscardPath({ discarded, relativePath, transaction, assertMutation, onRecoveryBoundary });
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
  await assertMutation();
  await rm(discardRoot, { recursive: true, force: true });
  await assertMutation();
  await rm(transaction.backupRoot, { recursive: true, force: true });
  await assertMutation();
  await rm(transaction.stagingRoot, { recursive: true, force: true });
  return 'rolled-back';
}

async function recoverCommittedTransaction(
  transaction,
  { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation, assertMutation }
) {
  await validateTransactionPaths(transaction, { packageRoot, lockRoot, lockIdentity, ownerToken, ownerOperation });
  await assertOptionalOwnedDirectory(transaction.backupRoot, 'transaction backup');
  await assertOptionalOwnedDirectory(transaction.stagingRoot, 'transaction staging');
  if (await pathExists(path.join(lockRoot, 'discard'))) {
    throw new Error('Committed generated profile transaction contains unexpected recovery discard state');
  }
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    if (!(await pathExists(target))) {
      throw new Error(`Committed generated profile path is missing: ${relativePath}`);
    }
    await assertPathDigest(target, transaction.nextDigests[relativePath], 'committed target');
  }
  await assertMutation();
  await rm(transaction.backupRoot, { recursive: true, force: true });
  await assertMutation();
  await rm(transaction.stagingRoot, { recursive: true, force: true });
  return 'committed';
}

async function recoverTransaction(transaction, context) {
  if (transaction.phase === 'active') return recoverActiveTransaction(transaction, context);
  if (transaction.phase === 'committed') return recoverCommittedTransaction(transaction, context);
  throw new Error('Generated profile transaction phase is unsupported');
}

export async function recoverGeneratedReplacement({
  packageRoot,
  isProcessAlive = processIsAlive,
  onRecoveryBoundary = async () => {}
} = {}) {
  packageRoot = assertPackageRoot(packageRoot);
  const lockRoot = path.join(packageRoot, LOCK_NAME);
  if (!(await pathExists(lockRoot))) return false;
  const identity = await realDirectoryIdentity(lockRoot, 'lock');
  let owner;
  try {
    owner = await readOwner(lockRoot, packageRoot);
  } catch (error) {
    throw new Error(`Generated profile lock metadata is unreadable at ${lockRoot}`, { cause: error });
  }
  if (isProcessAlive(owner.pid)) {
    throw new Error(`Another generated profile session is active (pid ${owner.pid}, started ${owner.startedAt})`);
  }
  const claim = await acquireRecoveryClaim(lockRoot, packageRoot, identity, owner.token, { isProcessAlive });
  let state = 'no-transaction';
  try {
    owner = await assertOuterOwner(lockRoot, packageRoot, identity, owner.token);
    if (owner.transaction) {
      const assertMutation = () => assertClaimOwnership(lockRoot, packageRoot, identity, owner.token, claim.token);
      state = await recoverTransaction(owner.transaction, {
        packageRoot,
        lockRoot,
        lockIdentity: identity,
        ownerToken: owner.token,
        ownerOperation: owner.operation,
        assertMutation,
        onRecoveryBoundary
      });
      await assertClaimOwnership(lockRoot, packageRoot, identity, owner.token, claim.token);
      const current = await assertOuterOwner(lockRoot, packageRoot, identity, owner.token);
      const { transaction: _transaction, ...cleared } = current;
      await writeOwnerAtomically(lockRoot, packageRoot, identity, owner.token, cleared);
    }
    await releaseOwnedLock(lockRoot, packageRoot, identity, owner.token, claim.token);
    return { recovered: true, state };
  } catch (error) {
    try {
      await releaseOwnedRecoveryClaim(lockRoot, packageRoot, identity, owner.token, claim.token);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Generated profile recovery and claim cleanup both failed');
    }
    throw error;
  }
}

async function beginTransaction(session, { stagingRoot, generatedPaths }) {
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
    if (!(await pathExists(resolveGeneratedPath(stagingRoot, relativePath)))) {
      throw new Error(`Staged generated path is missing: ${relativePath}`);
    }
  }
  const owner = await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
  if (owner.transaction) throw new Error('Generated profile session already contains a transaction');
  const backupRoot = path.join(session.lockRoot, 'backup');
  if (await pathExists(backupRoot)) throw new Error('Generated profile session contains an unjournaled backup directory');
  const stagingIdentity = await realDirectoryIdentity(stagingRoot, 'staging root');
  await writeDirectoryMarker(stagingRoot, 'staging', session, stagingIdentity);
  await mkdir(backupRoot);
  const backupIdentity = await realDirectoryIdentity(backupRoot, 'transaction backup');
  await writeDirectoryMarker(backupRoot, 'backup', session, backupIdentity);
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
  await writeOwnerAtomically(session.lockRoot, session.packageRoot, session.identity, session.token, {
    ...owner,
    transaction
  });
  return transaction;
}

async function clearTransaction(session, expectedPhase) {
  const owner = await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
  if (!owner.transaction || owner.transaction.phase !== expectedPhase) {
    throw new Error('Generated profile transaction changed before settlement');
  }
  const { transaction: _transaction, ...cleared } = owner;
  await writeOwnerAtomically(session.lockRoot, session.packageRoot, session.identity, session.token, cleared);
}

export async function createGeneratedProfileStaging(session) {
  if (!session || session[SESSION] !== true) {
    throw new Error('Generated profile staging requires an owned generation session');
  }
  await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
  const stagingRoot = path.join(session.lockRoot, 'staging');
  await mkdir(stagingRoot);
  return stagingRoot;
}

export async function runGeneratedReplacementTransaction({ session, stagingRoot, generatedPaths, onBoundary = async () => {} }) {
  const transaction = await beginTransaction(session, { stagingRoot, generatedPaths });
  await onBoundary('journaled', transaction);
  await onBoundary('backup-created', transaction);
  for (const relativePath of transaction.generatedPaths) {
    if (!transaction.existed[relativePath]) continue;
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const backup = resolveGeneratedPath(transaction.backupRoot, relativePath);
    await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(target, backup);
    await onBoundary(`backed-up:${relativePath}`, transaction);
  }
  for (const relativePath of transaction.generatedPaths) {
    const target = resolveGeneratedPath(transaction.packageRoot, relativePath);
    const staged = resolveGeneratedPath(transaction.stagingRoot, relativePath);
    await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
    await mkdir(path.dirname(target), { recursive: true });
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
  const owner = await assertOuterOwner(session.lockRoot, session.packageRoot, session.identity, session.token);
  if (!owner.transaction || owner.transaction.phase !== 'active') {
    throw new Error('Generated profile transaction changed before commit');
  }
  const committed = { ...owner.transaction, phase: 'committed' };
  await writeOwnerAtomically(session.lockRoot, session.packageRoot, session.identity, session.token, {
    ...owner,
    transaction: committed
  });
  await onBoundary('committed', committed);
  await rm(transaction.backupRoot, { recursive: true, force: true });
  await onBoundary('backup-cleaned', committed);
  await rm(transaction.stagingRoot, { recursive: true, force: true });
  await onBoundary('staging-cleaned', committed);
  await clearTransaction(session, 'committed');
  await onBoundary('journal-cleared', committed);
}

export async function withGeneratedProfileSession(
  { packageRoot, operation, isProcessAlive = processIsAlive, lockOptions, onBoundary } = {},
  work
) {
  packageRoot = assertPackageRoot(packageRoot);
  operation = assertOperation(operation);
  if (typeof work !== 'function') throw new Error('Generated profile session requires a callback');
  await recoverGeneratedReplacement({ packageRoot, isProcessAlive });
  const acquired = await acquireLock(packageRoot, operation, lockOptions);
  const session = {
    [SESSION]: true,
    packageRoot,
    lockRoot: acquired.lockRoot,
    identity: acquired.identity,
    token: acquired.owner.token,
    operation,
    onBoundary
  };
  let result;
  let operationFailure;
  try {
    result = await work(session);
  } catch (error) {
    operationFailure = error;
  }

  const failures = operationFailure ? [operationFailure] : [];
  let unsafe = false;
  try {
    const owner = await assertOuterOwner(session.lockRoot, packageRoot, session.identity, session.token);
    if (owner.transaction) {
      const assertMutation = () => assertOuterOwner(session.lockRoot, packageRoot, session.identity, session.token);
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

  if (!unsafe) {
    try {
      await releaseOwnedLock(session.lockRoot, packageRoot, session.identity, session.token);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Generated profile session failed; ${unsafe ? 'transaction and lock retained for recovery' : 'owned lock released'}`
    );
  }
  return result;
}
