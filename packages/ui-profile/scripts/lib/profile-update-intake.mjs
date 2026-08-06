import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  GENERATOR_VERSION,
  PROFILE_ID,
  PROFILE_SCHEMA_VERSION,
  assertRegistryIds,
  canonicalJson,
  sha256
} from './profile.mjs';

const SHADCN_NAME = 'shadcn';
const SHADCN_VERSION = '4.16.1';
const SHADCN_INTEGRITY = 'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==';
const PROVENANCE_SCHEMA_SHA256 = '50dc4e94abc96cecb6ce8dd729a9b486708d25c5ec35793a02049d51139c2a49';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

export async function assertProfileGenerationProvenance({ packageRoot, provenance }) {
  const schema = await readJson(path.join(packageRoot, 'provenance.schema.json'));
  assert(
    sha256(Buffer.from(canonicalJson(schema))) === PROVENANCE_SCHEMA_SHA256,
    'Profile update provenance schema identity differs'
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  assert(validate(provenance), `Profile update provenance is invalid: ${ajv.errorsText(validate.errors)}`);
  assert(
    provenance.profileId === PROFILE_ID &&
      provenance.schemaVersion === PROFILE_SCHEMA_VERSION &&
      provenance.generatorVersion === GENERATOR_VERSION,
    'Provenance identity does not match the profile generator'
  );
  assertRegistryIds(provenance.registryIds);
}

export async function assertPinnedShadcnToolchain({
  packageRoot,
  registry,
  resolvedRegistryUrl = import.meta.resolve('shadcn/registry')
}) {
  const repositoryRoot = path.resolve(packageRoot, '..', '..');
  const installedRoot = path.join(repositoryRoot, 'node_modules', SHADCN_NAME);
  const expectedRegistryModule = path.join(installedRoot, 'dist', 'registry', 'index.js');
  const lock = await readJson(path.join(repositoryRoot, 'package-lock.json'));
  const workspace = lock.packages?.['packages/ui-profile'];
  const lockedPackage = lock.packages?.['node_modules/shadcn'];
  const installedPackage = await readJson(path.join(installedRoot, 'package.json'));

  assert(registry.cli?.name === SHADCN_NAME, 'Profile update requires the pinned shadcn CLI identity');
  assert(registry.cli.version === SHADCN_VERSION, 'Profile update shadcn CLI version differs');
  assert(registry.cli.integrity === SHADCN_INTEGRITY, 'Profile update shadcn CLI integrity differs');
  assert(workspace?.devDependencies?.shadcn === SHADCN_VERSION, 'UI profile workspace does not pin shadcn exactly');
  assert(lockedPackage?.version === SHADCN_VERSION, 'Locked shadcn version differs');
  assert(lockedPackage.integrity === SHADCN_INTEGRITY, 'Locked shadcn integrity differs');
  assert(fileURLToPath(resolvedRegistryUrl) === expectedRegistryModule, 'Resolved shadcn registry module is shadowed');
  assert(installedPackage.name === SHADCN_NAME, 'Installed shadcn package identity differs');
  assert(installedPackage.version === SHADCN_VERSION, 'Installed shadcn version differs');
  return resolvedRegistryUrl;
}

export async function fetchPinnedRegistrySnapshots({
  packageRoot,
  registry,
  registryIds,
  fetchImpl = fetch,
  getRegistryItemsImpl,
  resolvedRegistryUrl
}) {
  resolvedRegistryUrl = await assertPinnedShadcnToolchain({ packageRoot, registry, resolvedRegistryUrl });
  if (!getRegistryItemsImpl) ({ getRegistryItems: getRegistryItemsImpl } = await import(resolvedRegistryUrl));

  const snapshots = new Map();
  for (const id of registryIds) {
    const url = registry.endpointTemplate.replace('{id}', id);
    const response = await fetchImpl(url, {
      headers: { 'user-agent': `@spfx-kit/ui-profile/${registry.cli.version}` },
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`Registry update failed for ${id}: HTTP ${response.status}`);
    snapshots.set(id, Buffer.from(await response.arrayBuffer()));
  }

  const cliItems = await getRegistryItemsImpl(registryIds, {
    config: { style: registry.preset },
    useCache: false
  });
  assert(cliItems.length === registryIds.length, 'Pinned shadcn CLI returned an incomplete registry collection');
  const cliById = new Map(cliItems.map((item) => [item.name, item]));
  assert(cliById.size === registryIds.length, 'Pinned shadcn CLI returned duplicate registry identities');

  for (const id of registryIds) {
    const cliItem = cliById.get(id);
    assert(cliItem, `Pinned shadcn CLI did not return ${id}`);
    let hostedItem;
    try {
      hostedItem = JSON.parse(snapshots.get(id).toString('utf8'));
    } catch (error) {
      throw new Error(`Hosted registry response is not JSON for ${id}`, { cause: error });
    }
    assert(
      canonicalJson(hostedItem) === canonicalJson(cliItem),
      `Hosted registry response differs from pinned shadcn CLI intake for ${id}`
    );
  }

  return snapshots;
}

export async function fetchValidatedProfileUpdateSnapshots({
  packageRoot,
  provenance,
  fetchImpl,
  getRegistryItemsImpl,
  resolvedRegistryUrl
}) {
  await assertProfileGenerationProvenance({ packageRoot, provenance });
  return fetchPinnedRegistrySnapshots({
    packageRoot,
    registry: provenance.registry,
    registryIds: provenance.registryIds,
    fetchImpl,
    getRegistryItemsImpl,
    resolvedRegistryUrl
  });
}
