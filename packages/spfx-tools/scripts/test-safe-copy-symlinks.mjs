import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { copyManagedSpfxSource, copyPortableSpfxSource, exists, writeJson } from '../src/lib/fs.mjs';

async function main() {
  await rejectsManagedPackageJsonSymlink();
  await rejectsPortablePackageJsonSymlink();
  await rejectsNestedTargets();
  await rejectsSymlinkedNestedTargets();
  await copiesRegularFiles();
  await excludesGeneratedBuildOutput();
  console.log('safe-copy symlink regression checks passed');
}

async function rejectsManagedPackageJsonSymlink() {
  await withFixture(
    'managed',
    async ({ root, source, target, outsidePackage }) => {
      await writeFile(path.join(source, '00-copied-before-link.txt'), 'partial copy\n');
      await symlink(outsidePackage, path.join(source, 'package.json'));

      await assert.rejects(copyManagedSpfxSource(source, target), /Refusing to copy symlink in SPFx source/);

      assert.equal(await exists(target), false);
      assert.equal(await exists(path.join(target, 'package.json')), false);
      await assertOutsidePackageWasNotRewritten(outsidePackage, target);
      assert.equal(await readFile(outsidePackage, 'utf8'), '{"name":"outside-managed"}\n');
      assert.equal(root.includes('spfx-kit-safe-copy-managed-'), true);
    },
    '{"name":"outside-managed"}\n'
  );
}

async function rejectsPortablePackageJsonSymlink() {
  await withFixture(
    'portable',
    async ({ source, target, outsidePackage }) => {
      await writeFile(path.join(source, '00-copied-before-link.txt'), 'partial copy\n');
      await symlink(outsidePackage, path.join(source, 'package.json'));

      await assert.rejects(copyPortableSpfxSource(source, target), /Refusing to copy symlink in SPFx source/);

      assert.equal(await exists(target), false);
      assert.equal(await exists(path.join(target, 'package.json')), false);
      await assertOutsidePackageWasNotRewritten(outsidePackage, target);
      assert.equal(await readFile(outsidePackage, 'utf8'), '{"name":"outside-portable"}\n');
    },
    '{"name":"outside-portable"}\n'
  );
}

async function copiesRegularFiles() {
  await withFixture(
    'regular-files',
    async ({ source, target }) => {
      await writeFile(path.join(source, 'package.json'), '{"name":"inside"}\n');
      await mkdir(path.join(source, 'src'), { recursive: true });
      await writeFile(path.join(source, 'src', 'webpart.ts'), 'export {};\n');

      await copyManagedSpfxSource(source, target);

      assert.equal(await readFile(path.join(target, 'package.json'), 'utf8'), '{"name":"inside"}\n');
      assert.equal(await readFile(path.join(target, 'src', 'webpart.ts'), 'utf8'), 'export {};\n');
    },
    '{"name":"outside-unused"}\n'
  );
}

async function excludesGeneratedBuildOutput() {
  await withFixture(
    'generated-output',
    async ({ source, target }) => {
      await writeFile(path.join(source, 'package.json'), '{"name":"inside"}\n');
      for (const directory of ['jest-output', 'lib-commonjs']) {
        await mkdir(path.join(source, directory), { recursive: true });
        await writeFile(path.join(source, directory, 'generated.js'), 'generated\n');
      }

      await copyPortableSpfxSource(source, target);

      assert.equal(await exists(path.join(target, 'jest-output')), false);
      assert.equal(await exists(path.join(target, 'lib-commonjs')), false);
      assert.equal(await exists(path.join(target, 'package.json')), true);
    },
    '{"name":"outside-unused"}\n'
  );
}

async function rejectsNestedTargets() {
  await withFixture(
    'nested-target',
    async ({ source }) => {
      await writeFile(path.join(source, 'package.json'), '{"name":"inside"}\n');

      const managedTarget = path.join(source, 'managed-export');
      await assert.rejects(copyManagedSpfxSource(source, managedTarget), /Refusing to copy SPFx source into itself/);
      assert.equal(await exists(managedTarget), false);

      const portableTarget = path.join(source, 'portable-export');
      await assert.rejects(copyPortableSpfxSource(source, portableTarget), /Refusing to copy SPFx source into itself/);
      assert.equal(await exists(portableTarget), false);
    },
    '{"name":"outside-unused"}\n'
  );
}

async function rejectsSymlinkedNestedTargets() {
  await withFixture(
    'symlinked-nested-target',
    async ({ outside, source }) => {
      const packagePath = path.join(source, 'package.json');
      await writeFile(packagePath, '{"name":"inside"}\n');

      const linkedTarget = path.join(outside, 'source-link');
      await symlink(source, linkedTarget);

      await assert.rejects(copyManagedSpfxSource(source, linkedTarget), /Refusing to copy SPFx source into itself/);
      assert.equal(await readFile(packagePath, 'utf8'), '{"name":"inside"}\n');

      const linkedChildTarget = path.join(outside, 'source-link', 'portable-export');
      await assert.rejects(copyPortableSpfxSource(source, linkedChildTarget), /Refusing to copy SPFx source into itself/);
      assert.equal(await exists(linkedChildTarget), false);
      assert.equal(await readFile(packagePath, 'utf8'), '{"name":"inside"}\n');
    },
    '{"name":"outside-unused"}\n'
  );
}

async function assertOutsidePackageWasNotRewritten(outsidePackage, target) {
  const originalOutsidePackage = await readFile(outsidePackage, 'utf8');
  await mkdir(path.dirname(path.join(target, 'package.json')), { recursive: true });
  await writeJson(path.join(target, 'package.json'), { name: 'rewritten' });
  assert.equal(await readFile(outsidePackage, 'utf8'), originalOutsidePackage);
}

async function withFixture(name, fn, outsidePackageContents) {
  const root = await mkdtemp(path.join(os.tmpdir(), `spfx-kit-safe-copy-${name}-`));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  const outside = path.join(root, 'outside');
  const outsidePackage = path.join(outside, 'package.json');

  await mkdir(source, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(outsidePackage, outsidePackageContents);

  try {
    await fn({ root, source, target, outside, outsidePackage });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
