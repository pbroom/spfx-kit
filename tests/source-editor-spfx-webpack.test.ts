import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const configureSpfxMonacoCss = require('../packages/source-editor-react/spfx-monaco-webpack.cjs');

describe('SPFx Monaco webpack configuration', () => {
  it('excludes Monaco from CSS Modules and adds a global CSS rule', () => {
    const moduleRule = createCssRule(true);
    const globalRule = createCssRule(false);
    const webpackConfiguration = {
      module: {
        rules: [{ test: /\.js$/ }, moduleRule, globalRule]
      }
    };

    expect(configureSpfxMonacoCss(webpackConfiguration)).toBe(webpackConfiguration);

    const monacoPath = '/repo/node_modules/monaco-editor/esm/vs/editor/editor.main.css';
    const appPath = '/repo/src/webparts/example/Example.module.css';
    expect(matches(moduleRule.exclude, monacoPath)).toBe(true);
    expect(matches(moduleRule.exclude, appPath)).toBe(false);

    const monacoGlobalRule = webpackConfiguration.module.rules.find(
      (rule) => String(rule.test) === String(/[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i)
    );
    expect(monacoGlobalRule).toBeDefined();
    expect(matches(monacoGlobalRule?.test, monacoPath)).toBe(true);
    expect(monacoGlobalRule?.use).toBe(globalRule.use);
  });

  it('is idempotent and preserves an existing module exclusion', () => {
    const existingExclusion = /legacy-package/;
    const moduleRule = { ...createCssRule(true), exclude: existingExclusion };
    const webpackConfiguration = {
      module: {
        rules: [moduleRule, createCssRule(false)]
      }
    };

    configureSpfxMonacoCss(webpackConfiguration);
    configureSpfxMonacoCss(webpackConfiguration);

    expect(webpackConfiguration.module.rules).toHaveLength(3);
    expect(moduleRule.exclude).toHaveLength(2);
    expect(matches(moduleRule.exclude, '/repo/node_modules/legacy-package/file.css')).toBe(true);
    expect(matches(moduleRule.exclude, '/repo/node_modules/monaco-editor/editor.css')).toBe(true);
  });

  it('fails loudly when the SPFx CSS rules cannot be identified', () => {
    expect(() => configureSpfxMonacoCss({ module: { rules: [] } })).toThrow(
      'Could not find the SPFx module and global CSS loader rules.'
    );
  });
});

function createCssRule(modulesEnabled: boolean) {
  return {
    test: modulesEnabled ? /\.css$/ : /\.global\.css$/,
    use: [
      {
        loader: '/repo/node_modules/@microsoft/sp-css-loader/lib/index.js',
        options: modulesEnabled ? { async: true, generateCssClassName: () => 'hash' } : { async: true }
      }
    ]
  };
}

function matches(condition: unknown, value: string): boolean {
  if (Array.isArray(condition)) {
    return condition.some((entry) => matches(entry, value));
  }
  return condition instanceof RegExp ? condition.test(value) : false;
}
