'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const configureSpfxMonacoCss = require('./spfx-monaco-webpack.cjs');
const UI_PROFILE_RULE_MARKER = Symbol.for('spfx-kit.source-editor.ui-profile.global-css-rule');
const BASE_UI_MJS_RULE_MARKER = Symbol.for('spfx-kit.source-editor.ui-profile.base-ui-mjs-rule');
const MONACO_CSS_RULE = /[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
  const baseUiUtilsEvidence = closure.packages.find((candidate) => candidate.name === '@base-ui/utils');
  if (!baseUiUtilsEvidence || baseUiUtilsEvidence.version !== '0.3.1') {
    throw new Error('Prepared Base UI dependency closure does not pin @base-ui/utils@0.3.1.');
  }
  const lock = JSON.parse(readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
  const lockedBaseUiUtils = lock.packages?.['node_modules/@base-ui/utils'];
  if (
    lockedBaseUiUtils?.version !== baseUiUtilsEvidence.version ||
    lockedBaseUiUtils.integrity !== baseUiUtilsEvidence.integrity
  ) {
    throw new Error('Installed @base-ui/utils lock identity differs from the dependency closure.');
  }
  const baseUiUtilsRoot = realpathSync(path.join(appRoot, 'node_modules', '@base-ui', 'utils'));
  const baseUiUtilsManifest = JSON.parse(readFileSync(path.join(baseUiUtilsRoot, 'package.json'), 'utf8'));
  if (baseUiUtilsManifest.name !== '@base-ui/utils' || baseUiUtilsManifest.version !== baseUiUtilsEvidence.version) {
    throw new Error('Resolved app-local @base-ui/utils package identity differs from the dependency closure.');
  }
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
