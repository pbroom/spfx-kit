import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeManagedAppVersion, selectManagedAppVersion, sortVersionTags } from '../apps/lab/server/app-versions';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('managed app versions', () => {
  it('sorts version tags newest first', () => {
    expect(sortVersionTags(['nightly', 'v1.9.0', 'v1.10.0', 'v2.0.0-beta.1', 'v2.0.0'])).toEqual([
      'v2.0.0',
      'v2.0.0-beta.1',
      'v1.10.0',
      'v1.9.0'
    ]);
  });

  it('discovers tags, switches pinned versions, and returns to Latest', async () => {
    const fixture = await createGitAppFixture();
    const initial = await describeManagedAppVersion(fixture.appDir);

    expect(initial).toMatchObject({
      current: '1.1.0',
      autoUpdate: false,
      selected: 'latest',
      canSelect: true,
      updateAvailable: false,
      source: 'clone'
    });
    expect(initial.options.map((option) => option.id)).toEqual(['latest', 'tag:v1.0.0']);

    await selectManagedAppVersion(fixture.appDir, 'tag:v1.0.0');
    expect(await readPackageVersion(fixture.appDir)).toBe('1.0.0');
    expect(await describeManagedAppVersion(fixture.appDir)).toMatchObject({
      selected: 'tag:v1.0.0',
      autoUpdate: false,
      canSelect: true
    });

    await selectManagedAppVersion(fixture.appDir, 'latest');
    expect(await readPackageVersion(fixture.appDir)).toBe('1.1.0');
    expect(git(fixture.appDir, 'branch', '--show-current')).toBe('main');
    expect(await describeManagedAppVersion(fixture.appDir)).toMatchObject({ selected: 'latest', autoUpdate: true });
  });

  it('detects a newer remote commit and fast-forwards a clean Latest checkout', async () => {
    const fixture = await createGitAppFixture();
    await writePackageVersion(fixture.sourceDir, '1.2.0');
    git(fixture.sourceDir, 'add', 'package.json');
    git(fixture.sourceDir, 'commit', '-m', 'release 1.2.0');
    git(fixture.sourceDir, 'push', 'origin', 'main');

    expect(await describeManagedAppVersion(fixture.appDir)).toMatchObject({
      selected: 'latest',
      updateAvailable: true,
      canSelect: true
    });

    await selectManagedAppVersion(fixture.appDir, 'latest');
    expect(await readPackageVersion(fixture.appDir)).toBe('1.2.0');
  });

  it('refuses to change a dirty app or a feature-branch checkout', async () => {
    const fixture = await createGitAppFixture();
    await writeFile(path.join(fixture.appDir, 'local-change.txt'), 'keep me\n', 'utf8');

    await expect(selectManagedAppVersion(fixture.appDir, 'tag:v1.0.0')).rejects.toThrow('local changes');
    expect(await readPackageVersion(fixture.appDir)).toBe('1.1.0');

    await rm(path.join(fixture.appDir, 'local-change.txt'));
    git(fixture.appDir, 'switch', '-c', 'feature/work');
    await expect(selectManagedAppVersion(fixture.appDir, 'tag:v1.0.0')).rejects.toThrow('feature branch');
  });

  it('pauses a clean branch that is ahead of or diverged from Latest', async () => {
    const fixture = await createGitAppFixture();
    await writePackageVersion(fixture.appDir, '1.1.1');
    git(fixture.appDir, 'add', 'package.json');
    git(fixture.appDir, 'commit', '-m', 'local main commit');

    expect(await describeManagedAppVersion(fixture.appDir)).toMatchObject({
      canSelect: false,
      updateAvailable: false,
      detail: 'Update paused because this branch has local commits ahead of Latest.'
    });
    await expect(selectManagedAppVersion(fixture.appDir, 'latest')).rejects.toThrow('ahead from Latest');

    await writePackageVersion(fixture.sourceDir, '1.2.0');
    git(fixture.sourceDir, 'add', 'package.json');
    git(fixture.sourceDir, 'commit', '-m', 'remote main commit');
    git(fixture.sourceDir, 'push', 'origin', 'main');

    await expect(selectManagedAppVersion(fixture.appDir, 'latest')).rejects.toThrow('diverged from Latest');
    expect(await describeManagedAppVersion(fixture.appDir)).toMatchObject({
      canSelect: false,
      updateAvailable: false,
      detail: 'Update paused because this branch has diverged from Latest.'
    });
  });
});

async function createGitAppFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-app-version-'));
  temporaryDirectories.push(root);
  const remoteDir = path.join(root, 'remote.git');
  const sourceDir = path.join(root, 'source');
  const appDir = path.join(root, 'app');
  await mkdir(sourceDir);
  git(root, 'init', '--bare', remoteDir);
  git(sourceDir, 'init', '-b', 'main');
  git(sourceDir, 'config', 'user.email', 'test@example.com');
  git(sourceDir, 'config', 'user.name', 'SPFx Kit Test');
  await writePackageVersion(sourceDir, '1.0.0');
  git(sourceDir, 'add', 'package.json');
  git(sourceDir, 'commit', '-m', 'release 1.0.0');
  git(sourceDir, 'tag', 'v1.0.0');
  await writePackageVersion(sourceDir, '1.1.0');
  git(sourceDir, 'add', 'package.json');
  git(sourceDir, 'commit', '-m', 'release 1.1.0');
  git(sourceDir, 'remote', 'add', 'origin', remoteDir);
  git(sourceDir, 'push', '--tags', '-u', 'origin', 'main');
  git(remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(root, 'clone', remoteDir, appDir);
  git(appDir, 'config', 'user.email', 'test@example.com');
  git(appDir, 'config', 'user.name', 'SPFx Kit Test');
  await mkdir(path.join(appDir, '.spfx-kit'), { recursive: true });
  await writeFile(path.join(appDir, '.git', 'info', 'exclude'), '.spfx-kit/\n', 'utf8');
  await writeFile(
    path.join(appDir, '.spfx-kit', 'clone.json'),
    `${JSON.stringify({ source: remoteDir, ref: 'main', clonedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
  return { appDir, remoteDir, sourceDir };
}

async function writePackageVersion(directory: string, version: string) {
  await writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name: 'fixture-spfx', version }, null, 2)}\n`);
}

async function readPackageVersion(directory: string) {
  const packageJson = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as { version: string };
  return packageJson.version;
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}
