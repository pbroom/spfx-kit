#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { readJson } from '../lib/fs.mjs';
import { verifyCdnStage, verifyRemoteCdnFiles } from '../lib/cdn-stage.mjs';

const usage = `Usage:
  verify-cdn-stage --stage <export-dir>/staging-cdn [--remote --expected-cdn-base-url <exact-prefix>] [--authorization-env <ENV_NAME>] [--json]

Local verification is always performed. --remote downloads every staged URL and compares its bytes and SHA-256.
The expected prefix must come from trusted deployment configuration, not from the artifact being checked.
If the CDN requires authorization, name an environment variable containing the Authorization header value.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stageDir = path.resolve(required(args, 'stage', usage));
  const manifest = await readJson(path.join(stageDir, 'deployment-manifest.json'));
  const rebuilt = await verifyCdnStage(stageDir, manifest);
  let remote = { status: 'not-run', files: 0 };

  if (args.remote === true || args.remote === 'true') {
    const expectedCdnBasePath = String(
      args['expected-cdn-base-url'] || process.env.SPFX_KIT_EXPECTED_STAGING_CDN_BASE_URL || ''
    ).trim();
    if (!expectedCdnBasePath) {
      throw new Error(
        '--remote requires --expected-cdn-base-url (or SPFX_KIT_EXPECTED_STAGING_CDN_BASE_URL) from trusted configuration'
      );
    }
    const authorization = readAuthorization(args['authorization-env']);
    const files = await verifyRemoteCdnFiles(rebuilt.files, { authorization, expectedCdnBasePath });
    remote = { status: 'passed', files: files.length };
  }

  const report = {
    stageDir,
    cdnBasePath: rebuilt.cdnBasePath,
    releaseId: rebuilt.releaseId,
    local: { status: 'passed', files: rebuilt.files.length },
    remote,
    sharePointAppCatalog: { status: 'not-run' }
  };
  if (args.json === true || args.json === 'true') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Validated staging CDN artifact: ${stageDir}`);
  console.log(`  Local upload files: ${rebuilt.files.length} (passed)`);
  console.log(`  Remote CDN: ${remote.status}${remote.status === 'passed' ? ` (${remote.files} files)` : ''}`);
  console.log('  SharePoint App Catalog proof: not run');
}

function readAuthorization(environmentName) {
  if (!environmentName) {
    return undefined;
  }
  if (environmentName === true || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentName)) {
    throw new Error('--authorization-env must name a valid environment variable');
  }
  const value = process.env[environmentName];
  if (!value) {
    throw new Error(`Authorization environment variable is not set: ${environmentName}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
