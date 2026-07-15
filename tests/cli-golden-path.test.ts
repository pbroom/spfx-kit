import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bumpCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/bump-spfx-app.mjs');
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
    for (const file of [
      'package.json',
      'config/rig.json',
      'config/typescript.json',
      'config/package-solution.json',
      '.spfx-kit/lab/register.tsx',
      '.spfx-kit/lab/tsconfig.json',
      '.github/workflows/ci.yml',
      '.nvmrc',
      '.gitignore'
    ]) {
      const info = await stat(path.join(appDir, file));
      expect(info.isFile()).toBe(true);
    }
    await expect(stat(path.join(appDir, 'gulpfile.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    const packageJson = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'));
    expect(packageJson.devDependencies).toMatchObject({
      '@microsoft/spfx-web-build-rig': '1.23.2',
      '@rushstack/heft': '1.2.17',
      typescript: '~5.8.0'
    });
    expect(packageJson.devDependencies).not.toHaveProperty('@microsoft/sp-build-web');
    const serveJson = JSON.parse(await readFile(path.join(appDir, 'config', 'serve.json'), 'utf8'));
    expect(serveJson.initialPage).toContain('/SitePages/Home.aspx?loadSPFX=true');
    expect(serveJson.initialPage).toContain('debugManifestsFile=https://localhost:4321/temp/build/manifests.js');
    expect(serveJson.initialPage).not.toContain('workbench.aspx');

    const workflow = await readFile(path.join(appDir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(workflow).toContain('npm run ship');
    expect(workflow).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(await readFile(path.join(appDir, '.nvmrc'), 'utf8')).toBe('22.22.3\n');
    expect(await readFile(path.join(appDir, '.gitignore'), 'utf8')).toContain('sharepoint/solution/*.sppkg');
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

  it('recovers a pending two-file version bump without bumping twice', async () => {
    const appDir = path.join(workDir, '.spfx-kit', 'apps', 'team-divider-spfx');
    const packagePath = path.join(appDir, 'package.json');
    const solutionPath = path.join(appDir, 'config', 'package-solution.json');
    const packageBackup = `${packagePath}.spfx-kit-bump.bak`;
    const solutionTmp = `${solutionPath}.spfx-kit-bump.tmp`;
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    const packageSolution = JSON.parse(await readFile(solutionPath, 'utf8'));

    const backupPackageJson = { ...packageJson, version: '1.0.0' };
    const bumpedPackageJson = { ...packageJson, version: '1.0.1' };
    const bumpedPackageSolution = {
      ...packageSolution,
      solution: {
        ...packageSolution.solution,
        version: '1.0.1.0',
        features: packageSolution.solution.features.map((feature: Record<string, unknown>) => ({
          ...feature,
          version: '1.0.1.0'
        }))
      }
    };

    await writeFile(packageBackup, `${JSON.stringify(backupPackageJson, null, 2)}\n`);
    await writeFile(packagePath, `${JSON.stringify(bumpedPackageJson, null, 2)}\n`);
    await writeFile(solutionTmp, `${JSON.stringify(bumpedPackageSolution, null, 2)}\n`);

    const result = runCli(bumpCli, ['--app', '.spfx-kit/apps/team-divider-spfx', '--json']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      recovered: true,
      previousVersion: '1.0.0',
      version: '1.0.1',
      solutionVersion: '1.0.1.0'
    });

    const recoveredPackageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    const recoveredPackageSolution = JSON.parse(await readFile(solutionPath, 'utf8'));
    expect(recoveredPackageJson.version).toBe('1.0.1');
    expect(recoveredPackageSolution.solution.version).toBe('1.0.1.0');
    expect(
      recoveredPackageSolution.solution.features.every((feature: { version: string }) => feature.version === '1.0.1.0')
    ).toBe(true);
    await expect(stat(packageBackup)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(solutionTmp)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
