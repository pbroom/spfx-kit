import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

export const CATALOG_COMPONENT_COUNT = 64;
export const CATALOG_INCLUDED_COUNT = 57;
export const CATALOG_EXCLUDED_COUNT = 4;
export const CATALOG_COMPOSITION_COUNT = 3;
export const CATALOG_PATH = 'catalog.json';
export const CATALOG_SCHEMA_PATH = 'catalog.schema.json';
export const CATALOG_SNAPSHOT_PATH = 'snapshots/catalog/components.json';

const COMPONENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertComponentIds(values, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  const seen = new Set();
  for (const id of values) {
    assert(typeof id === 'string' && COMPONENT_ID_PATTERN.test(id), `${label} contains an invalid component ID`);
    assert(!seen.has(id), `${label} contains duplicate component ${id}`);
    seen.add(id);
  }
  return values;
}

function assertObjectEntries(values, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  for (const value of values) {
    assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must contain objects`);
  }
  return values;
}

function assertExact(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

export function assertCatalogSchema(catalog, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('uri', {
    type: 'string',
    validate(value) {
      try {
        return Boolean(new URL(value).protocol);
      } catch {
        return false;
      }
    }
  });
  const validate = ajv.compile(schema);
  if (!validate(catalog)) {
    const detail = validate.errors
      ?.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
      .join('; ');
    throw new Error(`UI profile catalog schema errors: ${detail || 'unknown validation error'}`);
  }
}

export function deriveCatalogCoverage(catalog) {
  assert(catalog && typeof catalog === 'object' && !Array.isArray(catalog), 'UI profile catalog must be an object');

  const includedComponentIds = [...assertComponentIds(catalog.includedComponentIds, 'Included component IDs')];
  const excludedComponents = [...assertObjectEntries(catalog.excludedComponents, 'Excluded components')];
  const documentedCompositions = [
    ...assertObjectEntries(catalog.documentedCompositions, 'Documented compositions')
  ];
  const supportRegistryIds = [...assertComponentIds(catalog.supportRegistryIds, 'Support registry IDs')];
  const explicitDivergences = [...assertObjectEntries(catalog.explicitDivergences, 'Explicit divergences')];
  const excludedComponentIds = assertComponentIds(
    excludedComponents.map((entry) => entry.id),
    'Excluded component IDs'
  );
  const documentedCompositionIds = assertComponentIds(
    documentedCompositions.map((entry) => entry.id),
    'Documented composition IDs'
  );
  const catalogComponentIds = [...includedComponentIds, ...excludedComponentIds, ...documentedCompositionIds];
  assertComponentIds(catalogComponentIds, 'Catalog coverage');

  assert(catalog.counts && typeof catalog.counts === 'object', 'Catalog counts are missing');
  assertExact(
    catalog.counts,
    {
      catalog: CATALOG_COMPONENT_COUNT,
      included: CATALOG_INCLUDED_COUNT,
      excluded: CATALOG_EXCLUDED_COUNT,
      documentedCompositions: CATALOG_COMPOSITION_COUNT
    },
    'Catalog counts differ from the reviewed coverage contract'
  );
  assert(includedComponentIds.length === catalog.counts.included, 'Included component count differs');
  assert(excludedComponentIds.length === catalog.counts.excluded, 'Excluded component count differs');
  assert(
    documentedCompositionIds.length === catalog.counts.documentedCompositions,
    'Documented composition count differs'
  );
  assert(catalogComponentIds.length === catalog.counts.catalog, 'Catalog coverage does not contain exactly 64 entries');

  const catalogIdSet = new Set(catalogComponentIds);
  for (const id of supportRegistryIds) {
    assert(!catalogIdSet.has(id), `Support registry ID ${id} is also classified as a catalog component`);
  }

  const divergenceIds = new Set();
  const divergencesById = new Map();
  for (const divergence of explicitDivergences) {
    assert(
      typeof divergence.id === 'string' && COMPONENT_ID_PATTERN.test(divergence.id),
      'Explicit divergence contains an invalid ID'
    );
    assert(!divergenceIds.has(divergence.id), `Duplicate explicit divergence ${divergence.id}`);
    divergenceIds.add(divergence.id);
    const componentIds = assertComponentIds(divergence.componentIds, `Divergence ${divergence.id} component IDs`);
    for (const id of componentIds) {
      assert(catalogIdSet.has(id), `Divergence ${divergence.id} references unknown catalog component ${id}`);
    }
    divergencesById.set(divergence.id, new Set(componentIds));
  }

  for (const [classification, entries] of [
    ['Excluded component', excludedComponents],
    ['Documented composition', documentedCompositions]
  ]) {
    for (const entry of entries) {
      assert(
        typeof entry.divergenceId === 'string' && divergencesById.has(entry.divergenceId),
        `${classification} ${entry.id} references an unknown divergence`
      );
      assert(
        divergencesById.get(entry.divergenceId).has(entry.id),
        `${classification} ${entry.id} is absent from divergence ${entry.divergenceId}`
      );
      assert(typeof entry.reason === 'string' && entry.reason.trim().length > 0, `${classification} ${entry.id} has no reason`);
    }
  }

  return Object.freeze({
    includedComponentIds: Object.freeze(includedComponentIds),
    excludedComponentIds: Object.freeze([...excludedComponentIds]),
    documentedCompositionIds: Object.freeze([...documentedCompositionIds]),
    supportRegistryIds: Object.freeze(supportRegistryIds),
    catalogComponentIds: Object.freeze(catalogComponentIds),
    publicComponentIds: Object.freeze([...includedComponentIds]),
    registryIds: Object.freeze([...includedComponentIds, ...supportRegistryIds])
  });
}

export function assertCatalogSnapshot(catalog, snapshot, coverage = deriveCatalogCoverage(catalog)) {
  assert(catalog.catalogSnapshot === CATALOG_SNAPSHOT_PATH, 'Catalog snapshot path differs');
  assert(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'Official catalog snapshot must be an object');
  const snapshotIds = [...assertComponentIds(snapshot.componentIds, 'Official catalog snapshot IDs')];
  assert(snapshotIds.length === CATALOG_COMPONENT_COUNT, 'Official catalog snapshot must contain exactly 64 entries');
  assert(snapshot.source && typeof snapshot.source === 'object', 'Official catalog snapshot source is missing');
  assert(snapshot.source.kind === 'official-main-components-page', 'Official catalog snapshot source kind differs');
  assert(
    typeof snapshot.source.url === 'string' && /^https:\/\/ui\.shadcn\.com\//u.test(snapshot.source.url),
    'Official catalog snapshot URL is not an official shadcn URL'
  );
  assert(
    typeof snapshot.source.retrievedDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(snapshot.source.retrievedDate) &&
      !Number.isNaN(Date.parse(`${snapshot.source.retrievedDate}T00:00:00Z`)),
    'Official catalog snapshot retrieval date is invalid'
  );
  assert(
    snapshot.source.cli?.name === 'shadcn' && typeof snapshot.source.cli.version === 'string',
    'Official catalog snapshot CLI identity is invalid'
  );

  const included = new Set(coverage.includedComponentIds);
  const excluded = new Set(coverage.excludedComponentIds);
  const compositions = new Set(coverage.documentedCompositionIds);
  const classifiedSnapshotIds = snapshotIds.filter(
    (id) => included.has(id) || excluded.has(id) || compositions.has(id)
  );
  assertExact(classifiedSnapshotIds, snapshotIds, 'Official catalog snapshot contains an unclassified component');
  assertExact(
    coverage.includedComponentIds,
    snapshotIds.filter((id) => included.has(id)),
    'Included component order differs from the official catalog snapshot'
  );
  assertExact(
    coverage.excludedComponentIds,
    snapshotIds.filter((id) => excluded.has(id)),
    'Excluded component order differs from the official catalog snapshot'
  );
  assertExact(
    coverage.documentedCompositionIds,
    snapshotIds.filter((id) => compositions.has(id)),
    'Documented composition order differs from the official catalog snapshot'
  );
}

export async function readCatalogContract(packageRoot) {
  const [catalogBytes, schemaBytes, snapshotBytes] = await Promise.all([
    readFile(path.join(packageRoot, CATALOG_PATH)),
    readFile(path.join(packageRoot, CATALOG_SCHEMA_PATH)),
    readFile(path.join(packageRoot, CATALOG_SNAPSHOT_PATH))
  ]);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const schema = JSON.parse(schemaBytes.toString('utf8'));
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
  assertCatalogSchema(catalog, schema);
  const coverage = deriveCatalogCoverage(catalog);
  assertCatalogSnapshot(catalog, snapshot, coverage);
  return { catalog, schema, snapshot, coverage };
}
