#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, required } from '../lib/args.mjs';
import {
  copyPortableSpfxSource,
  exists,
  listFilesRecursive,
  readJson,
  writeJson
} from '../lib/fs.mjs';
import {
  appSlugFromDir,
  cdnBasePathForSlug,
  standalonePackageName,
  setCdnBasePath,
  setIncludeClientSideAssets
} from '../lib/spfx.mjs';

const usage = `Usage:
  export-spfx-app --app .spfx-kit/apps/<slug>-spfx --target single,cdn,standalone [--out <dir>] [--json] [--progress-json]`;

const allowedTargets = new Set(['single', 'cdn', 'standalone']);
let progressJson = false;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  progressJson = args['progress-json'] === true || args['progress-json'] === 'true';
  const app = required(args, 'app', usage);
  const targets = String(required(args, 'target', usage))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const target of targets) {
    if (!allowedTargets.has(target)) {
      throw new Error(`Unsupported export target "${target}". Use single, cdn, or standalone.`);
    }
  }

  const appDir = path.resolve(app);
  const slug = appSlugFromDir(appDir);
  const outDir = path.resolve(args.out || path.join(process.cwd(), '.spfx-kit', 'exports', slug, timestamp()));
  const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
  const writeManifestPath = path.join(appDir, 'config', 'write-manifests.json');
  const originalPackageSolution = await readFile(packageSolutionPath, 'utf8');
  const originalWriteManifest = await readFile(writeManifestPath, 'utf8');
  const summary = {
    app: path.relative(process.cwd(), appDir),
    slug,
    generatedAt: new Date().toISOString(),
    outDir,
    archivePath: '',
    targets: []
  };

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  try {
    if (targets.includes('single')) {
      summary.targets.push(await exportSingleBundle(appDir, outDir, slug));
    }
    if (targets.includes('cdn')) {
      summary.targets.push(await exportCdnPackage(appDir, outDir, slug));
    }
    if (targets.includes('standalone')) {
      summary.targets.push(await exportStandaloneRepo(appDir, outDir, slug));
    }
  } finally {
    await writeFile(packageSolutionPath, originalPackageSolution);
    await writeFile(writeManifestPath, originalWriteManifest);
  }

  summary.archivePath = path.join(outDir, `${slug}-${targets.map((target) => archiveSegmentForTarget(target)).join('-')}.tar.gz`);
  await writeExportReadme(outDir, slug, summary.targets);
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`);
  reportExportProgress({
    type: 'archive',
    phase: 'packaging',
    progress: 0.96,
    message: 'Compressing export archive.'
  });
  await createArchive(outDir, summary.targets, summary.archivePath);
  reportExportProgress({
    type: 'archive',
    phase: 'complete',
    progress: 1,
    message: 'Export archive ready.'
  });

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Exported ${slug}`);
    console.log(`  Output: ${outDir}`);
    console.log(`  Archive: ${summary.archivePath}`);
    for (const target of summary.targets) {
      console.log(`  ${target.id}: ${target.totalSize}`);
    }
  }
}

async function exportSingleBundle(appDir, outDir, slug) {
  reportTargetProgress('single', 'configuring', 0.08, 'Configuring embedded SharePoint package.');
  await setIncludeClientSideAssets(appDir, true);
  reportTargetProgress('single', 'building', 0.18, 'Running ship build for embedded bundle.');
  runShip(appDir);
  reportTargetProgress('single', 'assembling', 0.82, 'Copying SharePoint package into export.');
  const targetDir = path.join(outDir, exportDirNameForTarget('single', slug));
  await mkdir(targetDir, { recursive: true });
  const packageFile = await copyFirstSppkg(appDir, targetDir, `${slug}-standalone.sppkg`);
  const readmeFile = await writeSingleBundleReadme(targetDir, slug, path.basename(packageFile));
  reportTargetProgress('single', 'packaging', 0.94, 'Reading embedded bundle package contents.');
  const target = await describeTarget('single', `${slug}-standalone`, targetDir, [packageFile, readmeFile]);
  reportTargetProgress('single', 'complete', 1, 'Single bundle package assembled.');
  return target;
}

