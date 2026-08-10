#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveUiProfileDeliveryArtifact } from './lib/delivery-artifact.mjs';

if (process.argv.length !== 2) throw new Error('UI profile delivery verification does not accept arguments');

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = await resolveUiProfileDeliveryArtifact({ packageRoot });
console.log(`Verified ${artifact.cssRelativePath}: ${artifact.cssSha256}, scope ${artifact.scopeValue}`);
