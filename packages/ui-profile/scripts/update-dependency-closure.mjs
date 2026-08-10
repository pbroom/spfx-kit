import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROFILE_ID, canonicalJson } from './lib/profile.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--from-lockfile') {
  throw new Error('Dependency-closure updates require the explicit --from-lockfile flag');
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const [manifest, lock] = await Promise.all([
  readFile(path.join(packageRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8').then(JSON.parse)
]);
const workspacePath = 'packages/ui-profile';
const productionRoots = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveDependency(fromPath, dependency) {
  let current = fromPath;
  while (true) {
    const candidate = path.posix.join(current, 'node_modules', dependency);
    if (lock.packages?.[candidate]) return candidate;
    const parent = path.posix.dirname(current);
    if (parent === current || current === '.') break;
    current = parent;
  }
  const rootCandidate = `node_modules/${dependency}`;
  return lock.packages?.[rootCandidate] ? rootCandidate : null;
}

function packageName(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? null : lockPath.slice(index + marker.length);
}

const queue = productionRoots.map((dependency) => ({ from: workspacePath, dependency }));
const reached = new Map();
while (queue.length > 0) {
  const { from, dependency } = queue.shift();
  const resolvedPath = resolveDependency(from, dependency);
  assert(resolvedPath, `${from}: unable to resolve ${dependency} from the lockfile`);
  if (reached.has(resolvedPath)) continue;
  const locked = lock.packages[resolvedPath];
  const name = packageName(resolvedPath);
  assert(name && locked?.version && locked?.integrity, `${resolvedPath}: locked package metadata is incomplete`);
  reached.set(resolvedPath, locked);
  for (const child of Object.keys(locked.dependencies ?? {}).sort()) {
    queue.push({ from: resolvedPath, dependency: child });
  }
}

const packages = [...reached]
  .map(([lockPath, locked]) => {
    const optionalPeers = Object.entries(locked.peerDependenciesMeta ?? {})
      .filter(([, metadata]) => metadata.optional === true)
      .map(([name]) => name)
      .sort();
    return {
      path: lockPath,
      name: packageName(lockPath),
      version: locked.version,
      integrity: locked.integrity,
      dependencies: locked.dependencies ?? {},
      peerDependencies: locked.peerDependencies ?? {},
      ...(optionalPeers.length > 0 ? { optionalPeers } : {})
    };
  })
  .sort((left, right) => left.path.localeCompare(right.path, 'en'));

const closure = {
  schemaVersion: 1,
  profileId: PROFILE_ID,
  policy: {
    allowForcedPeerResolution: false,
    allowLegacyPeerDeps: false
  },
  productionRoots,
  packages
};
await writeFile(path.join(packageRoot, 'dependency-closure.json'), canonicalJson(closure));
console.log(`Bound ${packages.length} production packages from ${productionRoots.length} roots`);
