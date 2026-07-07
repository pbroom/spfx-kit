import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/create-spfx-app.mjs');
const validateCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/validate-spfx-app.mjs');
const syncCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/sync-lab.mjs');

let workDir = '';

function runCli(cli: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: workDir, encoding: 'utf8' });
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-golden-'));
});

afterAll(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
  }
});

describe('create -> sync -> validate golden path', () => {
  it('creates a managed SPFx app scaffold', async () => {
    const result = runCli(createCli, ['--name', 'team-divider', '--title', 'Team Divider', '--webpart', 'TeamDivider']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('.spfx-kit/apps/team-divider-spfx');

    const appDir = path.join(workDir, '.spfx-kit', 'apps', 'team-divider-spfx');
    for (const file of ['package.json', 'gulpfile.js', 'config/package-solution.json', '.spfx-kit/lab/register.tsx']) {
      const info = await stat(path.join(appDir, file));
      expect(info.isFile()).toBe(true);
    }
  });

  it('refuses to overwrite an existing app without --force', () => {
    const result = runCli(createCli, ['--name', 'team-divider', '--title', 'Team Divider', '--webpart', 'TeamDivider']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Refusing to overwrite');
  });

  it('syncs the lab registry with the created adapter', async () => {
    const result = runCli(syncCli, ['--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ syncedAdapters: 1 });

    const registry = path.join(workDir, 'apps', 'lab', 'src', 'generated', 'lab-registry.ts');
    const info = await stat(registry);
    expect(info.isFile()).toBe(true);
  });

  it('passes lab-profile validation', () => {
    const result = runCli(validateCli, ['--app', '.spfx-kit/apps/team-divider-spfx', '--profile', 'lab']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Validated @spfx-kit/team-divider-spfx');
  });
});
