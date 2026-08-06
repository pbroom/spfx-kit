import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { replaceGeneratedPaths } from '../packages/ui-profile/scripts/lib/replace-generated.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  acquirePreparationLock,
  acquireBaseUiRecoveryClaim,
  beginBaseUiPreparationTransaction,
  finalizeBaseUiPreparation,
  recoverRetainedBaseUiPreparation,
  releasePreparationLock
} from '../packages/ui-profile/scripts/lib/preparation-lock.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { transformPopupStoreUtils } from '../packages/ui-profile/scripts/transform-base-ui-popup-lifecycle.mjs';

const temporaryRoots: string[] = [];
const require = createRequire(import.meta.url);
const installedBaseUiRoot = path.dirname(require.resolve('@base-ui/react/package.json'));
const uiProfileRoot = path.resolve('packages/ui-profile');
const compatibilityContractPaths = [
  path.resolve('packages/ui-profile/compat/base-ui-1.6.0/select-value/contract.json'),
  path.resolve('packages/ui-profile/compat/base-ui-1.6.0/popup-lifecycle/contract.json')
];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<{ root: string; packageRoot: string; stagingRoot: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'ui-profile-replace-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'package');
  const stagingRoot = path.join(root, 'staging');
  await mkdir(packageRoot, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });
  return { root, packageRoot, stagingRoot };
}

async function createValidBaseUiCopy(target: string, sentinel: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await copyFile(path.join(installedBaseUiRoot, 'package.json'), path.join(target, 'package.json'));
  const contracts = await Promise.all(
    compatibilityContractPaths.map(async (contractPath) => JSON.parse(await readFile(contractPath)))
  );
  for (const contract of contracts) {
    for (const file of contract.files) {
      const destination = path.join(target, file.installedPath);
      await mkdir(path.dirname(destination), { recursive: true });
      if (file.transformedFileSha256) {
        const [source, originalFragment, transformedFragment] = await Promise.all([
          readFile(path.join(installedBaseUiRoot, file.installedPath), 'utf8'),
          readFile(path.join(uiProfileRoot, file.originalPath), 'utf8'),
          readFile(path.join(uiProfileRoot, file.transformedPath), 'utf8')
        ]);
        await writeFile(destination, transformPopupStoreUtils(source, originalFragment.trimEnd(), transformedFragment.trimEnd()));
      } else {
        await copyFile(path.join(uiProfileRoot, file.transformedPath), destination);
      }
    }
  }
  await writeFile(path.join(target, 'sentinel.txt'), sentinel);
}

