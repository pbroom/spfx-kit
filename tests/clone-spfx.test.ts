import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cloneCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/clone-spfx-app.mjs');
const syncCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/sync-lab.mjs');

const forkUrl = 'https://example.com/me/their-webpart.git';

let workDir = '';
let sourceRepoDir = '';
let appDir = '';

function runCli(cli: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: workDir, encoding: 'utf8' });
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-clone-'));
  sourceRepoDir = path.join(workDir, 'their-webpart-source');
  appDir = path.join(workDir, '.spfx-kit', 'apps', 'their-webpart-spfx');

  await mkdir(path.join(sourceRepoDir, 'src'), { recursive: true });
  await writeFile(
    path.join(sourceRepoDir, 'package.json'),
    `${JSON.stringify({ name: 'their-webpart', version: '1.0.0', description: 'Their web part' }, null, 2)}\n`
  );
  await writeFile(path.join(sourceRepoDir, 'src', 'index.ts'), 'export {};\n');
  runGit(sourceRepoDir, ['init', '-q', '-b', 'main']);
  runGit(sourceRepoDir, ['config', 'user.email', 'test@example.com']);
  runGit(sourceRepoDir, ['config', 'user.name', 'Test']);
  runGit(sourceRepoDir, ['add', '-A']);
  runGit(sourceRepoDir, ['commit', '-qm', 'initial']);
  runGit(sourceRepoDir, ['commit', '-qm', 'second', '--allow-empty']);
});

afterAll(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
  }
});

describe('clone:spfx third-party flow', () => {
  it('clones a repo with full history into the managed apps area', async () => {
    const result = runCli(cloneCli, ['--source', sourceRepoDir, '--name', 'their-webpart', '--fork', forkUrl]);
    expect(result.stderr).not.toContain('Error');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('.spfx-kit/apps/their-webpart-spfx');

    const gitDir = await stat(path.join(appDir, '.git'));
    expect(gitDir.isDirectory()).toBe(true);
    expect(runGit(appDir, ['rev-list', '--count', 'HEAD'])).toBe('2');
  });

  it('points origin at the fork and upstream at the source', async () => {
    const gitConfig = await readFile(path.join(appDir, '.git', 'config'), 'utf8');
    expect(gitConfig).toContain(forkUrl);
    expect(runGit(appDir, ['config', 'remote.upstream.url'])).toBe(sourceRepoDir);
  });

  it('scaffolds a local-only lab adapter and clone metadata', async () => {
    const adapter = await readFile(path.join(appDir, '.spfx-kit', 'lab', 'register.tsx'), 'utf8');
    expect(adapter).toContain("appId: 'their-webpart-spfx'");
    expect(adapter).toContain('Their web part');

    const metadata = JSON.parse(await readFile(path.join(appDir, '.spfx-kit', 'clone.json'), 'utf8'));
    expect(metadata).toMatchObject({ source: sourceRepoDir, ref: null, fork: forkUrl });
  });

  it('keeps kit-generated files out of the clone git status', async () => {
    const exclude = await readFile(path.join(appDir, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.split('\n')).toContain('.spfx-kit/');
    expect(runGit(appDir, ['status', '--porcelain'])).toBe('');
  });

  it('does not rewrite the third-party package.json', async () => {
    const packageJson = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('their-webpart');
  });

  it('registers the cloned app in the lab', () => {
    const result = runCli(syncCli, ['--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ syncedAdapters: 1 });
  });

  it('refuses to overwrite an existing clone without --force', () => {
    const result = runCli(cloneCli, ['--source', sourceRepoDir, '--name', 'their-webpart']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Refusing to overwrite');
  });

  it('rejects sources that are not SPFx-shaped projects', async () => {
    const emptyRepo = path.join(workDir, 'empty-source');
    await mkdir(emptyRepo, { recursive: true });
    runGit(emptyRepo, ['init', '-q', '-b', 'main']);
    runGit(emptyRepo, ['config', 'user.email', 'test@example.com']);
    runGit(emptyRepo, ['config', 'user.name', 'Test']);
    await writeFile(path.join(emptyRepo, 'README.md'), 'not an spfx app\n');
    runGit(emptyRepo, ['add', '-A']);
    runGit(emptyRepo, ['commit', '-qm', 'initial']);

    const result = runCli(cloneCli, ['--source', emptyRepo, '--name', 'not-an-app']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No package.json');
    await expect(stat(path.join(workDir, '.spfx-kit', 'apps', 'not-an-app-spfx'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });
});
