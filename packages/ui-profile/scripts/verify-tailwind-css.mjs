import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyTailwindCss } from './lib/compile-tailwind-css.mjs';

if (process.argv.length !== 2) throw new Error('CSS verification does not accept arguments');

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = JSON.parse(await readFile(path.join(packageRoot, 'profile.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'));
const result = await verifyTailwindCss({ packageRoot, profile, provenance });
console.log(`Verified ${result.artifact.path}: ${result.candidateCount} candidates, scope ${result.scopeValue}`);
