import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const BASE_UI_PACKAGE = '@base-ui/react';
const BASE_UI_VERSION = '1.6.0';
const BASE_UI_RESOLVED = 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz';
const BASE_UI_INTEGRITY = 'sha512-/jzjTWJYXhRFO45Bev9lc3cHbmjzCMpUqbMZ2AgKy/z25mY9B6shGSNcXcjQar9n5doM0KYW1W8fcFv2jZBuMw==';
const BASE_UI_TREE_SHA256 = 'd0a77f132c4d1dd4a0f5e4e91d36cfc774ac9dcdde74c91bcbb44f56dca4161f';
const STAMP_FILE = '.spfx-ui-profile-prepared.json';
const LOCK_OWNER_FILE = 'owner.json';
const LOCK_RECOVERY_CLAIM_SUFFIX = '.recovery-claim-';
const LOCK_RECOVERY_CLAIM_CANDIDATE_SUFFIX = '.recovery-candidate-';
const LOCK_RECOVERY_CLAIM_FILE = 'claim.json';
const execFileAsync = promisify(execFile);
const EXPORT_PATH = './spfx-id-ownership';
const EXPORT_CONTRACT = {
  import: { types: './spfx-id-ownership.d.mts', default: './spfx-id-ownership.mjs' },
  require: { types: './spfx-id-ownership.d.ts', default: './spfx-id-ownership.js' },
  default: { types: './spfx-id-ownership.d.mts', default: './spfx-id-ownership.mjs' }
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function ensureAppLocalDirectory(appRoot, components) {
  let current = appRoot;
  let currentIdentity = await lstat(current, { bigint: true });
  for (const component of components) {
    const target = path.join(current, component);
    try {
      await mkdir(target);
    } catch (error) {
      if (!isLockConflict(error)) throw error;
    }
    const targetIdentity = await lstat(target, { bigint: true });
    if (!targetIdentity.isDirectory() || targetIdentity.isSymbolicLink()) {
      throw new Error(`Prepared Base UI path must be an app-local directory: ${target}`);
    }
    const resolvedTarget = await realpath(target);
    const resolvedIdentity = await lstat(resolvedTarget, { bigint: true });
    const parentAfter = await lstat(current, { bigint: true });
    if (
      !sameFilesystemIdentity(currentIdentity, parentAfter) ||
      !sameFilesystemIdentity(targetIdentity, resolvedIdentity) ||
      !isPathInside(appRoot, resolvedTarget)
    ) {
      throw new Error(`Prepared Base UI parent escapes the app root: ${resolvedTarget}`);
    }
    current = resolvedTarget;
    currentIdentity = resolvedIdentity;
  }
  return current;
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'missing';
  try {
    process.kill(pid, 0);
    return 'unknown';
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return 'missing';
    return 'unknown';
  }
}

export async function observeSpfxUiProfileProcess(
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
    const fields =
      commandEnd === -1
        ? []
        : stat
            .slice(commandEnd + 1)
            .trim()
            .split(/\s+/u);
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
      if (!startedAt || /[\r\n]/u.test(startedAt)) return { status: 'unknown' };
      return { status: 'alive', identity: `darwin-ps-lstart-v1:${startedAt}` };
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 1) return { status: 'missing' };
      return { status: processExists(pid) };
    }
  }
  return { status: processExists(pid) };
}

function preparationLockActor(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.token !== 'string' ||
    !/^[a-zA-Z0-9-]{1,128}$/u.test(value.token) ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !Object.hasOwn(value, 'processIdentity') ||
    (value.processIdentity !== null && (typeof value.processIdentity !== 'string' || !value.processIdentity))
  ) {
    throw new Error(`Base UI preparation lock ${label} metadata is invalid`);
  }
  return value;
}

function preparationLockOwner(value) {
  return preparationLockActor(value, 'owner');
}

function preparationRecoveryClaim(value) {
  const claim = preparationLockActor(value, 'recovery claim');
  if (typeof claim.ownerToken !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(claim.ownerToken)) {
    throw new Error('Base UI preparation lock recovery claim metadata is invalid');
  }
  return claim;
}

export async function spfxUiProfilePreparationActorIsActive(actor, { observeProcess = observeSpfxUiProfileProcess } = {}) {
  const observation = await observeProcess(actor.pid);
  if (observation?.status === 'missing') return false;
  if (
    observation?.status === 'alive' &&
    actor.processIdentity &&
    typeof observation.identity === 'string' &&
    observation.identity !== actor.processIdentity
  ) {
    return false;
  }
  return true;
}

