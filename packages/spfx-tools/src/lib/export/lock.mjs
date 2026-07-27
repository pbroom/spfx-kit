import { createHash } from 'node:crypto';
import { mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LOCK_ROOT = path.join(tmpdir(), 'spfx-kit-export-locks');

export async function acquireAppExportLock(appDir) {
  const appRoot = await realpath(appDir);
  const key = createHash('sha256').update(appRoot).digest('hex');
  const lockFile = path.join(LOCK_ROOT, `${key}.lock`);
  await mkdir(LOCK_ROOT, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockFile, 'wx');
      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, appRoot, acquiredAt: new Date().toISOString() })}\n`
        );
      } finally {
        await handle.close();
      }
      let released = false;
      return async () => {
        if (!released) {
          released = true;
          await rm(lockFile, { force: true });
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      const owner = await readLockOwner(lockFile);
      if (!owner || isProcessAlive(owner.pid)) {
        throw new Error(`Another SPFx export is already running for ${appRoot}`);
      }
      await rm(lockFile, { force: true });
    }
  }
  throw new Error(`Could not acquire SPFx export lock for ${appRoot}`);
}

async function readLockOwner(lockFile) {
  try {
    const owner = JSON.parse(await readFile(lockFile, 'utf8'));
    return Number.isInteger(owner?.pid) && owner.pid > 0 ? owner : null;
  } catch {
    return null;
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
