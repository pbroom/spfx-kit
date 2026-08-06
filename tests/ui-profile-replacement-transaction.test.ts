import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  createGeneratedProfileStaging,
  recoverGeneratedReplacement,
  withGeneratedProfileSession
} from '../packages/ui-profile/scripts/lib/generation-transaction.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { replaceGeneratedPaths } from '../packages/ui-profile/scripts/lib/replace-generated.mjs';

const temporaryRoots: string[] = [];
const generatedPaths = ['snapshots', 'normalized', 'profile.json'];
const transactionModuleUrl = pathToFileURL(path.resolve('packages/ui-profile/scripts/lib/generation-transaction.mjs')).href;
const replacementModuleUrl = pathToFileURL(path.resolve('packages/ui-profile/scripts/lib/replace-generated.mjs')).href;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeCollection(root: string, version: string): Promise<void> {
  await mkdir(path.join(root, 'snapshots', 'raw'), { recursive: true });
  await mkdir(path.join(root, 'snapshots', 'canonical'), { recursive: true });
  await mkdir(path.join(root, 'normalized'), { recursive: true });
  await writeFile(path.join(root, 'snapshots', 'raw', 'version.txt'), version);
  await writeFile(path.join(root, 'snapshots', 'canonical', 'version.txt'), version);
  await writeFile(path.join(root, 'normalized', 'version.txt'), version);
  await writeFile(path.join(root, 'profile.json'), `${JSON.stringify({ version })}\n`);
}

async function fixture(): Promise<{ root: string; packageRoot: string; stagingRoot: string; token: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'ui-profile-generation-transaction-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'package');
  await mkdir(packageRoot, { recursive: true });
  await makeCollection(packageRoot, 'old');
  const token = randomUUID();
  const stagingRoot = path.join(packageRoot, `.profile-update-${token}-external`);
  return { root, packageRoot, stagingRoot, token };
}

async function collectionVersion(packageRoot: string): Promise<string[]> {
  return Promise.all([
    readFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'utf8'),
    readFile(path.join(packageRoot, 'snapshots', 'canonical', 'version.txt'), 'utf8'),
    readFile(path.join(packageRoot, 'normalized', 'version.txt'), 'utf8'),
    readFile(path.join(packageRoot, 'profile.json'), 'utf8').then((bytes) => JSON.parse(bytes).version)
  ]);
}

function childSource(): string {
  return `
    import { mkdir, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    import { createGeneratedProfileStaging, withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    import { replaceGeneratedPaths } from ${JSON.stringify(replacementModuleUrl)};
    const [packageRoot, token, requestedBoundary] = process.argv.slice(1);
    await withGeneratedProfileSession({ packageRoot, operation: 'update', lockOptions: { token } }, async (generationSession) => {
      const stagingRoot = await createGeneratedProfileStaging(generationSession);
      await mkdir(path.join(stagingRoot, 'snapshots', 'raw'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'snapshots', 'canonical'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'normalized'), { recursive: true });
      await writeFile(path.join(stagingRoot, 'snapshots', 'raw', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'snapshots', 'canonical', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'normalized', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'profile.json'), JSON.stringify({ version: 'new' }) + '\\n');
      await replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths: ['snapshots', 'normalized', 'profile.json'],
        generationSession,
        onBoundary: async (boundary) => {
          if (boundary !== requestedBoundary) return;
          process.send?.({ boundary });
          await new Promise(() => {});
        }
      });
    });
  `;
}

function preJournalChildSource(): string {
  return `
    import { createGeneratedProfileStaging, withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    const [packageRoot, token] = process.argv.slice(1);
    await withGeneratedProfileSession({ packageRoot, operation: 'update', lockOptions: { token } }, async (generationSession) => {
      await createGeneratedProfileStaging(generationSession);
      process.send?.({ boundary: 'staging-created' });
      await new Promise(() => {});
    });
  `;
}

function recoveryChildSource(): string {
  return `
    import { recoverGeneratedReplacement } from ${JSON.stringify(transactionModuleUrl)};
    const [packageRoot, requestedBoundary] = process.argv.slice(1);
    await recoverGeneratedReplacement({
      packageRoot,
      onRecoveryBoundary: async (boundary) => {
        if (boundary !== requestedBoundary) return;
        process.send?.({ boundary });
        await new Promise(() => {});
      }
    });
  `;
}

