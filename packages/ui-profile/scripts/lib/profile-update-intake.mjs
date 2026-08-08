import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  GENERATOR_VERSION,
  PROFILE_ID,
  PROFILE_SCHEMA_VERSION,
  assertRegistryIds,
  canonicalJson,
  moduleSpecifiers,
  sha256
} from './profile.mjs';

const SHADCN_NAME = 'shadcn';
const SHADCN_VERSION = '4.16.1';
const SHADCN_RESOLVED = 'https://registry.npmjs.org/shadcn/-/shadcn-4.16.1.tgz';
const SHADCN_INTEGRITY = 'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==';
// Derived from a clean npm 10.9.x install of the locked graph rooted at the independently verified
// SHADCN_RESOLVED/SHADCN_INTEGRITY artifact. This includes package-local dependency overrides.
const SHADCN_TREE_SHA256 = 'd2c030d535d89f866050bd40d843b34802bb9a0ba35acca50508c64a883457ea';
const SHADCN_RUNTIME_CLOSURE_SHA256 = '7a19e506f9e733dc03a9533aab875a2df1b76fd9bc498c356763c5274af62868';
const PROVENANCE_SCHEMA_SHA256 = '89208086e782b025d5abf7f4cad63b0dc7731e5aca2007fb862af49350ab74d6';
const DEFAULT_REGISTRY_ITEM_MAX_BYTES = 256 * 1024;
const DEFAULT_REGISTRY_AGGREGATE_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_REGISTRY_REQUEST_TIMEOUT_MS = 30_000;
const ICON_PLACEHOLDER_SPECIFIER = '@/app/(create)/components/icon-placeholder';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertProductionDependencyRoots(productionRoots, directProductionDependencies) {
  assert(Array.isArray(productionRoots), 'Production dependency roots must be an array');
  assert(
    directProductionDependencies && typeof directProductionDependencies === 'object',
    'Direct production dependency policy is missing'
  );
  assert(new Set(productionRoots).size === productionRoots.length, 'Production dependency roots contain duplicates');
  const actual = [...productionRoots].sort();
  const expected = Object.keys(directProductionDependencies).sort();
  assert(canonicalJson(actual) === canonicalJson(expected), 'Production dependency roots differ from provenance');
}

async function packageTreeSha256(root, { excludeNodeModules = false } = {}) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (excludeNodeModules && entry.isDirectory() && entry.name === 'node_modules') continue;
      if (path.basename(directory) === 'node_modules' && entry.isDirectory() && entry.name === '.bin') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        files.push([
          path.relative(root, absolute).replaceAll(path.sep, '/'),
          createHash('sha256')
            .update(await readFile(absolute))
            .digest('hex')
        ]);
      } else {
        throw new Error(`Installed shadcn package contains a non-file entry: ${path.relative(root, absolute)}`);
      }
    }
  }
  await visit(root);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export async function shadcnPackageTreeSha256(root) {
  return packageTreeSha256(root);
}

function lockedDependencyPath(lock, fromPath, dependencyName) {
  let current = fromPath;
  while (current && current !== '.') {
    const candidate = path.posix.join(current, 'node_modules', dependencyName);
    if (lock.packages?.[candidate]) return candidate;
    current = path.posix.dirname(current);
  }
  const rootCandidate = path.posix.join('node_modules', dependencyName);
  return lock.packages?.[rootCandidate] ? rootCandidate : null;
}

