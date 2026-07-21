import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeAppRepoFiles } from '../app-repo-files.mjs';
import { copyPortableSpfxSource, exists, listFilesRecursive, readJson, writeJson } from '../fs.mjs';
import { cdnBasePathForSlug, standalonePackageName, setCdnBasePath, setIncludeClientSideAssets } from '../spfx.mjs';
import { detectSpfxToolchain, standaloneScriptsForToolchain } from '../spfx-toolchain.mjs';
import { verifySppkg } from '../sppkg.mjs';
import {
  defaultClaude,
  writeCdnHandoffReadme,
  writeCdnPackageReadme,
  writeReleaseReadme,
  writeRepoExportReadme,
  writeSingleBundleReadme
} from './docs.mjs';
import { childStdio, reportTargetProgress } from './output.mjs';
import { describeTarget, exportDirNameForTarget } from './archive.mjs';

export async function exportSingleBundle(appDir, outDir, slug) {
  reportTargetProgress('single', 'configuring', 0.08, 'Configuring embedded SharePoint package.');
  await setIncludeClientSideAssets(appDir, true);
  reportTargetProgress('single', 'building', 0.18, 'Running ship build for embedded bundle.');
  runShip(appDir);
  reportTargetProgress('single', 'assembling', 0.82, 'Copying SharePoint package into export.');
  const targetDir = path.join(outDir, exportDirNameForTarget('single', slug));
  await mkdir(targetDir, { recursive: true });
  const packageFile = await copyExpectedSppkg(appDir, targetDir);
  const readmeFile = await writeSingleBundleReadme(targetDir, slug, path.basename(packageFile));
  reportTargetProgress('single', 'packaging', 0.94, 'Reading embedded bundle package contents.');
  const target = await describeTarget('single', path.basename(packageFile), targetDir, [packageFile, readmeFile]);
  reportTargetProgress('single', 'complete', 1, 'Single bundle package assembled.');
  return target;
}

export async function exportCdnPackage(appDir, outDir, slug) {
  reportTargetProgress('cdn', 'configuring', 0.08, 'Configuring CDN package and manifest path.');
  const cdnBasePath = cdnBasePathForSlug(slug, process.env.SPFX_KIT_CDN_BASE_URL || 'https://cdn.example.com/spfx');
  await setIncludeClientSideAssets(appDir, false);
  await setCdnBasePath(appDir, cdnBasePath);
  reportTargetProgress('cdn', 'building', 0.18, 'Running ship build for CDN assets.');
  runShip(appDir);

  reportTargetProgress('cdn', 'assembling', 0.68, 'Collecting package, assets, and manifests.');
  const targetDir = path.join(outDir, 'cdn');
  const solutionDir = path.join(targetDir, 'sharepoint', 'solution');
  const releaseDir = path.join(targetDir, 'release');
  const handoffDir = path.join(targetDir, 'cdn-handoff');
  await mkdir(solutionDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });
  await mkdir(handoffDir, { recursive: true });

  const packageFile = await copyExpectedSppkg(appDir, solutionDir, `${slug}.cdn.sppkg`);
  await copyIfExists(path.join(appDir, 'release', 'assets'), path.join(releaseDir, 'assets'));
  await copyIfExists(path.join(appDir, 'release', 'manifests'), path.join(releaseDir, 'manifests'));
  await copyContentsIfExists(path.join(appDir, 'temp', 'deploy'), path.join(releaseDir, 'assets'));
  await copyIfExists(path.join(releaseDir, 'assets'), path.join(handoffDir, 'assets'));
  await copyIfExists(path.join(releaseDir, 'manifests'), path.join(handoffDir, 'manifests'));
  reportTargetProgress('cdn', 'assembling', 0.86, 'Writing CDN handoff and release notes.');
  await writeCdnHandoffReadme(handoffDir, slug, cdnBasePath);
  await writeReleaseReadme(releaseDir, slug, cdnBasePath);
  const readmeFile = await writeCdnPackageReadme(targetDir, slug, cdnBasePath, path.basename(packageFile));

  const files = [readmeFile, packageFile, ...(await listFilesRecursive(releaseDir)), ...(await listFilesRecursive(handoffDir))];
  reportTargetProgress('cdn', 'packaging', 0.94, 'Reading CDN package contents.');
  const target = await describeTarget('cdn', 'SPFx + CDN JS package', targetDir, files);
  reportTargetProgress('cdn', 'complete', 1, 'SPFx + CDN JS package assembled.');
  return target;
}

