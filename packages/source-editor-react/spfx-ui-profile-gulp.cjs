'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, lstatSync, readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const configureSpfxMonacoCss = require('./spfx-monaco-webpack.cjs');
const UI_PROFILE_RULE_MARKER = Symbol.for('spfx-kit.source-editor.ui-profile.global-css-rule');
const BASE_UI_MJS_RULE_MARKER = Symbol.for('spfx-kit.source-editor.ui-profile.base-ui-mjs-rule');
const MONACO_CSS_RULE = /[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i;
const REVIEWED_TYPE_ONLY_PEERS = new Set(['@types/hoist-non-react-statics>@types/react']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertExact(actual, expected, message) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(message);
}

function lockPackageName(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? null : lockPath.slice(index + marker.length);
}

function resolveLockDependency(lock, fromPath, dependency) {
  let current = fromPath;
  while (current && current !== '.') {
    const candidate = path.posix.join(current, 'node_modules', dependency);
    if (lock.packages[candidate]) return candidate;
    const parent = path.posix.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const rootCandidate = `node_modules/${dependency}`;
  return lock.packages[rootCandidate] ? rootCandidate : null;
}

function resolveAcceptedDependency(accepted, fromPath, dependency) {
  let current = fromPath;
  while (current && current !== '.') {
    const candidate = path.posix.join(current, 'node_modules', dependency);
    if (accepted.has(candidate)) return candidate;
    const parent = path.posix.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const rootCandidate = `node_modules/${dependency}`;
  return accepted.has(rootCandidate) ? rootCandidate : null;
}

function optionalPeers(value) {
  return Object.entries(value || {})
    .filter(([, metadata]) => metadata && metadata.optional === true)
    .map(([name]) => name)
    .sort();
}

function requiredRuntimePeers(entry) {
  return Object.keys(entry.peerDependencies).filter(
    (peer) => !(entry.optionalPeers || []).includes(peer) && !REVIEWED_TYPE_ONLY_PEERS.has(`${entry.name}>${peer}`)
  );
}

function resolveInstalledDependency(appRoot, fromRoot, dependency) {
  let current = fromRoot;
  while (true) {
    const candidate = path.join(current, 'node_modules', ...dependency.split('/'));
    if (existsSync(candidate)) return candidate;
    if (path.normalize(current) === path.normalize(appRoot)) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function verifyInstalledPackageRoot(nodeModulesRoot, candidate, name) {
  if (!candidate) throw new Error(`App install cannot resolve dependency-closure package ${name}.`);
  if (lstatSync(candidate).isSymbolicLink()) {
    throw new Error(`Installed ${name} package root must not be a symbolic link.`);
  }
  const resolvedRoot = realpathSync(candidate);
  const relative = path.relative(nodeModulesRoot, resolvedRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Installed ${name} package root resolves outside the app-local node_modules tree.`);
  }
  if (path.normalize(resolvedRoot) !== path.normalize(candidate)) {
    throw new Error(`Installed ${name} package root differs from its app-local path.`);
  }
  return resolvedRoot;
}

function validateDependencyClosure(appRoot, closure, lock) {
  if (
    closure.schemaVersion !== 1 ||
    closure.profileId !== 'spfx-react17-base-nova-v1' ||
    closure.policy?.allowForcedPeerResolution !== false ||
    closure.policy?.allowLegacyPeerDeps !== false ||
    !Array.isArray(closure.productionRoots) ||
    !Array.isArray(closure.packages) ||
    closure.packages.length === 0
  ) {
    throw new Error('Prepared Base UI dependency closure identity differs.');
  }
  const accepted = new Map();
  for (const entry of closure.packages) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      path.posix.normalize(entry.path) !== entry.path ||
      (!entry.path.startsWith('node_modules/') && !entry.path.startsWith('packages/ui-profile/node_modules/')) ||
      typeof entry.name !== 'string' ||
      !entry.name ||
      typeof entry.version !== 'string' ||
      !entry.version ||
      typeof entry.integrity !== 'string' ||
      !entry.integrity.startsWith('sha512-') ||
      !entry.dependencies ||
      Array.isArray(entry.dependencies) ||
      !entry.peerDependencies ||
      Array.isArray(entry.peerDependencies) ||
      (entry.optionalPeers !== undefined && !Array.isArray(entry.optionalPeers))
    ) {
      throw new Error('Prepared Base UI dependency closure package metadata differs.');
    }
    if (accepted.has(entry.path)) throw new Error(`Prepared Base UI dependency closure duplicates path ${entry.path}.`);
    accepted.set(entry.path, entry);
  }
  const expectedRootPaths = new Map();
  for (const root of closure.productionRoots) {
    const expectedPath = resolveAcceptedDependency(accepted, 'packages/ui-profile', root);
    if (!expectedPath || accepted.get(expectedPath).name !== root) {
      throw new Error(`Prepared Base UI dependency closure omits production root ${root}.`);
    }
    expectedRootPaths.set(root, expectedPath);
  }
  for (const [entryPath, entry] of accepted) {
    for (const dependency of Object.keys(entry.dependencies)) {
      if (!resolveAcceptedDependency(accepted, entryPath, dependency)) {
        throw new Error(`Prepared Base UI dependency closure omits ${entry.name} dependency ${dependency}.`);
      }
    }
    for (const peer of requiredRuntimePeers(entry)) {
      if (!resolveAcceptedDependency(accepted, entryPath, peer)) {
        throw new Error(`Prepared Base UI dependency closure omits ${entry.name} peer ${peer}.`);
      }
    }
  }
  const reactEntries = [...accepted.values()].filter((entry) => entry.name === 'react');
  const reactDomEntries = [...accepted.values()].filter((entry) => entry.name === 'react-dom');
  if (
    reactEntries.length !== 1 ||
    reactEntries[0].version !== '17.0.1' ||
    reactDomEntries.length !== 1 ||
    reactDomEntries[0].version !== '17.0.1'
  ) {
    throw new Error('Prepared Base UI dependency closure does not pin React and React DOM 17.0.1.');
  }
  if (lock.lockfileVersion !== 3 || !lock.packages || Array.isArray(lock.packages)) {
    throw new Error('SPFx UI profile dependency verification requires npm lockfileVersion 3.');
  }

  const reached = new Map();
  const reachedByExpectedPath = new Map();
  const queue = closure.productionRoots.map((dependency) => ({
    expectedPath: expectedRootPaths.get(dependency),
    resolvedPath: resolveLockDependency(lock, '', dependency)
  }));
  while (queue.length > 0) {
    const next = queue.shift();
    const expected = accepted.get(next.expectedPath);
    if (!expected || !next.resolvedPath) {
      throw new Error(`App lockfile cannot resolve dependency-closure package ${expected?.name || 'unknown'}.`);
    }
    const priorResolvedPath = reachedByExpectedPath.get(next.expectedPath);
    if (priorResolvedPath && priorResolvedPath !== next.resolvedPath) {
      throw new Error(`App lockfile resolves dependency-closure package ${expected.name} inconsistently.`);
    }
    const priorExpectedPath = reached.get(next.resolvedPath);
    if (priorExpectedPath && priorExpectedPath !== next.expectedPath) {
      throw new Error(`App lockfile collapses distinct dependency-closure packages at ${next.resolvedPath}.`);
    }
    if (priorResolvedPath) continue;
    const name = lockPackageName(next.resolvedPath);
    if (name !== expected.name) throw new Error(`App lockfile resolves unexpected dependency-closure package ${name}.`);
    const locked = lock.packages[next.resolvedPath];
    if (locked.version !== expected.version || locked.integrity !== expected.integrity) {
      throw new Error(`Installed ${name} lock identity differs from the dependency closure.`);
    }
    assertExact(locked.dependencies || {}, expected.dependencies, `Installed ${name} dependency metadata differs.`);
    assertExact(locked.peerDependencies || {}, expected.peerDependencies, `Installed ${name} peer metadata differs.`);
    assertExact(locked.optionalDependencies || {}, {}, `Installed ${name} optional dependency metadata differs.`);
    assertExact(locked.bundleDependencies || [], [], `Installed ${name} bundled dependency metadata differs.`);
    assertExact(locked.bundledDependencies || [], [], `Installed ${name} bundled dependency metadata differs.`);
    assertExact(
      optionalPeers(locked.peerDependenciesMeta),
      [...(expected.optionalPeers || [])].sort(),
      `Installed ${name} optional-peer metadata differs.`
    );
    reached.set(next.resolvedPath, next.expectedPath);
    reachedByExpectedPath.set(next.expectedPath, next.resolvedPath);
    for (const dependency of Object.keys(expected.dependencies)) {
      const expectedPath = resolveAcceptedDependency(accepted, next.expectedPath, dependency);
      const resolvedPath = resolveLockDependency(lock, next.resolvedPath, dependency);
      if (!expectedPath || !resolvedPath) {
        throw new Error(`App lockfile cannot resolve dependency-closure package ${dependency}.`);
      }
      queue.push({ expectedPath, resolvedPath });
    }
  }
  if (reached.size !== accepted.size) {
    throw new Error(`App lockfile dependency closure size ${reached.size} differs from accepted ${accepted.size}.`);
  }
  for (const [expectedPath, entry] of accepted) {
    const resolvedPath = reachedByExpectedPath.get(expectedPath);
    if (!resolvedPath) throw new Error(`App lockfile dependency closure omits ${entry.name}.`);
    for (const peer of requiredRuntimePeers(entry)) {
      const peerPath = resolveLockDependency(lock, resolvedPath, peer);
      const reachedPeer = accepted.get(reached.get(peerPath));
      if (!peerPath || reachedPeer?.name !== peer) {
        throw new Error(`Installed ${entry.name} peer ${peer} differs from the dependency closure.`);
      }
    }
  }

  const nodeModulesRoot = realpathSync(path.join(appRoot, 'node_modules'));
  const resolvedRoots = new Map();
  const resolvedByExpectedPath = new Map();
  const physicalQueue = closure.productionRoots.map((dependency) => ({
    fromRoot: appRoot,
    expectedPath: expectedRootPaths.get(dependency)
  }));
  while (physicalQueue.length > 0) {
    const next = physicalQueue.shift();
    const expected = accepted.get(next.expectedPath);
    const lockPath = reachedByExpectedPath.get(next.expectedPath);
    if (!expected || !lockPath || reached.get(lockPath) !== next.expectedPath) {
      throw new Error(`App lockfile cannot bind physical dependency-closure package ${expected?.name || 'unknown'}.`);
    }
    const installedPath = resolveInstalledDependency(appRoot, next.fromRoot, expected.name);
    const resolvedRoot = verifyInstalledPackageRoot(nodeModulesRoot, installedPath, expected.name);
    const expectedRoot = path.join(appRoot, ...lockPath.split('/'));
    if (path.normalize(resolvedRoot) !== path.normalize(expectedRoot)) {
      throw new Error(`Resolved app-local ${expected.name} path differs from the app lockfile.`);
    }
    if (resolvedByExpectedPath.has(next.expectedPath)) continue;
    const manifestPath = path.join(resolvedRoot, 'package.json');
    if (lstatSync(manifestPath).isSymbolicLink() || !lstatSync(manifestPath).isFile()) {
      throw new Error(`Installed ${expected.name} package manifest is not a regular file.`);
    }
    const packageManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (packageManifest.name !== expected.name || packageManifest.version !== expected.version) {
      throw new Error(`Resolved app-local ${expected.name} package identity differs from the dependency closure.`);
    }
    assertExact(
      packageManifest.dependencies || {},
      expected.dependencies,
      `Resolved app-local ${expected.name} dependencies differ.`
    );
    assertExact(
      packageManifest.peerDependencies || {},
      expected.peerDependencies,
      `Resolved app-local ${expected.name} peers differ.`
    );
    assertExact(
      packageManifest.optionalDependencies || {},
      {},
      `Resolved app-local ${expected.name} optional dependencies differ.`
    );
    assertExact(packageManifest.bundleDependencies || [], [], `Resolved app-local ${expected.name} bundled dependencies differ.`);
    assertExact(
      packageManifest.bundledDependencies || [],
      [],
      `Resolved app-local ${expected.name} bundled dependencies differ.`
    );
    assertExact(
      optionalPeers(packageManifest.peerDependenciesMeta),
      [...(expected.optionalPeers || [])].sort(),
      `Resolved app-local ${expected.name} optional peers differ.`
    );
    resolvedByExpectedPath.set(next.expectedPath, resolvedRoot);
    if (!resolvedRoots.has(expected.name)) resolvedRoots.set(expected.name, resolvedRoot);
    for (const dependency of Object.keys(expected.dependencies)) {
      physicalQueue.push({
        fromRoot: resolvedRoot,
        expectedPath: resolveAcceptedDependency(accepted, next.expectedPath, dependency)
      });
    }
    for (const peer of requiredRuntimePeers(expected)) {
      const peerLockPath = resolveLockDependency(lock, lockPath, peer);
      physicalQueue.push({
        fromRoot: resolvedRoot,
        expectedPath: reached.get(peerLockPath)
      });
    }
  }
  if (resolvedByExpectedPath.size !== accepted.size) {
    throw new Error(`App install dependency closure size ${resolvedByExpectedPath.size} differs from accepted ${accepted.size}.`);
  }
  return resolvedRoots;
}

function loadDelivery(options) {
  const appRoot = options.appRoot && realpathSync(path.resolve(options.appRoot));
  const profileRoot = realpathSync(path.resolve(options.profileRoot || path.resolve(__dirname, 'ui-profile')));
  if (!appRoot) throw new Error('SPFx UI profile Gulp adapter requires appRoot.');
  const manifestPath = path.join(profileRoot, 'manifest.json');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const cssPath = path.resolve(appRoot, manifest.css.vendorPath);
  if (path.normalize(cssPath) !== path.normalize(path.join(profileRoot, 'tailwind-profile.css'))) {
    throw new Error('Vendored SPFx UI profile CSS path differs from the owned delivery path.');
  }
  if (sha256(readFileSync(cssPath)) !== manifest.css.sha256) {
    throw new Error('Vendored SPFx UI profile CSS artifact digest differs.');
  }
  const runtimeContractPath = path.resolve(appRoot, manifest.runtimeContract.vendorPath);
  if (path.normalize(runtimeContractPath) !== path.normalize(path.join(profileRoot, 'profile-contract.ts'))) {
    throw new Error('Vendored SPFx UI profile runtime contract path differs from the owned delivery path.');
  }
  if (sha256(readFileSync(runtimeContractPath)) !== manifest.runtimeContract.sha256) {
    throw new Error('Vendored SPFx UI profile runtime contract digest differs.');
  }
  const closureBinding = manifest.preparedBaseUi.deliveryFiles.find(
    (file) => file.sourcePath === manifest.preparedBaseUi.dependencyClosurePath
  );
  if (!closureBinding || closureBinding.sha256 !== manifest.preparedBaseUi.dependencyClosureSha256) {
    throw new Error('Vendored prepared Base UI dependency closure binding differs.');
  }
  const closurePath = path.resolve(appRoot, closureBinding.vendorPath);
  if (path.normalize(closurePath) !== path.normalize(path.join(profileRoot, 'dependency-closure.json'))) {
    throw new Error('Vendored prepared Base UI dependency closure path differs from the owned delivery path.');
  }
  const closureBytes = readFileSync(closurePath);
  if (sha256(closureBytes) !== closureBinding.sha256) {
    throw new Error('Vendored prepared Base UI dependency closure digest differs.');
  }
  const closure = JSON.parse(closureBytes.toString('utf8'));
  const lock = JSON.parse(readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
  const resolvedRoots = validateDependencyClosure(appRoot, closure, lock);
  const baseUiUtilsRoot = resolvedRoots.get('@base-ui/utils');
  if (!baseUiUtilsRoot) throw new Error('Prepared Base UI dependency closure omits @base-ui/utils.');
  return {
    appRoot,
    profileRoot,
    manifest,
    cssPath: path.normalize(cssPath),
    preparedRoot: path.join(appRoot, 'temp', 'spfx-ui-profile', 'base-ui'),
    baseUiUtilsRoot
  };
}

function prepareSpfxUiProfileBaseUi(options) {
  const delivery = loadDelivery(options);
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'spfx-ui-profile-prepare.mjs'), '--app-root', delivery.appRoot, '--profile-root', delivery.profileRoot],
    { cwd: delivery.appRoot, stdio: 'pipe' }
  );
  return delivery.preparedRoot;
}

function configureSpfxUiProfile(webpackConfiguration, options) {
  const delivery = loadDelivery(options);
  const rules = webpackConfiguration && webpackConfiguration.module && webpackConfiguration.module.rules;
  if (!Array.isArray(rules)) throw new Error('SPFx webpack configuration does not expose module.rules.');
  if (!existsSync(path.join(delivery.preparedRoot, 'package.json'))) {
    throw new Error('Prepared Base UI compatibility copy is missing; register the Gulp adapter before bundling.');
  }

  const moduleRule = rules.find((rule) => usesSpCssLoader(rule, true));
  const globalRule = rules.find((rule) => usesSpCssLoader(rule, false));
  if (!moduleRule || !globalRule) throw new Error('Could not find the SPFx module and global CSS loader rules.');

  configureSpfxMonacoCss(webpackConfiguration);
  const monacoRule = rules.find((rule) => usesAnySpCssLoader(rule) && String(rule && rule.test) === String(MONACO_CSS_RULE));
  if (!monacoRule) throw new Error('Could not find the dedicated Monaco global CSS rule.');
  clearInheritedBounds(monacoRule);
  const representativeMonacoPath = path.join(delivery.appRoot, 'node_modules', 'monaco-editor', 'editor.css');
  excludeFromOtherSpCssRules(rules, monacoRule, MONACO_CSS_RULE, representativeMonacoPath);

  const aliases = webpackConfiguration.resolve?.alias;
  if (aliases !== undefined && (Array.isArray(aliases) || typeof aliases !== 'object')) {
    throw new Error('SPFx webpack resolve.alias must be an object when present.');
  }
  webpackConfiguration.resolve = webpackConfiguration.resolve || {};
  webpackConfiguration.resolve.alias = aliases || {};
  const requiredAliases = { '@base-ui/react': delivery.preparedRoot };
  for (const [request, target] of Object.entries(requiredAliases)) {
    const currentAlias = webpackConfiguration.resolve.alias[request];
    if (currentAlias !== undefined && path.normalize(String(currentAlias)) !== path.normalize(target)) {
      throw new Error(`An incompatible ${request} webpack alias is already configured.`);
    }
    webpackConfiguration.resolve.alias[request] = target;
  }
  if (!rules.some((rule) => rule && rule[BASE_UI_MJS_RULE_MARKER] === delivery.preparedRoot)) {
    rules.push({
      test: /\.mjs$/u,
      include: [delivery.preparedRoot, delivery.baseUiUtilsRoot],
      resolve: { fullySpecified: false },
      [BASE_UI_MJS_RULE_MARKER]: delivery.preparedRoot
    });
  }

  const exactCssCondition = (resource) => path.normalize(String(resource || '').split('?', 1)[0]) === delivery.cssPath;
  exactCssCondition.uiProfileCssPath = delivery.cssPath;
  let profileRule = rules.find((rule) => rule && rule[UI_PROFILE_RULE_MARKER] === delivery.cssPath);
  excludeFromOtherSpCssRules(rules, profileRule, exactCssCondition, delivery.cssPath);
  if (!profileRule) {
    const globalRuleIndex = rules.indexOf(globalRule);
    profileRule = {
      ...cloneWithoutInheritedBounds(globalRule),
      test: exactCssCondition,
      [UI_PROFILE_RULE_MARKER]: delivery.cssPath
    };
    rules.splice(globalRuleIndex + 1, 0, profileRule);
  }
  clearInheritedBounds(profileRule);
  return webpackConfiguration;
}

function registerSpfxUiProfileGulp(build, options = {}) {
  const mergeConfig = build && build.configureWebpack && build.configureWebpack.mergeConfig;
  if (typeof mergeConfig !== 'function') throw new Error('SPFx Gulp build does not expose configureWebpack.mergeConfig.');
  prepareSpfxUiProfileBaseUi(options);
  mergeConfig.call(build.configureWebpack, {
    additionalConfiguration(webpackConfiguration) {
      return configureSpfxUiProfile(webpackConfiguration, options);
    }
  });
}

function usesSpCssLoader(rule, modulesEnabled) {
  const loaders = Array.isArray(rule && rule.use) ? rule.use : [rule && rule.use];
  return loaders.some((entry) => {
    if (!entry || typeof entry !== 'object' || !String(entry.loader || '').includes('@microsoft/sp-css-loader')) {
      return false;
    }
    return Boolean(entry.options && entry.options.generateCssClassName) === modulesEnabled;
  });
}

function usesAnySpCssLoader(rule) {
  return usesSpCssLoader(rule, true) || usesSpCssLoader(rule, false);
}

function excludeFromOtherSpCssRules(rules, dedicatedRule, condition, representativePath) {
  for (const rule of rules) {
    if (
      rule === dedicatedRule ||
      !usesAnySpCssLoader(rule) ||
      !matchesCondition(rule.test, representativePath) ||
      containsCondition(rule.exclude, condition)
    ) {
      continue;
    }
    rule.exclude = appendCondition(rule.exclude, condition);
  }
}

function matchesCondition(condition, value) {
  if (Array.isArray(condition)) return condition.some((entry) => matchesCondition(entry, value));
  if (typeof condition === 'function') return Boolean(condition(value));
  if (condition instanceof RegExp) {
    condition.lastIndex = 0;
    return condition.test(value);
  }
  return false;
}

function cloneWithoutInheritedBounds(rule) {
  const { include: _include, exclude: _exclude, ...clone } = rule;
  return clone;
}

function clearInheritedBounds(rule) {
  delete rule.include;
  delete rule.exclude;
}

function appendCondition(current, condition) {
  if (!current) return condition;
  return Array.isArray(current) ? [...current, condition] : [current, condition];
}

function containsCondition(current, condition) {
  if (Array.isArray(current)) return current.some((entry) => containsCondition(entry, condition));
  return String(current) === String(condition);
}

module.exports = registerSpfxUiProfileGulp;
module.exports.configureSpfxUiProfile = configureSpfxUiProfile;
module.exports.prepareSpfxUiProfileBaseUi = prepareSpfxUiProfileBaseUi;
