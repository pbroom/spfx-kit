import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import { expectedSppkgPath, verifySppkg } from '../packages/spfx-tools/src/lib/sppkg.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SPFx package verification', () => {
  it('verifies the exact configured package and required OPC parts', async () => {
    const appDir = await createFixture('solution/canary.sppkg');
    const packagePath = path.join(appDir, 'sharepoint', 'solution', 'canary.sppkg');
    await mkdir(path.dirname(packagePath), { recursive: true });
    await writeFile(
      packagePath,
      zipSync({
        '[Content_Types].xml': strToU8('<Types />'),
        '_rels/.rels': strToU8('<Relationships />'),
        'AppManifest.xml': strToU8('<App />')
      })
    );

    await expect(verifySppkg(appDir)).resolves.toMatchObject({ packagePath, entries: 3 });
  });

  it('rejects a configured package path outside sharepoint', async () => {
    const appDir = await createFixture('../escaped.sppkg');
    await expect(expectedSppkgPath(appDir)).rejects.toThrow('must stay within the sharepoint directory');
  });

  it('rejects an arbitrary ZIP that is not an SPFx package', async () => {
    const appDir = await createFixture('solution/not-spfx.sppkg');
    const packagePath = path.join(appDir, 'sharepoint', 'solution', 'not-spfx.sppkg');
    await mkdir(path.dirname(packagePath), { recursive: true });
    await writeFile(packagePath, zipSync({ 'readme.txt': strToU8('not an SPFx package') }));

    await expect(verifySppkg(appDir)).rejects.toThrow('missing required parts');
  });
});

async function createFixture(zippedPackage: string) {
  const appDir = await mkdtemp(path.join(tmpdir(), 'spfx-sppkg-'));
  temporaryDirectories.push(appDir);
  await mkdir(path.join(appDir, 'config'), { recursive: true });
  await writeFile(
    path.join(appDir, 'config', 'package-solution.json'),
    `${JSON.stringify({ paths: { zippedPackage } }, null, 2)}\n`
  );
  return appDir;
}
