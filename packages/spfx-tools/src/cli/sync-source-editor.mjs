#!/usr/bin/env node
import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { exists } from '../lib/fs.mjs';
import {
  LEGACY_SOURCE_EDITOR_VENDOR_PATH,
  SOURCE_EDITOR_VENDOR_TARGETS,
  createSourceEditorVendor,
  resolveSourceEditorUiProfile,
  sourceEditorConsumerProfile,
  sourceEditorVendorFilesForTarget
} from '../lib/source-editor-vendor.mjs';

async function main() {
  const check = process.argv.includes('--check');
  const requireAll = process.argv.includes('--require-all');
  const jsonOutput = process.argv.includes('--json');
  const rootDir = process.cwd();
  const results = [];
  const resolvedProfiles = new Map();
  const plans = [];
  for (const appName of SOURCE_EDITOR_VENDOR_TARGETS) {
    const consumerProfile = sourceEditorConsumerProfile(appName);
    const appDir = path.join(rootDir, '.spfx-kit', 'apps', appName);
    const present = await exists(path.join(appDir, 'package.json'));
    plans.push({ appName, appDir, consumerProfile, present });
  }
  const missing = plans.filter((plan) => !plan.present).map((plan) => plan.appName);
  if (requireAll && missing.length > 0) {
    throw new Error(`Missing required source editor consumers: ${missing.join(', ')}`);
  }

  // Resolve every complete plan before applying any of them. This keeps
  // --require-all transactional when a later full-profile dependency fails.
  for (const plan of plans) {
    if (plan.present) plan.resolved = await resolveVendorProfile(rootDir, plan.appName);
  }

  for (const plan of plans) {
    const { appName, appDir, consumerProfile, resolved } = plan;
    if (!resolved) {
      results.push({ appName, profileId: consumerProfile.profileId, status: 'missing' });
      continue;
    }
    resolvedProfiles.set(consumerProfile.key, resolved);
    const { uiProfile, vendors } = resolved;
    const legacyPath = path.join(appDir, LEGACY_SOURCE_EDITOR_VENDOR_PATH);
    const legacyExists = await exists(legacyPath);
    const vendorRoot = path.join(appDir, 'src/vendor/source-editor');
    const expectedVendorPaths = vendors
      .map((file) => path.relative(vendorRoot, path.join(appDir, file.vendorPath)).replaceAll(path.sep, '/'))
      .sort((left, right) => left.localeCompare(right, 'en'));
    const currentVendorPaths = await listRelativeFiles(vendorRoot);
    const vendorTreeIsCurrent = JSON.stringify(currentVendorPaths) === JSON.stringify(expectedVendorPaths);
    const currentFiles = await Promise.all(
      vendors.map(async (vendor) => {
        const targetPath = path.join(appDir, vendor.vendorPath);
        return (await exists(targetPath)) ? readFile(targetPath, 'utf8') : undefined;
      })
    );
    if (!legacyExists && vendorTreeIsCurrent && currentFiles.every((current, index) => current === vendors[index].source)) {
      results.push({ appName, profileId: uiProfile.manifest.profileId, status: 'current' });
      continue;
    }
    if (check) {
      results.push({ appName, profileId: uiProfile.manifest.profileId, status: 'outdated' });
      continue;
    }

    await rm(vendorRoot, { recursive: true, force: true });
    for (const vendor of vendors) {
      const targetPath = path.join(appDir, vendor.vendorPath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, vendor.source);
    }
    await rm(legacyPath, { force: true });
    results.push({ appName, profileId: uiProfile.manifest.profileId, status: 'updated' });
  }

  const checked = results.filter((result) => result.status !== 'missing');
  const outdated = checked.filter((result) => result.status === 'outdated');
  const summary = {
    profiles: [...resolvedProfiles.entries()].map(([profileKind, resolved]) => ({
      profileKind,
      profileId: resolved.uiProfile.manifest.profileId,
      languages: resolved.uiProfile.manifest.languages,
      packages: resolved.sourceVendors.map((vendor) => ({
        name: vendor.packageName,
        sourcePath: vendor.sourcePath,
        version: vendor.version,
        sha256: vendor.digest
      })),
      upstreamProfileId: resolved.uiProfile.manifest.upstream.profileId,
      upstreamProfileSha256: resolved.uiProfile.manifest.upstream.profileSha256,
      preparedBaseUi: `${resolved.uiProfile.manifest.preparedBaseUi.package}@${resolved.uiProfile.manifest.preparedBaseUi.version}`,
      files: resolved.uiProfile.files.length
    })),
    results
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary));
  } else {
    for (const result of results) {
      console.log(`${result.appName}: ${result.status} (${result.profileId})`);
    }
    for (const [profileKind, resolved] of resolvedProfiles) {
      console.log(
        `${profileKind}: ${resolved.uiProfile.manifest.profileId} (${resolved.uiProfile.manifest.upstream.profileSha256.slice(0, 12)}, ${resolved.vendors.length} files)`
      );
    }
  }

  if (check && outdated.length > 0) {
    throw new Error(`Outdated source editor vendor in: ${outdated.map((result) => result.appName).join(', ')}`);
  }
}

async function resolveVendorProfile(rootDir, appName) {
  const sourceVendors = await Promise.all(
    sourceEditorVendorFilesForTarget(appName).map(async (file) => {
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
  const uiProfile = await resolveSourceEditorUiProfile(rootDir, appName);
  return { sourceVendors, uiProfile, vendors: [...sourceVendors, ...uiProfile.files] };
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
