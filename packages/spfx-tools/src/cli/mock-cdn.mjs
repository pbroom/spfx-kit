#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import {
  DEFAULT_MOCK_CDN_BUCKET_PATH,
  DEFAULT_MOCK_CDN_ORIGIN,
  getMockCdnBucketStatus,
  normalizeMockCdnOrigin,
  publishMockCdnAppStage,
  resolveMockCdnBucketRoot,
  selectMockCdnAppRelease
} from '../lib/mock-cdn-bucket.mjs';
import { listenMockCdnServer, normalizeMockCdnLabOrigin } from '../lib/mock-cdn-server.mjs';
import { publishGitHubStagingSource } from '../lib/github-staging-source.mjs';

const usage = `Usage:
  mock-cdn publish --stage <export-dir>/staging-cdn [--select] [--origin http://127.0.0.1:5174] [--root .spfx-kit/mock-cdn/v1] [--json]
  mock-cdn publish-source --descriptor <staging-source.json> --materialization <checkout-or-extracted-root> [--select] [--origin http://127.0.0.1:5174] [--root .spfx-kit/mock-cdn/v1] [--json]
  mock-cdn select --app <slug> --release <immutable-id> [--origin http://127.0.0.1:5174] [--root .spfx-kit/mock-cdn/v1] [--json]
  mock-cdn status [--app <slug>] [--origin http://127.0.0.1:5174] [--root .spfx-kit/mock-cdn/v1] [--json]
  mock-cdn serve [--origin http://127.0.0.1:5174] [--lab-origin http://127.0.0.1:5173] [--root .spfx-kit/mock-cdn/v1] [--json]

The local mock CDN accepts only verified immutable staging-CDN releases whose recorded base URL exactly matches the configured mock origin. Publishing never overwrites a release. Selection is an explicit mutable local control-plane action.

publish-source performs no GitHub request and accepts no token or URL. It is the local adapter for an authenticated staging intake service: that service pulls the descriptor's exact pinned commit from private GitHub and supplies a checkout or safely extracted archive materialization. SPFx Kit verifies its declared checksum closure before using the same canonical immutable publish pipeline.`;

async function main() {
  const [command, ...optionArguments] = process.argv.slice(2);
  if (!command || command.startsWith('--')) {
    throw new Error(usage);
  }
  const args = parseArgs(optionArguments);
  const json = booleanFlag(args.json, 'json');
  const workspaceRoot = process.cwd();
  const bucketRoot = resolveMockCdnBucketRoot(
    workspaceRoot,
    stringOption(args.root, process.env.SPFX_KIT_MOCK_CDN_ROOT || DEFAULT_MOCK_CDN_BUCKET_PATH)
  );
  const origin = normalizeMockCdnOrigin(
    stringOption(args.origin, process.env.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN)
  );

  if (command === 'publish') {
    const result = await publishMockCdnAppStage({
      bucketRoot,
      origin,
      stageDir: path.resolve(required(args, 'stage', usage)),
      select: booleanFlag(args.select, 'select')
    });
    printResult(result, json, [
      `${result.published ? 'Published' : 'Already present'} mock CDN app release: ${result.appId}@${result.releaseId}`,
      `  URL: ${result.releaseBaseUrl}`,
      `  Files: ${result.files}`,
      `  Selected: ${result.selected ? 'yes' : 'no'}`
    ]);
    return;
  }

  if (command === 'publish-source') {
    const result = await publishGitHubStagingSource({
      bucketRoot,
      origin,
      descriptorFile: path.resolve(required(args, 'descriptor', usage)),
      materializationDir: path.resolve(required(args, 'materialization', usage)),
      select: booleanFlag(args.select, 'select')
    });
    printResult(result, json, [
      `${result.published ? 'Published' : 'Already present'} GitHub-sourced mock CDN app release: ${result.appId}@${result.releaseId}`,
      `  Source: ${result.source.repository}@${result.source.commit} · ${result.source.path}`,
      `  Descriptor: ${result.source.descriptorSha256}`,
      `  URL: ${result.releaseBaseUrl}`,
      `  Files: ${result.files}`,
      `  Selected: ${result.selected ? 'yes' : 'no'}`
    ]);
    return;
  }

  if (command === 'select') {
    const pointer = await selectMockCdnAppRelease({
      bucketRoot,
      origin,
      appId: required(args, 'app', usage),
      releaseId: required(args, 'release', usage)
    });
    printResult(pointer, json, [
      `Selected mock CDN app release: ${pointer.appId}@${pointer.releaseId}`,
      `  Manifest: ${pointer.deploymentManifestSha256}`
    ]);
    return;
  }

  if (command === 'status') {
    const status = await getMockCdnBucketStatus({
      bucketRoot,
      origin,
      appId: optionalString(args.app, 'app')
    });
    const lines = [`Mock CDN bucket: ${status.bucketRoot}`, `  Origin: ${status.origin}`];
    if (!status.apps.length) {
      lines.push('  Selected app releases: none');
    } else {
      for (const app of status.apps) {
        lines.push(
          app.status === 'selected-and-verified'
            ? `  ${app.appId}@${app.releaseId}: selected and verified (${app.files} files)`
            : `  ${app.appId}: invalid or unselected`
        );
      }
    }
    printResult(status, json, lines);
    return;
  }

  if (command === 'serve') {
    const labOrigin = normalizeMockCdnLabOrigin(
      stringOption(args['lab-origin'], process.env.SPFX_KIT_MOCK_CDN_LAB_ORIGIN || 'http://127.0.0.1:5173')
    );
    const running = await listenMockCdnServer({ bucketRoot, origin, labOrigin });
    const report = { bucketRoot, origin: running.origin, labOrigin, status: 'listening' };
    printResult(report, json, [
      `Mock CDN listening at ${running.origin}`,
      `  Lab origin: ${labOrigin}`,
      `  Bucket: ${bucketRoot}`
    ]);
    await waitForShutdown(running.close);
    return;
  }

  throw new Error(`Unknown mock CDN command: ${command}\n\n${usage}`);
}

function printResult(value, json, lines) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(lines.join('\n'));
}

function stringOption(value, fallback) {
  if (value === undefined) {
    return String(fallback);
  }
  if (value === true || !String(value).trim()) {
    throw new Error('Mock CDN option requires a value.');
  }
  return String(value).trim();
}

function optionalString(value, name) {
  if (value === undefined) {
    return undefined;
  }
  if (value === true || !String(value).trim()) {
    throw new Error(`--${name} requires a value.`);
  }
  return String(value).trim();
}

function booleanFlag(value, name) {
  if (value === undefined) {
    return false;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`--${name} must be a boolean flag.`);
}

function waitForShutdown(close) {
  return new Promise((resolve, reject) => {
    let closing = false;
    const shutdown = () => {
      if (closing) {
        return;
      }
      closing = true;
      void close().then(resolve, reject);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
