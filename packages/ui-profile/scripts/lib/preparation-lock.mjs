import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRANSACTION_KIND = 'base-ui-preparation-v1';
const RECOVERY_CLAIM_NAME = 'recovery-claim';
const RECOVERY_PACKAGE_NAME = '@base-ui/react';
const RECOVERY_PACKAGE_VERSION = '1.6.0';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const compatibilityContracts = [
  path.join(packageRoot, 'compat/base-ui-1.6.0/select-value/contract.json'),
  path.join(packageRoot, 'compat/base-ui-1.6.0/popup-lifecycle/contract.json')
];

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

function assertTransaction(transaction, ownerToken) {
  if (
    !isObject(transaction) ||
    transaction.kind !== TRANSACTION_KIND ||
    transaction.token !== ownerToken ||
    !path.isAbsolute(transaction.preparedRoot ?? '') ||
    !path.isAbsolute(transaction.backupRoot ?? '') ||
    !path.isAbsolute(transaction.stagingRoot ?? '') ||
    typeof transaction.hadPrepared !== 'boolean' ||
    typeof transaction.recoveryRequired !== 'boolean'
  ) {
    throw new Error('Base UI preparation transaction metadata is invalid');
  }
}

function assertOwner(owner) {
  if (!isObject(owner)) throw new Error('Base UI preparation lock owner must be an object');
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
    throw new Error('Base UI preparation lock owner pid must be a positive safe integer');
  }
  if (typeof owner.token !== 'string' || owner.token.trim().length === 0) {
    throw new Error('Base UI preparation lock owner token must be a nonempty string');
  }
  if (typeof owner.startedAt !== 'string' || !Number.isFinite(Date.parse(owner.startedAt))) {
    throw new Error('Base UI preparation lock owner startedAt must be a valid date');
  }
  if (owner.transaction !== undefined) assertTransaction(owner.transaction, owner.token);
  return owner;
}

