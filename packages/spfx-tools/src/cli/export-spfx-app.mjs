#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { appSlugFromDir } from '../lib/spfx.mjs';
import { archiveSegmentForTarget, createArchive } from '../lib/export/archive.mjs';
import { writeExportReadme } from '../lib/export/docs.mjs';
import { acquireAppExportLock } from '../lib/export/lock.mjs';
import { configureExportOutput, isJsonOutput, reportExportProgress } from '../lib/export/output.mjs';
import { exportCdnPackage, exportSingleBundle, exportStagingCdnPackage, exportStandaloneRepo } from '../lib/export/targets.mjs';
import { withAppliedExportConfig } from '../lib/export/config.mjs';

const usage = `Usage:
  export-spfx-app --app .spfx-kit/apps/<slug>-spfx --target single,cdn,staging-cdn,standalone [--out <dir>] [--json] [--progress-json]

Staging CDN target:
  --staging-cdn-base-url <https-url> --cdn-release <release-label>
  (or SPFX_KIT_STAGING_CDN_BASE_URL and SPFX_KIT_CDN_RELEASE)

With --json, stdout carries only the final JSON summary; all build logs go to stderr.`;

const allowedTargets = new Set(['single', 'cdn', 'staging-cdn', 'standalone']);

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
      throw new Error(`Unsupported export target "${target}". Use single, cdn, staging-cdn, or standalone.`);
    }
  }
  const stagingCdnRoot = String(args['staging-cdn-base-url'] || process.env.SPFX_KIT_STAGING_CDN_BASE_URL || '').trim();
  const cdnRelease = String(args['cdn-release'] || process.env.SPFX_KIT_CDN_RELEASE || '').trim();
  if (targets.includes('staging-cdn') && (!stagingCdnRoot || !cdnRelease)) {
    throw new Error(
      'staging-cdn requires --staging-cdn-base-url and --cdn-release (or SPFX_KIT_STAGING_CDN_BASE_URL and SPFX_KIT_CDN_RELEASE).'
    );
  }

  const appDir = path.resolve(app);
  const releaseExportLock = await acquireAppExportLock(appDir);
  try {
    await runExport({ appDir, args, cdnRelease, stagingCdnRoot, targets });
  } finally {
    await releaseExportLock();
  }
}

async function runExport({ appDir, args, cdnRelease, stagingCdnRoot, targets }) {
  const slug = appSlugFromDir(appDir);
  const outDir = path.resolve(args.out || path.join(process.cwd(), '.spfx-kit', 'exports', slug, timestamp()));
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

  await withAppliedExportConfig(appDir, async ({ exportConfig, restoreAppliedSource }) => {
    if (targets.includes('single')) {
      summary.targets.push(await exportSingleBundle(appDir, outDir, slug));
    }
    if (targets.includes('cdn')) {
      summary.targets.push(
        await exportCdnPackage(appDir, outDir, slug, {
          cdnBasePath: exportConfig?.cdnUrl || undefined
        })
      );
    }
    if (targets.includes('staging-cdn')) {
      summary.targets.push(
        await exportStagingCdnPackage(appDir, outDir, slug, {
          stagingCdnRoot,
          releaseLabel: cdnRelease
        })
      );
    }
    if (targets.includes('standalone')) {
      // Package targets mutate config in place. Return to the sidecar-applied
      // baseline so the standalone repo gets overrides without target-specific
      // includeClientSideAssets or staging CDN changes.
      await restoreAppliedSource();
      summary.targets.push(await exportStandaloneRepo(appDir, outDir, slug));
    }
  });

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
