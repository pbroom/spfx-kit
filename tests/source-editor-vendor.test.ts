import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syncCli = path.join(repoRoot, 'packages/spfx-tools/src/cli/sync-source-editor.mjs');
const temporaryDirectories: string[] = [];

describe('sync:source-editor', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('writes standalone snapshots and rejects vendor drift in check mode', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'spfx-kit-source-editor-'));
    temporaryDirectories.push(fixture);
    const coreDir = path.join(fixture, 'packages', 'source-editor-core');
    const reactDir = path.join(fixture, 'packages', 'source-editor-react');
    const appDir = path.join(fixture, '.spfx-kit', 'apps', 'better-divider-spfx');
    const textAppDir = path.join(fixture, '.spfx-kit', 'apps', 'better-text-spfx');
    const listAppDir = path.join(fixture, '.spfx-kit', 'apps', 'better-list-spfx');
    await mkdir(path.join(coreDir, 'src'), { recursive: true });
    await mkdir(path.join(reactDir, 'src'), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await mkdir(textAppDir, { recursive: true });
    await mkdir(listAppDir, { recursive: true });
    await writeFile(path.join(coreDir, 'package.json'), '{"name":"@spfx-kit/source-editor-core","version":"2.0.0"}\n');
    await writeFile(path.join(coreDir, 'src', 'index.ts'), 'export const language = "scss";\n');
    await writeFile(path.join(reactDir, 'package.json'), '{"name":"@spfx-kit/source-editor-react","version":"3.0.0"}\n');
    await writeFile(path.join(reactDir, 'src', 'SourceEditorField.tsx'), 'export const editor = "react";\n');
    await writeFile(path.join(reactDir, 'src', 'SourceWorkspaceField.tsx'), 'export const workspace = "react";\n');
    await writeFile(path.join(reactDir, 'src', 'sourceEditorMonacoAdapter.full.ts'), 'export const adapter = "html-and-scss";\n');
    await writeFile(
      path.join(reactDir, 'src', 'sourceEditorMonacoAdapter.scss-only.ts'),
      'export const adapter = "scss-only";\n'
    );
    await writeFile(path.join(reactDir, 'spfx-monaco-webpack.cjs'), 'module.exports = function configure() {};\n');
    await writeFile(path.join(appDir, 'package.json'), '{"name":"better-divider-spfx"}\n');
    await writeFile(path.join(textAppDir, 'package.json'), '{"name":"better-text-spfx"}\n');
    await writeFile(path.join(listAppDir, 'package.json'), '{"name":"better-list-spfx"}\n');
    await writeUiProfileFixture(fixture, '3.0.0');

    const syncResult = runCli(fixture);
    expect(syncResult.status).toBe(0);
    expect(syncResult.stdout).toContain('better-divider-spfx: updated');
    expect(syncResult.stdout).toContain('better-text-spfx: updated');

    const coreVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'sourceEditorCore.ts');
    const reactVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'SourceEditorField.tsx');
    const workspaceVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'SourceWorkspaceField.tsx');
    const adapterVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'sourceEditorMonacoAdapter.ts');
    const webpackVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'spfx-monaco-webpack.cjs');
    const profileManifestPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'ui-profile', 'manifest.json');
    const buttonVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'ui-profile', 'components', 'ui', 'button.tsx');
    const dropdownMenuVendorPath = path.join(
      appDir,
      'src',
      'vendor',
      'source-editor',
      'ui-profile',
      'components',
      'ui',
      'dropdown-menu.tsx'
    );
    const tabsVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'ui-profile', 'components', 'ui', 'tabs.tsx');
    const coreVendor = await readFile(coreVendorPath, 'utf8');
    const reactVendor = await readFile(reactVendorPath, 'utf8');
    const adapterVendor = await readFile(adapterVendorPath, 'utf8');
    const webpackVendor = await readFile(webpackVendorPath, 'utf8');
    expect(coreVendor).toContain('Vendored from @spfx-kit/source-editor-core@2.0.0');
    expect(reactVendor).toContain('Vendored from @spfx-kit/source-editor-react@3.0.0');
    expect(adapterVendor).toContain('scss-only');
    expect(webpackVendor).toContain('Vendored from @spfx-kit/source-editor-react@3.0.0');
    expect(await readFile(profileManifestPath, 'utf8')).toContain('source-editor-scss-react17-base-nova-v1');
    expect(await readFile(buttonVendorPath, 'utf8')).toBe(
      await readFile(path.join(fixture, 'packages/ui-profile/normalized/src/components/ui/button.tsx'), 'utf8')
    );
    expect(await readFile(dropdownMenuVendorPath, 'utf8')).toBe(
      await readFile(path.join(fixture, 'packages/ui-profile/normalized/src/components/ui/dropdown-menu.tsx'), 'utf8')
    );
    await expect(readFile(workspaceVendorPath, 'utf8')).rejects.toThrow();
    await expect(readFile(tabsVendorPath, 'utf8')).rejects.toThrow();

    const listVendorRoot = path.join(listAppDir, 'src', 'vendor', 'source-editor');
    expect(await readFile(path.join(listVendorRoot, 'SourceWorkspaceField.tsx'), 'utf8')).toContain(
      'Vendored from @spfx-kit/source-editor-react@3.0.0'
    );
    expect(await readFile(path.join(listVendorRoot, 'sourceEditorMonacoAdapter.ts'), 'utf8')).toContain('html-and-scss');
    expect(await readFile(path.join(listVendorRoot, 'ui-profile', 'manifest.json'), 'utf8')).toContain(
      'source-editor-react17-base-nova-v1'
    );
    expect(await readFile(path.join(listVendorRoot, 'ui-profile', 'components', 'ui', 'tabs.tsx'), 'utf8')).toBe(
      await readFile(path.join(fixture, 'packages/ui-profile/normalized/src/components/ui/tabs.tsx'), 'utf8')
    );
    const currentCheck = runCli(fixture, ['--check']);
    expect(currentCheck.status, `${currentCheck.stdout}\n${currentCheck.stderr}`).toBe(0);
    expect(runCli(fixture, ['--check', '--require-all']).status).toBe(0);

    await writeFile(reactVendorPath, `${reactVendor}// local edit\n`);
    const driftResult = runCli(fixture, ['--check']);
    expect(driftResult.status).toBe(1);
    expect(driftResult.stderr).toContain('Outdated source editor vendor in: better-divider-spfx');

    expect(runCli(fixture).status).toBe(0);
    const staleProfilePath = path.join(appDir, 'src', 'vendor', 'source-editor', 'ui-profile', 'stale.ts');
    await writeFile(staleProfilePath, 'export const stale = true;\n');
    expect(runCli(fixture, ['--check']).status).toBe(1);
    expect(runCli(fixture).status).toBe(0);
    await expect(readFile(staleProfilePath, 'utf8')).rejects.toThrow();

    await writeFile(tabsVendorPath, 'export const wrongProfile = true;\n');
    const wrongProfile = runCli(fixture, ['--check']);
    expect(wrongProfile.status).toBe(1);
    expect(wrongProfile.stderr).toContain('better-divider-spfx');
    expect(runCli(fixture).status).toBe(0);
    await expect(readFile(tabsVendorPath, 'utf8')).rejects.toThrow();

    const textVendorRoot = path.join(textAppDir, 'src', 'vendor', 'source-editor');
    await writeFile(path.join(appDir, 'src', 'vendor', 'source-editor', 'transaction-marker.txt'), 'divider-before\n');
    await writeFile(path.join(textVendorRoot, 'transaction-marker.txt'), 'text-before\n');
    const dividerBefore = await snapshotTree(path.join(appDir, 'src', 'vendor', 'source-editor'));
    const textBefore = await snapshotTree(textVendorRoot);
    await rm(path.join(reactDir, 'src', 'SourceWorkspaceField.tsx'));

    const lateFullProfileFailure = runCli(fixture, ['--require-all']);
    expect(lateFullProfileFailure.status).toBe(1);
    expect(lateFullProfileFailure.stderr).toContain('SourceWorkspaceField.tsx');
    expect(await snapshotTree(path.join(appDir, 'src', 'vendor', 'source-editor'))).toEqual(dividerBefore);
    expect(await snapshotTree(textVendorRoot)).toEqual(textBefore);
  });

  it('fails require-all acceptance when a managed consumer is missing', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'spfx-kit-source-editor-missing-'));
    temporaryDirectories.push(fixture);
    await mkdir(path.join(fixture, '.spfx-kit', 'apps', 'better-divider-spfx'), { recursive: true });
    await writeFile(
      path.join(fixture, '.spfx-kit', 'apps', 'better-divider-spfx', 'package.json'),
      '{"name":"better-divider-spfx"}\n'
    );
    await copySourceFixture(fixture);
    const result = runCli(fixture, ['--require-all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required source editor consumers: better-text-spfx, better-list-spfx');
    await expect(
      readFile(
        path.join(fixture, '.spfx-kit', 'apps', 'better-divider-spfx', 'src', 'vendor', 'source-editor', 'SourceEditorField.tsx'),
        'utf8'
      )
    ).rejects.toThrow();
  });
});