describe('UI profile generated artifact replacement', () => {
  it('replaces a complete staged batch and removes backup state', async () => {
    const { packageRoot, stagingRoot } = await fixtureRoot();
    await writeFile(path.join(packageRoot, 'one.txt'), 'old one');
    await mkdir(path.join(packageRoot, 'nested'), { recursive: true });
    await writeFile(path.join(packageRoot, 'nested/two.txt'), 'old two');
    await writeFile(path.join(stagingRoot, 'one.txt'), 'new one');
    await mkdir(path.join(stagingRoot, 'nested'), { recursive: true });
    await writeFile(path.join(stagingRoot, 'nested/two.txt'), 'new two');

    await replaceGeneratedPaths({
      packageRoot,
      stagingRoot,
      generatedPaths: ['one.txt', 'nested/two.txt'],
      legacyTestOnly: true
    });

    expect(await readFile(path.join(packageRoot, 'one.txt'), 'utf8')).toBe('new one');
    expect(await readFile(path.join(packageRoot, 'nested/two.txt'), 'utf8')).toBe('new two');
    expect((await readdir(packageRoot)).some((name) => name.startsWith('.profile-backup-'))).toBe(false);
  });

  it('restores the prior batch when a later replacement fails', async () => {
    const { packageRoot, stagingRoot } = await fixtureRoot();
    await writeFile(path.join(packageRoot, 'one.txt'), 'old one');
    await writeFile(path.join(packageRoot, 'blocked'), 'not a directory');
    await writeFile(path.join(stagingRoot, 'one.txt'), 'new one');
    await mkdir(path.join(stagingRoot, 'blocked'), { recursive: true });
    await writeFile(path.join(stagingRoot, 'blocked/two.txt'), 'new two');

    await expect(
      replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths: ['one.txt', 'blocked/two.txt'],
        legacyTestOnly: true
      })
    ).rejects.toThrow();

    expect(await readFile(path.join(packageRoot, 'one.txt'), 'utf8')).toBe('old one');
    expect(await readFile(path.join(packageRoot, 'blocked'), 'utf8')).toBe('not a directory');
    expect((await readdir(packageRoot)).some((name) => name.startsWith('.profile-backup-'))).toBe(false);
  });

  it('rejects unsafe and duplicate replacement paths before mutation', async () => {
    const { packageRoot, stagingRoot } = await fixtureRoot();
    await writeFile(path.join(packageRoot, 'one.txt'), 'old one');
    await writeFile(path.join(stagingRoot, 'one.txt'), 'new one');

    await expect(
      replaceGeneratedPaths({ packageRoot, stagingRoot, generatedPaths: ['../escape'], legacyTestOnly: true })
    ).rejects.toThrow('Unsafe');
    await expect(
      replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths: ['one.txt', 'one.txt'],
        legacyTestOnly: true
      })
    ).rejects.toThrow('unique');
    expect(await readFile(path.join(packageRoot, 'one.txt'), 'utf8')).toBe('old one');
  });

  it('preserves the backup when replacement and rollback both fail', async () => {
    const { packageRoot, stagingRoot } = await fixtureRoot();
    await writeFile(path.join(packageRoot, 'one.txt'), 'old one');
    await writeFile(path.join(packageRoot, 'blocked'), 'not a directory');
    await writeFile(path.join(stagingRoot, 'one.txt'), 'new one');
    await mkdir(path.join(stagingRoot, 'blocked'), { recursive: true });
    await writeFile(path.join(stagingRoot, 'blocked/two.txt'), 'new two');

    const operation = replaceGeneratedPaths({
      packageRoot,
      stagingRoot,
      generatedPaths: ['one.txt', 'blocked/two.txt'],
      legacyTestOnly: true,
      fileSystem: {
        rename: async (from: string, to: string) => {
          if (from.includes('.profile-backup-') && from.endsWith('one.txt') && to === path.join(packageRoot, 'one.txt')) {
            throw new Error('injected rollback failure');
          }
          await rename(from, to);
        }
      }
    });
    await expect(operation).rejects.toThrow('backup preserved at');

    const backup = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-backup-'));
    expect(backup).toBeDefined();
    expect(await readFile(path.join(packageRoot, backup!, 'one.txt'), 'utf8')).toBe('old one');
  });
});

async function journaledRecoveryFixture(): Promise<{
  root: string;
  preparedRoot: string;
  backupRoot: string;
  stagingRoot: string;
  lockRoot: string;
  owner: { token: string };
}> {
  const { root } = await fixtureRoot();
  const preparedRoot = path.join(root, 'base-ui');
  const backupRoot = path.join(root, '.base-ui-backup');
  const stagingRoot = path.join(root, '.base-ui-staging-kill-point');
  const lockRoot = path.join(root, '.base-ui-prepare-lock');
  await createValidBaseUiCopy(preparedRoot, 'old');
  await createValidBaseUiCopy(stagingRoot, 'new');
  const owner = await acquirePreparationLock(lockRoot, { pid: 101, token: 'journal-owner' });
  expect(
    await beginBaseUiPreparationTransaction(lockRoot, owner.token, {
      preparedRoot,
      backupRoot,
      stagingRoot,
      hadPrepared: true
    })
  ).toBe(true);
  return { root, preparedRoot, backupRoot, stagingRoot, lockRoot, owner };
}

