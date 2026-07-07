import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceFile } from '../apps/lab/server/workspace';
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
