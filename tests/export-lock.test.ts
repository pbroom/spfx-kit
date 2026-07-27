import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { acquireAppExportLock } from '../packages/spfx-tools/src/lib/export/lock.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SPFx export lock', () => {
  it('serializes exports for the same app and releases cleanly', async () => {
    const appDir = await mkdtemp(path.join(tmpdir(), 'spfx-export-lock-'));
    temporaryDirectories.push(appDir);
    await mkdir(path.join(appDir, 'config'));
    const releaseFirst = await acquireAppExportLock(appDir);
    await expect(acquireAppExportLock(appDir)).rejects.toThrow('already running');
    await releaseFirst();

    const releaseSecond = await acquireAppExportLock(appDir);
    await expect(releaseSecond()).resolves.toBeUndefined();
  });
});