function lockHolderSource(): string {
  return `
    import { withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    const [packageRoot] = process.argv.slice(1);
    await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {
      process.send?.({ boundary: 'locked' });
      await new Promise((resolve) => process.once('message', (message) => message === 'release' && resolve()));
    });
  `;
}

function lockContenderSource(): string {
  return `
    import { withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    const [packageRoot] = process.argv.slice(1);
    try {
      await withGeneratedProfileSession({ packageRoot, operation: 'regenerate' }, async () => {
        process.send?.({ boundary: 'entered' });
      });
      process.send?.({ boundary: 'unexpected-success' });
    } catch (error) {
      process.send?.({ boundary: 'blocked', error: error instanceof Error ? error.message : String(error) });
    }
  `;
}

async function waitForBoundary(child: ChildProcess, boundary: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const onMessage = (message: unknown): void => {
      if (typeof message === 'object' && message !== null && 'boundary' in message && message.boundary === boundary) {
        cleanup();
        resolve();
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(new Error(`transaction child exited before ${boundary}: code=${code} signal=${signal}\n${stderr}`));
    };
    const cleanup = (): void => {
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.on('message', onMessage);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function waitForClose(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
}

async function killAtBoundary(packageRoot: string, token: string, boundary: string): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', childSource(), packageRoot, token, boundary], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  await waitForBoundary(child, boundary);
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  expect(child.kill('SIGKILL')).toBe(true);
  await closed;
}

async function killBeforeJournal(packageRoot: string, token: string): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', preJournalChildSource(), packageRoot, token], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  await waitForBoundary(child, 'staging-created');
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  expect(child.kill('SIGKILL')).toBe(true);
  await closed;
}

async function killRecoveryAtBoundary(packageRoot: string, boundary: string): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', recoveryChildSource(), packageRoot, boundary], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  await waitForBoundary(child, boundary);
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  expect(child.kill('SIGKILL')).toBe(true);
  await closed;
}

