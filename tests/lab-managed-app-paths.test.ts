import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { managedAppSourceRoots, refreshManagedAppSourceRoots } from '../apps/lab/server/paths';

describe('managed app source roots', () => {
  let fixtureDir: string;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-managed-roots-'));
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('treats missing paths and regular files as unavailable app directories', async () => {
    const regularFile = path.join(fixtureDir, 'not-a-directory');
    await writeFile(regularFile, 'fixture');

    expect(managedAppSourceRoots(path.join(fixtureDir, 'missing'))).toEqual([]);
    expect(managedAppSourceRoots(regularFile)).toEqual([]);
  });

  it('reconciles app roots discovered, removed, or repointed after startup', async () => {
    const appsDir = path.join(fixtureDir, 'apps');
    const firstApp = path.join(fixtureDir, 'first-app');
    const secondApp = path.join(fixtureDir, 'second-app');
    await Promise.all([mkdir(appsDir), mkdir(firstApp), mkdir(secondApp)]);
    await symlink(firstApp, path.join(appsDir, 'first-app'), 'dir');
    const [firstAppRoot, secondAppRoot] = await Promise.all([realpath(firstApp), realpath(secondApp)]);

    const initial = refreshManagedAppSourceRoots(['/workspace'], new Map(), appsDir);
    expectRefresh(initial, ['/workspace', firstAppRoot], [['first-app', firstAppRoot]]);

    await symlink(secondApp, path.join(appsDir, 'second-app'), 'dir');
    await symlink(path.join(fixtureDir, 'missing-target'), path.join(appsDir, 'broken-app'), 'dir');
    await writeFile(path.join(appsDir, 'not-an-app'), 'fixture');

    const refreshed = refreshManagedAppSourceRoots(initial.allowedRoots, initial.managedEntries, appsDir);
    expectRefresh(
      refreshed,
      ['/workspace', firstAppRoot, secondAppRoot],
      [
        ['first-app', firstAppRoot],
        ['second-app', secondAppRoot]
      ]
    );

    const failedScan = refreshManagedAppSourceRoots(
      refreshed.allowedRoots,
      refreshed.managedEntries,
      path.join(fixtureDir, 'missing')
    );
    expectRefresh(failedScan, refreshed.allowedRoots, [...refreshed.managedEntries]);

    await rm(path.join(appsDir, 'first-app'));
    await symlink(path.join(fixtureDir, 'missing-target'), path.join(appsDir, 'first-app'), 'dir');
    const partialFailure = refreshManagedAppSourceRoots(refreshed.allowedRoots, refreshed.managedEntries, appsDir);
    expectRefresh(partialFailure, refreshed.allowedRoots, [...refreshed.managedEntries]);

    await rm(path.join(appsDir, 'first-app'));
    await symlink(secondApp, path.join(appsDir, 'first-app'), 'dir');
    const repointed = refreshManagedAppSourceRoots(partialFailure.allowedRoots, partialFailure.managedEntries, appsDir);
    expectRefresh(
      repointed,
      ['/workspace', secondAppRoot],
      [
        ['first-app', secondAppRoot],
        ['second-app', secondAppRoot]
      ]
    );

    await rm(appsDir, { recursive: true });
    await mkdir(appsDir);
    const emptied = refreshManagedAppSourceRoots(repointed.allowedRoots, repointed.managedEntries, appsDir);
    expectRefresh(emptied, ['/workspace'], []);
  });
});

function expectRefresh(
  refresh: ReturnType<typeof refreshManagedAppSourceRoots>,
  allowedRoots: string[],
  managedEntries: Array<[string, string]>
): void {
  expect(refresh.allowedRoots).toEqual(allowedRoots);
  expect([...refresh.managedEntries]).toEqual(managedEntries);
  expect(refresh.managedRoots).toEqual([...new Set(managedEntries.map(([, sourceRoot]) => sourceRoot))]);
}
