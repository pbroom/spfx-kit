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
    const closure = JSON.parse(
      await readFile(path.join(repositoryRoot, 'packages', 'ui-profile', 'dependency-closure.json'), 'utf8')
    );
    const lockPackages = Object.fromEntries(
      closure.packages.map((entry: any) => [
        lockPath(entry.name),
        {
          version: entry.version,
          integrity: entry.integrity,
          dependencies: entry.dependencies,
          peerDependencies: entry.peerDependencies,
          ...(entry.optionalPeers?.length
            ? {
                peerDependenciesMeta: Object.fromEntries(entry.optionalPeers.map((peer: string) => [peer, { optional: true }]))
              }
            : {}),
          ...(entry.name === '@base-ui/react' ? { resolved: 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz' } : {})
        }
      ])
    );
    const lock = {
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { '@base-ui/react': '1.6.0' } },
        ...lockPackages
      }
    };
    await writeFile(
      path.join(appRoot, 'package.json'),
      `${JSON.stringify({ name: 'better-text-spfx', dependencies: { '@base-ui/react': '1.6.0' } })}\n`
    );
    const appLockPath = path.join(appRoot, 'package-lock.json');
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);
    const installedBaseUi = path.join(repositoryRoot, 'node_modules', '@base-ui', 'react');
    for (const entry of closure.packages) {
      const source = path.join(repositoryRoot, 'node_modules', ...entry.name.split('/'));
      const target = path.join(appRoot, ...lockPath(entry.name).split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    }

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

    for (const entry of closure.packages) {
      const driftedLock = structuredClone(lock);
      driftedLock.packages[lockPath(entry.name)].version = '0.0.0-drift';
      await writeFile(appLockPath, `${JSON.stringify(driftedLock)}\n`);
      expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
        `Installed ${entry.name} lock identity differs from the dependency closure.`
      );
    }
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);

    const optionalLock = structuredClone(lock);
    optionalLock.packages['node_modules/@base-ui/utils'].optionalDependencies = { 'left-pad': '1.3.0' };
    await writeFile(appLockPath, `${JSON.stringify(optionalLock)}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Installed @base-ui/utils optional dependency metadata differs.'
    );

    const bundledLock = structuredClone(lock);
    bundledLock.packages['node_modules/@base-ui/utils'].bundleDependencies = [];
    bundledLock.packages['node_modules/@base-ui/utils'].bundledDependencies = ['left-pad'];
    await writeFile(appLockPath, `${JSON.stringify(bundledLock)}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Installed @base-ui/utils bundled dependency metadata differs.'
    );
    await writeFile(appLockPath, `${JSON.stringify(lock)}\n`);

    const floatingManifestPath = path.join(appRoot, 'node_modules', '@floating-ui', 'react-dom', 'package.json');
    const floatingManifest = JSON.parse(await readFile(floatingManifestPath, 'utf8'));
    await writeFile(floatingManifestPath, `${JSON.stringify({ ...floatingManifest, version: '0.0.0-drift' })}\n`);
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @floating-ui/react-dom package identity differs from the dependency closure.'
    );
    await writeFile(floatingManifestPath, `${JSON.stringify(floatingManifest)}\n`);

    const utilsManifestPath = path.join(appRoot, 'node_modules', '@base-ui', 'utils', 'package.json');
    const utilsManifest = JSON.parse(await readFile(utilsManifestPath, 'utf8'));
    await writeFile(
      utilsManifestPath,
      `${JSON.stringify({
        ...utilsManifest,
        optionalDependencies: { 'left-pad': '1.3.0' },
        bundleDependencies: [],
        bundledDependencies: ['left-pad']
      })}\n`
    );
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @base-ui/utils optional dependencies differ.'
    );
    await writeFile(
      utilsManifestPath,
      `${JSON.stringify({ ...utilsManifest, bundleDependencies: [], bundledDependencies: ['left-pad'] })}\n`
    );
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @base-ui/utils bundled dependencies differ.'
    );
    await writeFile(utilsManifestPath, `${JSON.stringify(utilsManifest)}\n`);

    const nestedRuntimeRoot = path.join(appRoot, 'node_modules', '@base-ui', 'utils', 'node_modules', '@babel', 'runtime');
    await mkdir(path.dirname(nestedRuntimeRoot), { recursive: true });
    await cp(path.join(repositoryRoot, 'node_modules', '@babel', 'runtime'), nestedRuntimeRoot, { recursive: true });
    expect(() => registerSpfxUiProfileGulp(createBuildStub(), { appRoot, profileRoot })).toThrow(
      'Resolved app-local @babel/runtime path differs from the app lockfile.'
    );
  });
});

function lockPath(name: string): string {
  return name === 'reselect' ? 'node_modules/@base-ui/utils/node_modules/reselect' : `node_modules/${name}`;
}

function createBuildStub(): any {
  return { configureWebpack: { mergeConfig() {} } };
}

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
