import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveExportArchiveFile, resolveWorkspaceFile } from '../apps/lab/server/workspace';
import { rootDir } from '../apps/lab/server/paths';

describe('resolveWorkspaceFile', () => {
  it('resolves files inside the workspace', async () => {
    const file = await resolveWorkspaceFile(path.join(rootDir, 'package.json'));
    expect(file.endsWith('package.json')).toBe(true);
  });

  it('rejects the workspace root itself', async () => {
    await expect(resolveWorkspaceFile(rootDir)).rejects.toThrow('outside this workspace');
  });

  it('rejects paths outside the workspace', async () => {
    await expect(resolveWorkspaceFile('/etc/hosts')).rejects.toThrow('outside this workspace');
  });

  it('rejects traversal that escapes the workspace', async () => {
    await expect(resolveWorkspaceFile(path.join(rootDir, '..', 'somewhere-else'))).rejects.toThrow();
  });
});

describe('resolveExportArchiveFile', () => {
  const exportsFixtureDir = path.join(rootDir, '.spfx-kit', 'exports', '.tmp-vitest-archive');
  const exportedArchive = path.join(exportsFixtureDir, 'sample.tar.gz');

  beforeAll(async () => {
    await mkdir(exportsFixtureDir, { recursive: true });
    await writeFile(exportedArchive, 'archive-bytes\n');
  });

  afterAll(async () => {
    await rm(exportsFixtureDir, { recursive: true, force: true });
  });

  it('resolves files under .spfx-kit/exports', async () => {
    const file = await resolveExportArchiveFile(exportedArchive);
    expect(file.endsWith('sample.tar.gz')).toBe(true);
  });

  it('rejects workspace files outside the export output directory', async () => {
    await expect(resolveExportArchiveFile(path.join(rootDir, 'package.json'))).rejects.toThrow(
      'outside the export output directory'
    );
  });

  it('rejects files outside the workspace', async () => {
    await expect(resolveExportArchiveFile('/etc/hosts')).rejects.toThrow('outside this workspace');
  });
});
