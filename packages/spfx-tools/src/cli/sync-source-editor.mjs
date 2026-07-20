#!/usr/bin/env node
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { exists } from '../lib/fs.mjs';
import {
  LEGACY_SOURCE_EDITOR_VENDOR_PATH,
  SOURCE_EDITOR_VENDOR_FILES,
  SOURCE_EDITOR_VENDOR_TARGETS,
  createSourceEditorVendor
} from '../lib/source-editor-vendor.mjs';

async function main() {
  const check = process.argv.includes('--check');
  const jsonOutput = process.argv.includes('--json');
  const rootDir = process.cwd();
  const vendors = await Promise.all(
    SOURCE_EDITOR_VENDOR_FILES.map(async (file) => {
      const [source, packageJsonSource] = await Promise.all([
        readFile(path.join(rootDir, file.sourcePath), 'utf8'),
        readFile(path.join(rootDir, file.packagePath), 'utf8')
      ]);
      const packageJson = JSON.parse(packageJsonSource);
      return {
        ...file,
        version: packageJson.version,
        ...createSourceEditorVendor(source, packageJson.version, file.packageName)
      };
    })
  );
  const results = [];

  for (const appName of SOURCE_EDITOR_VENDOR_TARGETS) {
    const appDir = path.join(rootDir, '.spfx-kit', 'apps', appName);
    if (!(await exists(path.join(appDir, 'package.json')))) {
      results.push({ appName, status: 'missing' });
      continue;
    }

    const legacyPath = path.join(appDir, LEGACY_SOURCE_EDITOR_VENDOR_PATH);
    const legacyExists = await exists(legacyPath);
    const currentFiles = await Promise.all(
      vendors.map(async (vendor) => {
        const targetPath = path.join(appDir, vendor.vendorPath);
        return (await exists(targetPath)) ? readFile(targetPath, 'utf8') : undefined;
      })
    );
    if (!legacyExists && currentFiles.every((current, index) => current === vendors[index].source)) {
      results.push({ appName, status: 'current' });
      continue;
    }
    if (check) {
      results.push({ appName, status: 'outdated' });
      continue;
    }

    for (const vendor of vendors) {
      const targetPath = path.join(appDir, vendor.vendorPath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, vendor.source);
    }
    await rm(legacyPath, { force: true });
    results.push({ appName, status: 'updated' });
  }

  const checked = results.filter((result) => result.status !== 'missing');
  const outdated = checked.filter((result) => result.status === 'outdated');
  const summary = {
    packages: vendors.map((vendor) => ({
      name: vendor.packageName,
      version: vendor.version,
      sha256: vendor.digest
    })),
    results
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary));
  } else {
    for (const result of results) {
      console.log(`${result.appName}: ${result.status}`);
    }
    for (const vendor of vendors) {
      console.log(`${vendor.packageName} ${vendor.version} (${vendor.digest.slice(0, 12)})`);
    }
  }

  if (check && outdated.length > 0) {
    throw new Error(`Outdated source editor vendor in: ${outdated.map((result) => result.appName).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
