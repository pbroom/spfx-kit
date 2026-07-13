#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { parseArgs, required } from '../lib/args.mjs';
import { exists, readJson } from '../lib/fs.mjs';
import { readSpfxSummary } from '../lib/spfx.mjs';
import { detectSpfxToolchain, requiredSpfxFiles } from '../lib/spfx-toolchain.mjs';

const usage = `Usage:
  validate-spfx-app --app .spfx-kit/apps/<slug> [--profile lab|standalone|cdn|single] [--build]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = required(args, 'app', usage);
  const appDir = path.resolve(app);
  const profile = String(args.profile || 'lab');
  if (!['lab', 'standalone', 'cdn', 'single'].includes(profile)) {
    throw new Error('--profile must be one of: lab, standalone, cdn, single');
  }

  const packagePath = path.join(appDir, 'package.json');
  if (!(await exists(packagePath))) {
    throw new Error(`Missing required SPFx files in ${app}:\n  - package.json`);
  }

  const packageJson = await readJson(packagePath);
  const toolchain = detectSpfxToolchain(packageJson);
  const baseRequiredFiles = requiredSpfxFiles(toolchain);

  const missing = [];
  for (const file of baseRequiredFiles) {
    if (!(await exists(path.join(appDir, file)))) {
      missing.push(file);
    }
  }
  if (profile === 'standalone') {
    for (const file of ['package-lock.json', 'CLAUDE.md', 'release/README.md', 'cdn-handoff/README.md']) {
      if (!(await exists(path.join(appDir, file)))) {
        missing.push(file);
      }
    }
  }
  if (profile === 'lab' && !(await hasLabAdapter(appDir))) {
    missing.push('.spfx-kit/lab/register.tsx or src/lab/register.tsx');
  }
  if (missing.length) {
    throw new Error(`Missing required SPFx files in ${app}:\n${missing.map((file) => `  - ${file}`).join('\n')}`);
  }

  if (profile === 'lab' && isUnderLegacyCommittedApps(appDir) && (await exists(path.join(appDir, 'package-lock.json')))) {
    throw new Error(
      'Imported app must not keep an active package-lock.json. Preserve it under .spfx-kit/original-package-lock.json instead.'
    );
  }

  const packageSolution = await readJson(path.join(appDir, 'config', 'package-solution.json'));
  const writeManifests = await readJson(path.join(appDir, 'config', 'write-manifests.json'));
  const summary = await readSpfxSummary(appDir);
  const issues = [];
  if (profile === 'lab' && !packageJson.name?.startsWith('@spfx-kit/')) {
    issues.push('package name should be namespaced as @spfx-kit/<slug>');
  }
  if (profile === 'standalone') {
    if (packageJson.name?.startsWith('@') || !packageJson.name?.endsWith('-spfx')) {
      issues.push('standalone package name should be an unscoped *-spfx name');
    }
    if (await exists(path.join(appDir, 'packages'))) {
      issues.push('standalone app must not contain a top-level packages/ workspace');
    }
    if (hasMonorepoOnlyDependency(packageJson)) {
      issues.push('standalone app package.json must not depend on @spfx-kit/* or file:../../packages dependencies');
    }
  }
  if (!summary.spfxVersion) {
    issues.push('could not detect SPFx version');
  }
  if (summary.toolchain === 'unknown') {
    issues.push('could not detect SPFx toolchain from @microsoft/sp-build-web or @microsoft/spfx-web-build-rig');
  }
  if (summary.toolchain === 'ambiguous') {
    issues.push('app declares both Gulp and Heft SPFx toolchains');
  }
  if (summary.toolchain === 'heft') {
    const rig = await readJson(path.join(appDir, 'config', 'rig.json'));
    if (rig.rigPackageName !== '@microsoft/spfx-web-build-rig') {
      issues.push('config/rig.json must reference @microsoft/spfx-web-build-rig');
    }
  }
  if (!summary.solutionId) {
    issues.push('could not detect solution id');
  }
  if (!summary.componentIds.length) {
    issues.push('could not detect any SPFx component manifests');
  }
  if ((profile === 'lab' || profile === 'cdn') && packageSolution.solution?.includeClientSideAssets !== false) {
    issues.push('config/package-solution.json solution.includeClientSideAssets must be false for CDN-hosted bundles');
  }
  if (profile === 'single' && packageSolution.solution?.includeClientSideAssets !== true) {
    issues.push('single-bundle profile requires solution.includeClientSideAssets=true');
  }
  const cdnBasePath = writeManifests.cdnBasePath;
  if ((profile === 'lab' || profile === 'cdn' || profile === 'standalone') && !isValidCdnBasePath(cdnBasePath)) {
    issues.push('config/write-manifests.json cdnBasePath must be a non-localhost HTTPS URL');
  }
  if (profile === 'cdn' && !(await exists(path.join(appDir, 'cdn-handoff', 'README.md')))) {
    issues.push('cdn profile requires cdn-handoff/README.md');
  }
  if (await exists(path.join(appDir, 'sharepoint', 'solution'))) {
    const hasAssets =
      (await hasFiles(path.join(appDir, 'release', 'assets'))) || (await hasFiles(path.join(appDir, 'temp', 'deploy')));
    if (profile === 'cdn' && !hasAssets) {
      issues.push('ship output exists but no CDN assets were found in release/assets or temp/deploy');
    }
    if (profile === 'cdn' && hasDependency(packageJson, 'monaco-editor') && !(await hasMonacoAssets(appDir))) {
      issues.push(
        'monaco-editor dependency requires CDN assets at release/assets/monaco-editor/min/vs or temp/deploy/monaco-editor/min/vs'
      );
    }
  }
  if (issues.length) {
    throw new Error(`SPFx validation failed:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
  }

  if (args.build) {
    const result = spawnSync('npm', ['run', 'build'], { cwd: appDir, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`Build failed for ${packageJson.name}`);
    }
  }

  console.log(`Validated ${packageJson.name}`);
  console.log(`  Profile: ${profile}`);
  console.log(`  SPFx: ${summary.spfxVersion}`);
  console.log(`  Toolchain: ${summary.toolchain}`);
  console.log(`  Node: ${summary.nodeRange || 'not declared'}`);
  console.log(`  Solution: ${summary.solutionId}`);
  console.log(`  Components: ${summary.componentIds.join(', ')}`);
  console.log(`  CDN: ${cdnBasePath}`);
}

