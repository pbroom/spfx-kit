#!/usr/bin/env node
import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { exists } from '../lib/fs.mjs';
import {
  LEGACY_SOURCE_EDITOR_VENDOR_PATH,
  SOURCE_EDITOR_VENDOR_FILES,
  SOURCE_EDITOR_VENDOR_TARGETS,
  createSourceEditorVendor,
  resolveSourceEditorUiProfile
} from '../lib/source-editor-vendor.mjs';

async function main() {
  const check = process.argv.includes('--check');
  const jsonOutput = process.argv.includes('--json');
  const rootDir = process.cwd();
  const sourceVendors = await Promise.all(
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
  const uiProfile = await resolveSourceEditorUiProfile(rootDir);
  const vendors = [...sourceVendors, ...uiProfile.files];
  const results = [];

  for (const appName of SOURCE_EDITOR_VENDOR_TARGETS) {
    const appDir = path.join(rootDir, '.spfx-kit', 'apps', appName);
    if (!(await exists(path.join(appDir, 'package.json')))) {
      results.push({ appName, status: 'missing' });
      continue;
    }

    const legacyPath = path.join(appDir, LEGACY_SOURCE_EDITOR_VENDOR_PATH);
    const legacyExists = await exists(legacyPath);
    const uiProfileVendorRoot = path.join(appDir, 'src/vendor/source-editor/ui-profile');
    const expectedUiProfilePaths = uiProfile.files
      .map((file) => path.relative(uiProfileVendorRoot, path.join(appDir, file.vendorPath)).replaceAll(path.sep, '/'))
      .sort();
    const currentUiProfilePaths = await listRelativeFiles(uiProfileVendorRoot);
    const uiProfileTreeIsCurrent = JSON.stringify(currentUiProfilePaths) === JSON.stringify(expectedUiProfilePaths);
    const currentFiles = await Promise.all(
      vendors.map(async (vendor) => {
        const targetPath = path.join(appDir, vendor.vendorPath);
        return (await exists(targetPath)) ? readFile(targetPath, 'utf8') : undefined;
      })
    );
    if (!legacyExists && uiProfileTreeIsCurrent && currentFiles.every((current, index) => current === vendors[index].source)) {
      results.push({ appName, status: 'current' });
      continue;
    }
    if (check) {
      results.push({ appName, status: 'outdated' });
      continue;
    }

    await rm(uiProfileVendorRoot, { recursive: true, force: true });
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
    packages: sourceVendors.map((vendor) => ({
      name: vendor.packageName,
      version: vendor.version,
      sha256: vendor.digest
    })),
    uiProfile: {
      profileId: uiProfile.manifest.profileId,
      upstreamProfileId: uiProfile.manifest.upstream.profileId,
      upstreamProfileSha256: uiProfile.manifest.upstream.profileSha256,
      preparedBaseUi: `${uiProfile.manifest.preparedBaseUi.package}@${uiProfile.manifest.preparedBaseUi.version}`,
      files: uiProfile.files.length
    },
    results
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary));
  } else {
    for (const result of results) {
      console.log(`${result.appName}: ${result.status}`);
    }
    for (const vendor of sourceVendors) {
      console.log(`${vendor.packageName} ${vendor.version} (${vendor.digest.slice(0, 12)})`);
    }
    console.log(
      `${uiProfile.manifest.profileId} (${uiProfile.manifest.upstream.profileSha256.slice(0, 12)}, ${uiProfile.files.length} files)`
    );
  }

  if (check && outdated.length > 0) {
    throw new Error(`Outdated source editor vendor in: ${outdated.map((result) => result.appName).join(', ')}`);
  }
}

async function listRelativeFiles(root) {
  if (!(await exists(root))) return [];
  const files = [];
  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relativePath = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relativePath);
      else files.push(entry.isFile() ? relativePath : `${relativePath}/`);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