async function writeUiProfileFixture(fixture: string, packageVersion: string) {
  const canonicalManifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/source-editor-react/ui-profile.json'), 'utf8')
  );
  canonicalManifest.packageVersion = packageVersion;
  const copiedPaths = new Set<string>([
    canonicalManifest.upstream.profilePath,
    canonicalManifest.upstream.provenancePath,
    canonicalManifest.preparedBaseUi.dependencyClosurePath,
    ...canonicalManifest.preparedBaseUi.contracts.map((contract: { path: string }) => contract.path),
    ...canonicalManifest.files.map((file: { sourcePath: string }) => file.sourcePath)
  ]);
  for (const relativePath of copiedPaths) {
    const target = path.join(fixture, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(repoRoot, relativePath)));
  }
  await writeFile(
    path.join(fixture, 'packages/source-editor-react/ui-profile.json'),
    `${JSON.stringify(canonicalManifest, null, 2)}\n`
  );
}

async function copySourceFixture(fixture: string) {
  const paths = [
    'packages/source-editor-core/package.json',
    'packages/source-editor-core/src/index.ts',
    'packages/source-editor-react/package.json',
    'packages/source-editor-react/src/SourceEditorField.tsx',
    'packages/source-editor-react/src/SourceWorkspaceField.tsx',
    'packages/source-editor-react/src/sourceEditorMonacoAdapter.full.ts',
    'packages/source-editor-react/src/sourceEditorMonacoAdapter.scss-only.ts',
    'packages/source-editor-react/spfx-monaco-webpack.cjs'
  ];
  for (const relativePath of paths) {
    const target = path.join(fixture, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(repoRoot, relativePath)));
  }
  await writeUiProfileFixture(fixture, '0.1.0');
}

function runCli(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [syncCli, ...args], { cwd, encoding: 'utf8' });
}

async function snapshotTree(root: string) {
  const snapshot: Record<string, string> = {};
  async function visit(directory: string, prefix = ''): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relativePath = path.posix.join(prefix, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else snapshot[relativePath] = (await readFile(absolutePath)).toString('base64');
    }
  }
  await visit(root);
  return snapshot;
}
