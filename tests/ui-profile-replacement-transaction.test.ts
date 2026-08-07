import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  captureGeneratedProfileTemporaryCandidate,
  createGeneratedProfileStaging,
  generatedProfileIdentityRecord,
  observeGeneratedProfileProcess,
  recoverGeneratedReplacement,
  removeGeneratedProfileTemporaryCandidate,
  startGeneratedProfileLeaseHeartbeat,
  withGeneratedProfileSession
} from '../packages/ui-profile/scripts/lib/generation-transaction.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { replaceGeneratedPaths } from '../packages/ui-profile/scripts/lib/replace-generated.mjs';

const temporaryRoots: string[] = [];
const generatedPaths = ['snapshots', 'normalized', 'generated', 'profile.json', 'provenance.json'];
const transactionModuleUrl = pathToFileURL(path.resolve('packages/ui-profile/scripts/lib/generation-transaction.mjs')).href;
const replacementModuleUrl = pathToFileURL(path.resolve('packages/ui-profile/scripts/lib/replace-generated.mjs')).href;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeCollection(root: string, version: string): Promise<void> {
  await mkdir(path.join(root, 'snapshots', 'raw'), { recursive: true });
  await mkdir(path.join(root, 'snapshots', 'canonical'), { recursive: true });
  await mkdir(path.join(root, 'normalized'), { recursive: true });
  await mkdir(path.join(root, 'generated'), { recursive: true });
  await writeFile(path.join(root, 'snapshots', 'raw', 'version.txt'), version);
  await writeFile(path.join(root, 'snapshots', 'canonical', 'version.txt'), version);
  await writeFile(path.join(root, 'normalized', 'version.txt'), version);
  await writeFile(path.join(root, 'generated', 'version.txt'), version);
  await writeFile(path.join(root, 'profile.json'), `${JSON.stringify({ version })}\n`);
  await writeFile(path.join(root, 'provenance.json'), `${JSON.stringify({ version })}\n`);
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
    readFile(path.join(packageRoot, 'profile.json'), 'utf8').then((bytes) => JSON.parse(bytes).version),
    readFile(path.join(packageRoot, 'provenance.json'), 'utf8').then((bytes) => JSON.parse(bytes).version)
  ]);
}

function childSource(): string {
  return `
    import { mkdir, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    import { createGeneratedProfileStaging, withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    import { replaceGeneratedPaths } from ${JSON.stringify(replacementModuleUrl)};
    const [packageRoot, token, requestedBoundary] = process.argv.slice(1);
    await withGeneratedProfileSession({
      packageRoot,
      operation: 'update',
      lockOptions: { token },
      onReleaseBoundary: async (boundary) => {
        if (boundary !== requestedBoundary) return;
        process.send?.({ boundary });
        await new Promise(() => setInterval(() => {}, 1_000));
      }
    }, async (generationSession) => {
      const stagingRoot = await createGeneratedProfileStaging(generationSession);
      await mkdir(path.join(stagingRoot, 'snapshots', 'raw'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'snapshots', 'canonical'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'normalized'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'generated'), { recursive: true });
      await writeFile(path.join(stagingRoot, 'snapshots', 'raw', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'snapshots', 'canonical', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'normalized', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'generated', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'profile.json'), JSON.stringify({ version: 'new' }) + '\\n');
      await writeFile(path.join(stagingRoot, 'provenance.json'), JSON.stringify({ version: 'new' }) + '\\n');
      await replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths: ['snapshots', 'normalized', 'generated', 'profile.json', 'provenance.json'],
        generationSession,
        onBoundary: async (boundary) => {
          if (boundary !== requestedBoundary) return;
          process.send?.({ boundary });
          await new Promise(() => setInterval(() => {}, 1_000));
        }
      });
    });
  `;
}

