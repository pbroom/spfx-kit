import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { acquireAppExportLock } from '../packages/spfx-tools/src/lib/export/lock.mjs';

const LOCK_ROOT = path.join(tmpdir(), 'spfx-kit-export-locks');
const temporaryDirectories: string[] = [];
const lockDirectories: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    ...lockDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  ]);
});

describe('SPFx export lock', () => {
  it('serializes exports for the same app and releases cleanly', async () => {
    const { appDir } = await createApp();
    const releaseFirst = await acquireAppExportLock(appDir);
    await expect(acquireAppExportLock(appDir)).rejects.toThrow('already running');
    await releaseFirst();

    const releaseSecond = await acquireAppExportLock(appDir);
    await expect(releaseSecond()).resolves.toBeUndefined();
  });

  it('reclaims an empty lock left by an interrupted writer', async () => {
    const { appDir, lockDir } = await createApp();
    await mkdir(lockDir, { recursive: true });

    const release = await acquireAppExportLock(appDir);
    expect(await readOwner(lockDir)).toMatchObject({ pid: process.pid, appRoot: await realpath(appDir) });
    await release();
  });

  it('reclaims a malformed lock', async () => {
    const { appDir, lockDir } = await createApp();
    await mkdir(lockDir, { recursive: true });
    await writeFile(path.join(lockDir, 'malformed.json'), '{not-json');

    const release = await acquireAppExportLock(appDir);
    expect(await readOwner(lockDir)).toMatchObject({ pid: process.pid, appRoot: await realpath(appDir) });
    await release();
  });

  it('reclaims a complete lock whose owner has exited', async () => {
    const { appDir, lockDir } = await createApp();
    await writeLock(lockDir, { token: randomUUID(), pid: 2_147_483_647 });

    const release = await acquireAppExportLock(appDir);
    expect(await readOwner(lockDir)).toMatchObject({ pid: process.pid });
    await release();
  });

  it('does not remove a replacement lock when an old owner releases', async () => {
    const { appDir, lockDir } = await createApp();
    const release = await acquireAppExportLock(appDir);
    const displacedDir = `${lockDir}.displaced`;
    const replacementDir = `${lockDir}.replacement`;
    const replacement = {
      token: randomUUID(),
      pid: process.pid,
      appRoot: await realpath(appDir),
      acquiredAt: new Date().toISOString()
    };
    await writeLock(replacementDir, replacement);
    await rename(lockDir, displacedDir);
    await rename(replacementDir, lockDir);

    await release();

    expect(await readOwner(lockDir)).toEqual(replacement);
    await expect(acquireAppExportLock(appDir)).rejects.toThrow('already running');
    await rm(displacedDir, { recursive: true, force: true });
  });

  it('allows exactly one contender to reclaim a stale lock', async () => {
    const { appDir, lockDir } = await createApp();
    await writeLock(lockDir, { token: randomUUID(), pid: 2_147_483_647 });

    const results = await Promise.allSettled([acquireAppExportLock(appDir), acquireAppExportLock(appDir)]);
    const acquired = results.filter(
      (result): result is PromiseFulfilledResult<() => Promise<void>> => result.status === 'fulfilled'
    );
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(acquired).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toHaveProperty('message', expect.stringContaining('already running'));
    await acquired[0].value();
  });
});

async function createApp() {
  const appDir = await mkdtemp(path.join(tmpdir(), 'spfx-export-lock-'));
  temporaryDirectories.push(appDir);
  await mkdir(path.join(appDir, 'config'));
  const key = createHash('sha256')
    .update(await realpath(appDir))
    .digest('hex');
  const lockDir = path.join(LOCK_ROOT, `${key}.lock`);
  lockDirectories.push(lockDir);
  return { appDir, lockDir };
}

async function writeLock(lockDir: string, owner: { token: string; pid: number; [key: string]: unknown }) {
  await mkdir(lockDir, { recursive: true });
  await writeFile(path.join(lockDir, `${owner.token}.json`), `${JSON.stringify(owner)}\n`);
}

async function readOwner(lockDir: string) {
  const [ownerFileName] = await readdir(lockDir);
  return JSON.parse(await readFile(path.join(lockDir, ownerFileName), 'utf8'));
}