export async function shadcnRuntimeClosureSha256(repositoryRoot, lock) {
  const pending = ['node_modules/shadcn'];
  const visited = new Set();
  const records = [];
  while (pending.length > 0) {
    const lockPath = pending.shift();
    if (visited.has(lockPath)) continue;
    visited.add(lockPath);
    const lockedPackage = lock.packages?.[lockPath];
    assert(lockedPackage, `Locked shadcn runtime package is missing: ${lockPath}`);
    const installedRoot = path.resolve(repositoryRoot, lockPath);
    const installedRootStats = await lstat(installedRoot);
    assert(
      installedRootStats.isDirectory() && !installedRootStats.isSymbolicLink(),
      `Installed shadcn runtime package root is shadowed: ${lockPath}`
    );
    const resolvedRoot = await realpath(installedRoot);
    records.push([
      lockPath,
      lockedPackage.version ?? '',
      lockedPackage.resolved ?? '',
      lockedPackage.integrity ?? '',
      await packageTreeSha256(resolvedRoot)
    ]);
    const requiredPeers = Object.keys(lockedPackage.peerDependencies ?? {}).filter(
      (name) => !lockedPackage.peerDependenciesMeta?.[name]?.optional
    );
    const requiredDependencies = [...Object.keys(lockedPackage.dependencies ?? {}), ...requiredPeers].sort();
    for (const dependencyName of requiredDependencies) {
      const dependencyPath = lockedDependencyPath(lock, lockPath, dependencyName);
      assert(dependencyPath, `Locked shadcn runtime dependency is missing: ${lockPath} -> ${dependencyName}`);
      if (!visited.has(dependencyPath)) pending.push(dependencyPath);
    }
  }
  records.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

async function readJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

function assertPositiveSafeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer`);
  return value;
}

async function withDeadline(label, timeoutMs, operation) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} exceeded the ${timeoutMs}ms deadline`));
    }, timeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(response, id, itemLimit, aggregateRemaining) {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength !== null && contentLength !== undefined && /^\d+$/u.test(contentLength)) {
    const declaredLength = Number(contentLength);
    assert(declaredLength <= itemLimit, `Registry response for ${id} exceeds the ${itemLimit}-byte item limit`);
    assert(
      declaredLength <= aggregateRemaining,
      `Registry response collection exceeds the aggregate byte limit at ${id}`
    );
  }
  assert(response.body && typeof response.body.getReader === 'function', `Registry response body is unavailable for ${id}`);

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      length += chunk.length;
      assert(length <= itemLimit, `Registry response for ${id} exceeds the ${itemLimit}-byte item limit`);
      assert(length <= aggregateRemaining, `Registry response collection exceeds the aggregate byte limit at ${id}`);
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, length);
}

function dependencyIdentity(specifier, label) {
  assert(typeof specifier === 'string' && specifier.length > 0, `${label} has an invalid dependency`);
  const match = specifier.startsWith('@')
    ? /^(@[^/]+\/[^@/]+)(?:@(.+))?$/u.exec(specifier)
    : /^([^@/]+)(?:@(.+))?$/u.exec(specifier);
  assert(match, `${label} has an unsupported dependency specifier: ${specifier}`);
  return { name: match[1], version: match[2] };
}

function importedPackageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}

function isExcludedDependency(name, exclusions) {
  return exclusions.some((specifier) => {
    if (specifier.endsWith('/*')) return name.startsWith(specifier.slice(0, -1));
    return dependencyIdentity(specifier, 'Profile exclusion').name === name;
  });
}

function assertAllowedProductionDependency(specifier, label, policy) {
  const dependency = dependencyIdentity(specifier, label);
  assert(!isExcludedDependency(dependency.name, policy.excludedDependencies), `${label} uses excluded dependency ${dependency.name}`);
  const expectedVersion = policy.directProductionDependencies[dependency.name];
  assert(expectedVersion, `${label} uses undeclared production dependency ${dependency.name}`);
  if (dependency.version) {
    assert(
      dependency.version === expectedVersion,
      `${label} requires ${dependency.name}@${dependency.version} instead of the pinned ${expectedVersion}`
    );
  }
}

export function assertRegistryMetadataDependencies(item, policy) {
  for (const field of ['dependencies', 'devDependencies']) {
    const dependencies = item[field] ?? [];
    assert(Array.isArray(dependencies), `Pinned registry item ${item.name} has invalid ${field}`);
    for (const dependency of dependencies) {
      assertAllowedProductionDependency(dependency, `Pinned registry item ${item.name}`, policy);
    }
  }
}

function resolveRelativeSourcePath(sourcePath, specifier, sourcePaths) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].filter((candidate) =>
    sourcePaths.has(candidate)
  );
  assert(candidates.length === 1, `${sourcePath} has an unresolved or ambiguous relative source import: ${specifier}`);
}