async function exportCdnPackage(appDir, outDir, slug) {
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

  const packageFile = await copyFirstSppkg(appDir, solutionDir, `${slug}.cdn.sppkg`);
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

async function exportStandaloneRepo(appDir, outDir, slug) {
  reportTargetProgress('standalone', 'assembling', 0.12, 'Copying standalone SPFx source.');
  const targetDir = path.join(outDir, exportDirNameForTarget('standalone', slug));
  await copyPortableSpfxSource(appDir, targetDir);
  reportTargetProgress('standalone', 'assembling', 0.34, 'Writing house-standard docs and metadata.');
  await ensureHouseStandardDocs(targetDir, slug);
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

function reportTargetProgress(target, phase, progress, message) {
  reportExportProgress({ type: 'target', target, phase, progress, message });
}

function reportExportProgress(event) {
  if (!progressJson) {
    return;
  }
  process.stderr.write(`SPFX_KIT_PROGRESS ${JSON.stringify({ ...event, time: new Date().toISOString() })}\n`);
}

function runShip(appDir) {
  runNpmCommand(appDir, ['run', 'ship'], `Ship build failed in ${appDir}`);
}

async function copyFirstSppkg(appDir, targetDir, targetName) {
  const packages = (await listFilesRecursive(path.join(appDir, 'sharepoint', 'solution'))).filter((file) =>
    file.endsWith('.sppkg')
  );
  if (!packages.length) {
    throw new Error(`No .sppkg was produced under ${path.join(appDir, 'sharepoint', 'solution')}`);
  }
  const target = path.join(targetDir, targetName);
  await cp(packages[0], target);
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
  packageJson.scripts = {
    build: 'gulp bundle',
    clean: 'gulp clean',
    test: 'gulp test',
    serve: 'gulp serve',
    ship: hasDependency(packageJson, 'monaco-editor')
      ? 'gulp clean && gulp bundle --ship && node scripts/copy-monaco-assets.mjs --app . && gulp package-solution --ship'
      : 'gulp clean && gulp bundle --ship && gulp package-solution --ship'
  };
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
    await writeFile(path.join(targetDir, 'CLAUDE.md'), defaultClaude(slug));
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
        { cwd, stdio: 'inherit', env: process.env }
      )
    : spawnSync('npm', args, { cwd, stdio: 'inherit', env: process.env });

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

async function writeExportReadme(outDir, slug, targets) {
  const pieces = targets
    .map((target) => {
      const entryName = path.relative(outDir, target.dir).replace(/\\/g, '/');
      if (target.id === 'single') {
        return `- \`${entryName}/\`: upload \`${slug}-standalone.sppkg\` to the SharePoint tenant app catalog. This package embeds its assets and does not need a CDN upload.`;
      }
      if (target.id === 'cdn') {
        return `- \`${entryName}/\`: upload \`release/assets/\` to the configured CDN path, then upload the .sppkg in \`sharepoint/solution/\` to the SharePoint tenant app catalog.`;
      }
      if (target.id === 'standalone') {
        return `- \`${entryName}/\`: portable SPFx source repo. Run \`npm ci\` and \`npm run ship\`, then upload the generated \`sharepoint/solution/*.sppkg\` package and any generated CDN assets.`;
      }
      return `- \`${entryName}/\`: see the README inside this folder.`;
    })
    .join('\n');

  await writeFile(
    path.join(outDir, 'README.md'),
    `# ${slug} SPFx Export

This archive contains the selected SPFx Kit export pieces.

${pieces}

SharePoint upload location:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog.
3. Upload .sppkg files under Apps for SharePoint.
4. Deploy or trust the app when prompted, then add the app or web part to the target site.

CDN upload location:

Upload CDN asset folders to the CDN base path shown in each CDN README. Preserve the folder structure under \`assets/\`.
`
  );
}

async function writeSingleBundleReadme(dir, slug, packageFileName) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  await writeFile(
    file,
    `# ${slug} Standalone SharePoint Package

Upload \`${packageFileName}\` to the SharePoint tenant app catalog under Apps for SharePoint.

Use this package when you want one .sppkg file with the web part assets embedded. No CDN upload is required.

Deployment steps:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog, then Apps for SharePoint.
3. Upload \`${packageFileName}\`.
4. Deploy or trust the app when prompted.
5. Add or update the app on the target SharePoint site, then add the web part to the page.
`
  );
  return file;
}

async function writeCdnPackageReadme(dir, slug, cdnBasePath, packageFileName) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  await writeFile(
    file,
    `# ${slug} CDN SharePoint Package

This package is split into SharePoint app catalog files and CDN-hosted assets.

CDN upload:

1. Upload the contents of \`release/assets/\` to:

\`${cdnBasePath}\`

2. Preserve the folder structure under \`assets/\`.
3. Use \`release/manifests/\` for manifest review or CDN handoff records when needed.

SharePoint upload:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog, then Apps for SharePoint.
3. Upload \`sharepoint/solution/${packageFileName}\`.
4. Deploy or trust the app when prompted.
5. Add or update the app on the target SharePoint site after the CDN assets are available.
`
  );
  return file;
}

