'use strict';

const path = require('node:path');
const { readFileSync, realpathSync } = require('node:fs');

const { resolveUiProfileDeliveryArtifact } = require('./scripts/lib/delivery-artifact.cjs');
const UI_PROFILE_RULE_MARKER = Symbol.for('spfx-kit.ui-profile.global-css-rule');
const UI_PROFILE_ASSET_PLUGIN_MARKER = Symbol.for('spfx-kit.ui-profile.delivery-assets-plugin');

module.exports = function configureSpfxUiProfileCss(webpackConfiguration, options = {}) {
  const rules = webpackConfiguration && webpackConfiguration.module && webpackConfiguration.module.rules;
  if (!Array.isArray(rules)) {
    throw new Error('SPFx webpack configuration does not expose module.rules.');
  }
  const packageRoot = path.resolve(options.packageRoot || __dirname);
  const artifact = resolveUiProfileDeliveryArtifact({ packageRoot });
  const preparedBaseUiRoot = realpathSync(path.join(packageRoot, '.prepared/base-ui'));
  const expectedPreparedParent = `${realpathSync(path.join(packageRoot, '.prepared'))}${path.sep}`;
  if (!preparedBaseUiRoot.startsWith(expectedPreparedParent)) {
    throw new Error('Prepared Base UI compatibility root resolves outside the UI profile package.');
  }
  const preparedManifest = JSON.parse(readFileSync(path.join(preparedBaseUiRoot, 'package.json'), 'utf8'));
  if (preparedManifest.name !== '@base-ui/react' || preparedManifest.version !== '1.6.0') {
    throw new Error('Prepared Base UI compatibility package identity differs.');
  }

  const resolve = webpackConfiguration.resolve || (webpackConfiguration.resolve = {});
  const alias = resolve.alias || (resolve.alias = {});
  if (Array.isArray(alias) || typeof alias !== 'object') {
    throw new Error('SPFx webpack configuration does not expose an object resolve.alias map.');
  }
  const currentBaseUiAlias = alias['@base-ui/react'];
  if (currentBaseUiAlias && path.resolve(currentBaseUiAlias) !== preparedBaseUiRoot) {
    throw new Error('SPFx webpack configuration already aliases @base-ui/react to a different package.');
  }
  alias['@base-ui/react'] = preparedBaseUiRoot;

  const exactCssPath = path.normalize(artifact.cssPath);
  const exactCssCondition = (resource) => path.normalize(String(resource || '').split('?', 1)[0]) === exactCssPath;
  exactCssCondition.uiProfileCssPath = exactCssPath;

  const moduleRule = rules.find((rule) => usesSpCssLoader(rule, true));
  const globalRule = rules.find((rule) => usesSpCssLoader(rule, false));
  if (!moduleRule || !globalRule) {
    throw new Error('Could not find the SPFx module and global CSS loader rules.');
  }

  if (!containsUiProfileCondition(moduleRule.exclude, exactCssPath)) {
    moduleRule.exclude = appendCondition(moduleRule.exclude, exactCssCondition);
  }

  if (!rules.some((rule) => rule && rule[UI_PROFILE_RULE_MARKER] === exactCssPath)) {
    const globalRuleIndex = rules.indexOf(globalRule);
    rules.splice(globalRuleIndex + 1, 0, {
      ...globalRule,
      test: exactCssCondition,
      [UI_PROFILE_RULE_MARKER]: exactCssPath
    });
  }

  const plugins = webpackConfiguration.plugins || (webpackConfiguration.plugins = []);
  if (!plugins.some((plugin) => plugin && plugin[UI_PROFILE_ASSET_PLUGIN_MARKER] === artifact.cssSha256)) {
    plugins.push(createDeliveryAssetsPlugin(artifact));
  }

  return webpackConfiguration;
};

function createDeliveryAssetsPlugin(artifact) {
  const cssAssetPath = `spfx-ui-profile/${artifact.cssSha256}.css`;
  const manifestAssetPath = 'spfx-ui-profile/ui-profile-delivery.json';
  const cssBytes = readFileSync(artifact.cssPath);
  const manifestBytes = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      profileId: artifact.profileId,
      profileSha256: artifact.profileSha256,
      provenanceSha256: artifact.provenanceSha256,
      scopeValue: artifact.scopeValue,
      css: { path: cssAssetPath, bytes: cssBytes.byteLength, sha256: artifact.cssSha256 }
    })}\n`
  );
  return {
    [UI_PROFILE_ASSET_PLUGIN_MARKER]: artifact.cssSha256,
    apply(compiler) {
      compiler.hooks.emit.tap('SpfxUiProfileDeliveryAssetsPlugin', (compilation) => {
        emitAsset(compilation, cssAssetPath, cssBytes);
        emitAsset(compilation, manifestAssetPath, manifestBytes);
      });
    }
  };
}

function emitAsset(compilation, assetPath, bytes) {
  const asset = { source: () => bytes, size: () => bytes.byteLength };
  if (typeof compilation.emitAsset === 'function' && compilation.compiler?.webpack?.sources?.RawSource) {
    compilation.emitAsset(assetPath, new compilation.compiler.webpack.sources.RawSource(bytes));
    return;
  }
  compilation.assets[assetPath] = asset;
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

function appendCondition(current, condition) {
  if (!current) return condition;
  return Array.isArray(current) ? [...current, condition] : [current, condition];
}

function containsUiProfileCondition(current, exactCssPath) {
  if (Array.isArray(current)) return current.some((entry) => containsUiProfileCondition(entry, exactCssPath));
  return typeof current === 'function' && current.uiProfileCssPath === exactCssPath;
}