export function assertFetchedRegistryClosure(items, registryIds, policy, expectedSourcePathsById = new Map()) {
  const registryIdSet = new Set(registryIds);
  const sourcePaths = new Set();
  for (const item of items) {
    assert(Array.isArray(item.files), `Pinned registry item ${item.name} has no source files`);
    for (const file of item.files) {
      assert(
        file && typeof file.path === 'string' && typeof file.content === 'string',
        `Pinned registry item ${item.name} has an invalid source file`
      );
      assert(!sourcePaths.has(file.path), `Pinned registry source path is duplicated: ${file.path}`);
      sourcePaths.add(file.path);
    }
    const expected = expectedSourcePathsById.get(item.name);
    if (expected) {
      const actual = item.files.map((file) => file.path).sort();
      assert(
        canonicalJson(actual) === canonicalJson(expected),
        `Pinned registry item ${item.name} source-file inventory differs from the committed profile`
      );
    }
  }

  for (const item of items) {
    assertRegistryMetadataDependencies(item, policy);
    const registryDependencies = item.registryDependencies ?? [];
    assert(Array.isArray(registryDependencies), `Pinned registry item ${item.name} has invalid registryDependencies`);
    for (const dependency of registryDependencies) {
      assert(
        typeof dependency === 'string' && registryIdSet.has(dependency),
        `Pinned registry item ${item.name} requires source outside the fetched registry closure: ${dependency}`
      );
    }

    for (const file of item.files) {
      for (const specifier of moduleSpecifiers(file.content, file.path)) {
        if (specifier === ICON_PLACEHOLDER_SPECIFIER) {
          assertAllowedProductionDependency('lucide-react', file.path, policy);
          continue;
        }
        const registrySource = /^@\/registry\/base-nova\/(?:ui\/([a-z0-9-]+)|lib\/(utils))$/u.exec(specifier);
        if (registrySource) {
          const dependency = registrySource[1] ?? registrySource[2];
          assert(
            registryIdSet.has(dependency),
            `${file.path} requires source outside the fetched registry closure: ${dependency}`
          );
          continue;
        }
        assert(!specifier.startsWith('@/'), `${file.path} uses an undeclared app-owned source alias: ${specifier}`);
        if (specifier.startsWith('.')) {
          resolveRelativeSourcePath(file.path, specifier, sourcePaths);
          continue;
        }
        assert(!specifier.startsWith('/'), `${file.path} uses an absolute source import: ${specifier}`);
        assertAllowedProductionDependency(importedPackageName(specifier), file.path, policy);
      }
    }
  }
}

export function bindVerifiedSnapshotsToProvenance(provenance, snapshots) {
  const registrySnapshots = {};
  for (const id of provenance.registryIds) {
    const raw = snapshots.get(id);
    assert(Buffer.isBuffer(raw), `Verified registry snapshot is missing for ${id}`);
    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch (error) {
      throw new Error(`Verified registry snapshot is not JSON for ${id}`, { cause: error });
    }
    registrySnapshots[id] = {
      rawSha256: sha256(raw),
      canonicalSha256: sha256(Buffer.from(canonicalJson(parsed)))
    };
  }
  return { ...provenance, registrySnapshots };
}

async function assertCommittedRegistrySnapshots(packageRoot, provenance) {
  const expectedSourcePathsById = new Map();
  for (const id of provenance.registryIds) {
    const expected = provenance.registrySnapshots[id];
    const raw = await readFile(path.join(packageRoot, 'snapshots', 'raw', `${id}.json`));
    const canonical = await readFile(path.join(packageRoot, 'snapshots', 'canonical', `${id}.json`));
    assert(sha256(raw) === expected.rawSha256, `Raw registry snapshot digest differs for ${id}`);
    assert(sha256(canonical) === expected.canonicalSha256, `Canonical registry snapshot digest differs for ${id}`);
    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch (error) {
      throw new Error(`Committed raw registry snapshot is not JSON for ${id}`, { cause: error });
    }
    assert(canonical.equals(Buffer.from(canonicalJson(parsed))), `Canonical registry snapshot bytes differ for ${id}`);
    expectedSourcePathsById.set(
      id,
      parsed.files.map((file) => file.path).sort()
    );
  }
  return expectedSourcePathsById;
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
  const implementationBytes = await readFile(path.join(packageRoot, provenance.normalization.implementation));
  assert(
    sha256(implementationBytes) === provenance.normalization.implementationSha256,
    'Normalization implementation digest differs'
  );
}

