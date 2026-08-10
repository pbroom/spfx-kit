import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error portable .mjs module without declarations
import {
  prepareSpfxUiProfileBaseUi,
  spfxUiProfilePreparationActorIsActive
} from '../packages/source-editor-react/spfx-ui-profile-prepare.mjs';
// @ts-expect-error plain .mjs module without declarations
import { resolveSourceEditorUiProfile } from '../packages/spfx-tools/src/lib/source-editor-vendor.mjs';

const require = createRequire(import.meta.url);
const registerSpfxUiProfileGulp = require('../packages/source-editor-react/spfx-ui-profile-gulp.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('portable Better Text SPFx UI profile build adapter', () => {
  it('binds preparation ownership to a process instance and fails closed when identity is unknown', async () => {
    const actor = { pid: 42, processIdentity: 'process-instance-a' };
    await expect(
      spfxUiProfilePreparationActorIsActive(actor, {
        observeProcess: async () => ({ status: 'alive', identity: 'process-instance-a' })
      })
    ).resolves.toBe(true);
    await expect(
      spfxUiProfilePreparationActorIsActive(actor, {
        observeProcess: async () => ({ status: 'alive', identity: 'process-instance-b' })
      })
    ).resolves.toBe(false);
    await expect(
      spfxUiProfilePreparationActorIsActive(actor, {
        observeProcess: async () => ({ status: 'unknown' })
      })
    ).resolves.toBe(true);
    await expect(
      spfxUiProfilePreparationActorIsActive(actor, {
        observeProcess: async () => ({ status: 'missing' })
      })
    ).resolves.toBe(false);
  });

  it('prepares an app-local Base UI copy and composes its alias and exact CSS rule with Monaco', async () => {
    const appRoot = await mkdtemp(path.join(tmpdir(), 'better-text-ui-profile-'));
    temporaryDirectories.push(appRoot);
    const closure = JSON.parse(
      await readFile(path.join(repositoryRoot, 'packages', 'ui-profile', 'dependency-closure.json'), 'utf8')
    );
    const lockPackages = Object.fromEntries(
      closure.packages.map((entry: any) => [
        lockPath(entry.name),
        {
          version: entry.version,
          integrity: entry.integrity,
          dependencies: entry.dependencies,
          peerDependencies: entry.peerDependencies,
          ...(entry.optionalPeers?.length
            ? {
                peerDependenciesMeta: Object.fromEntries(entry.optionalPeers.map((peer: string) => [peer, { optional: true }]))
              }
            : {}),
          ...(entry.name === '@base-ui/react' ? { resolved: 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz' } : {})
        }
      ])
    );
    const lock = {
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { '@base-ui/react': '1.6.0' } },
        ...lockPackages
      }
    };
    await writeFile(
      path.join(appRoot, 'package.json'),
      `${JSON.stringify({ name: 'better-text-spfx', dependencies: { '@base-ui/react': '1.6.0' } })}\n`
    );
    const appLockPath = path.join(appRoot, 'package-lock.json');
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);
    const installedBaseUi = path.join(repositoryRoot, 'node_modules', '@base-ui', 'react');
    for (const entry of closure.packages) {
      const source = path.join(repositoryRoot, 'node_modules', ...entry.name.split('/'));
      const target = path.join(appRoot, ...lockPath(entry.name).split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    }

    const resolved = await resolveSourceEditorUiProfile(repositoryRoot, 'better-text-spfx');
    for (const file of resolved.files) {
      if (!file.vendorPath.startsWith('src/vendor/source-editor/ui-profile/')) continue;
      const target = path.join(appRoot, file.vendorPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.source);
    }
    const profileRoot = path.join(appRoot, 'src', 'vendor', 'source-editor', 'ui-profile');
    const installedManifestBefore = await readFile(path.join(installedBaseUi, 'package.json'));
    const preparedRoot = await prepareSpfxUiProfileBaseUi({ appRoot, profileRoot });
    expect(preparedRoot).toBe(path.join(await realpath(appRoot), 'temp', 'spfx-ui-profile', 'base-ui'));
    expect(await readFile(path.join(installedBaseUi, 'package.json'))).toEqual(installedManifestBefore);
    expect(JSON.parse(await readFile(path.join(preparedRoot, 'package.json'), 'utf8')).exports).toHaveProperty(
      './spfx-id-ownership'
    );
    expect(await readFile(path.join(preparedRoot, 'spfx-id-ownership.mjs'), 'utf8')).toContain('BaseUiIdOwnershipProvider');
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);

    const preparedParent = path.dirname(preparedRoot);
    const backupRoot = path.join(preparedParent, '.base-ui-backup');
    const lockRoot = path.join(preparedParent, '.base-ui-prepare-lock');
    const lockOwnerPath = path.join(lockRoot, 'owner.json');
    const stampPath = path.join(preparedRoot, '.spfx-ui-profile-prepared.json');
    const currentStamp = JSON.parse(await readFile(stampPath, 'utf8'));
    const outsideStagingDecoy = path.join(preparedParent, '.base-ui-staging-outside-lock');
    await mkdir(outsideStagingDecoy);
    await writeFile(path.join(outsideStagingDecoy, 'sentinel'), 'must remain outside the lock\n');

    await writeFile(stampPath, `${JSON.stringify({ ...currentStamp, preparedTreeSha256: '0'.repeat(64) })}\n`);
    const interruptedPreJournalStaging = await terminatePreparationAtBoundary({
      appRoot,
      profileRoot,
      boundary: 'preparation-staging-created'
    });
    expect(path.dirname(interruptedPreJournalStaging.stagingRoot)).toBe(path.join(lockRoot, 'payloads'));
    expect(JSON.parse(await readFile(lockOwnerPath, 'utf8'))).not.toHaveProperty('transaction');
    expect((await lstat(interruptedPreJournalStaging.stagingRoot)).isDirectory()).toBe(true);
    const interruptedStaleRetirement = await terminatePreparationAtBoundary({
      appRoot,
      profileRoot,
      boundary: 'stale-lock-retired'
    });
    expect((await lstat(interruptedStaleRetirement.staleRoot)).isDirectory()).toBe(true);
    await expect(lstat(path.join(interruptedStaleRetirement.staleRoot, 'payloads'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(interruptedPreJournalStaging.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await rm(interruptedStaleRetirement.staleRoot, { recursive: true });
    await removePreparationRecoveryClaimResidues(lockRoot);
    expect(await readFile(path.join(outsideStagingDecoy, 'sentinel'), 'utf8')).toBe('must remain outside the lock\n');

    const interruptedRelease = await terminatePreparationAtBoundary({
      appRoot,
      profileRoot,
      boundary: 'release-lock-retired'
    });
    expect((await lstat(interruptedRelease.releaseRoot)).isDirectory()).toBe(true);
    await expect(lstat(path.join(interruptedRelease.releaseRoot, 'payloads'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await rm(interruptedRelease.releaseRoot, { recursive: true });

    await writeFile(stampPath, `${JSON.stringify({ ...currentStamp, preparedTreeSha256: '0'.repeat(64) })}\n`);
    const interruptedRetirement = await terminatePreparationAtBoundary({
      appRoot,
      profileRoot,
      boundary: 'prepared-backup-retired'
    });
    expect(path.dirname(interruptedRetirement.retiredRoot)).toBe(path.join(lockRoot, 'payloads'));
    expect((await lstat(interruptedRetirement.retiredRoot)).isDirectory()).toBe(true);
    const interruptedPayloadCleanup = await terminatePreparationAtBoundary({
      appRoot,
      profileRoot,
      boundary: 'preparation-payload-cleanup-started',
      beforeKill: async () => {
        await rm(path.join(interruptedRetirement.retiredRoot, 'package.json'));
      }
    });
    expect(interruptedPayloadCleanup.payloadRoot).toBe(path.join(lockRoot, 'payloads'));
    expect((await lstat(interruptedPayloadCleanup.payloadRoot)).isDirectory()).toBe(true);
    expect((await lstat(lockRoot)).isDirectory()).toBe(true);
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(interruptedRetirement.retiredRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await removePreparationRecoveryClaimResidues(lockRoot);
    expect(await readFile(path.join(outsideStagingDecoy, 'sentinel'), 'utf8')).toBe('must remain outside the lock\n');
    await rm(outsideStagingDecoy, { recursive: true });

    await writeFile(stampPath, `${JSON.stringify({ ...currentStamp, preparedTreeSha256: '0'.repeat(64) })}\n`);
    let stagingBoundaryCalls = 0;
    let journalBoundaryCalls = 0;
    let backupBoundaryCalls = 0;
    let interruptedOwner: any;
    const heldBackupRoot = path.join(preparedParent, '.base-ui-backup-held-test');
    await expect(
      prepareSpfxUiProfileBaseUi({
        appRoot,
        profileRoot,
        onPreparationLockBoundary: async (boundary: string, details: any) => {
          if (boundary === 'preparation-staging-created') {
            stagingBoundaryCalls += 1;
            expect(path.dirname(details.stagingRoot)).toBe(path.join(lockRoot, 'payloads'));
            expect(path.basename(details.stagingRoot)).toMatch(/^staging-/u);
            expect(JSON.parse(await readFile(lockOwnerPath, 'utf8'))).not.toHaveProperty('transaction');
          }
          if (boundary === 'preparation-transaction-journaled') {
            journalBoundaryCalls += 1;
            interruptedOwner = JSON.parse(await readFile(lockOwnerPath, 'utf8'));
            expect(interruptedOwner.transaction).toMatchObject({
              kind: 'spfx-ui-profile-preparation-v1',
              token: interruptedOwner.token,
              preparedRoot,
              backupRoot,
              hadPrepared: true,
              contracts: currentStamp.contracts
            });
            expect(interruptedOwner.transaction.priorTree).not.toEqual(interruptedOwner.transaction.stagedTree);
            expect((await lstat(preparedRoot)).isDirectory()).toBe(true);
            await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
            expect((await lstat(interruptedOwner.transaction.stagingRoot)).isDirectory()).toBe(true);
          }
          if (boundary === 'prepared-tree-backed-up') {
            backupBoundaryCalls += 1;
            await rename(backupRoot, heldBackupRoot);
            throw new Error('simulated process termination after the prepared tree was backed up');
          }
        }
      })
    ).rejects.toThrow('Base UI preparation and cleanup both failed');
    expect(stagingBoundaryCalls).toBe(1);
    expect(journalBoundaryCalls).toBe(1);
    expect(backupBoundaryCalls).toBe(1);
    await expect(lstat(preparedRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(heldBackupRoot)).isDirectory()).toBe(true);
    expect((await lstat(interruptedOwner.transaction.stagingRoot)).isDirectory()).toBe(true);
    expect((await lstat(lockRoot)).isDirectory()).toBe(true);
    await rename(heldBackupRoot, backupRoot);
    await writeFile(lockOwnerPath, `${JSON.stringify({ ...interruptedOwner, pid: 2_147_483_647, processIdentity: null })}\n`);
    let retiredStagingRoot: string | undefined;
    await expect(
      prepareSpfxUiProfileBaseUi({
        appRoot,
        profileRoot,
        onPreparationLockBoundary: async (boundary: string, details: any) => {
          if (boundary !== 'recovery-staging-retired') return;
          retiredStagingRoot = details.retiredRoot;
          throw new Error('simulated process termination after staging retirement');
        }
      })
    ).rejects.toThrow('simulated process termination after staging retirement');
    expect((await lstat(preparedRoot)).isDirectory()).toBe(true);
    await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(interruptedOwner.transaction.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(retiredStagingRoot!)).isDirectory()).toBe(true);
    expect(path.dirname(retiredStagingRoot!)).toBe(path.join(lockRoot, 'payloads'));
    expect((await lstat(lockRoot)).isDirectory()).toBe(true);

    let retiredBackupRoot: string | undefined;
    let promotedBoundaryCalls = 0;
    let recoveryBackupBoundaryCalls = 0;
    await expect(
      prepareSpfxUiProfileBaseUi({
        appRoot,
        profileRoot,
        onPreparationLockBoundary: async (boundary: string, details: any) => {
          if (boundary === 'prepared-tree-promoted') {
            promotedBoundaryCalls += 1;
            throw new Error('simulated process termination after promotion');
          }
          if (boundary === 'recovery-backup-retired') {
            recoveryBackupBoundaryCalls += 1;
            retiredBackupRoot = details.retiredRoot;
            throw new Error('simulated process termination during backup retirement');
          }
        }
      })
    ).rejects.toThrow('Base UI preparation and cleanup both failed');
    expect(promotedBoundaryCalls).toBe(1);
    expect(recoveryBackupBoundaryCalls).toBe(1);
    expect((await lstat(preparedRoot)).isDirectory()).toBe(true);
    await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(retiredStagingRoot!)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(retiredBackupRoot!)).isDirectory()).toBe(true);
    expect(path.dirname(retiredBackupRoot!)).toBe(path.join(lockRoot, 'payloads'));
    expect((await lstat(lockRoot)).isDirectory()).toBe(true);
    const promotedOwner = JSON.parse(await readFile(lockOwnerPath, 'utf8'));
    await writeFile(lockOwnerPath, `${JSON.stringify({ ...promotedOwner, pid: 2_147_483_647, processIdentity: null })}\n`);
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(retiredBackupRoot!)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });

    const currentPreparedRecord = promotedOwner.transaction.stagedTree;
    const legacyStagingRoot = path.join(preparedParent, '.base-ui-staging-legacy-test');
    const legacyRetiredStagingRoot = path.join(preparedParent, '.base-ui-staging-retired-legacy-test');
    const unboundLegacyRetirement = path.join(preparedParent, '.base-ui-staging-retired-unbound-test');
    await mkdir(legacyRetiredStagingRoot);
    await writeFile(path.join(legacyRetiredStagingRoot, 'partial-copy'), 'partial legacy staging retirement\n');
    const legacyStagingIdentity = await lstat(legacyRetiredStagingRoot, { bigint: true });
    await mkdir(unboundLegacyRetirement);
    await writeFile(path.join(unboundLegacyRetirement, 'sentinel'), 'must remain unbound\n');
    await writeLegacyPreparationLock(lockRoot, {
      token: 'legacy-staging-retirement',
      transaction: {
        kind: 'spfx-ui-profile-preparation-v1',
        token: 'legacy-staging-retirement',
        preparedRoot,
        backupRoot,
        stagingRoot: legacyStagingRoot,
        hadPrepared: true,
        contracts: currentStamp.contracts,
        priorTree: currentPreparedRecord,
        stagedTree: {
          dev: String(legacyStagingIdentity.dev),
          ino: String(legacyStagingIdentity.ino),
          treeSha256: '0'.repeat(64)
        }
      }
    });
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(legacyRetiredStagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(unboundLegacyRetirement, 'sentinel'), 'utf8')).toBe('must remain unbound\n');
    await rm(unboundLegacyRetirement, { recursive: true });

    const legacyBackupRoot = path.join(preparedParent, '.base-ui-backup-retired-legacy-test');
    await mkdir(legacyBackupRoot);
    await writeFile(path.join(legacyBackupRoot, 'partial-copy'), 'partial legacy backup retirement\n');
    const legacyBackupIdentity = await lstat(legacyBackupRoot, { bigint: true });
    await writeLegacyPreparationLock(lockRoot, {
      token: 'legacy-backup-retirement',
      transaction: {
        kind: 'spfx-ui-profile-preparation-v1',
        token: 'legacy-backup-retirement',
        preparedRoot,
        backupRoot,
        stagingRoot: legacyStagingRoot,
        hadPrepared: true,
        contracts: currentStamp.contracts,
        priorTree: {
          dev: String(legacyBackupIdentity.dev),
          ino: String(legacyBackupIdentity.ino),
          treeSha256: '0'.repeat(64)
        },
        stagedTree: currentPreparedRecord
      }
    });
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(legacyBackupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });

    const contractPaths = [
      'compat/base-ui-1.6.0/id-ownership/contract.json',
      'compat/base-ui-1.6.0/popup-lifecycle/contract.json',
      'compat/base-ui-1.6.0/select-value/contract.json'
    ];
    const fixtureBindings = [];
    for (const contractPath of contractPaths) {
      const contract = JSON.parse(await readFile(path.join(profileRoot, contractPath), 'utf8'));
      for (const file of contract.providerFiles || []) {
        fixtureBindings.push({ path: file.sourcePath, sha256: file.sha256 });
      }
      for (const file of contract.files || []) {
        if (file.upstreamPath) fixtureBindings.push({ path: file.upstreamPath, sha256: file.upstreamSha256 });
        if (file.originalPath) fixtureBindings.push({ path: file.originalPath, sha256: file.originalSha256 });
        fixtureBindings.push({ path: file.transformedPath, sha256: file.transformedSha256 });
      }
    }
    expect(fixtureBindings).toHaveLength(12);
    for (const fixture of fixtureBindings) {
      const fixturePath = path.join(profileRoot, fixture.path);
      const original = await readFile(fixturePath);
      await writeFile(fixturePath, Buffer.concat([original, Buffer.from('\ncorrupted fixture\n')]));
      await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toThrow(`${fixture.path} digest differs`);
      await writeFile(fixturePath, original);
    }
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);

    await mkdir(lockRoot);
    await writeFile(
      lockOwnerPath,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: 2_147_483_647,
        token: 'abandoned-preparation',
        startedAt: '2026-08-09T00:00:00.000Z',
        processIdentity: null
      })}\n`
    );
    const abandonedPayloadRoot = path.join(lockRoot, 'payloads');
    await mkdir(abandonedPayloadRoot);
    const abandonedStagingRoot = path.join(abandonedPayloadRoot, 'staging-interrupted');
    await mkdir(abandonedStagingRoot);
    await writeFile(path.join(abandonedStagingRoot, 'partial-copy'), 'interrupted before journaling\n');
    const activeRecoveryToken = '00000000-0000-0000-0000-000000000000';
    const recoveryClaimPrefix = `${path.basename(lockRoot)}.recovery-claim-`;
    const recoveryClaimRoot = path.join(path.dirname(lockRoot), `${recoveryClaimPrefix}${activeRecoveryToken}`);
    const recoveryClaimPath = path.join(recoveryClaimRoot, 'claim.json');
    const retiredLockRoot = `${lockRoot}.stale-test`;
    let publicationBoundaryCalls = 0;
    await expect(
      prepareSpfxUiProfileBaseUi({
        appRoot,
        profileRoot,
        onPreparationLockBoundary: async (boundary: string) => {
          if (boundary !== 'initial-recovery-claims-scanned' || publicationBoundaryCalls > 0) return;
          publicationBoundaryCalls += 1;
          await mkdir(recoveryClaimRoot);
          await writeFile(
            recoveryClaimPath,
            `${JSON.stringify({
              schemaVersion: 1,
              pid: process.pid,
              token: activeRecoveryToken,
              ownerToken: 'abandoned-preparation',
              startedAt: '2026-08-09T00:00:00.000Z',
              processIdentity: null
            })}\n`
          );
          await rename(lockRoot, retiredLockRoot);
        }
      })
    ).rejects.toThrow(`Another Base UI preparation recovery is already in progress (pid ${process.pid}`);
    expect(publicationBoundaryCalls).toBe(1);
    await expect(lstat(lockRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(path.join(retiredLockRoot, 'owner.json'), 'utf8')).token).toBe('abandoned-preparation');
    expect((await lstat(path.join(retiredLockRoot, 'payloads', 'staging-interrupted'))).isDirectory()).toBe(true);
    expect(JSON.parse(await readFile(recoveryClaimPath, 'utf8')).token).toBe(activeRecoveryToken);
    expect((await readdir(path.dirname(lockRoot))).filter((name) => name.startsWith(recoveryClaimPrefix))).toEqual([
      path.basename(recoveryClaimRoot)
    ]);
    await rename(retiredLockRoot, lockRoot);
    await rm(recoveryClaimRoot, { recursive: true });
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    await expect(lstat(abandonedStagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(lockOwnerPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const retiredClaimResidue = path.join(path.dirname(lockRoot), `${path.basename(lockRoot)}.recovery-retired-interrupted`);
    await mkdir(retiredClaimResidue);
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);
    expect((await lstat(retiredClaimResidue)).isDirectory()).toBe(true);
    await rm(retiredClaimResidue, { recursive: true });

    const incompleteCanonicalClaim = path.join(path.dirname(lockRoot), `${recoveryClaimPrefix}incomplete-canonical-claim`);
    await mkdir(incompleteCanonicalClaim);
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(incompleteCanonicalClaim)).isDirectory()).toBe(true);
    await rm(incompleteCanonicalClaim, { recursive: true });

    const outsidePayloadRoot = path.join(appRoot, 'outside-preparation-payloads');
    await mkdir(outsidePayloadRoot);
    await writeFile(path.join(outsidePayloadRoot, 'sentinel'), 'must remain outside the preparation lock\n');
    await mkdir(lockRoot);
    await writeFile(
      lockOwnerPath,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: 2_147_483_647,
        token: 'symlinked-payload-root',
        startedAt: '2026-08-09T00:00:00.000Z',
        processIdentity: null
      })}\n`
    );
    await symlink(outsidePayloadRoot, path.join(lockRoot, 'payloads'), 'dir');
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toThrow(
      'Base UI preparation payload root must be an owned directory'
    );
    expect((await lstat(lockRoot)).isDirectory()).toBe(true);
    expect((await lstat(path.join(lockRoot, 'payloads'))).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(outsidePayloadRoot, 'sentinel'), 'utf8')).toBe('must remain outside the preparation lock\n');
    await rm(lockRoot, { recursive: true });
    await rm(outsidePayloadRoot, { recursive: true });

    await mkdir(lockRoot);
    await writeFile(
      lockOwnerPath,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        token: 'active-preparation',
        startedAt: '2026-08-09T00:00:00.000Z',
        processIdentity: null
      })}\n`
    );
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toThrow(
      `Another Base UI preparation is already in progress (pid ${process.pid}`
    );
    expect(JSON.parse(await readFile(lockOwnerPath, 'utf8')).token).toBe('active-preparation');
    await rm(lockRoot, { recursive: true });

    const danglingLockTarget = path.join(appRoot, 'missing-preparation-lock-target');
    await symlink(danglingLockTarget, lockRoot, 'dir');
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toThrow(
      'Base UI preparation lock metadata is unreadable'
    );
    expect((await lstat(lockRoot)).isSymbolicLink()).toBe(true);
    await expect(lstat(danglingLockTarget)).rejects.toMatchObject({ code: 'ENOENT' });
    await rm(lockRoot);

    const inheritedInclude = /[\\/]src[\\/]/u;
    const inheritedExclude = /legacy-global/u;
    const moduleRule = { ...createCssRule(true), include: inheritedInclude };
    const globalRule = { ...createCssRule(false), include: inheritedInclude, exclude: inheritedExclude };
    const webpackConfiguration: any = { module: { rules: [moduleRule, globalRule] } };
    let customization: any;
    registerSpfxUiProfileGulp(
      {
        configureWebpack: {
          mergeConfig(value: any) {
            customization = value;
          }
        }
      },
      { appRoot, profileRoot }
    );
    expect(customization.additionalConfiguration(webpackConfiguration)).toBe(webpackConfiguration);
    expect(webpackConfiguration.resolve.alias['@base-ui/react']).toBe(preparedRoot);
    expect(webpackConfiguration.resolve.alias).not.toHaveProperty('react/jsx-runtime$');
    expect(webpackConfiguration.module.rules).toHaveLength(5);
    const baseUiUtilsRoot = path.join(await realpath(appRoot), 'node_modules', '@base-ui', 'utils');
    const preparedMjsRule = webpackConfiguration.module.rules.find((rule: any) => rule.resolve?.fullySpecified === false);
    expect(preparedMjsRule).toBeDefined();
    expect(preparedMjsRule.include).toEqual([preparedRoot, baseUiUtilsRoot]);
    expect(matches(preparedMjsRule.test, path.join(preparedRoot, 'select', 'root', 'SelectRoot.mjs'))).toBe(true);
    expect(matches(preparedMjsRule.test, path.join(baseUiUtilsRoot, 'store', 'StoreInspector.mjs'))).toBe(true);
    expect(matches(preparedMjsRule.test, path.join(preparedRoot, 'select', 'root', 'SelectRoot.js'))).toBe(false);

    const cssPath = path.join(await realpath(profileRoot), 'tailwind-profile.css');
    const profileRule = webpackConfiguration.module.rules.find(
      (rule: any) => typeof rule.test === 'function' && rule.test.uiProfileCssPath
    );
    expect(matches(moduleRule.exclude, cssPath)).toBe(false);
    expect(matches(globalRule.exclude, cssPath)).toBe(true);
    expect(matches(profileRule.test, cssPath)).toBe(true);
    expect(matches(profileRule.test, `${cssPath}?used`)).toBe(true);
    expect(matches(profileRule.test, path.join(appRoot, 'src', 'unrelated.css'))).toBe(false);
    expect(profileRule.use).toBe(globalRule.use);
    expect(profileRule).not.toHaveProperty('include');
    expect(profileRule).not.toHaveProperty('exclude');
    const monacoPath = path.join(await realpath(appRoot), 'node_modules', 'monaco-editor', 'editor.css');
    const monacoRule = webpackConfiguration.module.rules.find(
      (rule: any) => String(rule.test) === String(/[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i)
    );
    expect(monacoRule).toBeDefined();
    expect(monacoRule).not.toHaveProperty('include');
    expect(monacoRule).not.toHaveProperty('exclude');
    expect(matches(moduleRule.exclude, monacoPath)).toBe(true);
    expect(matches(globalRule.exclude, monacoPath)).toBe(true);
    expect(ruleApplies(monacoRule, monacoPath)).toBe(true);
    expect(ruleApplies(profileRule, cssPath)).toBe(true);
    expect(ruleApplies(moduleRule, monacoPath)).toBe(false);
    expect(ruleApplies(globalRule, monacoPath)).toBe(false);
    expect(ruleApplies(moduleRule, cssPath)).toBe(false);
    expect(ruleApplies(globalRule, cssPath)).toBe(false);

    expect(customization.additionalConfiguration(webpackConfiguration)).toBe(webpackConfiguration);
    expect(webpackConfiguration.module.rules).toHaveLength(5);

    for (const entry of closure.packages) {
      const driftedLock = structuredClone(lock);
      driftedLock.packages[lockPath(entry.name)].version = '0.0.0-drift';
      await writeFile(appLockPath, `${JSON.stringify(driftedLock)}\n`);
      expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
        `Installed ${entry.name} lock identity differs from the dependency closure.`
      );
    }
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);

    const optionalLock = structuredClone(lock);
    optionalLock.packages['node_modules/@base-ui/utils'].optionalDependencies = { 'left-pad': '1.3.0' };
    await writeFile(appLockPath, `${JSON.stringify(optionalLock)}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Installed @base-ui/utils optional dependency metadata differs.'
    );

    const bundledLock = structuredClone(lock);
    bundledLock.packages['node_modules/@base-ui/utils'].bundleDependencies = [];
    bundledLock.packages['node_modules/@base-ui/utils'].bundledDependencies = ['left-pad'];
    await writeFile(appLockPath, `${JSON.stringify(bundledLock)}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Installed @base-ui/utils bundled dependency metadata differs.'
    );
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);

    const floatingManifestPath = path.join(appRoot, 'node_modules', '@floating-ui', 'react-dom', 'package.json');
    const floatingManifest = JSON.parse(await readFile(floatingManifestPath, 'utf8'));
    await writeFile(floatingManifestPath, `${JSON.stringify({ ...floatingManifest, version: '0.0.0-drift' })}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @floating-ui/react-dom package identity differs from the dependency closure.'
    );
    await writeFile(floatingManifestPath, `${JSON.stringify(floatingManifest)}\n`);

    const utilsManifestPath = path.join(appRoot, 'node_modules', '@base-ui', 'utils', 'package.json');
    const utilsManifest = JSON.parse(await readFile(utilsManifestPath, 'utf8'));
    await writeFile(
      utilsManifestPath,
      `${JSON.stringify({
        ...utilsManifest,
        optionalDependencies: { 'left-pad': '1.3.0' },
        bundleDependencies: [],
        bundledDependencies: ['left-pad']
      })}\n`
    );
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @base-ui/utils optional dependencies differ.'
    );
    await writeFile(
      utilsManifestPath,
      `${JSON.stringify({ ...utilsManifest, bundleDependencies: [], bundledDependencies: ['left-pad'] })}\n`
    );
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @base-ui/utils bundled dependencies differ.'
    );
    await writeFile(utilsManifestPath, `${JSON.stringify(utilsManifest)}\n`);

    const nestedRuntimeRoot = path.join(appRoot, 'node_modules', '@base-ui', 'utils', 'node_modules', '@babel', 'runtime');
    await mkdir(path.dirname(nestedRuntimeRoot), { recursive: true });
    await cp(path.join(repositoryRoot, 'node_modules', '@babel', 'runtime'), nestedRuntimeRoot, { recursive: true });
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @babel/runtime path differs from the app lockfile.'
    );

    const outsideTempRoot = await mkdtemp(path.join(tmpdir(), 'spfx-ui-profile-outside-'));
    temporaryDirectories.push(outsideTempRoot);
    const outsideSentinel = path.join(outsideTempRoot, 'sentinel.txt');
    await writeFile(outsideSentinel, 'must remain outside the app\n');
    await rm(path.join(appRoot, 'temp'), { recursive: true, force: true });
    await symlink(outsideTempRoot, path.join(appRoot, 'temp'), 'dir');
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).rejects.toThrow(
      'Prepared Base UI path must be an app-local directory'
    );
    expect(await readFile(outsideSentinel, 'utf8')).toBe('must remain outside the app\n');
    await expect(lstat(path.join(outsideTempRoot, 'spfx-ui-profile'))).rejects.toMatchObject({ code: 'ENOENT' });
  }, 120_000);
});