function isUnderLegacyCommittedApps(appDir) {
  const relative = path.relative(process.cwd(), appDir).replace(/\\/g, '/');
  return relative.startsWith('apps/') && !relative.startsWith('apps/lab/');
}

async function hasLabAdapter(appDir) {
  return (
    (await exists(path.join(appDir, '.spfx-kit', 'lab', 'register.tsx'))) ||
    (await exists(path.join(appDir, 'src', 'lab', 'register.tsx')))
  );
}

function hasMonorepoOnlyDependency(packageJson) {
  const all = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
  return Object.entries(all).some(([name, spec]) => name.startsWith('@spfx-kit/') || String(spec).includes('../../packages'));
}

function isValidCdnBasePath(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return false;
  }
}

async function hasFiles(dir) {
  if (!(await exists(dir))) {
    return false;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      return true;
    }
    if (entry.isDirectory() && (await hasFiles(path.join(dir, entry.name)))) {
      return true;
    }
  }
  return false;
}

async function hasMonacoAssets(appDir) {
  return (
    (await exists(path.join(appDir, 'release', 'assets', 'monaco-editor', 'min', 'vs', 'loader.js'))) ||
    (await exists(path.join(appDir, 'temp', 'deploy', 'monaco-editor', 'min', 'vs', 'loader.js')))
  );
}

function hasDependency(packageJson, name) {
  return Boolean(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