export async function assertProfileUpdateProvenance(options) {
  await assertProfileGenerationProvenance(options);
  return assertCommittedRegistrySnapshots(options.packageRoot, options.provenance);
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
  assert(lockedPackage.resolved === SHADCN_RESOLVED, 'Locked shadcn resolved artifact differs');
  assert(lockedPackage.integrity === SHADCN_INTEGRITY, 'Locked shadcn integrity differs');
  assert(fileURLToPath(resolvedRegistryUrl) === expectedRegistryModule, 'Resolved shadcn registry module is shadowed');
  assert(installedPackage.name === SHADCN_NAME, 'Installed shadcn package identity differs');
  assert(installedPackage.version === SHADCN_VERSION, 'Installed shadcn version differs');
  const resolvedRoot = await realpath(path.dirname(path.dirname(path.dirname(fileURLToPath(resolvedRegistryUrl)))));
  const lockedRoot = await realpath(installedRoot);
  assert(resolvedRoot === lockedRoot, 'Resolved shadcn package root differs from the lockfile package root');
  assert(
    (await shadcnPackageTreeSha256(lockedRoot)) === SHADCN_TREE_SHA256,
    'Installed shadcn package tree differs from the pinned network-intake contract'
  );
  assert(
    (await shadcnRuntimeClosureSha256(repositoryRoot, lock)) === SHADCN_RUNTIME_CLOSURE_SHA256,
    'Installed shadcn runtime dependency closure differs from the pinned network-intake contract'
  );
  return resolvedRegistryUrl;
}

export async function fetchPinnedRegistrySnapshots({
  packageRoot,
  registry,
  registryIds,
  dependencyPolicy,
  expectedSourcePathsById,
  fetchImpl = fetch,
  getRegistryItemsImpl,
  resolvedRegistryUrl,
  maxRegistryItemBytes = DEFAULT_REGISTRY_ITEM_MAX_BYTES,
  maxRegistryAggregateBytes = DEFAULT_REGISTRY_AGGREGATE_MAX_BYTES,
  requestTimeoutMs = DEFAULT_REGISTRY_REQUEST_TIMEOUT_MS
}) {
  assertPositiveSafeInteger(maxRegistryItemBytes, 'Registry item byte limit');
  assertPositiveSafeInteger(maxRegistryAggregateBytes, 'Registry aggregate byte limit');
  assertPositiveSafeInteger(requestTimeoutMs, 'Registry request timeout');
  assert(
    dependencyPolicy &&
      Array.isArray(dependencyPolicy.excludedDependencies) &&
      dependencyPolicy.directProductionDependencies &&
      typeof dependencyPolicy.directProductionDependencies === 'object',
    'Profile update dependency policy is missing'
  );
  resolvedRegistryUrl = await assertPinnedShadcnToolchain({ packageRoot, registry, resolvedRegistryUrl });
  if (!getRegistryItemsImpl) ({ getRegistryItems: getRegistryItemsImpl } = await import(resolvedRegistryUrl));

  const snapshots = new Map();
  let aggregateBytes = 0;
  for (const id of registryIds) {
    const url = registry.endpointTemplate.replace('{id}', id);
    const snapshot = await withDeadline(`Registry update request for ${id}`, requestTimeoutMs, async (signal) => {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': `@spfx-kit/ui-profile/${registry.cli.version}` },
        redirect: 'error',
        signal
      });
      if (!response.ok) throw new Error(`Registry update failed for ${id}: HTTP ${response.status}`);
      return readBoundedResponse(response, id, maxRegistryItemBytes, maxRegistryAggregateBytes - aggregateBytes);
    });
    aggregateBytes += snapshot.length;
    snapshots.set(id, snapshot);
  }

  const cliItems = await withDeadline('Pinned shadcn CLI registry intake', requestTimeoutMs, () =>
    getRegistryItemsImpl(registryIds, {
      config: { style: registry.preset },
      useCache: false
    })
  );
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
  assertFetchedRegistryClosure(cliItems, registryIds, dependencyPolicy, expectedSourcePathsById);

  return snapshots;
}

export async function fetchValidatedProfileUpdateSnapshots({
  packageRoot,
  provenance,
  fetchImpl,
  getRegistryItemsImpl,
  resolvedRegistryUrl
}) {
  const expectedSourcePathsById = await assertProfileUpdateProvenance({ packageRoot, provenance });
  return fetchPinnedRegistrySnapshots({
    packageRoot,
    registry: provenance.registry,
    registryIds: provenance.registryIds,
    dependencyPolicy: {
      excludedDependencies: provenance.excludedDependencies,
      directProductionDependencies: provenance.directProductionDependencies
    },
    expectedSourcePathsById,
    fetchImpl,
    getRegistryItemsImpl,
    resolvedRegistryUrl
  });
}
