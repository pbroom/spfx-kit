import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, realpath, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LOCK_ROOT = path.join(tmpdir(), 'spfx-kit-export-locks');
const MAX_ACQUIRE_ATTEMPTS = 8;

export async function acquireAppExportLock(appDir) {
  const appRoot = await realpath(appDir);
  const key = createHash('sha256').update(appRoot).digest('hex');
  const lockDir = path.join(LOCK_ROOT, `${key}.lock`);
  await mkdir(LOCK_ROOT, { recursive: true });

  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    const owner = {
      token: randomUUID(),
      pid: process.pid,
      appRoot,
      acquiredAt: new Date().toISOString(),
    };
    const candidateDir = `${lockDir}.${owner.token}.candidate`;
    const ownerFileName = `${owner.token}.json`;
    await mkdir(candidateDir);
    await writeOwner(path.join(candidateDir, ownerFileName), owner);

    try {
      await rename(candidateDir, lockDir);
      return createReleaseLock(lockDir, ownerFileName);
    } catch (error) {
      if (error?.code !== 'EEXIST' && error?.code !== 'ENOTEMPTY') {
        throw error;
      }
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
    }

    const existingLock = await readLock(lockDir);
    if (!existingLock) {
      continue;
    }
    if (existingLock.owner && isProcessAlive(existingLock.owner.pid)) {
      throw new Error(`Another SPFx export is already running for ${appRoot}`);
    }
    await removeObservedLock(lockDir, existingLock.ownerFileName);
  }

  throw new Error(`Could not acquire SPFx export lock for ${appRoot}`);
}

async function writeOwner(ownerFile, owner) {
  const handle = await open(ownerFile, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function createReleaseLock(lockDir, ownerFileName) {
  let released = false;
  return async () => {
    if (released) {
      return;
    }

    try {
      await unlink(path.join(lockDir, ownerFileName));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        released = true;
        return;
      }
      throw error;
    }
    released = true;
    await removeEmptyLockDir(lockDir);
  };
}

async function readLock(lockDir) {
  let entries;
  try {
    entries = await readdir(lockDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  if (entries.length === 0) {
    return { owner: null, ownerFileName: null };
  }
  if (entries.length !== 1 || !entries[0].isFile()) {
    return { owner: null, ownerFileName: null };
  }

  const ownerFileName = entries[0].name;
  try {
    const owner = JSON.parse(await readFile(path.join(lockDir, ownerFileName), 'utf8'));
    const expectedFileName = `${owner?.token}.json`;
    return {
      owner:
        Number.isInteger(owner?.pid) && owner.pid > 0 && ownerFileName === expectedFileName
          ? owner
          : null,
      ownerFileName,
    };
  } catch {
    return { owner: null, ownerFileName };
  }
}

async function removeObservedLock(lockDir, ownerFileName) {
  if (ownerFileName) {
    try {
      await unlink(path.join(lockDir, ownerFileName));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return removeEmptyLockDir(lockDir);
}

async function removeEmptyLockDir(lockDir) {
  try {
    await rmdir(lockDir);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return true;
    }
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}