function regenerateChildSource(): string {
  return `
    import { mkdir, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    import { createGeneratedProfileStaging, withGeneratedProfileSession } from ${JSON.stringify(transactionModuleUrl)};
    import { replaceGeneratedPaths } from ${JSON.stringify(replacementModuleUrl)};
    const [packageRoot, token, requestedBoundary] = process.argv.slice(1);
    await withGeneratedProfileSession({ packageRoot, operation: 'regenerate', lockOptions: { token } }, async (generationSession) => {
      const stagingRoot = await createGeneratedProfileStaging(generationSession);
      await mkdir(path.join(stagingRoot, 'snapshots', 'canonical'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'normalized'), { recursive: true });
      await mkdir(path.join(stagingRoot, 'generated'), { recursive: true });
      await writeFile(path.join(stagingRoot, 'snapshots', 'canonical', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'normalized', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'generated', 'version.txt'), 'new');
      await writeFile(path.join(stagingRoot, 'profile.json'), JSON.stringify({ version: 'new' }) + '\\n');
      await replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths: ['snapshots/canonical', 'normalized', 'generated', 'profile.json'],
        generationSession,
        onBoundary: async (boundary) => {
          if (boundary !== requestedBoundary) return;
          process.send?.({ boundary });
          await new Promise(() => setInterval(() => {}, 1_000));
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
      await new Promise(() => setInterval(() => {}, 1_000));
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
        await new Promise(() => setInterval(() => {}, 1_000));
      },
      onReleaseBoundary: async (boundary) => {
        if (boundary !== requestedBoundary) return;
        process.send?.({ boundary });
        await new Promise(() => setInterval(() => {}, 1_000));
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

async function killAtBoundary(
  packageRoot: string,
  token: string,
  boundary: string,
  beforeKill: () => Promise<void> = async () => {}
): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', childSource(), packageRoot, token, boundary], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  await waitForBoundary(child, boundary);
  await beforeKill();
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  expect(child.kill('SIGKILL')).toBe(true);
  await closed;
}

async function killRegenerateAtBoundary(packageRoot: string, token: string, boundary: string): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', regenerateChildSource(), packageRoot, token, boundary], {
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

async function killRecoveryAtBoundary(
  packageRoot: string,
  boundary: string,
  beforeKill: () => Promise<void> = async () => {}
): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', recoveryChildSource(), packageRoot, boundary], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  await waitForBoundary(child, boundary);
  await beforeKill();
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  expect(child.kill('SIGKILL')).toBe(true);
  await closed;
}

async function rewriteOwnerAsLegacyUpdate(packageRoot: string): Promise<void> {
  const ownerPath = path.join(packageRoot, '.profile-generation-lock', 'owner.json');
  const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
  owner.transaction.kind = 'ui-profile-generation-v1';
  owner.transaction.generatedPaths = ['snapshots', 'normalized', 'profile.json', 'provenance.json'];
  for (const inventory of ['existed', 'priorDigests', 'nextDigests']) delete owner.transaction[inventory].generated;
  await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
}

async function rewriteOwnerAsLegacyRegenerate(packageRoot: string): Promise<void> {
  const ownerPath = path.join(packageRoot, '.profile-generation-lock', 'owner.json');
  const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
  owner.transaction.kind = 'ui-profile-generation-v1';
  owner.transaction.generatedPaths = ['snapshots/canonical', 'normalized', 'profile.json'];
  for (const inventory of ['existed', 'priorDigests', 'nextDigests']) delete owner.transaction[inventory].generated;
  await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
}

describe('generated profile process observation', () => {
  it('pins Darwin process start observation to UTC independently of the parent timezone', async () => {
    const observedEnvironments: Array<NodeJS.ProcessEnv | undefined> = [];
    const run = async (
      _file: string,
      _arguments: string[],
      options: { env?: NodeJS.ProcessEnv }
    ): Promise<{ stdout: string }> => {
      observedEnvironments.push(options.env);
      return { stdout: 'Thu Aug  6 16:00:00 2026' };
    };

    const first = await observeGeneratedProfileProcess(123, { platform: 'darwin', run });
    const second = await observeGeneratedProfileProcess(123, { platform: 'darwin', run });

    expect(first).toEqual(second);
    expect(first).toEqual({ status: 'alive', identity: 'darwin-ps-lstart-v1:Thu Aug  6 16:00:00 2026' });
    expect(observedEnvironments).toHaveLength(2);
    expect(observedEnvironments.every((environment) => environment?.TZ === 'UTC0')).toBe(true);
  });

  it('distinguishes a missing Linux pid stat from an unreadable global boot id', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    await expect(
      observeGeneratedProfileProcess(process.pid, {
        platform: 'linux',
        read: async () => {
          throw missing;
        }
      })
    ).resolves.toEqual({ status: 'missing' });

    await expect(
      observeGeneratedProfileProcess(process.pid, {
        platform: 'linux',
        read: async (file: string) => {
          if (file.includes(`/proc/${process.pid}/stat`)) return `${process.pid} (node) S`;
          throw missing;
        }
      })
    ).resolves.toEqual({ status: 'unknown' });
  });

  it('parses Linux field 22 as the stable process start tick', async () => {
    const fields = ['S', ...Array.from({ length: 18 }, (_, index) => String(index + 1)), '424242'];
    await expect(
      observeGeneratedProfileProcess(123, {
        platform: 'linux',
        read: async (file: string) =>
          file.endsWith('/stat') ? `123 (node worker) ${fields.join(' ')}` : '12345678-1234-1234-1234-123456789abc\n'
      })
    ).resolves.toEqual({
      status: 'alive',
      identity: 'linux-proc-v1:12345678-1234-1234-1234-123456789abc:424242'
    });
  });

  it('treats a Linux zombie as an exited process even while its pid is present', async () => {
    const fields = ['Z', ...Array.from({ length: 18 }, (_, index) => String(index + 1)), '424242'];
    await expect(
      observeGeneratedProfileProcess(123, {
        platform: 'linux',
        read: async (file: string) =>
          file.endsWith('/stat') ? `123 (node worker) ${fields.join(' ')}` : '12345678-1234-1234-1234-123456789abc\n'
      })
    ).resolves.toEqual({ status: 'missing' });
  });

  it('runs heartbeat ticks serially, drains an in-flight tick, and reports refresh failures', async () => {
    let tick!: () => void;
    let interval = 0;
    let cleared = false;
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const heartbeat = startGeneratedProfileLeaseHeartbeat(
      async () => {
        calls += 1;
        if (calls === 1) await firstPending;
      },
      900,
      {
        setIntervalFn: (callback: () => void, delay: number) => {
          tick = callback;
          interval = delay;
          return { unref: () => {} } as NodeJS.Timeout;
        },
        clearIntervalFn: () => {
          cleared = true;
        }
      }
    );
    expect(interval).toBe(300);
    tick();
    tick();
    await Promise.resolve();
    expect(calls).toBe(1);
    const stopped = heartbeat.stopAndDrain();
    expect(cleared).toBe(true);
    releaseFirst();
    await stopped;
    expect(calls).toBe(2);

    let failingTick!: () => void;
    const failure = new Error('heartbeat failed');
    const failing = startGeneratedProfileLeaseHeartbeat(
      async () => {
        throw failure;
      },
      300,
      {
        setIntervalFn: (callback: () => void) => {
          failingTick = callback;
          return { unref: () => {} } as NodeJS.Timeout;
        },
        clearIntervalFn: () => {}
      }
    );
    failingTick();
    await expect(failing.stopAndDrain()).rejects.toBe(failure);
    await expect(failing.assertHealthy()).rejects.toBe(failure);
  });
});

describe('generated profile filesystem identity fencing', () => {
  it('serializes large filesystem identities without Number rounding', () => {
    expect(generatedProfileIdentityRecord({ dev: 18_446_744_073_709_551_615n, ino: 9_007_199_254_740_993n })).toEqual({
      dev: '18446744073709551615',
      ino: '9007199254740993'
    });
    expect(() => generatedProfileIdentityRecord({ dev: 1, ino: 2 })).toThrow('must use bigint');
  });
});

describe('generated profile temporary candidate cleanup', () => {
  async function candidateFixture(): Promise<{ sandbox: string; candidate: string; ownedFile: string }> {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'ui-profile-candidate-cleanup-'));
    temporaryRoots.push(sandbox);
    const candidate = path.join(sandbox, 'candidate');
    await mkdir(candidate);
    const ownedFile = path.join(candidate, 'owned.json');
    await writeFile(ownedFile, '{"owned":true}\n');
    return { sandbox, candidate, ownedFile };
  }

  it('removes a temporary candidate only while its root and complete inventory still match', async () => {
    const { sandbox, candidate } = await candidateFixture();
    const binding = await captureGeneratedProfileTemporaryCandidate(candidate);

    await removeGeneratedProfileTemporaryCandidate(candidate, binding, 'test candidate');

    expect(await readdir(sandbox)).toEqual([]);
  });

  it('preserves a copied-metadata root replacement and its sentinel', async () => {
    const { sandbox, candidate, ownedFile } = await candidateFixture();
    const binding = await captureGeneratedProfileTemporaryCandidate(candidate);
    const [rootDetails, fileDetails] = await Promise.all([lstat(candidate), lstat(ownedFile)]);
    const parked = path.join(sandbox, 'parked-candidate');
    await rename(candidate, parked);
    await mkdir(candidate);
    const replacementFile = path.join(candidate, 'owned.json');
    await writeFile(replacementFile, '{"owned":true}\n');
    await writeFile(path.join(candidate, 'foreign-sentinel'), 'preserve');
    await chmod(replacementFile, fileDetails.mode);
    await utimes(replacementFile, fileDetails.atime, fileDetails.mtime);
    await chmod(candidate, rootDetails.mode);
    await utimes(candidate, rootDetails.atime, rootDetails.mtime);

    await expect(removeGeneratedProfileTemporaryCandidate(candidate, binding, 'test candidate')).rejects.toThrow(
      'recursive removal skipped'
    );

    expect(await readFile(path.join(candidate, 'foreign-sentinel'), 'utf8')).toBe('preserve');
    expect(await readFile(path.join(parked, 'owned.json'), 'utf8')).toBe('{"owned":true}\n');
  });

  it('preserves a copied-metadata descendant replacement within the bound root', async () => {
    const { sandbox, candidate, ownedFile } = await candidateFixture();
    const binding = await captureGeneratedProfileTemporaryCandidate(candidate);
    const fileDetails = await lstat(ownedFile);
    const parked = path.join(sandbox, 'parked-owned.json');
    await rename(ownedFile, parked);
    await writeFile(ownedFile, '{"owned":true}\n');
    await chmod(ownedFile, fileDetails.mode);
    await utimes(ownedFile, fileDetails.atime, fileDetails.mtime);

    await expect(removeGeneratedProfileTemporaryCandidate(candidate, binding, 'test candidate')).rejects.toThrow(
      'recursive removal skipped'
    );

    expect(await readFile(ownedFile, 'utf8')).toBe('{"owned":true}\n');
    expect(await readFile(parked, 'utf8')).toBe('{"owned":true}\n');
  });

  it('preserves an unexpected sentinel added to an otherwise bound candidate', async () => {
    const { candidate } = await candidateFixture();
    const binding = await captureGeneratedProfileTemporaryCandidate(candidate);
    const sentinel = path.join(candidate, 'foreign-sentinel');
    await writeFile(sentinel, 'preserve');

    await expect(removeGeneratedProfileTemporaryCandidate(candidate, binding, 'test candidate')).rejects.toThrow(
      'recursive removal skipped'
    );

    expect(await readFile(sentinel, 'utf8')).toBe('preserve');
  });
});

describe('generated profile full-command transaction', () => {
  it('rejects production replacement without a full-command generation session', async () => {
    const { packageRoot, stagingRoot } = await fixture();
    await expect(replaceGeneratedPaths({ packageRoot, stagingRoot, generatedPaths })).rejects.toThrow(
      'requires a full-command generation session'
    );
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
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
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
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
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new', 'new']);
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
          generatedPaths: ['snapshots/canonical', 'normalized', 'generated', 'profile.json'],
          generationSession
        });
      }
    );
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'new', 'new', 'new', 'old']);
    expect(await readFile(path.join(packageRoot, 'generated', 'version.txt'), 'utf8')).toBe('new');
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
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
    expect(await collectionVersion(external)).toEqual(['external', 'external', 'external', 'external', 'external']);
  });

  it('removes lock-owned staging after a hard kill before transaction journaling', async () => {
    const { packageRoot, token } = await fixture();
    await killBeforeJournal(packageRoot, token);

    expect(await recoverGeneratedReplacement({ packageRoot })).toEqual({ recovered: true, state: 'no-transaction' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('distinguishes a recycled owner pid from the recorded process instance', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'journaled');
    const owner = JSON.parse(await readFile(path.join(packageRoot, '.profile-generation-lock', 'owner.json'), 'utf8'));
    owner.processIdentity = 'test-owner-process-instance';
    await writeFile(path.join(packageRoot, '.profile-generation-lock', 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`);
    const gatePath = path.join(packageRoot, '.profile-generation-lock', 'mutation-gate', 'gate.json');
    const gate = JSON.parse(await readFile(gatePath, 'utf8'));
    gate.processIdentity = owner.processIdentity;
    await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`);

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        observeProcess: async (pid: number) =>
          pid === owner.pid ? { status: 'alive', identity: `${owner.processIdentity}:recycled` } : { status: 'unknown' }
      })
    ).resolves.toMatchObject({ recovered: true, state: 'rolled-back' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('renews an unverified live owner lease beyond the former five-minute limit', async () => {
    const { packageRoot } = await fixture();
    let clock = Date.parse('2026-08-06T12:00:00.000Z');
    let renewOwner!: () => Promise<void>;
    await withGeneratedProfileSession(
      {
        packageRoot,
        operation: 'update',
        observeProcess: async () => ({ status: 'unknown' }),
        now: () => clock,
        leaseMs: 60_000,
        startHeartbeat: (refresh: () => Promise<void>) => {
          renewOwner = refresh;
          return { assertHealthy: async () => {}, stopAndDrain: async () => {} };
        }
      },
      async () => {
        clock += 6 * 60_000;
        await renewOwner();
        await expect(
          recoverGeneratedReplacement({
            packageRoot,
            observeProcess: async () => ({ status: 'unknown' }),
            now: () => clock
          })
        ).rejects.toThrow('Another generated profile session is active');
      }
    );
  });

  it('keeps a live lease publisher healthy when a reader publishes its completed candidate', async () => {
    const { packageRoot } = await fixture();
    const processIdentity = 'live-lease-publisher';
    let renewOwner!: () => Promise<void>;
    let raced = false;
    await withGeneratedProfileSession(
      {
        packageRoot,
        operation: 'update',
        observeProcess: async () => ({ status: 'alive', identity: processIdentity }),
        startHeartbeat: (refresh: () => Promise<void>) => {
          renewOwner = refresh;
          return { assertHealthy: async () => {}, stopAndDrain: async () => {} };
        },
        onBoundary: async (boundary: string) => {
          if (boundary !== 'lease-publishing' || raced) return;
          raced = true;
          await expect(
            recoverGeneratedReplacement({
              packageRoot,
              observeProcess: async () => ({ status: 'alive', identity: processIdentity })
            })
          ).rejects.toThrow('Another generated profile session is active');
        }
      },
      async () => {
        await renewOwner();
        expect(raced).toBe(true);
      }
    );
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-generation-lock'))).toEqual([]);
  });

  it('keeps a live owner publisher healthy when a reader publishes its completed candidate', async () => {
    const { packageRoot } = await fixture();
    const processIdentity = 'live-owner-publisher';
    let raced = false;
    await withGeneratedProfileSession(
      {
        packageRoot,
        operation: 'update',
        observeProcess: async () => ({ status: 'alive', identity: processIdentity }),
        startHeartbeat: () => ({ assertHealthy: async () => {}, stopAndDrain: async () => {} }),
        onBoundary: async (boundary: string) => {
          if (boundary !== 'owner-publishing' || raced) return;
          raced = true;
          await expect(
            recoverGeneratedReplacement({
              packageRoot,
              observeProcess: async () => ({ status: 'alive', identity: processIdentity })
            })
          ).rejects.toThrow('Another generated profile session is active');
        }
      },
      async (generationSession: unknown) => {
        await createGeneratedProfileStaging(generationSession);
        expect(raced).toBe(true);
      }
    );
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-generation-lock'))).toEqual([]);
  });

  it('keeps an unverified recovery claim live by heartbeat during a long rollback', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const owner = JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'));
    const ownerLease = JSON.parse(await readFile(path.join(lockRoot, 'lease.json'), 'utf8'));
    let clock = ownerLease.expiresAt + 1;
    let refreshClaim!: () => Promise<void>;
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observeProcess = async (pid: number): Promise<{ status: 'missing' | 'unknown' }> =>
      pid === owner.pid ? { status: 'missing' } : { status: 'unknown' };
    const recovery = recoverGeneratedReplacement({
      packageRoot,
      observeProcess,
      now: () => clock,
      leaseMs: 60_000,
      startHeartbeat: (refresh: () => Promise<void>) => {
        refreshClaim = refresh;
        return { assertHealthy: async () => {}, stopAndDrain: async () => {} };
      },
      onRecoveryBoundary: async (boundary: string) => {
        if (boundary !== 'recovery-cleanup:snapshots') return;
        entered();
        await releasePromise;
      }
    });
    await enteredPromise;
    clock += 6 * 60_000;
    await refreshClaim();
    await expect(recoverGeneratedReplacement({ packageRoot, observeProcess, now: () => clock })).rejects.toThrow(
      'mutation gate is held'
    );
    release();
    await expect(recovery).resolves.toMatchObject({ recovered: true, state: 'rolled-back' });
  }, 60_000);

  it('expires an identity-less mutation gate when its holder stops renewing it', async () => {
    const { packageRoot } = await fixture();
    let clock = Date.parse('2026-08-06T12:00:00.000Z');
    await expect(
      withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          observeProcess: async () => ({ status: 'unknown' }),
          now: () => clock,
          leaseMs: 60_000,
          startHeartbeat: () => ({ assertHealthy: async () => {}, stopAndDrain: async () => {} })
        },
        async () => {
          clock += 60_001;
          await expect(
            recoverGeneratedReplacement({
              packageRoot,
              observeProcess: async () => ({ status: 'unknown' }),
              now: () => clock
            })
          ).resolves.toMatchObject({ recovered: true, state: 'no-transaction' });
        }
      )
    ).rejects.toThrow('Generated profile session failed');
  });

  it('does not take over a paused live owner after its lease expires', async () => {
    const { packageRoot, token } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    await killAtBoundary(packageRoot, token, 'journaled', async () => {
      const leasePath = path.join(lockRoot, 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8'));
      lease.renewedAt = 1;
      lease.expiresAt = 2;
      await writeFile(leasePath, `${JSON.stringify(lease, null, 2)}\n`);
      await expect(
        recoverGeneratedReplacement({
          packageRoot,
          observeProcess: async () => ({ status: 'unknown' }),
          now: () => 3
        })
      ).rejects.toThrow('mutation gate is held');
      await expect(realpath(path.join(lockRoot, 'recovery-claim'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
  });

  it('does not replace a paused live recovery claim after its lease expires', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const owner = JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'));
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots', async () => {
      const leasePath = path.join(lockRoot, 'recovery-claim', 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8'));
      lease.renewedAt = 1;
      lease.expiresAt = 2;
      await writeFile(leasePath, `${JSON.stringify(lease, null, 2)}\n`);
      await expect(
        recoverGeneratedReplacement({
          packageRoot,
          observeProcess: async (pid: number) => (pid === owner.pid ? { status: 'missing' } : { status: 'unknown' }),
          now: () => 3
        })
      ).rejects.toThrow('mutation gate is held');
    });
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
  });

  it('fences a stale owner continuation after a recycled-instance takeover wins the gate', async () => {
    const { packageRoot } = await fixture();
    let observedIdentity = 'owner-instance';
    let renewOwner!: () => Promise<void>;
    await expect(
      withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          observeProcess: async () => ({ status: 'alive', identity: observedIdentity }),
          startHeartbeat: (refresh: () => Promise<void>) => {
            renewOwner = refresh;
            return { assertHealthy: async () => {}, stopAndDrain: async () => {} };
          }
        },
        async () => {
          observedIdentity = 'recycled-instance';
          await expect(
            recoverGeneratedReplacement({
              packageRoot,
              observeProcess: async () => ({ status: 'alive', identity: observedIdentity }),
              onClaimPublished: async () => {
                await expect(renewOwner()).rejects.toThrow('mutation gate ownership was lost');
              }
            })
          ).resolves.toMatchObject({ recovered: true, state: 'no-transaction' });
        }
      )
    ).rejects.toThrow('Generated profile session failed');
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
  });

  it('distinguishes a recycled recovery-claim pid from the recorded process instance', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const owner = JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'));
    const claim = JSON.parse(await readFile(path.join(lockRoot, 'recovery-claim', 'claim.json'), 'utf8'));
    claim.processIdentity = 'test-claim-process-instance';
    await writeFile(path.join(lockRoot, 'recovery-claim', 'claim.json'), `${JSON.stringify(claim, null, 2)}\n`);
    const gatePath = path.join(lockRoot, 'mutation-gate', 'gate.json');
    const gate = JSON.parse(await readFile(gatePath, 'utf8'));
    gate.processIdentity = claim.processIdentity;
    await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`);

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        observeProcess: async (pid: number) => {
          if (pid === owner.pid) return { status: 'missing' };
          if (pid === claim.pid) return { status: 'alive', identity: `${claim.processIdentity}:recycled` };
          return { status: 'unknown' };
        }
      })
    ).resolves.toMatchObject({ recovered: true, state: 'rolled-back' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('preserves a copied-metadata replacement when retiring a stale recovery claim', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const claimRoot = path.join(lockRoot, 'recovery-claim');
    const relocated = path.join(lockRoot, '.relocated-owned-claim');

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onClaimBoundary: async (boundary: string) => {
          if (boundary !== 'claim-retiring') return;
          await rename(claimRoot, relocated);
          await mkdir(claimRoot);
          for (const file of ['claim.json', 'lease.json']) {
            await writeFile(path.join(claimRoot, file), await readFile(path.join(relocated, file)));
          }
          await writeFile(path.join(claimRoot, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('claim changed before retirement');
    expect(await readFile(path.join(claimRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocated)).resolves.toBeTruthy();
  });

  it('preserves a copied replacement of an owned unpublished recovery-claim candidate', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const relocated = path.join(lockRoot, '.relocated-owned-claim-candidate');
    let candidateRoot = '';

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onClaimBoundary: async (boundary: string) => {
          if (boundary !== 'claim-publishing') return;
          const candidateName = (await readdir(lockRoot)).find((name) => name.startsWith('.recovery-claim-acquire-'));
          expect(candidateName).toBeDefined();
          candidateRoot = path.join(lockRoot, candidateName!);
          await rename(candidateRoot, relocated);
          await mkdir(candidateRoot);
          for (const file of ['claim.json', 'lease.json']) {
            await writeFile(path.join(candidateRoot, file), await readFile(path.join(relocated, file)));
          }
          await writeFile(path.join(candidateRoot, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('recovery claim candidate identity changed');

    expect(await readFile(path.join(candidateRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocated)).resolves.toBeTruthy();
    await expect(realpath(path.join(lockRoot, 'recovery-claim'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a replaced retired stale claim while unblocking the next session', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const staleClaim = JSON.parse(await readFile(path.join(lockRoot, 'recovery-claim', 'claim.json'), 'utf8'));
    const staleRoot = path.join(lockRoot, `.recovery-claim-stale-${staleClaim.token}`);
    const relocated = path.join(lockRoot, '.relocated-owned-stale-claim');

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onClaimPublished: async () => {
          await rename(staleRoot, relocated);
          await mkdir(staleRoot);
          for (const file of ['claim.json', 'lease.json']) {
            await writeFile(path.join(staleRoot, file), await readFile(path.join(relocated, file)));
          }
          await writeFile(path.join(staleRoot, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('detached lock cleanup retained');

    const releaseName = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(releaseName).toBeDefined();
    const releaseRoot = path.join(packageRoot, releaseName!);
    expect(await readFile(path.join(releaseRoot, path.basename(staleRoot), 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(path.join(releaseRoot, path.basename(relocated)))).resolves.toBeTruthy();
    await expect(realpath(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('preserves a copied-metadata replacement when releasing a failed recovery claim', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'tampered');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const claimRoot = path.join(lockRoot, 'recovery-claim');
    const relocated = path.join(lockRoot, '.relocated-released-claim');

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onClaimBoundary: async (boundary: string) => {
          if (boundary !== 'claim-releasing') return;
          await rename(claimRoot, relocated);
          await mkdir(claimRoot);
          for (const file of ['claim.json', 'lease.json']) {
            await writeFile(path.join(claimRoot, file), await readFile(path.join(relocated, file)));
          }
          await writeFile(path.join(claimRoot, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('recovery and claim cleanup both failed');
    expect(await readFile(path.join(claimRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocated)).resolves.toBeTruthy();
  });

  it('canonicalizes a symlinked package root before journaling and recovery', async () => {
    const { root, packageRoot, token } = await fixture();
    const packageAlias = path.join(root, 'package-alias');
    await symlink(packageRoot, packageAlias, 'dir');
    await killAtBoundary(packageAlias, token, 'journaled');

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('rejects a symlinked staging ancestor before a regenerate can move external content', async () => {
    const { root, packageRoot } = await fixture();
    const external = path.join(root, 'external-staging');
    await makeCollection(external, 'external');
    let failure: unknown;

    try {
      await withGeneratedProfileSession({ packageRoot, operation: 'regenerate' }, async (generationSession: unknown) => {
        const stagingRoot = await createGeneratedProfileStaging(generationSession);
        await symlink(path.join(external, 'snapshots'), path.join(stagingRoot, 'snapshots'), 'dir');
        await mkdir(path.join(stagingRoot, 'normalized'), { recursive: true });
        await mkdir(path.join(stagingRoot, 'generated'), { recursive: true });
        await writeFile(path.join(stagingRoot, 'normalized', 'version.txt'), 'new');
        await writeFile(path.join(stagingRoot, 'generated', 'version.txt'), 'new');
        await writeFile(path.join(stagingRoot, 'profile.json'), JSON.stringify({ version: 'new' }) + '\n');
        await replaceGeneratedPaths({
          packageRoot,
          stagingRoot,
          generatedPaths: ['snapshots/canonical', 'normalized', 'generated', 'profile.json'],
          generationSession
        });
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.some((error) => String(error).includes('symlinked ancestor'))).toBe(true);
    expect(await readFile(path.join(external, 'snapshots', 'canonical', 'version.txt'), 'utf8')).toBe('external');
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('canonicalizes differently cased package roots on case-insensitive filesystems', async ({ skip }) => {
    const { packageRoot, token } = await fixture();
    const letter = packageRoot.search(/[a-z]/u);
    if (letter === -1) {
      skip();
      return;
    }
    const packageAlias = `${packageRoot.slice(0, letter)}${packageRoot[letter].toUpperCase()}${packageRoot.slice(letter + 1)}`;
    try {
      if ((await realpath(packageAlias)) !== (await realpath(packageRoot))) {
        skip();
        return;
      }
    } catch {
      skip();
      return;
    }
    await killAtBoundary(packageAlias, token, 'journaled');

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
  });

  it('recovers every hard-kill move boundary to an exact old or new collection', async () => {
    const boundaries = [
      'journaled',
      'backup-bound',
      'backup-created',
      'backed-up:snapshots',
      'backed-up:normalized',
      'backed-up:profile.json',
      'backed-up:provenance.json',
      'installed:snapshots',
      'installed:normalized',
      'installed:profile.json',
      'installed:provenance.json',
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
      expect(await collectionVersion(packageRoot), boundary).toEqual([expected, expected, expected, expected, expected]);
      expect(
        (await readdir(packageRoot)).filter((name) => name.startsWith('.profile-')),
        boundary
      ).toEqual([]);
    }
  }, 30_000);

  it('refuses to back up a target changed after its prior digest was journaled', async () => {
    const { packageRoot, token } = await fixture();
    const changed = path.join(packageRoot, 'snapshots', 'raw', 'version.txt');
    await killAtBoundary(packageRoot, token, 'backup-created', async () => {
      await writeFile(changed, 'editor-change');
    });

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('preserved prior target digest differs');
    await expect(readFile(changed, 'utf8')).resolves.toBe('editor-change');
  });

  it('refuses a generated target recreated after backup before staged installation', async () => {
    const { packageRoot } = await fixture();
    let failure: unknown;
    try {
      await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession: unknown) => {
        const stagingRoot = await createGeneratedProfileStaging(generationSession);
        await makeCollection(stagingRoot, 'new');
        await replaceGeneratedPaths({
          packageRoot,
          stagingRoot,
          generatedPaths,
          generationSession,
          onBoundary: async (boundary: string) => {
            if (boundary === 'backed-up:profile.json') {
              await writeFile(path.join(packageRoot, 'profile.json'), '{"version":"editor"}\n');
            }
          }
        });
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      (failure as AggregateError).errors.some((error) => String(error).includes('target was recreated before installation'))
    ).toBe(true);
    expect(await readFile(path.join(packageRoot, 'profile.json'), 'utf8')).toBe('{"version":"editor"}\n');
  });

  it('allows a new session after interrupted partial cleanup of a detached settled lock', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'lock-removing', async () => {
      const releaseName = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
      expect(releaseName).toBeDefined();
      const releaseRoot = path.join(packageRoot, releaseName!);
      await rm(path.join(releaseRoot, 'mutation-gate', 'gate.json'));
      const bindingName = (await readdir(releaseRoot)).find((name) => name.includes('cleanup-discard'));
      if (bindingName) await rm(path.join(releaseRoot, bindingName, 'binding.json'));
    });

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new', 'new']);
    await expect(realpath(path.join(packageRoot, '.profile-generation-lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rediscovers and removes a fully bound released lock after a restart', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'lock-detached');
    const released = (await readdir(packageRoot)).filter((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(released).toHaveLength(1);

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-generation-lock.release-'))).toEqual([]);
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
  });

  it('does not remove a detached lock while its original owner is still live', async () => {
    const { packageRoot, token } = await fixture();
    const child = spawn(process.execPath, ['--input-type=module', '-e', childSource(), packageRoot, token, 'lock-detached'], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    await waitForBoundary(child, 'lock-detached');
    const released = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(released).toBeDefined();

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
    await expect(realpath(path.join(packageRoot, released!))).resolves.toBeTruthy();

    const closed = waitForClose(child);
    expect(child.kill('SIGKILL')).toBe(true);
    await closed;
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
    await expect(realpath(path.join(packageRoot, released!))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves an unverified interrupted recovery-claim candidate rather than recursively deleting it', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const candidate = path.join(lockRoot, '.recovery-claim-acquire-interrupted');
    await mkdir(candidate);

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('detached lock cleanup retained');
    const releasedLock = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(releasedLock).toBeDefined();
    await expect(realpath(path.join(packageRoot, releasedLock!, path.basename(candidate)))).resolves.toBeTruthy();
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('resumes markerless backup and staging quarantine cleanup after repeated restarts', async () => {
    for (const kind of ['backup', 'staging']) {
      const { packageRoot, token } = await fixture();
      const lockRoot = path.join(packageRoot, '.profile-generation-lock');
      const cleanupRoot = path.join(lockRoot, `.transaction-cleanup-${kind}-${token}`);
      await killAtBoundary(packageRoot, token, `cleanup-removing:${kind}`, async () => {
        await rm(path.join(cleanupRoot, '.generation-owner.json'));
      });

      await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
        recovered: true,
        state: 'committed'
      });
      await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toBe(false);
      expect(await collectionVersion(packageRoot), kind).toEqual(['new', 'new', 'new', 'new', 'new']);
    }
  });

  it('reconciles an empty cleanup-binding acquisition candidate after a hard kill', async () => {
    const { packageRoot, token } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const candidatePrefix = `.transaction-cleanup-backup-${token}-binding.acquire-`;
    await killAtBoundary(packageRoot, token, 'cleanup-binding-created:backup');
    expect((await readdir(lockRoot)).filter((name) => name.startsWith(candidatePrefix))).toHaveLength(1);

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'committed'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new', 'new']);
    await expect(realpath(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps a live cleanup-binding publisher healthy when its completed candidate is promoted', async () => {
    const { packageRoot } = await fixture();
    let promoted = false;
    await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession: unknown) => {
      const stagingRoot = await createGeneratedProfileStaging(generationSession);
      await makeCollection(stagingRoot, 'new');
      await replaceGeneratedPaths({
        packageRoot,
        stagingRoot,
        generatedPaths,
        generationSession,
        onBoundary: async (boundary: string, details: { temporary?: string; bindingRoot?: string }) => {
          if (boundary !== 'cleanup-binding-publishing:backup') return;
          expect(details.temporary).toBeDefined();
          expect(details.bindingRoot).toBeDefined();
          await rename(details.temporary!, details.bindingRoot!);
          promoted = true;
        }
      });
    });
    expect(promoted).toBe(true);
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new', 'new']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-generation-lock'))).toEqual([]);
  });

  it('rejects an unbound pre-existing cleanup quarantine without recursively removing it', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'committed');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const cleanupRoot = path.join(lockRoot, `.transaction-cleanup-backup-${token}`);
    await rename(path.join(lockRoot, 'backup'), cleanupRoot);

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('has no transaction binding');
    expect(await readdir(cleanupRoot)).toContain('.generation-owner.json');
    expect(await collectionVersion(packageRoot)).toEqual(['new', 'new', 'new', 'new', 'new']);
  });

  it('revalidates a cleanup quarantine after the removal boundary and preserves its replacement', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'committed');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const cleanupRoot = path.join(lockRoot, `.transaction-cleanup-backup-${token}`);
    const relocatedRoot = path.join(lockRoot, '.relocated-owned-cleanup');

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onRecoveryBoundary: async (boundary: string) => {
          if (boundary !== 'cleanup-removing:backup') return;
          await rename(cleanupRoot, relocatedRoot);
          await mkdir(cleanupRoot);
          await writeFile(path.join(cleanupRoot, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('cleanup path was replaced');
    expect(await readFile(path.join(cleanupRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocatedRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a relocated cleanup root when it gains an untracked descendant', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'committed');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const cleanupRoot = path.join(lockRoot, `.transaction-cleanup-backup-${token}`);
    const relocatedRoot = path.join(lockRoot, '.relocated-owned-cleanup-with-extra');

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onRecoveryBoundary: async (boundary: string) => {
          if (boundary !== 'cleanup-removing:backup') return;
          await rename(cleanupRoot, relocatedRoot);
          await mkdir(path.join(relocatedRoot, 'unexpected'));
          await writeFile(path.join(relocatedRoot, 'unexpected', 'nested.txt'), 'preserve-owned');
          await mkdir(cleanupRoot);
          await writeFile(path.join(cleanupRoot, 'foreign-sentinel.txt'), 'preserve-foreign');
        }
      })
    ).rejects.toThrow('descendant inventory changed');

    expect(await readFile(path.join(cleanupRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve-foreign');
    expect(await readFile(path.join(relocatedRoot, 'unexpected', 'nested.txt'), 'utf8')).toBe('preserve-owned');
    await expect(realpath(relocatedRoot)).resolves.toBeTruthy();
  });

  it('preserves a detached lock when a cleanup quarantine gains an untracked descendant', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'committed');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const cleanupName = `.transaction-cleanup-backup-${token}`;

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onRecoveryBoundary: async (boundary: string) => {
          if (boundary !== 'cleanup-removing:backup') return;
          await writeFile(path.join(lockRoot, cleanupName, 'foreign-sentinel.txt'), 'preserve');
        }
      })
    ).rejects.toThrow('detached lock cleanup retained');

    const releaseName = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(releaseName).toBeDefined();
    const releaseRoot = path.join(packageRoot, releaseName!);
    expect(await readFile(path.join(releaseRoot, cleanupName, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
  });

  it('preserves a foreign discard-root replacement before moving generated data into it', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const discardRoot = path.join(lockRoot, 'discard');
    const relocatedDiscard = path.join(lockRoot, '.relocated-owned-discard');
    await rename(discardRoot, relocatedDiscard);
    await mkdir(discardRoot);
    await writeFile(path.join(discardRoot, 'foreign-sentinel.txt'), 'preserve');

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('discard binding directory identity changed');
    expect(await readFile(path.join(discardRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocatedDiscard)).resolves.toBeTruthy();
  });

  it('preserves both roots when the canonical lock is replaced at lock-releasing', async () => {
    const { packageRoot } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const relocatedRoot = path.join(packageRoot, '.relocated-owned-lock');

    await expect(
      withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          onReleaseBoundary: async (boundary: string) => {
            if (boundary !== 'lock-releasing') return;
            await rename(lockRoot, relocatedRoot);
            await mkdir(lockRoot);
            await writeFile(path.join(lockRoot, 'foreign-sentinel.txt'), 'preserve');
          }
        },
        async () => {}
      )
    ).rejects.toThrow('lock ownership lost; owned lock and foreign replacement preserved');

    expect(await readFile(path.join(lockRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocatedRoot)).resolves.toBeTruthy();
    expect((await readdir(packageRoot)).some((name) => name.startsWith('.profile-generation-lock.release-'))).toBe(false);
  });

  it('preserves a replacement detached-lock path and removes only the relocated bound lock inode', async () => {
    const { packageRoot } = await fixture();
    let replacementRoot = '';
    let relocatedRoot = '';
    let failure: unknown;
    try {
      await withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          onReleaseBoundary: async (boundary: string, releaseRoot: string) => {
            if (boundary !== 'lock-detached') return;
            replacementRoot = releaseRoot;
            relocatedRoot = `${releaseRoot}.owned`;
            await rename(releaseRoot, relocatedRoot);
            await mkdir(releaseRoot);
            await writeFile(path.join(releaseRoot, 'foreign-sentinel.txt'), 'preserve');
          }
        },
        async () => {}
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      (failure as AggregateError).errors.some((error) =>
        String(error).includes('owned detached lock removed; foreign replacement preserved')
      )
    ).toBe(true);
    expect((failure as AggregateError).message).toContain('owned detached lock removed; foreign replacement preserved');
    expect((failure as AggregateError).message).not.toContain('detached lock retained');
    expect(await readFile(path.join(replacementRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocatedRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('revalidates the detached lock immediately after the removal boundary', async () => {
    const { packageRoot } = await fixture();
    let replacementRoot = '';
    let relocatedRoot = '';
    let failure: unknown;
    try {
      await withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          onReleaseBoundary: async (boundary: string, releaseRoot: string) => {
            if (boundary !== 'lock-removing') return;
            replacementRoot = releaseRoot;
            relocatedRoot = `${releaseRoot}.owned`;
            await rename(releaseRoot, relocatedRoot);
            await mkdir(releaseRoot);
            await writeFile(path.join(releaseRoot, 'foreign-sentinel.txt'), 'preserve');
          }
        },
        async () => {}
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      (failure as AggregateError).errors.some((error) =>
        String(error).includes('owned detached lock removed; foreign replacement preserved')
      )
    ).toBe(true);
    expect((failure as AggregateError).message).toContain('owned detached lock removed; foreign replacement preserved');
    expect((failure as AggregateError).message).not.toContain('detached lock retained');
    expect(await readFile(path.join(replacementRoot, 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(relocatedRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a detached lock when its retained-payload inventory root is replaced', async () => {
    const { packageRoot } = await fixture();
    let detachedRoot = '';
    await expect(
      withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          onReleaseBoundary: async (boundary: string, releaseRoot: string) => {
            if (boundary !== 'lock-removing') return;
            detachedRoot = releaseRoot;
            const bindingRoot = path.join(releaseRoot, 'retained-payload-bindings');
            await rename(bindingRoot, path.join(releaseRoot, '.relocated-owned-retained-bindings'));
            await mkdir(bindingRoot);
            await writeFile(path.join(bindingRoot, 'foreign-sentinel.txt'), 'preserve');
          }
        },
        async () => {}
      )
    ).rejects.toThrow('detached lock retained for cleanup');

    expect(await readFile(path.join(detachedRoot, 'retained-payload-bindings', 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(path.join(detachedRoot, '.relocated-owned-retained-bindings'))).resolves.toBeTruthy();
    await expect(realpath(path.join(packageRoot, '.profile-generation-lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
  });

  it('preserves a detached lock when a retained-payload binding is corrupted', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    let detachedRoot = '';
    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onReleaseBoundary: async (boundary: string, releaseRoot: string) => {
          if (boundary !== 'lock-removing') return;
          detachedRoot = releaseRoot;
          const bindingRoot = path.join(releaseRoot, 'retained-payload-bindings');
          const bindingName = (await readdir(bindingRoot)).find((name) => name.endsWith('.json'));
          expect(bindingName).toBeDefined();
          await writeFile(path.join(bindingRoot, bindingName!), '{"corrupt":true}\n');
        }
      })
    ).rejects.toThrow('detached lock cleanup retained');

    const bindingRoot = path.join(detachedRoot, 'retained-payload-bindings');
    expect(await readdir(bindingRoot)).not.toHaveLength(0);
    await expect(realpath(path.join(packageRoot, '.profile-generation-lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
  });

  it('preserves a byte-identical new-inode retained-binding replacement', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    let detachedRoot = '';
    let relocatedBinding = '';

    await expect(
      recoverGeneratedReplacement({
        packageRoot,
        onReleaseBoundary: async (boundary: string, releaseRoot: string) => {
          if (boundary !== 'lock-removing') return;
          detachedRoot = releaseRoot;
          const bindingRoot = path.join(releaseRoot, 'retained-payload-bindings');
          const bindingName = (await readdir(bindingRoot)).find((name) => name.endsWith('.json'));
          expect(bindingName).toBeDefined();
          const bindingPath = path.join(bindingRoot, bindingName!);
          const bytes = await readFile(bindingPath);
          relocatedBinding = `${releaseRoot}.original-${bindingName}`;
          await rename(bindingPath, relocatedBinding);
          await writeFile(bindingPath, bytes);
        }
      })
    ).rejects.toThrow('detached lock cleanup retained');

    await expect(realpath(relocatedBinding)).resolves.toBeTruthy();
    await expect(realpath(detachedRoot)).resolves.toBeTruthy();
    await expect(realpath(path.join(packageRoot, '.profile-generation-lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
  });

  it('honors explicit recovery relinquishment even when the owner lease is missing', async () => {
    const { packageRoot } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    await expect(
      withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession: unknown) => {
        const stagingRoot = await createGeneratedProfileStaging(generationSession);
        await makeCollection(stagingRoot, 'new');
        await replaceGeneratedPaths({
          packageRoot,
          stagingRoot,
          generatedPaths,
          generationSession,
          onBoundary: async (boundary: string) => {
            if (boundary !== 'installed:snapshots') return;
            await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'tampered');
            throw new Error('force unsafe settlement');
          }
        });
      })
    ).rejects.toThrow('transaction and lock retained for recovery');
    const owner = JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'));
    expect(owner.recoveryRequired).toBe(true);
    await rm(path.join(lockRoot, 'lease.json'));
    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'new');
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
  });

  it('relinquishes a still-canonical owner gate after a pre-detach release failure', async () => {
    const { packageRoot } = await fixture();
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    await expect(
      withGeneratedProfileSession(
        {
          packageRoot,
          operation: 'update',
          onReleaseBoundary: async (boundary: string) => {
            if (boundary === 'lock-releasing') throw new Error('injected pre-detach release failure');
          }
        },
        async () => {}
      )
    ).rejects.toThrow('transaction and lock retained for recovery');
    const owner = JSON.parse(await readFile(path.join(lockRoot, 'owner.json'), 'utf8'));
    expect(owner.recoveryRequired).toBe(true);
    await expect(realpath(path.join(lockRoot, 'mutation-gate'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'no-transaction'
    });
  });

  it('preserves a replaced bound discard child while unblocking the next session', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const lockRoot = path.join(packageRoot, '.profile-generation-lock');
    const discarded = path.join(lockRoot, 'discard', '0');
    const relocated = path.join(lockRoot, '.relocated-owned-discard-child');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots', async () => {
      await rename(discarded, relocated);
      await mkdir(discarded);
      await writeFile(path.join(discarded, 'foreign-sentinel.txt'), 'preserve');
    });

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('detached lock cleanup retained');
    const releaseName = (await readdir(packageRoot)).find((name) => name.startsWith('.profile-generation-lock.release-'));
    expect(releaseName).toBeDefined();
    const releaseRoot = path.join(packageRoot, releaseName!);
    expect(await readFile(path.join(releaseRoot, 'discard', '0', 'foreign-sentinel.txt'), 'utf8')).toBe('preserve');
    await expect(realpath(path.join(releaseRoot, '.relocated-owned-discard-child'))).resolves.toBeTruthy();
    await expect(realpath(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withGeneratedProfileSession({ packageRoot, operation: 'update' }, async () => {})).resolves.toBeUndefined();
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('reconciles pre-link and post-link retained-binding publication residue', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    const bindingRoot = path.join(packageRoot, '.profile-generation-lock', 'retained-payload-bindings');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots', async () => {
      const bindingName = (await readdir(bindingRoot)).find((name) => !name.startsWith('.pending-'));
      expect(bindingName).toBeDefined();
      const bindingPath = path.join(bindingRoot, bindingName!);
      const bindingToken = bindingName!.slice(0, -'.json'.length);
      await writeFile(path.join(bindingRoot, `.pending-${bindingToken}-${randomUUID()}.json`), await readFile(bindingPath));
      await link(bindingPath, path.join(bindingRoot, `.pending-${bindingToken}-${randomUUID()}.json`));
    });

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('preserves a journaled transaction when recovery bytes are not an exact old or new collection', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'tampered');

    await expect(recoverGeneratedReplacement({ packageRoot })).rejects.toThrow('digest differs');
    expect(await readFile(path.join(packageRoot, '.profile-generation-lock', 'owner.json'), 'utf8')).toContain(
      'ui-profile-generation-v2'
    );
    expect((await readdir(path.join(packageRoot, '.profile-generation-lock', 'backup'))).length).toBeGreaterThan(0);

    await writeFile(path.join(packageRoot, 'snapshots', 'raw', 'version.txt'), 'new');
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });

  it('resumes after a hard kill during recovery discard cleanup', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:snapshots');
    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:snapshots');

    expect(await recoverGeneratedReplacement({ packageRoot })).toMatchObject({ recovered: true, state: 'rolled-back' });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('recovers a legacy update journal and its shifted retained discard binding', async () => {
    const { packageRoot, token } = await fixture();
    await killAtBoundary(packageRoot, token, 'installed:profile.json', async () => {
      await rewriteOwnerAsLegacyUpdate(packageRoot);
    });

    await killRecoveryAtBoundary(packageRoot, 'recovery-cleanup:profile.json');
    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
    expect(await readFile(path.join(packageRoot, 'generated', 'version.txt'), 'utf8')).toBe('new');
    expect((await readdir(packageRoot)).filter((name) => name.startsWith('.profile-'))).toEqual([]);
  });

  it('recovers the legacy regenerate journal layout without claiming the generated tree', async () => {
    const { packageRoot, token } = await fixture();
    await killRegenerateAtBoundary(packageRoot, token, 'journaled');
    await rewriteOwnerAsLegacyRegenerate(packageRoot);

    await expect(recoverGeneratedReplacement({ packageRoot })).resolves.toMatchObject({
      recovered: true,
      state: 'rolled-back'
    });
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
    expect(await readFile(path.join(packageRoot, 'generated', 'version.txt'), 'utf8')).toBe('old');
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
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
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
    expect(await collectionVersion(packageRoot)).toEqual(['old', 'old', 'old', 'old', 'old']);
  });
});
