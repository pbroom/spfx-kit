import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runEvidenceCli } from '../.github/evidence-trust/v1/validate-shadcn-evidence.mjs';

export * from '../.github/evidence-trust/v1/validate-shadcn-evidence.mjs';

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runEvidenceCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