async function terminatePreparationAtBoundary({
  appRoot,
  profileRoot,
  boundary,
  beforeKill
}: {
  appRoot: string;
  profileRoot: string;
  boundary: string;
  beforeKill?: (details: any) => Promise<void>;
}): Promise<any> {
  const moduleUrl = pathToFileURL(
    path.join(repositoryRoot, 'packages', 'source-editor-react', 'spfx-ui-profile-prepare.mjs')
  ).href;
  const script = `
    const { prepareSpfxUiProfileBaseUi } = await import(${JSON.stringify(moduleUrl)});
    await prepareSpfxUiProfileBaseUi({
      appRoot: ${JSON.stringify(appRoot)},
      profileRoot: ${JSON.stringify(profileRoot)},
      onPreparationLockBoundary: async (name, details) => {
        if (name !== ${JSON.stringify(boundary)}) return;
        await new Promise((resolve, reject) => {
          process.send({ name, details }, (error) => (error ? reject(error) : resolve()));
        });
        setInterval(() => {}, 1_000);
        await new Promise(() => {});
      }
    });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve());
  });
  const boundaryReached = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${boundary}: ${stderr}`)), 20_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Preparation child exited before ${boundary} (code ${code}, signal ${signal}): ${stderr}`));
    });
    child.on('message', (message: any) => {
      if (message?.name !== boundary) return;
      clearTimeout(timeout);
      resolve(message.details);
    });
  });
  try {
    const details = await boundaryReached;
    await beforeKill?.(details);
    return details;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

async function removePreparationRecoveryClaimResidues(lockRoot: string): Promise<void> {
  const preparedParent = path.dirname(lockRoot);
  const claimPrefix = `${path.basename(lockRoot)}.recovery-claim-`;
  for (const name of await readdir(preparedParent)) {
    if (name.startsWith(claimPrefix)) await rm(path.join(preparedParent, name), { recursive: true });
  }
}

async function writeLegacyPreparationLock(
  lockRoot: string,
  value: { token: string; transaction: Record<string, unknown> }
): Promise<void> {
  await mkdir(lockRoot);
  await writeFile(
    path.join(lockRoot, 'owner.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      pid: 2_147_483_647,
      token: value.token,
      startedAt: '2026-08-09T00:00:00.000Z',
      processIdentity: null,
      transaction: value.transaction
    })}\n`
  );
}

function lockPath(name: string): string {
  return name === 'reselect' ? 'node_modules/@base-ui/utils/node_modules/reselect' : `node_modules/${name}`;
}

function createBuildStub(): any {
  return { configureWebpack: { mergeConfig() {} } };
}

function createCssRule(modulesEnabled: boolean): any {
  return {
    test: modulesEnabled ? /\.module(?:\.scss)?\.css$/iu : /(?<!\.module(?:\.scss)?)\.css$/iu,
    use: [
      {
        loader: '/repo/node_modules/@microsoft/sp-css-loader/lib/index.js',
        options: modulesEnabled ? { async: true, generateCssClassName: () => 'hash' } : { async: true }
      }
    ]
  };
}

function matches(condition: any, value: string): boolean {
  if (Array.isArray(condition)) return condition.some((entry) => matches(entry, value));
  if (typeof condition === 'function') return condition(value);
  return condition instanceof RegExp ? condition.test(value) : false;
}

function ruleApplies(rule: any, value: string): boolean {
  return matches(rule.test, value) && (!rule.include || matches(rule.include, value)) && !matches(rule.exclude, value);
}
