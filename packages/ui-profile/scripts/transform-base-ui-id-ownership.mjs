import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { sha256 } from './lib/profile.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preparedParent = path.join(packageRoot, '.prepared');
const contractDirectory = path.join(packageRoot, 'compat', 'base-ui-1.6.0', 'id-ownership');
const contractPath = path.join(contractDirectory, 'contract.json');
const contract = JSON.parse(await readFile(contractPath, 'utf8'));
const contractSchema = JSON.parse(await readFile(path.join(contractDirectory, 'contract.schema.json'), 'utf8'));
const validateContract = new Ajv2020({ allErrors: true, strict: true }).compile(contractSchema);
if (!validateContract(contract)) {
  throw new Error(`Base UI ID ownership contract is invalid: ${JSON.stringify(validateContract.errors)}`);
}

const exportContract = {
  import: {
    types: './spfx-id-ownership.d.mts',
    default: './spfx-id-ownership.mjs'
  },
  require: {
    types: './spfx-id-ownership.d.ts',
    default: './spfx-id-ownership.js'
  },
  default: {
    types: './spfx-id-ownership.d.mts',
    default: './spfx-id-ownership.mjs'
  }
};

export function transformBaseUiPackageManifest(source) {
  const manifest = JSON.parse(source);
  const current = manifest.exports?.[contract.exportPath];
  if (current !== undefined && JSON.stringify(current) !== JSON.stringify(exportContract)) {
    throw new Error(`${contract.exportPath}: an unrecognized Base UI export already exists`);
  }
  if (!manifest.exports || Array.isArray(manifest.exports) || typeof manifest.exports !== 'object') {
    throw new Error('Base UI package manifest must provide an object exports map');
  }
  manifest.exports[contract.exportPath] = exportContract;
  return JSON.stringify(manifest, null, 2);
}

async function verifiedProviderFile(file) {
  const bytes = await readFile(path.join(packageRoot, file.sourcePath));
  if (sha256(bytes) !== file.sha256) throw new Error(`${file.sourcePath}: provider source digest differs`);
  return bytes;
}

async function verifyFixtures() {
  for (const file of contract.providerFiles) await verifiedProviderFile(file);
}

export async function applyIdOwnership(baseUiRoot) {
  const [realParent, realTarget] = await Promise.all([realpath(preparedParent), realpath(baseUiRoot)]);
  const relativeTarget = path.relative(realParent, realTarget);
  if (
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget) ||
    !path.basename(realTarget).startsWith('.base-ui-staging-')
  ) {
    throw new Error('ID ownership may only be applied to an isolated .prepared staging copy');
  }
  await verifyFixtures();
  const manifestPath = path.join(baseUiRoot, contract.packageManifest.installedPath);
  const manifestBytes = await readFile(manifestPath);
  const manifestDigest = sha256(manifestBytes);
  if (
    manifestDigest !== contract.packageManifest.originalFileSha256 &&
    manifestDigest !== contract.packageManifest.transformedFileSha256
  ) {
    throw new Error(`${manifestPath}: installed package manifest bytes are not recognized`);
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.name !== contract.package || manifest.version !== contract.version) {
    throw new Error(`Expected ${contract.package}@${contract.version}; found ${manifest.name}@${manifest.version}`);
  }
  const transformedManifest = Buffer.from(transformBaseUiPackageManifest(manifestBytes.toString('utf8')));
  if (sha256(transformedManifest) !== contract.packageManifest.transformedFileSha256) {
    throw new Error(`${manifestPath}: transformed package manifest digest differs`);
  }
  await writeFile(manifestPath, transformedManifest);
  for (const file of contract.providerFiles) {
    await writeFile(path.join(baseUiRoot, file.installedPath), await verifiedProviderFile(file), { flag: 'wx' });
  }
}

const mode = process.argv[2];
if (mode === '--verify-fixtures') {
  await verifyFixtures();
  console.log(`Verified ${contract.contractVersion}`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  throw new Error('Only --verify-fixtures is supported; use prepare-base-ui for isolated transforms');
}