describe('Base UI preparation lock transaction', () => {
  it('publishes a complete lock directory atomically and reports the live winner', async () => {
    const { root } = await fixtureRoot();
    const lockRoot = path.join(root, '.base-ui-prepare-lock');
    const attempts = await Promise.allSettled([
      acquirePreparationLock(lockRoot, {
        pid: 101,
        token: 'concurrent-owner-a',
        startedAt: '2026-08-06T00:00:00.000Z',
        isProcessAlive: () => true
      }),
      acquirePreparationLock(lockRoot, {
        pid: 202,
        token: 'concurrent-owner-b',
        startedAt: '2026-08-06T00:00:01.000Z',
        isProcessAlive: () => true
      })
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const winner = fulfilled[0].value;
    expect(rejected[0].reason.message).toContain(`Another Base UI preparation is already in progress (pid ${winner.pid}`);
    expect(JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8')).token).toBe(winner.token);
    expect((await readdir(root)).some((name) => name.startsWith('.base-ui-prepare-lock.acquire-'))).toBe(false);
    expect(await releasePreparationLock(lockRoot, winner.token)).toBe(true);
  });

  it('allows only the claimed recoverer to mutate and release a stale transaction', async () => {
    const fixture = await journaledRecoveryFixture();
    let recoveryClaimed!: () => void;
    let resumeRecovery!: () => void;
    const recoveryClaimedPromise = new Promise<void>((resolve) => {
      recoveryClaimed = resolve;
    });
    const resumeRecoveryPromise = new Promise<void>((resolve) => {
      resumeRecovery = resolve;
    });
    let paused = false;
    const firstRecovery = recoverRetainedBaseUiPreparation({
      lockRoot: fixture.lockRoot,
      preparedRoot: fixture.preparedRoot,
      backupRoot: fixture.backupRoot,
      isProcessAlive: () => false,
      fileSystem: {
        pathExists: async (target: string) => {
          if (target === fixture.preparedRoot && !paused) {
            paused = true;
            recoveryClaimed();
            await resumeRecoveryPromise;
          }
          try {
            await access(target);
            return true;
          } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
            throw error;
          }
        }
      }
    });
    await recoveryClaimedPromise;

    await expect(
      recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).rejects.toThrow('Another Base UI recovery is already in progress');
    await expect(acquirePreparationLock(fixture.lockRoot, { isProcessAlive: () => false })).rejects.toThrow('Stale');

    resumeRecovery();
    expect(await firstRecovery).toEqual({ recovered: true, state: 'pre-move' });
    const replacement = await acquirePreparationLock(fixture.lockRoot, { token: 'replacement-owner' });
    expect(await releasePreparationLock(fixture.lockRoot, fixture.owner.token)).toBe(false);
    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).toBe(false);
    expect(JSON.parse(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).token).toBe(replacement.token);
    expect(await releasePreparationLock(fixture.lockRoot, replacement.token)).toBe(true);
  });

  it('cannot publish a stale owner claim into a replacement lock', async () => {
    const fixture = await journaledRecoveryFixture();
    let staleOwnerRead!: () => void;
    let resumeStaleRecoverer!: () => void;
    const staleOwnerReadPromise = new Promise<void>((resolve) => {
      staleOwnerRead = resolve;
    });
    const resumeStaleRecovererPromise = new Promise<void>((resolve) => {
      resumeStaleRecoverer = resolve;
    });
    const staleRecoverer = recoverRetainedBaseUiPreparation({
      lockRoot: fixture.lockRoot,
      preparedRoot: fixture.preparedRoot,
      backupRoot: fixture.backupRoot,
      isProcessAlive: () => false,
      beforeRecoveryClaim: async () => {
        staleOwnerRead();
        await resumeStaleRecovererPromise;
      }
    });
    await staleOwnerReadPromise;

    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).toEqual({ recovered: true, state: 'pre-move' });
    const replacement = await acquirePreparationLock(fixture.lockRoot, { token: 'replacement-after-recovery' });

    resumeStaleRecoverer();
    await expect(staleRecoverer).rejects.toThrow('owner changed before recovery claim publication');
    expect((await readdir(fixture.lockRoot)).some((name) => name.includes('recovery-claim'))).toBe(false);
    expect(JSON.parse(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).token).toBe(replacement.token);

    await createValidBaseUiCopy(fixture.stagingRoot, 'replacement staging');
    expect(
      await beginBaseUiPreparationTransaction(fixture.lockRoot, replacement.token, {
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        stagingRoot: fixture.stagingRoot,
        hadPrepared: true
      })
    ).toBe(true);
    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).toEqual({ recovered: true, state: 'pre-move' });
    await expect(readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).rejects.toThrow();
  });

  it('removes only its own published claim when post-publication work fails', async () => {
    const fixture = await journaledRecoveryFixture();
    await expect(
      acquireBaseUiRecoveryClaim(fixture.lockRoot, fixture.owner.token, {
        token: 'failed-published-claim',
        afterPublish: async () => {
          throw new Error('injected post-publication failure');
        }
      })
    ).rejects.toThrow('injected post-publication failure');
    expect(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).toContain(fixture.owner.token);
    await expect(readFile(path.join(fixture.lockRoot, 'recovery-claim/claim.json'), 'utf8')).rejects.toThrow();

    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).toEqual({ recovered: true, state: 'pre-move' });
  });

  it('atomically quarantines a stale recovery claim and takes it over', async () => {
    const fixture = await journaledRecoveryFixture();
    expect(
      await acquireBaseUiRecoveryClaim(fixture.lockRoot, fixture.owner.token, {
        pid: 424242,
        token: 'stale-recovery-claim',
        startedAt: '2026-08-06T00:00:00.000Z'
      })
    ).toMatchObject({ token: 'stale-recovery-claim' });

    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false,
        isRecoveryProcessAlive: () => false
      })
    ).toEqual({ recovered: true, state: 'pre-move' });
    expect(await readFile(path.join(fixture.preparedRoot, 'sentinel.txt'), 'utf8')).toBe('old');
    await expect(readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).rejects.toThrow();
    expect((await readdir(fixture.root)).some((name) => name.includes('recovery-claim-stale'))).toBe(false);
  });

  it.each([
    ['pid', { pid: 0, token: 'owner', startedAt: '2026-08-06T00:00:00.000Z' }, 'positive safe integer'],
    ['token', { pid: 101, token: '', startedAt: '2026-08-06T00:00:00.000Z' }, 'nonempty string'],
    ['startedAt', { pid: 101, token: 'owner', startedAt: 'not-a-date' }, 'valid date']
  ])('rejects malformed owner %s before liveness or mutation', async (_field, malformedOwner, expectedMessage) => {
    const { root } = await fixtureRoot();
    const lockRoot = path.join(root, `.malformed-${_field}.lock`);
    await mkdir(lockRoot);
    await writeFile(path.join(lockRoot, 'owner.json'), `${JSON.stringify(malformedOwner)}\n`);
    let livenessChecks = 0;
    const failure = await acquirePreparationLock(path.join(root, `.malformed-${_field}.lock`), {
      isProcessAlive: () => {
        livenessChecks += 1;
        return true;
      }
    }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { cause?: Error }).cause?.message).toContain(expectedMessage);
    expect(livenessChecks).toBe(0);
    expect(JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'))).toEqual(malformedOwner);
    expect((await readdir(root)).some((name) => name.includes('.acquire-'))).toBe(false);
  });

  it.each([
    ['pre-move', async (fixture: Awaited<ReturnType<typeof journaledRecoveryFixture>>) => fixture, 'old'],
    [
      'backup-only',
      async (fixture: Awaited<ReturnType<typeof journaledRecoveryFixture>>) => {
        await rename(fixture.preparedRoot, fixture.backupRoot);
        return fixture;
      },
      'old'
    ],
    [
      'prepared-and-backup',
      async (fixture: Awaited<ReturnType<typeof journaledRecoveryFixture>>) => {
        await rename(fixture.preparedRoot, fixture.backupRoot);
        await rename(fixture.stagingRoot, fixture.preparedRoot);
        return fixture;
      },
      'new'
    ],
    [
      'success',
      async (fixture: Awaited<ReturnType<typeof journaledRecoveryFixture>>) => {
        await rename(fixture.preparedRoot, fixture.backupRoot);
        await rename(fixture.stagingRoot, fixture.preparedRoot);
        await rm(fixture.backupRoot, { recursive: true });
        return fixture;
      },
      'new'
    ]
  ])('recovers the %s kill-point state before another preparation', async (expectedState, arrange, expectedSentinel) => {
    const fixture = await arrange(await journaledRecoveryFixture());
    const recovery = await recoverRetainedBaseUiPreparation({
      lockRoot: fixture.lockRoot,
      preparedRoot: fixture.preparedRoot,
      backupRoot: fixture.backupRoot,
      isProcessAlive: () => false
    });

    expect(recovery).toEqual({ recovered: true, state: expectedState });
    expect(await readFile(path.join(fixture.preparedRoot, 'sentinel.txt'), 'utf8')).toBe(expectedSentinel);
    await expect(readFile(path.join(fixture.backupRoot, 'sentinel.txt'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(fixture.stagingRoot, 'sentinel.txt'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).rejects.toThrow();
  });

  it.each([
    ['pre-move', false],
    ['success', true]
  ])('recovers a fresh-install %s state', async (expectedState, promoted) => {
    const { root } = await fixtureRoot();
    const preparedRoot = path.join(root, 'base-ui');
    const backupRoot = path.join(root, '.base-ui-backup');
    const stagingRoot = path.join(root, '.base-ui-staging-fresh');
    const lockRoot = path.join(root, '.base-ui-prepare-lock');
    await createValidBaseUiCopy(stagingRoot, 'fresh');
    const owner = await acquirePreparationLock(lockRoot, { pid: 101, token: 'fresh-owner' });
    expect(
      await beginBaseUiPreparationTransaction(lockRoot, owner.token, {
        preparedRoot,
        backupRoot,
        stagingRoot,
        hadPrepared: false
      })
    ).toBe(true);
    if (promoted) await rename(stagingRoot, preparedRoot);

    expect(
      await recoverRetainedBaseUiPreparation({
        lockRoot,
        preparedRoot,
        backupRoot,
        isProcessAlive: () => false
      })
    ).toEqual({ recovered: true, state: expectedState });
    if (promoted) expect(await readFile(path.join(preparedRoot, 'sentinel.txt'), 'utf8')).toBe('fresh');
    else await expect(readFile(path.join(preparedRoot, 'sentinel.txt'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(stagingRoot, 'sentinel.txt'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(lockRoot, 'owner.json'), 'utf8')).rejects.toThrow();
  });

  it('fails closed and preserves every path for an ambiguous state', async () => {
    const fixture = await journaledRecoveryFixture();
    await createValidBaseUiCopy(fixture.backupRoot, 'unexpected backup');

    await expect(
      recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).rejects.toThrow('ambiguous');
    expect(await readFile(path.join(fixture.preparedRoot, 'sentinel.txt'), 'utf8')).toBe('old');
    expect(await readFile(path.join(fixture.backupRoot, 'sentinel.txt'), 'utf8')).toBe('unexpected backup');
    expect(await readFile(path.join(fixture.stagingRoot, 'sentinel.txt'), 'utf8')).toBe('new');
    expect(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).toContain('transaction');
    expect(await releasePreparationLock(fixture.lockRoot, fixture.owner.token)).toBe(true);
  });

  it('rejects a corrupted transformed declaration without deleting recovery state', async () => {
    const fixture = await journaledRecoveryFixture();
    await rm(fixture.stagingRoot, { recursive: true });
    const selectContract = JSON.parse(await readFile(compatibilityContractPaths[0], 'utf8'));
    const corruptPath = path.join(fixture.preparedRoot, selectContract.files[0].installedPath);
    await writeFile(corruptPath, 'corrupt declaration');

    await expect(
      recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).rejects.toThrow('digest differs');
    expect(await readFile(corruptPath, 'utf8')).toBe('corrupt declaration');
    expect(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).toContain('transaction');
    expect(await releasePreparationLock(fixture.lockRoot, fixture.owner.token)).toBe(true);
  });

  it('rejects a missing transformed runtime file without deleting recovery state', async () => {
    const fixture = await journaledRecoveryFixture();
    await rm(fixture.stagingRoot, { recursive: true });
    const popupContract = JSON.parse(await readFile(compatibilityContractPaths[1], 'utf8'));
    const missingPath = path.join(fixture.preparedRoot, popupContract.files[0].installedPath);
    await rm(missingPath);

    await expect(
      recoverRetainedBaseUiPreparation({
        lockRoot: fixture.lockRoot,
        preparedRoot: fixture.preparedRoot,
        backupRoot: fixture.backupRoot,
        isProcessAlive: () => false
      })
    ).rejects.toThrow('unreadable');
    await expect(readFile(missingPath)).rejects.toThrow();
    expect(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8')).toContain('transaction');
    expect(await releasePreparationLock(fixture.lockRoot, fixture.owner.token)).toBe(true);
  });

  it('aggregates promotion, rollback, and cleanup failures and retains the journal', async () => {
    const fixture = await journaledRecoveryFixture();
    await rename(fixture.preparedRoot, fixture.backupRoot);
    const failure = await finalizeBaseUiPreparation({
      operationFailure: new Error('injected promotion failure'),
      stagingRoot: fixture.stagingRoot,
      preparedRoot: fixture.preparedRoot,
      backupRoot: fixture.backupRoot,
      transactionStarted: true,
      lockRoot: fixture.lockRoot,
      token: fixture.owner.token,
      fileSystem: {
        rename: async (from: string, to: string) => {
          if (from === fixture.backupRoot && to === fixture.preparedRoot) throw new Error('injected rollback failure');
          await rename(from, to);
        },
        rm: async (target: string, options: Parameters<typeof rm>[1]) => {
          if (target === fixture.stagingRoot) throw new Error('injected cleanup failure');
          await rm(target, options);
        }
      }
    }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => error.message)).toEqual([
      'injected promotion failure',
      'injected rollback failure',
      'injected cleanup failure'
    ]);
    const retainedOwner = JSON.parse(await readFile(path.join(fixture.lockRoot, 'owner.json'), 'utf8'));
    expect(retainedOwner.transaction.recoveryRequired).toBe(true);
    expect(await readFile(path.join(fixture.backupRoot, 'sentinel.txt'), 'utf8')).toBe('old');
    expect(await readFile(path.join(fixture.stagingRoot, 'sentinel.txt'), 'utf8')).toBe('new');
    expect(await releasePreparationLock(fixture.lockRoot, fixture.owner.token)).toBe(true);
  });

  it('aggregates a pre-journal cleanup failure but still releases its owned lock', async () => {
    const { root } = await fixtureRoot();
    const stagingRoot = path.join(root, '.base-ui-staging-pre-journal');
    const lockRoot = path.join(root, '.base-ui-prepare-lock');
    await mkdir(stagingRoot);
    const owner = await acquirePreparationLock(lockRoot, { token: 'pre-journal-owner' });
    const failure = await finalizeBaseUiPreparation({
      operationFailure: new Error('injected transform failure'),
      stagingRoot,
      preparedRoot: path.join(root, 'base-ui'),
      backupRoot: path.join(root, '.base-ui-backup'),
      transactionStarted: false,
      lockRoot,
      token: owner.token,
      fileSystem: {
        rm: async () => {
          throw new Error('injected staging cleanup failure');
        }
      }
    }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect((failure as AggregateError).errors.map((error) => error.message)).toEqual([
      'injected transform failure',
      'injected staging cleanup failure'
    ]);
    await expect(readFile(path.join(lockRoot, 'owner.json'), 'utf8')).rejects.toThrow();
  });
});
