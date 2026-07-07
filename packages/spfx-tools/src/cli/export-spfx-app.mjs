#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { appSlugFromDir } from '../lib/spfx.mjs';
import { archiveSegmentForTarget, createArchive } from '../lib/export/archive.mjs';
import { writeExportReadme } from '../lib/export/docs.mjs';
import { configureExportOutput, isJsonOutput, reportExportProgress } from '../lib/export/output.mjs';
import { exportCdnPackage, exportSingleBundle, exportStandaloneRepo } from '../lib/export/targets.mjs';

const usage = `Usage:
  export-spfx-app --app .spfx-kit/apps/<slug>-spfx --target single,cdn,standalone [--out <dir>] [--json] [--progress-json]

With --json, stdout carries only the final JSON summary; all build logs go to stderr.`;

const allowedTargets = new Set(['single', 'cdn', 'standalone']);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  configureExportOutput({
    progressJson: args['progress-json'] === true || args['progress-json'] === 'true',
    jsonOutput: args.json === true || args.json === 'true'
  });
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
      // single/cdn mutate config in place; restore the originals so the
      // standalone repo copies pristine configuration.
      await writeFile(packageSolutionPath, originalPackageSolution);
      await writeFile(writeManifestPath, originalWriteManifest);
      summary.targets.push(await exportStandaloneRepo(appDir, outDir, slug));
    }
  } finally {
    await writeFile(packageSolutionPath, originalPackageSolution);
    await writeFile(writeManifestPath, originalWriteManifest);
  }

  summary.archivePath = path.join(outDir, `${slug}-${targets.map((target) => archiveSegmentForTarget(target)).join('-')}.tar.gz`);
  await writeExportReadme(outDir, slug, summary.targets);
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(portableManifest(summary, outDir), null, 2)}\n`);
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

  if (isJsonOutput()) {
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

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}

// The manifest ships inside the archive, so keep every path relative to the
// export root instead of leaking the creator's local filesystem layout.
function portableManifest(summary, outDir) {
  return {
    ...summary,
    outDir: '.',
    archivePath: path.relative(outDir, summary.archivePath).replace(/\\/g, '/'),
    targets: summary.targets.map((target) => ({
      ...target,
      dir: path.relative(outDir, target.dir).replace(/\\/g, '/')
    }))
  };
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
