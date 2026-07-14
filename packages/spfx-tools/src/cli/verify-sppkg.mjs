#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { verifySppkg } from '../lib/sppkg.mjs';

const usage = `Usage:
  verify-sppkg --app .spfx-kit/apps/<slug> [--json]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(required(args, 'app', usage));
  const result = await verifySppkg(appDir);
  const output = {
    packagePath: path.relative(process.cwd(), result.packagePath).replace(/\\/g, '/'),
    bytes: result.bytes,
    entries: result.entries
  };
  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Verified ${output.packagePath}`);
  console.log(`  Size: ${output.bytes} bytes`);
  console.log(`  Entries: ${output.entries}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