async function readOwner(lockRoot) {
  return assertOwner(JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8')));
}

async function writeOwnerAtomically(lockRoot, owner) {
  assertOwner(owner);
  const pendingPath = path.join(lockRoot, `.owner-${randomUUID()}.json`);
  try {
    await writeFile(pendingPath, `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    await rename(pendingPath, path.join(lockRoot, 'owner.json'));
  } finally {
    await rm(pendingPath, { force: true });
  }
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isLockConflict(error) {
  return Boolean(error && typeof error === 'object' && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY'));
}

function assertRecoveryClaim(claim) {
  if (!isObject(claim)) throw new Error('Base UI recovery claim must be an object');
  if (!Number.isSafeInteger(claim.pid) || claim.pid <= 0) {
    throw new Error('Base UI recovery claim pid must be a positive safe integer');
  }
  if (typeof claim.token !== 'string' || claim.token.trim().length === 0) {
    throw new Error('Base UI recovery claim token must be a nonempty string');
  }
  if (typeof claim.ownerToken !== 'string' || claim.ownerToken.trim().length === 0) {
    throw new Error('Base UI recovery claim ownerToken must be a nonempty string');
  }
  if (typeof claim.startedAt !== 'string' || !Number.isFinite(Date.parse(claim.startedAt))) {
    throw new Error('Base UI recovery claim startedAt must be a valid date');
  }
  return claim;
}

async function readClaimDirectory(claimRoot) {
  return assertRecoveryClaim(JSON.parse(await readFile(path.join(claimRoot, 'claim.json'), 'utf8')));
}

async function readRecoveryClaim(lockRoot) {
  return readClaimDirectory(path.join(lockRoot, RECOVERY_CLAIM_NAME));
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken) {
  const before = await stat(lockRoot);
  if (!sameDirectoryIdentity(before, outerIdentity)) {
    throw new Error('Base UI preparation owner changed before recovery claim publication');
  }
  const owner = await readOwner(lockRoot);
  const after = await stat(lockRoot);
  if (!sameDirectoryIdentity(after, outerIdentity) || owner.token !== ownerToken || !owner.transaction) {
    throw new Error('Base UI preparation owner changed before recovery claim publication');
  }
  return owner;
}

async function removeOwnedClaimDirectory(claimRoot, expectedClaim) {
  let existing;
  try {
    existing = await readClaimDirectory(claimRoot);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    return false;
  }
  if (existing.token !== expectedClaim.token || existing.ownerToken !== expectedClaim.ownerToken) return false;
  await rm(claimRoot, { recursive: true, force: true });
  return true;
}

async function cleanupPublishedRecoveryClaim(lockRoot, outerIdentity, expectedClaim) {
  try {
    await assertRecoveryOuterBinding(lockRoot, outerIdentity, expectedClaim.ownerToken);
  } catch {
    return false;
  }
  const claimRoot = path.join(lockRoot, RECOVERY_CLAIM_NAME);
  let existing;
  try {
    existing = await readClaimDirectory(claimRoot);
  } catch {
    return false;
  }
  if (existing.token !== expectedClaim.token || existing.ownerToken !== expectedClaim.ownerToken) return false;
  await assertRecoveryOuterBinding(lockRoot, outerIdentity, expectedClaim.ownerToken);

  const cleanupRoot = path.join(lockRoot, `.recovery-claim-cleanup-${randomUUID()}`);
  try {
    await rename(claimRoot, cleanupRoot);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
  const moved = await readClaimDirectory(cleanupRoot);
  if (moved.token !== expectedClaim.token || moved.ownerToken !== expectedClaim.ownerToken) {
    throw new Error(`Unexpected recovery claim was preserved at ${cleanupRoot}`);
  }
  await rm(cleanupRoot, { recursive: true, force: true });
  return true;
}

export async function acquireBaseUiRecoveryClaim(
  lockRoot,
  ownerToken,
  {
    pid = process.pid,
    token = randomUUID(),
    startedAt = new Date().toISOString(),
    isProcessAlive = processIsAlive,
    afterStaleClaimRead = async () => {},
    afterPublish = async () => {}
  } = {}
) {
  const claim = assertRecoveryClaim({ pid, token, ownerToken, startedAt });
  const claimRoot = path.join(lockRoot, RECOVERY_CLAIM_NAME);
  const outerIdentity = await stat(lockRoot);
  const temporaryClaimRoot = await mkdtemp(path.join(lockRoot, '.recovery-claim-acquire-'));
  const ownedQuarantines = [];
  let temporaryClaimOwned = true;
  let published = false;
  let completed = false;
  try {
    await writeFile(path.join(temporaryClaimRoot, 'claim.json'), `${JSON.stringify(claim, null, 2)}\n`, { flag: 'wx' });
    await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
      if (await pathExists(claimRoot)) {
        await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
        let existing;
        let existingIdentity;
        try {
          existingIdentity = await stat(claimRoot);
          existing = await readRecoveryClaim(lockRoot);
          const afterReadIdentity = await stat(claimRoot);
          if (!sameDirectoryIdentity(existingIdentity, afterReadIdentity)) continue;
        } catch (error) {
          if (error && typeof error === 'object' && error.code === 'ENOENT' && !(await pathExists(claimRoot))) continue;
          throw new Error(`Base UI recovery claim metadata is unreadable at ${claimRoot}`, { cause: error });
        }
        if (existing.ownerToken !== ownerToken) {
          throw new Error('Base UI recovery claim is bound to a different preparation owner');
        }
        if (isProcessAlive(existing.pid)) {
          throw new Error(`Another Base UI recovery is already in progress (pid ${existing.pid}, started ${existing.startedAt})`);
        }
        await afterStaleClaimRead(existing);
        const quarantineRoot = path.join(lockRoot, `.recovery-claim-stale-${randomUUID()}`);
        await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
        try {
          await rename(claimRoot, quarantineRoot);
        } catch (error) {
          if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
          throw error;
        }
        let moved;
        let movedIdentity;
        try {
          movedIdentity = await stat(quarantineRoot);
          moved = await readClaimDirectory(quarantineRoot);
          const afterMovedReadIdentity = await stat(quarantineRoot);
          if (!sameDirectoryIdentity(movedIdentity, afterMovedReadIdentity)) {
            throw new Error('Base UI recovery claim identity changed while validating quarantine');
          }
        } catch (error) {
          throw new Error(`Unexpected recovery claim was preserved at ${quarantineRoot}`, { cause: error });
        }
        if (
          !sameDirectoryIdentity(existingIdentity, movedIdentity) ||
          moved.token !== existing.token ||
          moved.ownerToken !== existing.ownerToken
        ) {
          throw new Error(`Unexpected recovery claim was preserved at ${quarantineRoot}`);
        }
        ownedQuarantines.push({ target: quarantineRoot, claim: existing });
      }

      await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
      const temporaryClaim = await readClaimDirectory(temporaryClaimRoot);
      if (temporaryClaim.token !== claim.token || temporaryClaim.ownerToken !== claim.ownerToken) {
        throw new Error('Base UI recovery temporary claim ownership changed before publication');
      }
      try {
        await rename(temporaryClaimRoot, claimRoot);
        temporaryClaimOwned = false;
        published = true;
        await afterPublish(claim);
        await assertRecoveryOuterBinding(lockRoot, outerIdentity, ownerToken);
        const publishedClaim = await readRecoveryClaim(lockRoot);
        if (publishedClaim.token !== claim.token || publishedClaim.ownerToken !== ownerToken) {
          throw new Error('Base UI recovery claim ownership changed after publication');
        }
        completed = true;
        return claim;
      } catch (error) {
        if (!isLockConflict(error)) throw error;
      }
    }
    throw new Error(`Base UI recovery claim contention did not settle at ${claimRoot}`);
  } finally {
    if (temporaryClaimOwned) await removeOwnedClaimDirectory(temporaryClaimRoot, claim);
    if (published && !completed) await cleanupPublishedRecoveryClaim(lockRoot, outerIdentity, claim);
    await Promise.all(ownedQuarantines.map(({ target, claim: staleClaim }) => removeOwnedClaimDirectory(target, staleClaim)));
  }
}

async function assertRecoveryClaimOwnership(lockRoot, ownerToken, claimToken) {
  const [owner, claim] = await Promise.all([readOwner(lockRoot), readRecoveryClaim(lockRoot)]);
  if (owner.token !== ownerToken || claim.ownerToken !== ownerToken || claim.token !== claimToken) {
    throw new Error('Base UI recovery claim ownership was lost before mutation');
  }
}

export async function acquirePreparationLock(
  lockRoot,
  { pid = process.pid, token = randomUUID(), startedAt = new Date().toISOString(), isProcessAlive = processIsAlive } = {}
) {
  const owner = assertOwner({ pid, token, startedAt });
  const temporaryLockRoot = await mkdtemp(`${lockRoot}.acquire-`);
  let temporaryLockOwned = true;
  let conflict = false;
  try {
    await writeFile(path.join(temporaryLockRoot, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    if (await pathExists(lockRoot)) {
      conflict = true;
    } else {
      try {
        await rename(temporaryLockRoot, lockRoot);
        temporaryLockOwned = false;
        return owner;
      } catch (error) {
        if (!isLockConflict(error)) throw error;
        conflict = true;
      }
    }
  } finally {
    if (temporaryLockOwned) await rm(temporaryLockRoot, { recursive: true, force: true });
  }

  if (!conflict) throw new Error(`Base UI preparation lock acquisition failed at ${lockRoot}`);
  let existing;
  try {
    existing = await readOwner(lockRoot);
  } catch (error) {
    throw new Error(
      `Base UI preparation lock metadata is unreadable at ${lockRoot}; verify no preparation is running, then inspect that directory`,
      { cause: error }
    );
  }
  if (isProcessAlive(existing.pid)) {
    throw new Error(`Another Base UI preparation is already in progress (pid ${existing.pid}, started ${existing.startedAt})`);
  }
  throw new Error(
    `Stale Base UI preparation lock from pid ${existing.pid} remains at ${lockRoot}; verify that process is gone, then inspect that directory`
  );
}

export async function beginBaseUiPreparationTransaction(
  lockRoot,
  token,
  { preparedRoot, backupRoot, stagingRoot, hadPrepared }
) {
  const owner = await readOwner(lockRoot);
  if (owner.token !== token) return false;
  if (owner.transaction) throw new Error('Base UI preparation lock already contains a transaction journal');
  const transaction = {
    kind: TRANSACTION_KIND,
    token,
    preparedRoot,
    backupRoot,
    stagingRoot,
    hadPrepared,
    recoveryRequired: false
  };
  assertTransaction(transaction, token);
  await writeOwnerAtomically(lockRoot, { ...owner, transaction });
  return true;
}

export async function settlePreparationLock(lockRoot, token, { retain = false } = {}) {
  let owner;
  try {
    owner = await readOwner(lockRoot);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
  if (owner.token !== token) return false;
  if (retain) {
    if (!owner.transaction) throw new Error('Cannot retain a Base UI preparation lock without a transaction journal');
    await writeOwnerAtomically(lockRoot, {
      ...owner,
      transaction: { ...owner.transaction, recoveryRequired: true }
    });
    return true;
  }

  const releaseRoot = `${lockRoot}.release-${randomUUID()}`;
  await rename(lockRoot, releaseRoot);
  const movedOwner = await readOwner(releaseRoot);
  if (movedOwner.token !== token) {
    throw new Error(`Preparation lock ownership changed during release; preserved unexpected lock at ${releaseRoot}`);
  }
  await rm(releaseRoot, { recursive: true, force: true });
  return true;
}

export async function releasePreparationLock(lockRoot, token) {
  return settlePreparationLock(lockRoot, token);
}

async function releaseClaimedPreparationLock(lockRoot, ownerToken, claimToken) {
  try {
    await assertRecoveryClaimOwnership(lockRoot, ownerToken, claimToken);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    if (error instanceof Error && error.message === 'Base UI recovery claim ownership was lost before mutation') return false;
    throw error;
  }

  const releaseRoot = `${lockRoot}.recovery-release-${randomUUID()}`;
  await rename(lockRoot, releaseRoot);
  const [movedOwner, movedClaim] = await Promise.all([readOwner(releaseRoot), readRecoveryClaim(releaseRoot)]);
  if (movedOwner.token !== ownerToken || movedClaim.ownerToken !== ownerToken || movedClaim.token !== claimToken) {
    throw new Error(`Base UI recovery ownership changed during release; preserved transaction at ${releaseRoot}`);
  }
  await rm(releaseRoot, { recursive: true, force: true });
  return true;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

let recoveryFilesPromise;
async function recoveryFiles() {
  recoveryFilesPromise ??= (async () => {
    const contracts = await Promise.all(compatibilityContracts.map(async (contractPath) => JSON.parse(await readFile(contractPath))));
    const files = [];
    for (const contract of contracts) {
      if (contract.package !== RECOVERY_PACKAGE_NAME || contract.version !== RECOVERY_PACKAGE_VERSION || !Array.isArray(contract.files)) {
        throw new Error(`Base UI compatibility contract is invalid for recovery: ${contract.contractVersion ?? 'unknown'}`);
      }
      for (const file of contract.files) {
        const expectedSha256 = file.transformedFileSha256 ?? file.transformedSha256;
        if (typeof file.installedPath !== 'string' || typeof expectedSha256 !== 'string') {
          throw new Error(`Base UI compatibility contract has an invalid recovery file entry: ${contract.contractVersion}`);
        }
        files.push({ installedPath: file.installedPath, expectedSha256 });
      }
    }
    return files;
  })();
  return recoveryFilesPromise;
}

async function validateBaseUiPreparedCopy(root, fileSystem) {
  let manifest;
  try {
    manifest = JSON.parse(await fileSystem.readFile(path.join(root, 'package.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Preserved Base UI recovery copy is unreadable at ${root}`, { cause: error });
  }
  if (manifest.name !== RECOVERY_PACKAGE_NAME || manifest.version !== RECOVERY_PACKAGE_VERSION) {
    throw new Error(
      `Preserved recovery copy at ${root} must be ${RECOVERY_PACKAGE_NAME}@${RECOVERY_PACKAGE_VERSION}, found ${manifest.name ?? 'unknown'}@${manifest.version ?? 'unknown'}`
    );
  }

  for (const file of await recoveryFiles()) {
    const target = path.join(root, file.installedPath);
    let bytes;
    try {
      bytes = await fileSystem.readFile(target);
    } catch (error) {
      throw new Error(`Required transformed Base UI recovery file is unreadable: ${file.installedPath}`, { cause: error });
    }
    if (sha256(bytes) !== file.expectedSha256) {
      throw new Error(`Required transformed Base UI recovery file digest differs: ${file.installedPath}`);
    }
  }
}

function assertTransactionPaths(transaction, { preparedRoot, backupRoot }) {
  const expectedStagingParent = path.dirname(preparedRoot);
  if (
    transaction.preparedRoot !== preparedRoot ||
    transaction.backupRoot !== backupRoot ||
    path.dirname(transaction.stagingRoot) !== expectedStagingParent ||
    !path.basename(transaction.stagingRoot).startsWith('.base-ui-staging-')
  ) {
    throw new Error('Base UI preparation transaction paths do not match this preparation root');
  }
}

async function recoverTransactionState(transaction, fileSystem, assertMutationOwnership = async () => {}) {
  const preparedExists = await fileSystem.pathExists(transaction.preparedRoot);
  const backupExists = await fileSystem.pathExists(transaction.backupRoot);
  const stagingExists = await fileSystem.pathExists(transaction.stagingRoot);

  if (transaction.hadPrepared) {
    if (preparedExists && !backupExists && stagingExists) {
      await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
      await assertMutationOwnership();
      await fileSystem.rm(transaction.stagingRoot, { recursive: true, force: true });
      return 'pre-move';
    }
    if (!preparedExists && backupExists && stagingExists) {
      await validateBaseUiPreparedCopy(transaction.backupRoot, fileSystem);
      const failures = [];
      let restored = false;
      try {
        await assertMutationOwnership();
        await fileSystem.rename(transaction.backupRoot, transaction.preparedRoot);
        restored = true;
      } catch (error) {
        failures.push(error);
      }
      try {
        await assertMutationOwnership();
        await fileSystem.rm(transaction.stagingRoot, { recursive: true, force: true });
      } catch (error) {
        failures.push(error);
      }
      if (restored) {
        try {
          await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Base UI backup recovery and cleanup failed');
      return 'backup-only';
    }
    if (!preparedExists && backupExists && !stagingExists) {
      await validateBaseUiPreparedCopy(transaction.backupRoot, fileSystem);
      await assertMutationOwnership();
      await fileSystem.rename(transaction.backupRoot, transaction.preparedRoot);
      await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
      return 'backup-only';
    }
    if (preparedExists && backupExists && !stagingExists) {
      await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
      await assertMutationOwnership();
      await fileSystem.rm(transaction.backupRoot, { recursive: true, force: true });
      return 'prepared-and-backup';
    }
    if (preparedExists && !backupExists && !stagingExists) {
      await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
      return 'success';
    }
  } else {
    if (!preparedExists && !backupExists && stagingExists) {
      await assertMutationOwnership();
      await fileSystem.rm(transaction.stagingRoot, { recursive: true, force: true });
      return 'pre-move';
    }
    if (preparedExists && !backupExists && !stagingExists) {
      await validateBaseUiPreparedCopy(transaction.preparedRoot, fileSystem);
      return 'success';
    }
  }

  throw new Error(
    `Base UI preparation transaction is ambiguous (prepared=${preparedExists}, backup=${backupExists}, staging=${stagingExists}); all paths were preserved`
  );
}

async function recoverOwnedTransaction({ lockRoot, token, preparedRoot, backupRoot, fileSystem }) {
  const owner = await readOwner(lockRoot);
  if (owner.token !== token) throw new Error('Base UI preparation transaction ownership was lost');
  if (!owner.transaction) throw new Error('Base UI preparation transaction journal is missing');
  assertTransactionPaths(owner.transaction, { preparedRoot, backupRoot });
  return recoverTransactionState(owner.transaction, fileSystem);
}

export async function recoverRetainedBaseUiPreparation({
  lockRoot,
  preparedRoot,
  backupRoot,
  isProcessAlive = processIsAlive,
  isRecoveryProcessAlive = processIsAlive,
  beforeRecoveryClaim = async () => {},
  fileSystem = {}
}) {
  const fs = { pathExists, readFile, rename, rm, ...fileSystem };
  if (!(await fs.pathExists(lockRoot))) return false;

  let owner;
  try {
    owner = await readOwner(lockRoot);
  } catch (error) {
    throw new Error(`Base UI preparation lock metadata is unreadable at ${lockRoot}`, { cause: error });
  }
  if (!owner.transaction) return false;
  if (isProcessAlive(owner.pid)) throw new Error(`Base UI recovery is still owned by live process ${owner.pid}`);
  const originalOwnerToken = owner.token;
  await beforeRecoveryClaim({ ownerToken: originalOwnerToken });
  const claim = await acquireBaseUiRecoveryClaim(lockRoot, originalOwnerToken, {
    isProcessAlive: isRecoveryProcessAlive
  });

  owner = await readOwner(lockRoot);
  if (owner.token !== originalOwnerToken) throw new Error('Base UI preparation owner changed after recovery claim');
  if (!owner.transaction) throw new Error('Base UI preparation transaction disappeared after recovery claim');
  assertTransactionPaths(owner.transaction, { preparedRoot, backupRoot });

  const assertClaim = () => assertRecoveryClaimOwnership(lockRoot, originalOwnerToken, claim.token);
  const state = await recoverTransactionState(owner.transaction, fs, assertClaim);
  const released = await releaseClaimedPreparationLock(lockRoot, originalOwnerToken, claim.token);
  if (!released) throw new Error(`Base UI recovery lost lock ownership before release at ${lockRoot}`);
  return { recovered: true, state };
}

export async function finalizeBaseUiPreparation({
  operationFailure,
  stagingRoot,
  preparedRoot,
  backupRoot,
  transactionStarted,
  lockRoot,
  token,
  fileSystem = {},
  settleLock = settlePreparationLock
}) {
  const fs = { pathExists, readFile, rename, rm, ...fileSystem };
  const failures = operationFailure ? [operationFailure] : [];
  let recoveryUnsafe = false;

  if (transactionStarted) {
    try {
      await recoverOwnedTransaction({ lockRoot, token, preparedRoot, backupRoot, fileSystem: fs });
    } catch (error) {
      if (error instanceof AggregateError) failures.push(...error.errors);
      else failures.push(error);
      recoveryUnsafe = true;
    }
  } else if (stagingRoot) {
    try {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }

  let lockSettled = false;
  try {
    lockSettled = await settleLock(lockRoot, token, { retain: recoveryUnsafe });
    if (!lockSettled) {
      failures.push(
        new Error(
          `Base UI preparation lock ownership was lost before it could be ${recoveryUnsafe ? 'retained' : 'released'} at ${lockRoot}`
        )
      );
    }
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    const lockOutcome = recoveryUnsafe
      ? lockSettled
        ? 'recovery is unsafe, so the transaction journal and owned lock were retained'
        : 'recovery is unsafe and lock ownership could not be confirmed'
      : lockSettled
        ? 'the owned lock was released'
        : 'lock ownership could not be released';
    throw new AggregateError(failures, `Base UI preparation finalization failed; ${lockOutcome}`);
  }

  return { lockDisposition: recoveryUnsafe ? 'retained' : 'released' };
}
