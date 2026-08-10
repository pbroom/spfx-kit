import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readCatalogContract } from './lib/catalog.mjs';

const NON_COMPONENT_EXPORTS = Object.freeze(['.', './delivery', './spfx-gulp', './spfx-webpack', './styles.css', './vite']);
const NON_COMPONENT_TYPE_VERSIONS = Object.freeze(['delivery', 'vite']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExact(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

async function readJson(packageRoot, relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), 'utf8'));
}

async function filesUnderIfPresent(packageRoot, relativeDirectory) {
  const directory = path.join(packageRoot, relativeDirectory);
  try {
    const stats = await lstat(directory);
    assert(stats.isDirectory() && !stats.isSymbolicLink(), `${relativeDirectory} must be a regular directory`);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        assert(entry.isFile(), `${relativeDirectory} contains a non-file entry`);
        files.push(path.relative(packageRoot, absolute).replaceAll(path.sep, '/'));
      }
    }
  }
  await visit(directory);
  return sorted(files);
}

function assertPublicEntries(manifest, coverage) {
  const expectedExports = sorted([...NON_COMPONENT_EXPORTS, ...coverage.publicComponentIds.map((id) => `./${id}`)]);
  assertExact(
    sorted(Object.keys(manifest.exports ?? {})),
    expectedExports,
    'Public package export inventory differs from catalog'
  );
  for (const id of coverage.publicComponentIds) {
    assertExact(
      manifest.exports[`./${id}`],
      {
        types: `./normalized/src/components/ui/${id}.tsx`,
        import: `./dist/normalized/src/components/ui/${id}.js`
      },
      `${id}: public package export differs from the catalog contract`
    );
  }

  const versions = manifest.typesVersions?.['*'];
  assert(versions && typeof versions === 'object', 'Public package typesVersions are missing');
  const expectedTypeVersions = sorted([...NON_COMPONENT_TYPE_VERSIONS, ...coverage.publicComponentIds]);
  assertExact(sorted(Object.keys(versions)), expectedTypeVersions, 'Public package typeVersions inventory differs from catalog');
  for (const id of coverage.publicComponentIds) {
    assertExact(
      versions[id],
      [`normalized/src/components/ui/${id}.tsx`],
      `${id}: public package typeVersions target differs from the catalog contract`
    );
  }

  const nonPublicIds = new Set([
    ...coverage.excludedComponentIds,
    ...coverage.documentedCompositionIds,
    ...coverage.supportRegistryIds
  ]);
  for (const id of nonPublicIds) {
    assert(!Object.hasOwn(manifest.exports ?? {}, `./${id}`), `${id}: non-public catalog entry is exported`);
    assert(!Object.hasOwn(versions, id), `${id}: non-public catalog entry has a typesVersions path`);
  }
}

function assertProfileEntries(profile, provenance, coverage) {
  assert(profile.profileId === provenance.profileId, 'Profile and provenance identities differ');
  assertExact(provenance.registryIds, coverage.registryIds, 'Provenance registry IDs differ from catalog coverage');
  assertExact(
    sorted(Object.keys(provenance.registrySnapshots ?? {})),
    sorted(coverage.registryIds),
    'Provenance registry snapshot inventory differs from catalog coverage'
  );
  assert(Array.isArray(profile.items), 'Generated profile item inventory is missing');
  assertExact(
    profile.items.map((item) => item.id),
    coverage.registryIds,
    'Generated profile items differ from catalog coverage'
  );

  const itemById = new Map(profile.items.map((item) => [item.id, item]));
  const normalizedPaths = new Set((profile.ownedSources ?? []).map((entry) => entry.output?.path));
  normalizedPaths.delete(undefined);
  for (const id of coverage.registryIds) {
    const item = itemById.get(id);
    assert(item, `${id}: generated profile item is missing`);
    assert(item.raw?.path === `snapshots/raw/${id}.json`, `${id}: raw snapshot path differs`);
    assert(item.canonical?.path === `snapshots/canonical/${id}.json`, `${id}: canonical snapshot path differs`);
    assert(Array.isArray(item.normalized) && item.normalized.length > 0, `${id}: normalized output inventory is empty`);
    for (const output of item.normalized) {
      assert(typeof output.path === 'string', `${id}: normalized output path is invalid`);
      assert(!normalizedPaths.has(output.path), `${id}: duplicate normalized output ${output.path}`);
      normalizedPaths.add(output.path);
    }
  }
  for (const id of coverage.publicComponentIds) {
    assert(normalizedPaths.has(`normalized/src/components/ui/${id}.tsx`), `${id}: public component has no normalized module`);
  }
  return sorted(normalizedPaths);
}

async function assertGeneratedInventories(packageRoot, coverage, normalizedPaths) {
  const expectedRaw = sorted(coverage.registryIds.map((id) => `snapshots/raw/${id}.json`));
  const expectedCanonical = sorted(coverage.registryIds.map((id) => `snapshots/canonical/${id}.json`));
  const [raw, canonical, normalized] = await Promise.all([
    filesUnderIfPresent(packageRoot, 'snapshots/raw'),
    filesUnderIfPresent(packageRoot, 'snapshots/canonical'),
    filesUnderIfPresent(packageRoot, 'normalized')
  ]);
  if (raw) assertExact(raw, expectedRaw, 'Raw registry snapshot inventory differs from catalog coverage');
  if (canonical) assertExact(canonical, expectedCanonical, 'Canonical registry snapshot inventory differs from catalog coverage');
  if (normalized) assertExact(normalized, normalizedPaths, 'Normalized source inventory differs from generated profile');
}

export async function verifyCatalogPackage({ packageRoot } = {}) {
  const selectedRoot = path.resolve(packageRoot ?? path.dirname(fileURLToPath(import.meta.url)), packageRoot ? '.' : '..');
  const [{ catalog, snapshot, coverage }, manifest, provenance, profile] = await Promise.all([
    readCatalogContract(selectedRoot),
    readJson(selectedRoot, 'package.json'),
    readJson(selectedRoot, 'provenance.json'),
    readJson(selectedRoot, 'profile.json')
  ]);
  assert(catalog.profileId === provenance.profileId, 'Catalog and provenance identities differ');
  assert(catalog.profileId === profile.profileId, 'Catalog and profile identities differ');
  assert(catalog.officialDefaults?.style === 'base-nova', 'Catalog official default style differs');
  assert(snapshot.componentIds.length === catalog.counts.catalog, 'Catalog snapshot count differs from catalog coverage');
  assertPublicEntries(manifest, coverage);
  const normalizedPaths = assertProfileEntries(profile, provenance, coverage);
  await assertGeneratedInventories(selectedRoot, coverage, normalizedPaths);
  return Object.freeze({
    catalog: catalog.counts.catalog,
    included: catalog.counts.included,
    excluded: catalog.counts.excluded,
    documentedCompositions: catalog.counts.documentedCompositions,
    registry: coverage.registryIds.length,
    public: coverage.publicComponentIds.length
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await verifyCatalogPackage();
  console.log(
    `Verified official shadcn catalog: ${result.catalog} covered, ${result.public} public, ` +
      `${result.excluded} excluded, ${result.documentedCompositions} documented compositions`
  );
}