async function newPreparationLockActor(extra = {}) {
  const observation = await observeSpfxUiProfileProcess(process.pid);
  return {
    schemaVersion: 1,
    pid: process.pid,
    token: randomUUID(),
    startedAt: new Date().toISOString(),
    processIdentity: observation.status === 'alive' && typeof observation.identity === 'string' ? observation.identity : null,
    ...extra
  };
}

async function readStablePreparationMetadata(root, fileName, parse, label) {
  const metadataPath = path.join(root, fileName);
  const before = await lstat(metadataPath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`Base UI preparation lock ${label} metadata must be a regular file`);
  }
  const metadata = parse(JSON.parse(await readFile(metadataPath, 'utf8')));
  const after = await lstat(metadataPath, { bigint: true });
  if (!sameFilesystemIdentity(before, after)) {
    throw new Error(`Base UI preparation lock ${label} metadata changed while it was read`);
  }
  return metadata;
}

async function readPreparationLockOwner(lockRoot) {
  return readStablePreparationMetadata(lockRoot, LOCK_OWNER_FILE, preparationLockOwner, 'owner');
}

async function readPreparationRecoveryClaim(claimRoot) {
  return readStablePreparationMetadata(claimRoot, LOCK_RECOVERY_CLAIM_FILE, preparationRecoveryClaim, 'recovery claim');
}

async function lockDirectoryIdentity(lockRoot) {
  const identity = await lstat(lockRoot, { bigint: true });
  if (!identity.isDirectory() || identity.isSymbolicLink()) {
    throw new Error(`Base UI preparation lock must be an app-local directory: ${lockRoot}`);
  }
  return identity;
}

function sameFilesystemIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function isMissing(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

function isLockConflict(error) {
  return Boolean(error && typeof error === 'object' && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY'));
}

async function publishPreparationLock(lockRoot, owner, onLockBoundary) {
  const candidateRoot = await mkdtemp(`${lockRoot}.acquire-`);
  let candidateOwned = true;
  try {
    await writeFile(path.join(candidateRoot, LOCK_OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    const activeClaims = await activePreparationRecoveryClaims(lockRoot);
    if (activeClaims.length) {
      const [{ claim }] = activeClaims;
      throw new Error(
        `Another Base UI preparation recovery is already in progress (pid ${claim.pid}, started ${claim.startedAt})`
      );
    }
    await onLockBoundary('initial-recovery-claims-scanned', { lockRoot });
    if (await pathExistsNoFollow(lockRoot)) return false;
    const finalActiveClaims = await activePreparationRecoveryClaims(lockRoot);
    if (finalActiveClaims.length) {
      const [{ claim }] = finalActiveClaims;
      throw new Error(
        `Another Base UI preparation recovery is already in progress (pid ${claim.pid}, started ${claim.startedAt})`
      );
    }
    try {
      await rename(candidateRoot, lockRoot);
      candidateOwned = false;
      return true;
    } catch (error) {
      if (isLockConflict(error)) return false;
      throw error;
    }
  } finally {
    if (candidateOwned) await rm(candidateRoot, { recursive: true, force: true });
  }
}

async function assertPreparationLockBinding(lockRoot, expectedIdentity, ownerToken) {
  const before = await lockDirectoryIdentity(lockRoot);
  const owner = await readPreparationLockOwner(lockRoot);
  const after = await lockDirectoryIdentity(lockRoot);
  if (!sameFilesystemIdentity(before, after) || !sameFilesystemIdentity(before, expectedIdentity) || owner.token !== ownerToken) {
    throw new Error('Base UI preparation lock owner changed during recovery');
  }
  return owner;
}

async function pathExistsNoFollow(target) {
  try {
    await lstat(target, { bigint: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function publishPreparationRecoveryClaim(lockRoot, existingOwner, expectedIdentity, claim) {
  await assertPreparationLockBinding(lockRoot, expectedIdentity, existingOwner.token);
  const claimPrefix = `${path.basename(lockRoot)}${LOCK_RECOVERY_CLAIM_SUFFIX}`;
  const candidateRoot = await mkdtemp(
    path.join(path.dirname(lockRoot), `${path.basename(lockRoot)}${LOCK_RECOVERY_CLAIM_CANDIDATE_SUFFIX}`)
  );
  const claimRoot = path.join(path.dirname(lockRoot), `${claimPrefix}${claim.token}`);
  let candidateOwned = true;
  let publishedIdentity;
  let operationError;
  try {
    await writeFile(path.join(candidateRoot, LOCK_RECOVERY_CLAIM_FILE), `${JSON.stringify(claim, null, 2)}\n`, { flag: 'wx' });
    await assertPreparationLockBinding(lockRoot, expectedIdentity, existingOwner.token);
    try {
      await rename(candidateRoot, claimRoot);
      candidateOwned = false;
      publishedIdentity = await lockDirectoryIdentity(claimRoot);
    } catch (error) {
      if (isLockConflict(error)) throw new Error('Base UI preparation recovery claim token collided', { cause: error });
      throw error;
    }
    const published = await readPreparationRecoveryClaim(claimRoot);
    if (published.token !== claim.token || published.ownerToken !== existingOwner.token) {
      throw new Error('Base UI preparation recovery claim changed during publication');
    }
    await assertPreparationLockBinding(lockRoot, expectedIdentity, existingOwner.token);
  } catch (error) {
    operationError = error;
  }
  let cleanupError;
  if (candidateOwned) {
    try {
      await assertPreparationLockBinding(lockRoot, expectedIdentity, existingOwner.token);
      await rm(candidateRoot, { recursive: true, force: true });
    } catch (error) {
      if (!isMissing(error)) cleanupError = error;
    }
  }
  if (operationError && cleanupError) {
    throw new AggregateError([operationError, cleanupError], 'Recovery claim publication and cleanup both failed');
  }
  if (operationError) {
    if (publishedIdentity) {
      try {
        await retireOwnPreparationRecoveryClaim({ claim, claimRoot, claimIdentity: publishedIdentity });
      } catch (retirementError) {
        throw new AggregateError([operationError, retirementError], 'Recovery claim publication and retirement both failed', {
          cause: retirementError
        });
      }
    }
    throw operationError;
  }
  if (cleanupError) throw cleanupError;
  return { claim, claimRoot, claimIdentity: publishedIdentity };
}

function preparationRecoveryClaimPrefix(lockRoot) {
  return `${path.basename(lockRoot)}${LOCK_RECOVERY_CLAIM_SUFFIX}`;
}

async function activePreparationRecoveryClaims(lockRoot) {
  const claims = [];
  const claimPrefix = preparationRecoveryClaimPrefix(lockRoot);
  const entries = await readdir(path.dirname(lockRoot), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.startsWith(claimPrefix)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Base UI preparation recovery claim must be a directory: ${entry.name}`);
    }
    const claimRoot = path.join(path.dirname(lockRoot), entry.name);
    const before = await lockDirectoryIdentity(claimRoot);
    const claim = await readPreparationRecoveryClaim(claimRoot);
    const after = await lockDirectoryIdentity(claimRoot);
    if (!sameFilesystemIdentity(before, after) || entry.name !== `${claimPrefix}${claim.token}`) {
      throw new Error(`Base UI preparation recovery claim changed while it was inspected: ${entry.name}`);
    }
    if (await spfxUiProfilePreparationActorIsActive(claim)) {
      claims.push({ claim, claimRoot, claimIdentity: before });
    }
  }
  return claims;
}

async function retireOwnPreparationRecoveryClaim(published) {
  const before = await lockDirectoryIdentity(published.claimRoot);
  const claim = await readPreparationRecoveryClaim(published.claimRoot);
  const after = await lockDirectoryIdentity(published.claimRoot);
  if (
    !sameFilesystemIdentity(before, after) ||
    !sameFilesystemIdentity(before, published.claimIdentity) ||
    claim.token !== published.claim.token ||
    claim.ownerToken !== published.claim.ownerToken
  ) {
    throw new Error('Base UI preparation recovery claim changed before cleanup');
  }
  const claimName = path.basename(published.claimRoot);
  const lockName = claimName.slice(0, -`${LOCK_RECOVERY_CLAIM_SUFFIX}${published.claim.token}`.length);
  const retiredRoot = path.join(
    path.dirname(published.claimRoot),
    `${lockName}.recovery-retired-${published.claim.token}-${randomUUID()}`
  );
  try {
    await rename(published.claimRoot, retiredRoot);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  const movedIdentity = await lockDirectoryIdentity(retiredRoot);
  const movedClaim = await readPreparationRecoveryClaim(retiredRoot);
  if (
    !sameFilesystemIdentity(movedIdentity, published.claimIdentity) ||
    movedClaim.token !== published.claim.token ||
    movedClaim.ownerToken !== published.claim.ownerToken
  ) {
    throw new Error(`Recovery claim ownership changed during retirement; preserved at ${retiredRoot}`);
  }
  await rm(retiredRoot, { recursive: true, force: true });
  return true;
}

async function acquirePreparationRecoveryClaim(lockRoot, existingOwner, expectedIdentity) {
  const ownClaim = preparationRecoveryClaim(await newPreparationLockActor({ ownerToken: existingOwner.token }));
  return publishPreparationRecoveryClaim(lockRoot, existingOwner, expectedIdentity, ownClaim);
}

async function reclaimStalePreparationLock(lockRoot, existingOwner, expectedIdentity) {
  const published = await acquirePreparationRecoveryClaim(lockRoot, existingOwner, expectedIdentity);
  let result = false;
  let operationError;
  try {
    const currentOwner = await assertPreparationLockBinding(lockRoot, expectedIdentity, existingOwner.token);
    if (await spfxUiProfilePreparationActorIsActive(currentOwner)) {
      throw new Error(
        `Another Base UI preparation is already in progress (pid ${currentOwner.pid}, started ${currentOwner.startedAt})`
      );
    }
    const finalClaimIdentity = await lockDirectoryIdentity(published.claimRoot);
    const finalClaim = await readPreparationRecoveryClaim(published.claimRoot);
    if (
      !sameFilesystemIdentity(finalClaimIdentity, published.claimIdentity) ||
      finalClaim.token !== published.claim.token ||
      finalClaim.ownerToken !== existingOwner.token
    ) {
      throw new Error('Base UI preparation recovery claim changed before lock retirement');
    }
    const staleRoot = `${lockRoot}.stale-${randomUUID()}`;
    let retired = false;
    try {
      await rename(lockRoot, staleRoot);
      retired = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (retired) {
      const movedIdentity = await lockDirectoryIdentity(staleRoot);
      const movedOwner = await readPreparationLockOwner(staleRoot);
      if (!sameFilesystemIdentity(movedIdentity, expectedIdentity) || movedOwner.token !== existingOwner.token) {
        throw new Error(`Preparation lock ownership changed during recovery; preserved unexpected lock at ${staleRoot}`);
      }
      await rm(staleRoot, { recursive: true, force: true });
      result = true;
    }
  } catch (error) {
    operationError = error;
  }
  let cleanupError;
  try {
    await retireOwnPreparationRecoveryClaim(published);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError && cleanupError) {
    throw new AggregateError([operationError, cleanupError], 'Lock recovery and claim retirement both failed');
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function acquirePreparationLock(lockRoot, onLockBoundary) {
  const owner = preparationLockOwner(await newPreparationLockActor());
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (await publishPreparationLock(lockRoot, owner, onLockBoundary)) return owner;
    let before;
    let existingOwner;
    let after;
    try {
      before = await lockDirectoryIdentity(lockRoot);
      existingOwner = await readPreparationLockOwner(lockRoot);
      after = await lockDirectoryIdentity(lockRoot);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
      throw new Error(`Base UI preparation lock metadata is unreadable at ${lockRoot}`, { cause: error });
    }
    if (!sameFilesystemIdentity(before, after)) continue;
    if (await spfxUiProfilePreparationActorIsActive(existingOwner)) {
      throw new Error(
        `Another Base UI preparation is already in progress (pid ${existingOwner.pid}, started ${existingOwner.startedAt})`
      );
    }
    await reclaimStalePreparationLock(lockRoot, existingOwner, before);
  }
  throw new Error(`Base UI preparation lock contention did not settle at ${lockRoot}`);
}

async function releasePreparationLock(lockRoot, token) {
  let before;
  let owner;
  let after;
  try {
    before = await lockDirectoryIdentity(lockRoot);
    owner = await readPreparationLockOwner(lockRoot);
    after = await lockDirectoryIdentity(lockRoot);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
  if (!sameFilesystemIdentity(before, after) || owner.token !== token) return false;
  if ((await activePreparationRecoveryClaims(lockRoot)).length) return false;
  const releaseRoot = `${lockRoot}.release-${randomUUID()}`;
  await rename(lockRoot, releaseRoot);
  const movedIdentity = await lockDirectoryIdentity(releaseRoot);
  const movedOwner = await readPreparationLockOwner(releaseRoot);
  if (!sameFilesystemIdentity(movedIdentity, before) || movedOwner.token !== token) {
    throw new Error(`Preparation lock ownership changed during release; preserved unexpected lock at ${releaseRoot}`);
  }
  await rm(releaseRoot, { recursive: true, force: true });
  return true;
}

async function treeSha256(root, ignored = new Set()) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      if (ignored.has(relative)) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push([relative, sha256(await readFile(absolute))]);
      else throw new Error(`Base UI contains a non-file entry: ${relative}`);
    }
  }
  await visit(root);
  return sha256(JSON.stringify(files));
}

function contractRelativePath(sourcePath) {
  const marker = 'packages/ui-profile/';
  if (!sourcePath.startsWith(marker)) throw new Error(`Unsupported prepared Base UI contract path: ${sourcePath}`);
  return sourcePath.slice(marker.length);
}

async function readVerified(profileRoot, relativePath, expectedSha256, label) {
  const target = path.resolve(profileRoot, relativePath);
  const relative = path.relative(profileRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes the vendored UI profile`);
  }
  const bytes = await readFile(target);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${label} digest differs`);
  return bytes;
}

async function readContracts(profileRoot, profileManifest) {
  const contracts = {};
  for (const binding of profileManifest.preparedBaseUi.contracts) {
    const relativePath = contractRelativePath(binding.path);
    const bytes = await readVerified(profileRoot, relativePath, binding.sha256, `Prepared Base UI contract ${binding.path}`);
    const contract = JSON.parse(bytes.toString('utf8'));
    if (contract.package !== BASE_UI_PACKAGE || contract.version !== BASE_UI_VERSION) {
      throw new Error(`Prepared Base UI contract ${binding.path} has an unsupported package identity`);
    }
    contracts[path.basename(path.dirname(relativePath))] = { contract, sha256: binding.sha256 };
  }
  for (const required of ['id-ownership', 'popup-lifecycle', 'select-value']) {
    if (!contracts[required]) throw new Error(`Prepared Base UI contract is missing: ${required}`);
  }
  return contracts;
}

async function verifyContractFixtures(profileRoot, contracts) {
  for (const file of contracts['id-ownership'].contract.providerFiles) {
    await readVerified(profileRoot, file.sourcePath, file.sha256, file.sourcePath);
  }
  for (const file of contracts['popup-lifecycle'].contract.files) {
    await readVerified(profileRoot, file.originalPath, file.originalSha256, file.originalPath);
    await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
  }
  for (const file of contracts['select-value'].contract.files) {
    await readVerified(profileRoot, file.upstreamPath, file.upstreamSha256, file.upstreamPath);
    await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
  }
}

async function resolveInstalledBaseUi(appRoot) {
  const packageManifest = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
  const declared = packageManifest.dependencies?.[BASE_UI_PACKAGE] ?? packageManifest.devDependencies?.[BASE_UI_PACKAGE];
  if (declared !== BASE_UI_VERSION) throw new Error(`${BASE_UI_PACKAGE} must be pinned exactly to ${BASE_UI_VERSION}`);

  const lock = JSON.parse(await readFile(path.join(appRoot, 'package-lock.json'), 'utf8'));
  const locked = lock.packages?.[`node_modules/${BASE_UI_PACKAGE}`];
  if (locked?.version !== BASE_UI_VERSION || locked.resolved !== BASE_UI_RESOLVED || locked.integrity !== BASE_UI_INTEGRITY) {
    throw new Error(`Installed ${BASE_UI_PACKAGE} lock identity differs from the pinned preparation contract`);
  }

  const require = createRequire(path.join(appRoot, 'package.json'));
  const resolvedManifestPath = require.resolve(`${BASE_UI_PACKAGE}/package.json`);
  const resolvedRoot = await realpath(path.dirname(resolvedManifestPath));
  const expectedRoot = await realpath(path.join(appRoot, 'node_modules', '@base-ui', 'react'));
  if (resolvedRoot !== expectedRoot) throw new Error(`Resolved ${BASE_UI_PACKAGE} is not app-local`);
  const resolvedManifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  if (resolvedManifest.name !== BASE_UI_PACKAGE || resolvedManifest.version !== BASE_UI_VERSION) {
    throw new Error(`Resolved Base UI package identity differs from ${BASE_UI_PACKAGE}@${BASE_UI_VERSION}`);
  }
  if ((await treeSha256(resolvedRoot)) !== BASE_UI_TREE_SHA256) {
    throw new Error(`Installed ${BASE_UI_PACKAGE} package tree differs from the pinned preparation contract`);
  }
  return resolvedRoot;
}

async function applySelectValue(profileRoot, stagingRoot, contract) {
  const from = contract.replacement.from;
  const to = contract.replacement.to;
  for (const file of contract.files) {
    const upstream = await readVerified(profileRoot, file.upstreamPath, file.upstreamSha256, file.upstreamPath);
    const expected = await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
    const source = upstream.toString('utf8');
    if (source.split(from).length - 1 !== 1) throw new Error(`${file.upstreamPath}: unsupported declaration shape`);
    if (Buffer.from(source.replace(from, to)).compare(expected) !== 0) {
      throw new Error(`${file.installedPath}: transformed declaration differs from the exact fixture`);
    }
    const target = path.join(stagingRoot, file.installedPath);
    const installed = await readFile(target);
    if (sha256(installed) !== file.upstreamSha256) throw new Error(`${file.installedPath}: installed bytes differ`);
    await writeFile(target, expected);
  }
}

async function applyPopupLifecycle(profileRoot, stagingRoot, contract) {
  for (const file of contract.files) {
    const original = await readVerified(profileRoot, file.originalPath, file.originalSha256, file.originalPath);
    const transformed = await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
    const target = path.join(stagingRoot, file.installedPath);
    const installed = await readFile(target);
    if (sha256(installed) !== file.originalFileSha256) throw new Error(`${file.installedPath}: installed bytes differ`);
    const originalFragment = original.toString('utf8').trimEnd();
    const transformedFragment = transformed.toString('utf8').trimEnd();
    const source = installed.toString('utf8');
    if (source.split(originalFragment).length - 1 !== 1 || source.includes(transformedFragment)) {
      throw new Error(`${file.installedPath}: unsupported popup lifecycle shape`);
    }
    const output = Buffer.from(source.replace(originalFragment, transformedFragment));
    if (sha256(output) !== file.transformedFileSha256) throw new Error(`${file.installedPath}: transformed digest differs`);
    await writeFile(target, output);
  }
}

async function applyIdOwnership(profileRoot, stagingRoot, contract) {
  const manifestPath = path.join(stagingRoot, contract.packageManifest.installedPath);
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== contract.packageManifest.originalFileSha256) {
    throw new Error('Base UI package manifest differs from the ID ownership contract');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest.exports || Array.isArray(manifest.exports) || typeof manifest.exports !== 'object') {
    throw new Error('Base UI package manifest must expose an object exports map');
  }
  if (manifest.exports[EXPORT_PATH] !== undefined) throw new Error(`${EXPORT_PATH}: an export already exists`);
  manifest.exports[EXPORT_PATH] = EXPORT_CONTRACT;
  const transformedManifest = Buffer.from(JSON.stringify(manifest, null, 2));
  if (sha256(transformedManifest) !== contract.packageManifest.transformedFileSha256) {
    throw new Error('Base UI transformed package manifest digest differs');
  }
  await writeFile(manifestPath, transformedManifest);
  for (const file of contract.providerFiles) {
    const source = await readVerified(profileRoot, file.sourcePath, file.sha256, file.sourcePath);
    await writeFile(path.join(stagingRoot, file.installedPath), source, { flag: 'wx' });
  }
}

async function preparedTreeIsCurrent(preparedRoot, contractDigests) {
  if (!(await exists(path.join(preparedRoot, STAMP_FILE)))) return false;
  try {
    const stamp = JSON.parse(await readFile(path.join(preparedRoot, STAMP_FILE), 'utf8'));
    return (
      stamp.schemaVersion === 1 &&
      stamp.package === `${BASE_UI_PACKAGE}@${BASE_UI_VERSION}` &&
      stamp.sourceTreeSha256 === BASE_UI_TREE_SHA256 &&
      JSON.stringify(stamp.contracts) === JSON.stringify(contractDigests) &&
      stamp.preparedTreeSha256 === (await treeSha256(preparedRoot, new Set([STAMP_FILE])))
    );
  } catch {
    return false;
  }
}

export async function prepareSpfxUiProfileBaseUi({ appRoot, profileRoot, onPreparationLockBoundary = async () => {} }) {
  if (!appRoot || !profileRoot) throw new Error('Base UI preparation requires appRoot and profileRoot');
  const resolvedAppRoot = await realpath(appRoot);
  const resolvedProfileRoot = await realpath(profileRoot);
  const profileManifest = JSON.parse(await readFile(path.join(resolvedProfileRoot, 'manifest.json'), 'utf8'));
  if (profileManifest.preparedBaseUi.package !== BASE_UI_PACKAGE || profileManifest.preparedBaseUi.version !== BASE_UI_VERSION) {
    throw new Error('Vendored UI profile prepared Base UI identity differs');
  }
  const contracts = await readContracts(resolvedProfileRoot, profileManifest);
  await verifyContractFixtures(resolvedProfileRoot, contracts);
  const contractDigests = Object.fromEntries(
    Object.entries(contracts)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([name, value]) => [name, value.sha256])
  );

  const preparedParent = await ensureAppLocalDirectory(resolvedAppRoot, ['temp', 'spfx-ui-profile']);
  const preparedRoot = path.join(preparedParent, 'base-ui');
  const backupRoot = path.join(preparedParent, '.base-ui-backup');
  const lockRoot = path.join(preparedParent, '.base-ui-prepare-lock');
  const lockOwner = await acquirePreparationLock(lockRoot, onPreparationLockBoundary);

  let stagingRoot;
  let movedPreparedToBackup = false;
  let result;
  let operationError;
  try {
    const installedRoot = await resolveInstalledBaseUi(resolvedAppRoot);
    if (!(await preparedTreeIsCurrent(preparedRoot, contractDigests))) {
      if (await exists(backupRoot)) throw new Error('A retained Base UI backup requires manual inspection');
      stagingRoot = await mkdtemp(path.join(preparedParent, '.base-ui-staging-'));
      await cp(installedRoot, stagingRoot, { recursive: true });
      if ((await treeSha256(stagingRoot)) !== BASE_UI_TREE_SHA256) throw new Error('Staged Base UI tree differs');
      await applySelectValue(resolvedProfileRoot, stagingRoot, contracts['select-value'].contract);
      await applyPopupLifecycle(resolvedProfileRoot, stagingRoot, contracts['popup-lifecycle'].contract);
      await applyIdOwnership(resolvedProfileRoot, stagingRoot, contracts['id-ownership'].contract);
      const preparedTreeSha256 = await treeSha256(stagingRoot);
      await writeFile(
        path.join(stagingRoot, STAMP_FILE),
        `${JSON.stringify({
          schemaVersion: 1,
          package: `${BASE_UI_PACKAGE}@${BASE_UI_VERSION}`,
          sourceTreeSha256: BASE_UI_TREE_SHA256,
          preparedTreeSha256,
          contracts: contractDigests
        })}\n`
      );
      if (await exists(preparedRoot)) {
        await rename(preparedRoot, backupRoot);
        movedPreparedToBackup = true;
      }
      await rename(stagingRoot, preparedRoot);
      stagingRoot = undefined;
      await rm(backupRoot, { recursive: true, force: true });
      movedPreparedToBackup = false;
    }
    result = preparedRoot;
  } catch (error) {
    operationError = error;
    try {
      if (movedPreparedToBackup && !(await exists(preparedRoot)) && (await exists(backupRoot))) {
        await rename(backupRoot, preparedRoot);
      }
    } catch (rollbackError) {
      operationError = new AggregateError([error, rollbackError], 'Base UI preparation and rollback both failed');
    }
  }

  const cleanupErrors = [];
  try {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (!(await releasePreparationLock(lockRoot, lockOwner.token))) {
      throw new Error(`Base UI preparation lock ownership was lost before release at ${lockRoot}`);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  const cleanupError =
    cleanupErrors.length > 1 ? new AggregateError(cleanupErrors, 'Base UI preparation cleanup failed') : cleanupErrors[0];
  if (operationError && cleanupError) {
    throw new AggregateError([operationError, cleanupError], 'Base UI preparation and cleanup both failed');
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return result;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prepared = await prepareSpfxUiProfileBaseUi({
    appRoot: readOption('--app-root'),
    profileRoot: readOption('--profile-root')
  });
  console.log(prepared);
}