export async function exportStandaloneRepo(appDir, outDir, slug) {
  reportTargetProgress('standalone', 'assembling', 0.12, 'Copying standalone SPFx source.');
  const targetDir = path.join(outDir, exportDirNameForTarget('standalone', slug));
  await copyPortableSpfxSource(appDir, targetDir);
  reportTargetProgress('standalone', 'assembling', 0.34, 'Writing house-standard docs and metadata.');
  await ensureHouseStandardDocs(targetDir, slug);
  await writeAppRepoFiles(targetDir);
  await writeRepoExportReadme(targetDir, slug);
  reportTargetProgress('standalone', 'configuring', 0.52, 'Rewriting standalone package configuration.');
  await rewriteStandalonePackageJson(targetDir, standalonePackageName(appDir));
  await rewriteStandaloneTsconfig(targetDir);
  await writeStandaloneMetadata(targetDir, slug);
  reportTargetProgress('standalone', 'building', 0.7, 'Generating standalone package lock.');
  await createStandalonePackageLock(targetDir);
  reportTargetProgress('standalone', 'packaging', 0.94, 'Reading standalone repo contents.');
  const files = await listFilesRecursive(targetDir);
  const target = await describeTarget('standalone', `${slug}-repo`, targetDir, files);
  reportTargetProgress('standalone', 'complete', 1, 'Standalone repo staged.');
  return target;
}

function runShip(appDir) {
  runNpmCommand(appDir, ['run', 'ship'], `Ship build failed in ${appDir}`);
}

async function copyExpectedSppkg(appDir, targetDir, targetName) {
  const { packagePath } = await verifySppkg(appDir);
  const target = path.join(targetDir, targetName || path.basename(packagePath));
  await cp(packagePath, target);
  return target;
}

