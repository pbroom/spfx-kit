'use strict';

const MONACO_CSS_RULE = /[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i;

/**
 * Route Monaco's global styles through SPFx's non-module CSS loader.
 *
 * Monaco creates plain class names at runtime. SPFx otherwise treats ordinary
 * dependency CSS as CSS Modules and hashes those selectors, which leaves the
 * editor DOM completely unstyled.
 */
module.exports = function configureSpfxMonacoCss(webpackConfiguration) {
  const rules = webpackConfiguration && webpackConfiguration.module && webpackConfiguration.module.rules;
  if (!Array.isArray(rules)) {
    throw new Error('SPFx webpack configuration does not expose module.rules.');
  }

  const moduleRule = rules.find((rule) => usesSpCssLoader(rule, true));
  const globalRule = rules.find((rule) => usesSpCssLoader(rule, false));
  if (!moduleRule || !globalRule) {
    throw new Error('Could not find the SPFx module and global CSS loader rules.');
  }

  moduleRule.exclude = appendCondition(moduleRule.exclude, MONACO_CSS_RULE);

  if (!rules.some((rule) => String(rule && rule.test) === String(MONACO_CSS_RULE))) {
    const globalRuleIndex = rules.indexOf(globalRule);
    rules.splice(globalRuleIndex + 1, 0, {
      ...globalRule,
      test: MONACO_CSS_RULE
    });
  }

  return webpackConfiguration;
};

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
  if (!current) {
    return condition;
  }
  return Array.isArray(current) ? [...current, condition] : [current, condition];
}
