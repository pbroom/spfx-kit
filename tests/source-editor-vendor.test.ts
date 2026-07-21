import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    await mkdir(path.join(coreDir, 'src'), { recursive: true });
    await mkdir(path.join(reactDir, 'src'), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(path.join(coreDir, 'package.json'), '{"name":"@spfx-kit/source-editor-core","version":"2.0.0"}\n');
    await writeFile(path.join(coreDir, 'src', 'index.ts'), 'export const language = "scss";\n');
    await writeFile(path.join(reactDir, 'package.json'), '{"name":"@spfx-kit/source-editor-react","version":"3.0.0"}\n');
    await writeFile(path.join(reactDir, 'src', 'SourceEditorField.tsx'), 'export const editor = "react";\n');
    await writeFile(path.join(reactDir, 'src', 'SourceWorkspaceField.tsx'), 'export const workspace = "react";\n');
    await writeFile(path.join(appDir, 'package.json'), '{"name":"better-divider-spfx"}\n');

    const syncResult = runCli(fixture);
    expect(syncResult.status).toBe(0);
    expect(syncResult.stdout).toContain('better-divider-spfx: updated');
    expect(syncResult.stdout).toContain('better-text-spfx: missing');

    const coreVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'sourceEditorCore.ts');
    const reactVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'SourceEditorField.tsx');
    const workspaceVendorPath = path.join(appDir, 'src', 'vendor', 'source-editor', 'SourceWorkspaceField.tsx');
    const coreVendor = await readFile(coreVendorPath, 'utf8');
    const reactVendor = await readFile(reactVendorPath, 'utf8');
    const workspaceVendor = await readFile(workspaceVendorPath, 'utf8');
    expect(coreVendor).toContain('Vendored from @spfx-kit/source-editor-core@2.0.0');
    expect(reactVendor).toContain('Vendored from @spfx-kit/source-editor-react@3.0.0');
    expect(workspaceVendor).toContain('Vendored from @spfx-kit/source-editor-react@3.0.0');
    expect(runCli(fixture, ['--check']).status).toBe(0);

    await writeFile(reactVendorPath, `${reactVendor}// local edit\n`);
    const driftResult = runCli(fixture, ['--check']);
    expect(driftResult.status).toBe(1);
    expect(driftResult.stderr).toContain('Outdated source editor vendor in: better-divider-spfx');
  });
});

function runCli(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [syncCli, ...args], { cwd, encoding: 'utf8' });
}