describe('generated profile full-command transaction', () => {
  it('rejects production replacement without a full-command generation session', async () => {
    const { packageRoot, stagingRoot } = await fixture();
    await expect(replaceGeneratedPaths({ packageRoot, stagingRoot, generatedPaths })).rejects.toThrow(
      'requires a full-command generation session'
    );
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
  });

  it('holds the generation lock before source reads and staging', async () => {
    const { packageRoot } = await fixture();
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {
      entered();
      await releasePromise;
    });
    await enteredPromise;
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'regenerate' }, async () => {})).rejects.toThrow(
      'Another generated profile session is active'
    );
    release();
    await first;
  });

  it('blocks a separate regenerate process before reads while an update session owns the lock', async () => {
    const { packageRoot } = await fixture();
    const holder = spawn(process.execPath, ['--input-type=module', '-e', lockHolderSource(), packageRoot], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    await waitForBoundary(holder, 'locked');
    const contender = spawn(process.execPath, ['--input-type=module', '-e', lockContenderSource(), packageRoot], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    await waitForBoundary(contender, 'blocked');
    await waitForClose(contender);
    holder.send('release');
    await waitForClose(holder);
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
  });

  it('publishes one complete collection and removes owned transaction state', async () => {
    const { packageRoot, token } = await fixture();
    await withGeneratedProfileSession(
      { packageRoot, operation: 'update', lockOptions: { token } },
      async (generationSession: unknown) => {
        const stagingRoot = await createGeneratedProfileStaging(generationSession);
        await makeCollection(stagingRoot, 'new');
        await replaceGeneratedPaths({ packageRoot, stagingRoot, generatedPaths, generationSession });
      }
    );
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('accepts the canonical POSIX regenerate inventory without replacing raw snapshots', async () => {
    const { packageRoot } = await fixture();
    const token = randomUUID();
    await withGeneratedProfileSession(
      { packageRoot, operation: 'regenerate', lockOptions: { token } },
      async (generationSession: unknown) => {
        const stagingRoot = await createGeneratedProfileStaging(generationSession);
        await makeCollection(stagingRoot, 'new');
        await replaceGeneratedPaths({
          packageRoot,
          stagingRoot,
          generatedPaths: ['snapshots/canonical', 'normalized', 'profile.json'],
          generationSession
        });
      }
    );
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'new', 'new', 'new']);
  });

  it('rejects a symlinked owner-derived staging root before journaling or mutation', async () => {
    const { packageRoot, stagingRoot, token, root } = await fixture();
    const external = path.join(root, 'external-staging');
    await makeCollection(external, 'external');
    await symlink(external, stagingRoot, 'dir');

    let failure: unknown;
    try {
      await withGeneratedProfileSession(
        { packageRoot, operation: 'update', lockOptions: { token } },
        async (generationSession: unknown) => {
          await replaceGeneratedPaths({ packageRoot, stagingRoot, generatedPaths, generationSession });
        }
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.some((error) => String(error).includes('outside its owner lock'))).toBe(true);
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
    expect(await collectionVersion(external)).toEqual(['external', 'external', 'external', 'external']);
  });

  it('removes lock-owned staging after a hard kill before transaction journaling', async () => {
    const { packageRoot, token } = await fixture();
    await killBeforeJournal(packageRoot, token);

    expect(await recoverGeneratedReplacement({ packageRoot })).toEqual({ recovered: true, state: 'no-transaction' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('recovers every hard-kill move boundary to an exact old or new collection', async () => {
    const boundaries = [
      'journaled',
      'backup-created',
      'backed-up:snapshots',
      'backed-up:normalized',
      'backed-up:profile.json',
      'installed:snapshots',
      'installed:normalized',
      'installed:profile.json',
      'committed',
      'backup-cleaned',
      'staging-cleaned',
      'journal-cleared'
    ];

    for (const boundary of boundaries) {
      const { packageRoot, token } = await fixture();
      await killAtBoundary(packageRoot, token, boundary);
      const recovery = await recoverGeneratedReplacement({ packageRoot });
      expect(recovery).toMatchObject({ recovered: true });
      const expected = ['committed', 'backup-cleaned', 'staging-cleaned', 'journal-cleared'].includes(boundary) ? 'new' : 'old';
      expect(await collectionVersion(packageRoot), boundary).toEqual([expected, expected, expected, expected]);
      expect(
        (await readdir(packageRoot)).filter((name) => name.startsWith('.profile-')),
        boundary
      ).toEqual([]);
    }
  }, 30_000);

  it('preserves a journaled transaction when recovery bytes are not an exact old or new collection', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'tampered');

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('digest differs');
    expect(await readFile(path.join(packageRoot, '.profile-generation-lock', 'owner.json'), 'utf8')).toContain(
      'ui-profile-generation-v1'
    );
    expect((await readdir(path.join(packageRoot, '.profile-generation-lock', 'backup'))).length).toBeGreaterThan(0);

    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'new');
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
  });

  it('resumes after a hard kill during recovery discard cleanup', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots');

    expect(await recoverGeneratedReplacement({ packageRoot })).toMatchObject({ recovered: true, state: 'rolled-back' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('fails closed on a path-injected stale journal without mutating the collection', async () => {
    const { packageRoot, token } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    await killAtBoundary(packageRoot, token, 'journaled');
    const ownerPath = path.join(lockRoot, 'owner.json');
    const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
    owner.transaction.stagingRoot = path.join(tmpdir(), '.profile-injected-staging');
    await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);

    await expect(recoverGeneratedReplacement({ packageRoot, isProcessAlive: () => false })).rejects.toThrow(
      'lock metadata is unreadable'
    );
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
    expect(await readFile(ownerPath, 'utf8')).toContain('.profile-injected-staging');
  });

  it('rejects a forged tracked target even when its journal maps remain schema-valid', async () => {
    const { packageRoot, token } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const sentinelPath = path.join(packageRoot, 'package.json');
    await writeFile(sentinelPath, '{"private":true}\n');
    await killAtBoundary(packageRoot, token, 'journaled');
    const ownerPath = path.join(lockRoot, 'owner.json');
    const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
    owner.transaction.generatedPaths[0] = 'package.json';
    for (const field of ['existed', 'priorDigests', 'nextDigests']) {
      owner.transaction[field]['package.json'] = owner.transaction[field].snapshots;
      delete owner.transaction[field].snapshots;
    }
    await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);

    await expect(recoverGeneratedReplacement({ packageRoot, isProcessAlive: () => false })).rejects.toThrow(
      'lock metadata is unreadable'
    );
    expect(await readFile(sentinelPath, 'utf8')).toBe('{"private":true}\n');
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old']);
  });
});
