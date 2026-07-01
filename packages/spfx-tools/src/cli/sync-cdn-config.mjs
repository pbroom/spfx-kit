#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { readJson, writeJson } from '../lib/fs.mjs';

const usage = `Usage:
  sync-cdn-config --app .spfx-kit/apps/<slug> [--base-url https://cdn.example.com/root]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = required(args, 'app', usage);
  const appDir = path.resolve(app);
  const slug = path.basename(appDir);
  const baseUrl = String(args['base-url'] || process.env.SPFX_KIT_CDN_BASE_URL || '').trim();
  if (!baseUrl) {
    throw new Error('Missing CDN base URL. Set SPFX_KIT_CDN_BASE_URL or pass --base-url.');
  }

  const cdnBasePath = `${baseUrl.replace(/\/+$/, '')}/${slug}/`;
  assertHttpsCdn(cdnBasePath);

  const writeManifestPath = path.join(appDir, 'config', 'write-manifests.json');
  const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
  const writeManifest = await readJson(writeManifestPath);
  const packageSolution = await readJson(packageSolutionPath);

  writeManifest.cdnBasePath = cdnBasePath;
  packageSolution.solution = packageSolution.solution || {};
  packageSolution.solution.includeClientSideAssets = false;

  await writeJson(writeManifestPath, writeManifest);
  await writeJson(packageSolutionPath, packageSolution);

  console.log(`Updated CDN config for ${app}`);
  console.log(`  cdnBasePath: ${cdnBasePath}`);
  console.log('  includeClientSideAssets: false');
}

function assertHttpsCdn(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid CDN URL: ${value}`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw new Error(`CDN base path must be a non-localhost HTTPS URL: ${value}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
