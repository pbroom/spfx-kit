import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error portable .mjs module without declarations
import { prepareSpfxUiProfileBaseUi } from '../packages/source-editor-react/spfx-ui-profile-prepare.mjs';
// @ts-expect-error plain .mjs module without declarations
import { resolveSourceEditorUiProfile } from '../packages/spfx-tools/src/lib/source-editor-vendor.mjs';

const require = createRequire(import.meta.url);
const registerSpfxUiProfileGulp = require('../packages/source-editor-react/spfx-ui-profile-gulp.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('portable Better Text SPFx UI profile build adapter', () => {
  it('prepares an app-local Base UI copy and composes its alias and exact CSS rule with Monaco', async () => {
    const appRoot = await mkdtemp(path.join(tmpdir(), 'better-text-ui-profile-'));
    temporaryDirectories.push(appRoot);
    await writeFile(
      path.join(appRoot, 'package.json'),
      `${JSON.stringify({ name: 'better-text-spfx', dependencies: { '@base-ui/react': '1.6.0' } })}\n`
    );
    await writeFile(
      path.join(appRoot, 'package-lock.json'),
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { '@base-ui/react': '1.6.0' } },
          'node_modules/@base-ui/react': {
            version: '1.6.0',
            resolved: 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz',
            integrity: 'sha512-/jzjTWJYXhRFO45Bev9lc3cHbmjzCMpUqbMZ2AgKy/z25mY9B6shGSNcXcjQar9n5doM0KYW1W8fcFv2jZBuMw=='
          },
          'node_modules/@base-ui/utils': {
            version: '0.3.1',
            resolved: 'https://registry.npmjs.org/@base-ui/utils/-/utils-0.3.1.tgz',
            integrity: 'sha512-gFFiltORVmW/N6IILTGxizP3PBpVpysqML1ALY5Vk0mH+7faVkCknOU31goYHN5Aoek2dkjxva1XOD2Ce9WuIg=='
          }
        }
      })}\n`
    );
    const installedBaseUi = path.join(repositoryRoot, 'node_modules', '@base-ui', 'react');
    await mkdir(path.join(appRoot, 'node_modules', '@base-ui'), { recursive: true });
    await cp(installedBaseUi, path.join(appRoot, 'node_modules', '@base-ui', 'react'), { recursive: true });
    await cp(
      path.join(repositoryRoot, 'node_modules', '@base-ui', 'utils'),
      path.join(appRoot, 'node_modules', '@base-ui', 'utils'),
      { recursive: true }
    );

    const resolved = await resolveSourceEditorUiProfile(repositoryRoot, 'better-text-spfx');
    for (const file of resolved.files) {
      if (!file.vendorPath.startsWith('src/vendor/source-editor/ui-profile/')) continue;
      const target = path.join(appRoot, file.vendorPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.source);
    }
    const profileRoot = path.join(appRoot, 'src', 'vendor', 'source-editor', 'ui-profile');
    const installedManifestBefore = await readFile(path.join(installedBaseUi, 'package.json'));
    const preparedRoot = await prepareSpfxUiProfileBaseUi({ appRoot, profileRoot });
    expect(preparedRoot).toBe(path.join(await realpath(appRoot), 'temp', 'spfx-ui-profile', 'base-ui'));
    expect(await readFile(path.join(installedBaseUi, 'package.json'))).toEqual(installedManifestBefore);
    expect(JSON.parse(await readFile(path.join(preparedRoot, 'package.json'), 'utf8')).exports).toHaveProperty(
      './spfx-id-ownership'
    );
    expect(await readFile(path.join(preparedRoot, 'spfx-id-ownership.mjs'), 'utf8')).toContain('BaseUiIdOwnershipProvider');
    await expect(prepareSpfxUiProfileBaseUi({ appRoot, profileRoot })).resolves.toBe(preparedRoot);

    const inheritedInclude = /[\\/]src[\\/]/u;
    const inheritedExclude = /legacy-global/u;
    const moduleRule = { ...createCssRule(true), include: inheritedInclude };
    const globalRule = { ...createCssRule(false), include: inheritedInclude, exclude: inheritedExclude };
    const webpackConfiguration: any = { module: { rules: [moduleRule, globalRule] } };
    let customization: any;
    registerSpfxUiProfileGulp(
      {
        configureWebpack: {
          mergeConfig(value: any) {
            customization = value;
          }
        }
      },
      { appRoot, profileRoot }
    );
    expect(customization.additionalConfiguration(webpackConfiguration)).toBe(webpackConfiguration);
    expect(webpackConfiguration.resolve.alias['@base-ui/react']).toBe(preparedRoot);
    expect(webpackConfiguration.resolve.alias).not.toHaveProperty('react/jsx-runtime$');
    expect(webpackConfiguration.module.rules).toHaveLength(5);
    const baseUiUtilsRoot = path.join(await realpath(appRoot), 'node_modules', '@base-ui', 'utils');
    const preparedMjsRule = webpackConfiguration.module.rules.find((rule: any) => rule.resolve?.fullySpecified === false);
    expect(preparedMjsRule).toBeDefined();
    expect(preparedMjsRule.include).toEqual([preparedRoot, baseUiUtilsRoot]);
    expect(matches(preparedMjsRule.test, path.join(preparedRoot, 'select', 'root', 'SelectRoot.mjs'))).toBe(true);
    expect(matches(preparedMjsRule.test, path.join(baseUiUtilsRoot, 'store', 'StoreInspector.mjs'))).toBe(true);
    expect(matches(preparedMjsRule.test, path.join(preparedRoot, 'select', 'root', 'SelectRoot.js'))).toBe(false);

    const cssPath = path.join(await realpath(profileRoot), 'tailwind-profile.css');
    const profileRule = webpackConfiguration.module.rules.find(
      (rule: any) => typeof rule.test === 'function' && rule.test.uiProfileCssPath
    );
    expect(matches(moduleRule.exclude, cssPath)).toBe(false);
    expect(matches(globalRule.exclude, cssPath)).toBe(true);
    expect(matches(profileRule.test, cssPath)).toBe(true);
    expect(matches(profileRule.test, `${cssPath}?used`)).toBe(true);
    expect(matches(profileRule.test, path.join(appRoot, 'src', 'unrelated.css'))).toBe(false);
    expect(profileRule.use).toBe(globalRule.use);
    expect(profileRule).not.toHaveProperty('include');
    expect(profileRule).not.toHaveProperty('exclude');
    const monacoPath = path.join(await realpath(appRoot), 'node_modules', 'monaco-editor', 'editor.css');
    const monacoRule = webpackConfiguration.module.rules.find(
      (rule: any) => String(rule.test) === String(/[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/i)
    );
    expect(monacoRule).toBeDefined();
    expect(monacoRule).not.toHaveProperty('include');
    expect(monacoRule).not.toHaveProperty('exclude');
    expect(matches(moduleRule.exclude, monacoPath)).toBe(true);
    expect(matches(globalRule.exclude, monacoPath)).toBe(true);
    expect(ruleApplies(monacoRule, monacoPath)).toBe(true);
    expect(ruleApplies(profileRule, cssPath)).toBe(true);
    expect(ruleApplies(moduleRule, monacoPath)).toBe(false);
    expect(ruleApplies(globalRule, monacoPath)).toBe(false);
    expect(ruleApplies(moduleRule, cssPath)).toBe(false);
    expect(ruleApplies(globalRule, cssPath)).toBe(false);

    expect(customization.additionalConfiguration(webpackConfiguration)).toBe(webpackConfiguration);
    expect(webpackConfiguration.module.rules).toHaveLength(5);
  });
});

function createCssRule(modulesEnabled: boolean): any {
  return {
    test: modulesEnabled ? /\.module(?:\.scss)?\.css$/iu : /(?<!\.module(?:\.scss)?)\.css$/iu,
    use: [
      {
        loader: '/repo/node_modules/@microsoft/sp-css-loader/lib/index.js',
        options: modulesEnabled ? { async: true, generateCssClassName: () => 'hash' } : { async: true }
      }
    ]
  };
}

function matches(condition: any, value: string): boolean {
  if (Array.isArray(condition)) return condition.some((entry) => matches(entry, value));
  if (typeof condition === 'function') return condition(value);
  return condition instanceof RegExp ? condition.test(value) : false;
}

function ruleApplies(rule: any, value: string): boolean {
  return matches(rule.test, value) && (!rule.include || matches(rule.include, value)) && !matches(rule.exclude, value);
}