async function copyIfExists(source, target) {
  if (await exists(source)) {
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

async function copyContentsIfExists(source, target) {
  if (!(await exists(source))) {
    return;
  }
  await mkdir(target, { recursive: true });
  const entries = await readdir(source);
  for (const entry of entries) {
    await cp(path.join(source, entry), path.join(target, entry), { recursive: true, force: true });
  }
}

async function rewriteStandalonePackageJson(targetDir, packageName) {
  const packagePath = path.join(targetDir, 'package.json');
  const packageJson = await readJson(packagePath);
  packageJson.name = packageName;
  delete packageJson.exports;
  packageJson.private = true;
  if (packageJson.dependencies) {
    for (const [name, spec] of Object.entries(packageJson.dependencies)) {
      if (name.startsWith('@spfx-kit/') || String(spec).includes('../../packages')) {
        delete packageJson.dependencies[name];
      }
    }
  }
  packageJson.scripts = standaloneScriptsForToolchain(detectSpfxToolchain(packageJson), {
    monaco: hasDependency(packageJson, 'monaco-editor')
  });
  await writeJson(packagePath, packageJson);
  if (hasDependency(packageJson, 'monaco-editor')) {
    await writeLocalMonacoCopyScript(targetDir);
  }
}

async function rewriteStandaloneTsconfig(targetDir) {
  const tsconfigPath = path.join(targetDir, 'tsconfig.json');
  if (!(await exists(tsconfigPath))) {
    return;
  }
  const tsconfig = await readJson(tsconfigPath);
  if (typeof tsconfig.extends === 'string') {
    tsconfig.extends = tsconfig.extends.replace('../../node_modules/', './node_modules/');
  }
  if (tsconfig.compilerOptions?.typeRoots) {
    tsconfig.compilerOptions.typeRoots = ['./node_modules/@types', './node_modules/@microsoft'];
  }
  await writeJson(tsconfigPath, tsconfig);
}

async function ensureHouseStandardDocs(targetDir, slug) {
  if (!(await exists(path.join(targetDir, 'CLAUDE.md')))) {
    const packageJson = await readJson(path.join(targetDir, 'package.json'));
    await writeFile(path.join(targetDir, 'CLAUDE.md'), defaultClaude(slug, detectSpfxToolchain(packageJson)));
  }
  await mkdir(path.join(targetDir, 'cdn-handoff'), { recursive: true });
  if (!(await exists(path.join(targetDir, 'cdn-handoff', 'README.md')))) {
    await writeCdnHandoffReadme(path.join(targetDir, 'cdn-handoff'), slug, cdnBasePathForSlug(slug));
  }
  await mkdir(path.join(targetDir, 'release'), { recursive: true });
  if (!(await exists(path.join(targetDir, 'release', 'README.md')))) {
    await writeReleaseReadme(path.join(targetDir, 'release'), slug, cdnBasePathForSlug(slug));
  }
  await mkdir(path.join(targetDir, 'sharepoint', 'solution'), { recursive: true });
}

async function writeStandaloneMetadata(targetDir, slug) {
  await mkdir(path.join(targetDir, '.spfx-kit'), { recursive: true });
  await writeJson(path.join(targetDir, '.spfx-kit', 'export.json'), {
    slug,
    exportedAt: new Date().toISOString(),
    format: 'standalone',
    importableBySpfxKit: true
  });
}

async function createStandalonePackageLock(targetDir) {
  runNpmCommand(
    targetDir,
    ['install', '--package-lock-only', '--ignore-scripts'],
    `Could not generate standalone package-lock.json in ${targetDir}`
  );
}

function runNpmCommand(cwd, args, failureMessage) {
  const nodeVersion = readPinnedNodeVersion(cwd);
  const nvmScript = process.env.NVM_DIR
    ? path.join(process.env.NVM_DIR, 'nvm.sh')
    : path.join(process.env.HOME || '', '.nvm', 'nvm.sh');
  const useNvm = Boolean(nodeVersion && existsSync(nvmScript));
  const result = useNvm
    ? spawnSync(
        '/bin/zsh',
        ['-lc', `source ${shellQuote(nvmScript)} && nvm exec ${shellQuote(nodeVersion)} npm ${args.map(shellQuote).join(' ')}`],
        { cwd, stdio: childStdio(), env: process.env }
      )
    : spawnSync('npm', args, { cwd, stdio: childStdio(), env: process.env });

  if (result.status !== 0) {
    throw new Error(failureMessage);
  }
}

function readPinnedNodeVersion(cwd) {
  for (const file of [
    path.join(cwd, '.nvmrc'),
    path.join(cwd, '.node-version'),
    path.join(process.cwd(), '.nvmrc'),
    path.join(process.cwd(), '.node-version')
  ]) {
    if (existsSync(file)) {
      const value = readFileSync(file, 'utf8').trim();
      if (value) {
        return value;
      }
    }
  }
  return '';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function hasDependency(packageJson, name) {
  return Boolean(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
}

async function writeLocalMonacoCopyScript(targetDir) {
  const scriptDir = path.join(targetDir, 'scripts');
  await mkdir(scriptDir, { recursive: true });
  await writeFile(
    path.join(scriptDir, 'copy-monaco-assets.mjs'),
    `#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { cp, mkdir, rm } from 'node:fs/promises';

const appDir = path.resolve(process.argv.includes('--app') ? process.argv[process.argv.indexOf('--app') + 1] : '.');
const appRequire = createRequire(path.join(appDir, 'package.json'));
const monacoPackagePath = appRequire.resolve('monaco-editor/package.json');
const monacoVsDir = path.join(path.dirname(monacoPackagePath), 'min', 'vs');
const targets = [path.join(appDir, 'release', 'assets', 'monaco-editor', 'min', 'vs')];
const tempDeploy = path.join(appDir, 'temp', 'deploy');
try {
  await mkdir(tempDeploy, { recursive: true });
  targets.push(path.join(tempDeploy, 'monaco-editor', 'min', 'vs'));
} catch {}
for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(monacoVsDir, target, { recursive: true });
}
`
  );
}
