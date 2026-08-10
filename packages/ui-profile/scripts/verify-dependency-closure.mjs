import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from './lib/profile.mjs';
import { assertProductionDependencyRoots } from './lib/profile-update-intake.mjs';

const execFileAsync = promisify(execFile);

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const closure = JSON.parse(await readFile(path.join(packageRoot, 'dependency-closure.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'));
const rootManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
const REVIEWED_TYPE_ONLY_PEERS = new Set(['@types/hoist-non-react-statics>@types/react']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExact(actual, expected, message) {
  assert(canonicalJson(actual) === canonicalJson(expected), message);
}

function resolveLockedDependency(lock, fromPath, dependency) {
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

assert(closure.schemaVersion === 1 && closure.profileId === 'spfx-react17-base-nova-v1', 'Closure identity differs');
assert(closure.policy.allowForcedPeerResolution === false, 'Forced peer resolution must remain disabled');
assert(closure.policy.allowLegacyPeerDeps === false, 'Legacy peer resolution must remain disabled');
assert(!manifest.overrides && !manifest.resolutions, 'UI profile manifest contains forced dependency resolution');
assert(!rootManifest.overrides && !rootManifest.resolutions, 'Repository root manifest contains forced dependency resolution');
assertProductionDependencyRoots(closure.productionRoots, provenance.directProductionDependencies);
assert(
  closure.productionRoots.every((dependency) => manifest.dependencies?.[dependency] || manifest.peerDependencies?.[dependency]),
  'Closure roots must be package dependencies or React peer dependencies'
);

const accepted = new Map();
for (const entry of closure.packages) {
  assert(
    typeof entry.path === 'string' &&
      path.posix.normalize(entry.path) === entry.path &&
      (entry.path.startsWith('node_modules/') || entry.path.startsWith('packages/ui-profile/node_modules/')),
    `${entry.name}: lock path is missing`
  );
  assert(!accepted.has(entry.path), `Duplicate closure package path ${entry.path}`);
  assert(/^sha512-/.test(entry.integrity), `${entry.name}: npm integrity is missing`);
  accepted.set(entry.path, entry);
}
for (const root of closure.productionRoots) {
  const rootPath = resolveLockedDependency(packageLock, 'packages/ui-profile', root);
  const entry = accepted.get(rootPath);
  assert(
    entry?.name === root && entry.version === (manifest.dependencies?.[root] || manifest.peerDependencies?.[root]),
    `${root}: direct version differs`
  );
}
for (const entry of closure.packages) {
  for (const dependency of Object.keys(entry.dependencies)) {
    const resolvedPath = resolveLockedDependency(packageLock, entry.path, dependency);
    assert(resolvedPath && accepted.has(resolvedPath), `${entry.name}: dependency ${dependency} is absent from the closure`);
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
  const selectedRepositoryRoot = path.dirname(lockfilePath);
  const selectedPackageRoot = path.join(selectedRepositoryRoot, 'packages', 'ui-profile');
  async function readBoundJson(candidate, label) {
    const stats = await lstat(candidate);
    assert(stats.isFile() && !stats.isSymbolicLink(), `${label} is not a regular file`);
    return JSON.parse(await readFile(candidate, 'utf8'));
  }
  const lock = await readBoundJson(lockfilePath, 'Selected lockfile');
  const selectedManifest = await readBoundJson(path.join(selectedPackageRoot, 'package.json'), 'Selected UI profile manifest');
  const selectedRootManifest = await readBoundJson(
    path.join(selectedRepositoryRoot, 'package.json'),
    'Selected repository manifest'
  );
  assert(
    !selectedManifest.overrides && !selectedManifest.resolutions,
    'Selected UI profile manifest contains forced dependency resolution'
  );
  assert(
    !selectedRootManifest.overrides && !selectedRootManifest.resolutions,
    'Selected repository manifest contains forced dependency resolution'
  );
  assertExact(selectedRootManifest.workspaces ?? [], rootManifest.workspaces ?? [], 'Selected repository workspaces differ');
  assert(
    selectedManifest.name === manifest.name && selectedManifest.version === manifest.version,
    'Selected UI profile identity differs'
  );
  assertExact(selectedManifest.dependencies ?? {}, manifest.dependencies ?? {}, 'Selected UI profile dependencies differ');
  assertExact(
    selectedManifest.peerDependencies ?? {},
    manifest.peerDependencies ?? {},
    'Selected UI profile peer dependencies differ'
  );
  assertExact(
    selectedManifest.devDependencies ?? {},
    manifest.devDependencies,
    'Selected UI profile development dependencies differ'
  );
  assert(lock.lockfileVersion === 3, 'Dependency verification requires npm lockfileVersion 3');
  const workspaceKey = 'packages/ui-profile';
  const workspace = lock.packages?.[workspaceKey];
  assert(workspace, `Lockfile does not contain ${workspaceKey}`);
  assert(
    workspace.name === selectedManifest.name && workspace.version === selectedManifest.version,
    'Lockfile UI profile workspace identity differs'
  );
  assert(!workspace.hasInstallScript, 'UI profile must not use install-time mutation');
  assertExact(workspace.dependencies ?? {}, manifest.dependencies ?? {}, 'Lockfile workspace dependencies differ');
  assertExact(workspace.peerDependencies ?? {}, manifest.peerDependencies ?? {}, 'Lockfile workspace peer dependencies differ');
  assertExact(workspace.devDependencies ?? {}, manifest.devDependencies, 'Lockfile workspace development dependencies differ');

  function packageName(lockPath) {
    const marker = 'node_modules/';
    const index = lockPath.lastIndexOf(marker);
    return index === -1 ? null : lockPath.slice(index + marker.length);
  }

  function resolveDependency(fromPath, dependency) {
    return resolveLockedDependency(lock, fromPath, dependency);
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
    const expected = accepted.get(resolvedPath);
    assert(expected?.name === name, `Unexpected production-closure dependency ${name} at ${resolvedPath}`);
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

  async function runNpm(npmArguments) {
    return process.env.npm_execpath
      ? execFileAsync(process.execPath, [process.env.npm_execpath, ...npmArguments], {
          cwd: path.dirname(lockfilePath),
          maxBuffer: 10 * 1024 * 1024
        })
      : execFileAsync('npm', npmArguments, {
          cwd: path.dirname(lockfilePath),
          maxBuffer: 10 * 1024 * 1024
        });
  }

  const strictPeerResolutionArgument = '--legacy-peer-deps=false';
  const npmPeerResolution = (await runNpm(['config', 'get', 'legacy-peer-deps', strictPeerResolutionArgument])).stdout.trim();
  assert(
    npmPeerResolution === 'false',
    `Effective npm config legacy-peer-deps must be false (received ${JSON.stringify(npmPeerResolution)})`
  );

  const npmArguments = ['ls', '--all', '--workspace', '@spfx-kit/ui-profile', '--json', strictPeerResolutionArgument];
  let npmResult;
  let npmFailure;
  try {
    npmResult = await runNpm(npmArguments);
  } catch (error) {
    npmFailure = error;
    const stdout = error.stdout;
    assert(stdout, `npm dependency tree could not be inspected: ${error.message}`);
    try {
      JSON.parse(stdout);
    } catch {
      throw new Error('npm dependency tree did not produce valid JSON', { cause: error });
    }
    npmResult = { stdout };
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
  if (npmFailure && problems.length === 0) problems.push(npmFailure.message);
  assert(problems.length === 0, `npm dependency tree problems: ${[...new Set(problems)].join('; ')}`);
  const installedProfile = tree.dependencies?.['@spfx-kit/ui-profile'];
  assert(installedProfile, 'Installed npm tree omits the UI profile workspace');
  for (const root of closure.productionRoots) {
    const installed = installedProfile.dependencies?.[root];
    const rootPath = resolveDependency(workspaceKey, root);
    const expected = accepted.get(rootPath);
    assert(installed, `Installed npm tree omits production root ${root}`);
    assert(installed.link !== true, `Installed npm tree links production root ${root}`);
    assert(installed.version === expected.version, `${root}: installed root version differs`);
    for (const dependency of Object.keys(expected.dependencies)) {
      assert(
        installed.dependencies?.[dependency]?.version === accepted.get(resolveDependency(rootPath, dependency))?.version,
        `${root}: installed dependency edge ${dependency} differs from the accepted closure`
      );
    }
  }

  async function boundRealpath(candidate, message) {
    try {
      return await realpath(candidate);
    } catch (error) {
      throw new Error(message, { cause: error });
    }
  }
  const canonicalRepositoryRoot = await boundRealpath(
    selectedRepositoryRoot,
    'Selected lockfile repository root does not resolve'
  );
  for (const [candidate, expected, label] of [
    [lockfilePath, path.join(canonicalRepositoryRoot, 'package-lock.json'), 'Selected lockfile'],
    [
      path.join(selectedRepositoryRoot, 'package.json'),
      path.join(canonicalRepositoryRoot, 'package.json'),
      'Selected repository manifest'
    ],
    [
      path.join(selectedPackageRoot, 'package.json'),
      path.join(canonicalRepositoryRoot, 'packages', 'ui-profile', 'package.json'),
      'Selected UI profile manifest'
    ]
  ]) {
    assert((await realpath(candidate)) === expected, `${label} resolves outside the selected lockfile checkout`);
  }
  const canonicalSelectedPackageRoot = await boundRealpath(
    selectedPackageRoot,
    'Selected lockfile checkout does not contain the UI profile workspace'
  );
  assert(
    canonicalSelectedPackageRoot === path.join(canonicalRepositoryRoot, 'packages', 'ui-profile'),
    'Selected UI profile workspace resolves outside the selected lockfile checkout'
  );
  const canonicalNodeModulesRoot = await boundRealpath(
    path.join(selectedRepositoryRoot, 'node_modules'),
    'Selected lockfile checkout does not contain a bound node_modules root'
  );
  assert(
    canonicalNodeModulesRoot === path.join(canonicalRepositoryRoot, 'node_modules'),
    'Repository node_modules root resolves outside the repository'
  );
  function isContainedPath(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  async function resolveInstalledManifest(fromDirectory, name) {
    let current = path.resolve(fromDirectory);
    assert(
      current === canonicalRepositoryRoot || isContainedPath(canonicalRepositoryRoot, current),
      `${fromDirectory}: installed dependency resolution starts outside the repository`
    );
    while (true) {
      const packageDirectory = path.join(current, 'node_modules', ...name.split('/'));
      const candidate = path.join(packageDirectory, 'package.json');
      try {
        const packageStats = await lstat(packageDirectory);
        assert(
          packageStats.isDirectory() && !packageStats.isSymbolicLink(),
          `${name}: installed package root is not a regular directory`
        );
        const manifestStats = await lstat(candidate);
        assert(
          manifestStats.isFile() && !manifestStats.isSymbolicLink(),
          `${name}: installed package manifest is not a regular file`
        );
        const manifest = JSON.parse(await readFile(candidate, 'utf8'));
        const canonicalPackageDirectory = await realpath(packageDirectory);
        const canonicalManifestPath = await realpath(candidate);
        assert(
          isContainedPath(canonicalRepositoryRoot, canonicalPackageDirectory),
          `${name}: installed package root resolves outside repository`
        );
        assert(
          canonicalPackageDirectory === path.resolve(packageDirectory) &&
            canonicalManifestPath === path.join(canonicalPackageDirectory, 'package.json'),
          `${name}: installed package path contains an unbound link`
        );
        return {
          manifest,
          manifestPath: canonicalManifestPath,
          packageDirectory: canonicalPackageDirectory
        };
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
      if (current === canonicalRepositoryRoot) break;
      const parent = path.dirname(current);
      if (parent === current || (parent !== canonicalRepositoryRoot && !isContainedPath(canonicalRepositoryRoot, parent))) {
        break;
      }
      current = parent;
    }
    throw new Error(`${fromDirectory}: unable to resolve installed package ${name}`);
  }

  const reachedInstalled = new Set();
  const visitedInstalledManifests = new Set();
  async function verifyInstalledPackage(name, resolved, ancestry) {
    const lockPath = path.relative(canonicalRepositoryRoot, resolved.packageDirectory).replaceAll(path.sep, '/');
    const expected = accepted.get(lockPath);
    assert(expected?.name === name, `Installed npm tree contains unexpected production package ${name} at ${lockPath}`);
    assert(resolved.manifest.name === name, `${ancestry}: installed package identity differs`);
    assert(resolved.manifest.version === expected.version, `${ancestry}: installed version differs`);
    assertExact(
      resolved.manifest.dependencies ?? {},
      expected.dependencies,
      `${ancestry}: installed dependency metadata differs`
    );
    assertExact(
      resolved.manifest.optionalDependencies ?? {},
      {},
      `${ancestry}: installed optional dependencies are not accepted`
    );
    assertExact(resolved.manifest.bundledDependencies ?? [], [], `${ancestry}: installed bundled dependencies are not accepted`);
    assertExact(resolved.manifest.bundleDependencies ?? [], [], `${ancestry}: installed bundle dependencies are not accepted`);
    assertExact(
      resolved.manifest.peerDependencies ?? {},
      expected.peerDependencies,
      `${ancestry}: installed peer metadata differs`
    );
    const installedOptionalPeers = Object.entries(resolved.manifest.peerDependenciesMeta ?? {})
      .filter(([, metadata]) => metadata.optional === true)
      .map(([peer]) => peer)
      .sort();
    assertExact(
      installedOptionalPeers,
      [...(expected.optionalPeers ?? [])].sort(),
      `${ancestry}: installed optional peers differ`
    );
    reachedInstalled.add(lockPath);
    if (visitedInstalledManifests.has(resolved.manifestPath)) return;
    visitedInstalledManifests.add(resolved.manifestPath);
    for (const dependency of Object.keys(expected.dependencies)) {
      const child = await resolveInstalledManifest(resolved.packageDirectory, dependency);
      await verifyInstalledPackage(dependency, child, `${ancestry} > ${dependency}`);
    }
    for (const peer of Object.keys(expected.peerDependencies).filter((peer) => !(expected.optionalPeers ?? []).includes(peer))) {
      if (REVIEWED_TYPE_ONLY_PEERS.has(`${name}>${peer}`)) continue;
      const expectedPeerPath = resolveDependency(lockPath, peer);
      const expectedPeer = accepted.get(expectedPeerPath);
      assert(expectedPeer, `${ancestry}: required installed peer ${peer} is outside the accepted closure`);
      const installedPeer = await resolveInstalledManifest(resolved.packageDirectory, peer);
      const installedPeerPath = path.relative(canonicalRepositoryRoot, installedPeer.packageDirectory).replaceAll(path.sep, '/');
      assert(
        installedPeerPath === expectedPeerPath && installedPeer.manifest.version === expectedPeer.version,
        `${ancestry}: required installed peer ${peer} version differs`
      );
    }
  }
  for (const root of closure.productionRoots) {
    const installed = await resolveInstalledManifest(canonicalSelectedPackageRoot, root);
    await verifyInstalledPackage(root, installed, root);
  }
  assertExact(
    [...reachedInstalled].sort(),
    [...accepted.keys()].sort(),
    'Installed npm production closure differs from accepted closure'
  );
}

console.log(
  `Verified production dependency closure: ${closure.packages.length} packages, React ${reactEntries[0].version}, React DOM ${reactDomEntries[0].version}${manifestOnly ? ' (manifest only)' : ''}`
);
