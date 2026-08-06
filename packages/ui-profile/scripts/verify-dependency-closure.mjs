import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from './lib/profile.mjs';

const execFileAsync = promisify(execFile);

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const closure = JSON.parse(await readFile(path.join(packageRoot, 'dependency-closure.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const rootManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExact(actual, expected, message) {
  assert(canonicalJson(actual) === canonicalJson(expected), message);
}

assert(closure.schemaVersion === 1 && closure.profileId === 'spfx-react17-base-nova-v1', 'Closure identity differs');
assert(closure.policy.allowForcedPeerResolution === false, 'Forced peer resolution must remain disabled');
assert(closure.policy.allowLegacyPeerDeps === false, 'Legacy peer resolution must remain disabled');
assert(!manifest.overrides && !manifest.resolutions, 'UI profile manifest contains forced dependency resolution');
assert(!rootManifest.overrides && !rootManifest.resolutions, 'Repository root manifest contains forced dependency resolution');
assert(manifest.dependencies === undefined, 'Tooling-only profile must not declare production dependencies');
assert(
  closure.productionRoots.every((dependency) => manifest.devDependencies[dependency]),
  'Closure roots must be development dependencies'
);

const accepted = new Map();
for (const entry of closure.packages) {
  assert(!accepted.has(entry.name), `Duplicate closure package ${entry.name}`);
  assert(/^sha512-/.test(entry.integrity), `${entry.name}: npm integrity is missing`);
  accepted.set(entry.name, entry);
}
for (const root of closure.productionRoots) {
  const entry = accepted.get(root);
  assert(entry && entry.version === manifest.devDependencies[root], `${root}: direct version differs`);
}
for (const entry of closure.packages) {
  for (const dependency of Object.keys(entry.dependencies)) {
    assert(accepted.has(dependency), `${entry.name}: dependency ${dependency} is absent from the closure`);
  }
}
const reactEntries = closure.packages.filter((entry) => entry.name === 'react');
const reactDomEntries = closure.packages.filter((entry) => entry.name === 'react-dom');
assert(reactEntries.length === 1 && reactEntries[0].version === '17.0.1', 'Closure must contain one React 17.0.1');
assert(reactDomEntries.length === 1 && reactDomEntries[0].version === '17.0.1', 'Closure must contain one React DOM 17.0.1');

const manifestOnly = process.argv.includes('--manifest-only');
const lockfileFlag = process.argv.indexOf('--lockfile');
if (lockfileFlag !== -1 && !process.argv[lockfileFlag + 1]) throw new Error('--lockfile requires a path');
if (!manifestOnly) {
  const lockfilePath =
    lockfileFlag === -1
      ? path.resolve(packageRoot, '..', '..', 'package-lock.json')
      : path.resolve(process.cwd(), process.argv[lockfileFlag + 1]);
  await access(lockfilePath);
  const lock = JSON.parse(await readFile(lockfilePath, 'utf8'));
  assert(lock.lockfileVersion === 3, 'Dependency verification requires npm lockfileVersion 3');
  const workspaceKey = 'packages/ui-profile';
  const workspace = lock.packages?.[workspaceKey];
  assert(workspace, `Lockfile does not contain ${workspaceKey}`);
  assert(!workspace.hasInstallScript, 'UI profile must not use install-time mutation');
  assert(workspace.dependencies === undefined, 'Lockfile workspace must not contain production dependencies');
  assertExact(workspace.devDependencies ?? {}, manifest.devDependencies, 'Lockfile workspace development dependencies differ');

  function packageName(lockPath) {
    const marker = 'node_modules/';
    const index = lockPath.lastIndexOf(marker);
    return index === -1 ? null : lockPath.slice(index + marker.length);
  }

  function resolveDependency(fromPath, dependency) {
    let current = fromPath;
    while (true) {
      const candidate = path.posix.join(current, 'node_modules', dependency);
      if (lock.packages[candidate]) return candidate;
      const parent = path.posix.dirname(current);
      if (parent === current || current === '.') break;
      current = parent;
    }
    const rootCandidate = `node_modules/${dependency}`;
    return lock.packages[rootCandidate] ? rootCandidate : null;
  }

  const reached = new Map();
  const queue = closure.productionRoots.map((dependency) => ({ from: workspaceKey, dependency }));
  while (queue.length > 0) {
    const next = queue.shift();
    const resolvedPath = resolveDependency(next.from, next.dependency);
    assert(resolvedPath, `${next.from}: unable to resolve ${next.dependency} from lockfile`);
    if (reached.has(resolvedPath)) continue;
    const locked = lock.packages[resolvedPath];
    const name = packageName(resolvedPath);
    reached.set(resolvedPath, name);
    for (const dependency of Object.keys(locked.dependencies ?? {})) queue.push({ from: resolvedPath, dependency });
  }

  assert(reached.size === accepted.size, `Lockfile closure size ${reached.size} differs from accepted ${accepted.size}`);
  for (const [resolvedPath, name] of reached) {
    const locked = lock.packages[resolvedPath];
    const expected = accepted.get(name);
    assert(expected, `Unexpected production-closure dependency ${name}`);
    assert(locked.version === expected.version, `${name}: lock version differs`);
    assert(locked.integrity === expected.integrity, `${name}: lock integrity differs`);
    assertExact(locked.dependencies ?? {}, expected.dependencies, `${name}: dependency metadata differs`);
    assertExact(locked.peerDependencies ?? {}, expected.peerDependencies, `${name}: peer metadata differs`);
    const lockedOptionalPeers = Object.entries(locked.peerDependenciesMeta ?? {})
      .filter(([, metadata]) => metadata.optional === true)
      .map(([peer]) => peer)
      .sort();
    assertExact(lockedOptionalPeers, [...(expected.optionalPeers ?? [])].sort(), `${name}: optional-peer metadata differs`);
    for (const peer of Object.keys(expected.peerDependencies).filter((peer) => !(expected.optionalPeers ?? []).includes(peer))) {
      assert(resolveDependency(resolvedPath, peer), `${name}: required peer ${peer} does not resolve`);
    }
  }
  const reactPaths = [...reached].filter(([, name]) => name === 'react').map(([lockedPath]) => lockedPath);
  const reactDomPaths = [...reached].filter(([, name]) => name === 'react-dom').map(([lockedPath]) => lockedPath);
  assert(reactPaths.length === 1, `Lockfile resolves ${reactPaths.length} React paths instead of one`);
  assert(reactDomPaths.length === 1, `Lockfile resolves ${reactDomPaths.length} React DOM paths instead of one`);

  const npmArguments = ['ls', '--omit=dev', '--all', '--workspace', '@spfx-kit/ui-profile', '--json'];
  let npmResult;
  try {
    npmResult = process.env.npm_execpath
      ? await execFileAsync(process.execPath, [process.env.npm_execpath, ...npmArguments], {
          cwd: path.dirname(lockfilePath),
          maxBuffer: 10 * 1024 * 1024
        })
      : await execFileAsync('npm', npmArguments, {
          cwd: path.dirname(lockfilePath),
          maxBuffer: 10 * 1024 * 1024
        });
  } catch (error) {
    const stdout = error.stdout || '{}';
    const tree = JSON.parse(stdout);
    const problems = tree.problems ?? [error.message];
    throw new Error(`npm dependency tree is invalid: ${problems.join('; ')}`, { cause: error });
  }
  const tree = JSON.parse(npmResult.stdout);
  const problems = [...(tree.problems ?? [])];
  function collectProblems(node, ancestry = []) {
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      const location = [...ancestry, name].join(' > ');
      if (dependency.invalid) problems.push(`${location}: invalid`);
      if (dependency.extraneous) problems.push(`${location}: extraneous`);
      if (dependency.problems) problems.push(...dependency.problems.map((problem) => `${location}: ${problem}`));
      collectProblems(dependency, [...ancestry, name]);
    }
  }
  collectProblems(tree);
  assert(problems.length === 0, `npm dependency tree problems: ${[...new Set(problems)].join('; ')}`);
  const installedProfile = tree.dependencies?.['@spfx-kit/ui-profile'];
  assert(installedProfile, 'npm tree does not contain the UI profile workspace');
  assert(
    Object.keys(installedProfile.dependencies ?? {}).length === 0,
    'Tooling-only UI profile leaked dependencies into the production install tree'
  );
}

console.log(
  `Verified production dependency closure: ${closure.packages.length} packages, React ${reactEntries[0].version}, React DOM ${reactDomEntries[0].version}${manifestOnly ? ' (manifest only)' : ''}`
);