async function writeRepoExportReadme(dir, slug) {
  await writeFile(
    path.join(dir, 'SPFX-KIT-EXPORT-README.md'),
    `# ${slug} Repo Export

This folder is a portable SPFx source repo. It is not the upload artifact itself.

Build deployment artifacts:

1. Run \`npm ci\`.
2. Run \`npm run ship\`.
3. Upload generated .sppkg files from \`sharepoint/solution/\` to the SharePoint tenant app catalog under Apps for SharePoint.
4. If the package uses CDN assets, upload generated files from \`release/assets/\` to the CDN base path in \`config/write-manifests.json\`.
5. Deploy or trust the SharePoint package, then add or update the app on the target SharePoint site.
`
  );
}

async function writeCdnHandoffReadme(dir, slug, cdnBasePath) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${slug} CDN Handoff

Upload the contents of \`assets/\` to:

\`${cdnBasePath}\`

The SharePoint package in \`sharepoint/solution\` references this CDN path through \`config/write-manifests.json\`.
CDN upload is intentionally manual for v1.
`
  );
}

async function writeReleaseReadme(dir, slug, cdnBasePath) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${slug} Release

This folder contains CDN-ready assets and manifests generated by \`gulp bundle --ship\`.

CDN base path: \`${cdnBasePath}\`
`
  );
}

async function createArchive(outDir, targets, archivePath) {
  const targetEntries = targets.map((target) => path.relative(outDir, target.dir).split(path.sep)[0]);
  const entries = [...targetEntries, 'README.md', 'manifest.json'].filter((entry, index, arr) => arr.indexOf(entry) === index);
  const result = spawnSync('tar', ['-czf', archivePath, '-C', outDir, ...entries], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Could not create export archive: ${archivePath}`);
  }
}

function exportDirNameForTarget(target, slug) {
  if (target === 'single') {
    return `${slug}-standalone`;
  }
  if (target === 'standalone') {
    return `${slug}-repo`;
  }
  return target;
}

function archiveSegmentForTarget(target) {
  if (target === 'single') {
    return 'standalone';
  }
  if (target === 'standalone') {
    return 'repo';
  }
  return target;
}

async function describeTarget(id, label, dir, files) {
  const uniqueFiles = Array.from(new Set(files));
  const items = [];
  let total = 0;
  for (const file of uniqueFiles) {
    if (!(await exists(file))) {
      continue;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      continue;
    }
    total += info.size;
    items.push({
      path: file,
      relativePath: path.relative(dir, file).replace(/\\/g, '/'),
      size: formatBytes(info.size)
    });
  }
  return {
    id,
    label,
    dir,
    totalBytes: total,
    totalSize: formatBytes(total),
    files: items.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  };
}

function hasDependency(packageJson, name) {
  return Boolean(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
}

function defaultClaude(slug) {
  return `# ${slug} SPFx Project Rules

- Use Node >=22.14.0 <23.0.0 and npm 10.
- Use SPFx 1.21.1, React 17, TypeScript 5.3.3, and gulp 4.
- For CDN production packages, keep \`includeClientSideAssets=false\` and set \`cdnBasePath\` to your CDN URL for this app.
- Provision SharePoint lists and tenant resources manually; do not add PnP provisioning as a hidden build step.
- Keep production-consumed source under \`src/\`; do not add a top-level \`packages/\` workspace.
`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}

function formatBytes(value) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
