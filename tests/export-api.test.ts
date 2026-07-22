import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeConfiguredStandalonePackage } from '../apps/lab/server/export-api';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('standalone export estimates', () => {
  it('accepts a configured package with a mixed-case .sppkg extension', async () => {
    const appDir = await createFixture('solution/Better-List.SPPKG');

    await expect(describeConfiguredStandalonePackage(appDir, 'better-list-standalone')).resolves.toEqual({
      packageFileName: 'Better-List.SPPKG',
      file: {
        name: 'better-list-standalone/Better-List.SPPKG',
        size: 'from latest build'
      }
    });
  });
});

async function createFixture(zippedPackage: string) {
  const appDir = await mkdtemp(path.join(tmpdir(), 'spfx-export-api-'));
  temporaryDirectories.push(appDir);
  await mkdir(path.join(appDir, 'config'), { recursive: true });
  await writeFile(
    path.join(appDir, 'config', 'package-solution.json'),
    `${JSON.stringify({ paths: { zippedPackage } }, null, 2)}\n`
  );
  return appDir;
}
