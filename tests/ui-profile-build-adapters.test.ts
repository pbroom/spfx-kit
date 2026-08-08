import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs build integration module
import { resolveUiProfileDeliveryArtifact } from '../packages/ui-profile/scripts/lib/delivery-artifact.mjs';
// @ts-expect-error plain .mjs Vite integration module
import {
  spfxUiProfileDeliveryPlugin,
  UI_PROFILE_DELIVERY_MODULE_ID
} from '../packages/ui-profile/scripts/lib/vite-delivery-plugin.mjs';

const require = createRequire(import.meta.url);
const configureSpfxUiProfileCss = require('../packages/ui-profile/spfx-ui-webpack.cjs');
const registerSpfxUiProfileGulp = require('../packages/ui-profile/spfx-ui-gulp.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repositoryRoot, 'packages', 'ui-profile');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('UI profile delivery artifact', () => {
  it('resolves the manifest-declared CSS bytes and immutable identity', async () => {
    const artifact = await resolveUiProfileDeliveryArtifact({ packageRoot: profileRoot });
    const profile = JSON.parse(await readFile(path.join(profileRoot, 'profile.json'), 'utf8'));

    expect(artifact).toMatchObject({
      profileId: profile.profileId,
      provenanceSha256: profile.provenanceSha256,
      cssRelativePath: profile.css.artifact.path,
      cssSha256: profile.css.artifact.sha256,
      scopeValue: profile.css.scopeValue
    });
    expect(
      createHash('sha256')
        .update(await readFile(artifact.cssPath))
        .digest('hex')
    ).toBe(artifact.cssSha256);
  });

  it('fails closed when the declared CSS path escapes or its bytes drift', async () => {
    const fixture = await copyDeliveryFixture();
    const profilePath = path.join(fixture, 'profile.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.css.artifact.path = '../outside.css';
    await writeFile(profilePath, `${JSON.stringify(profile)}\n`);
    expect(() => resolveUiProfileDeliveryArtifact({ packageRoot: fixture })).toThrow('path escapes');

    profile.css.artifact.path = 'generated/tailwind-profile.css';
    await writeFile(profilePath, `${JSON.stringify(profile)}\n`);
    await writeFile(path.join(fixture, profile.css.artifact.path), 'tampered');
    expect(() => resolveUiProfileDeliveryArtifact({ packageRoot: fixture })).toThrow('CSS artifact digest differs');
  });
});

describe('Vite UI profile delivery adapter', () => {
  it('loads one virtual module bound to the manifest-declared CSS path and digests', async () => {
    const plugin = spfxUiProfileDeliveryPlugin({ packageRoot: profileRoot });
    const resolvedId = plugin.resolveId(UI_PROFILE_DELIVERY_MODULE_ID);
    expect(resolvedId).toBe(`\0${UI_PROFILE_DELIVERY_MODULE_ID}`);
    expect(plugin.resolveId('unrelated')).toBeNull();

    const source = await plugin.load(resolvedId as string);
    const artifact = await resolveUiProfileDeliveryArtifact({ packageRoot: profileRoot });
    expect(source).toContain(`import ${JSON.stringify(artifact.cssPath)};`);
    expect(source).toContain(`export const profileId = ${JSON.stringify(artifact.profileId)};`);
    expect(source).toContain(`export const cssSha256 = ${JSON.stringify(artifact.cssSha256)};`);
    await expect(plugin.load('\0unrelated')).resolves.toBeNull();
  });
});

describe('SPFx UI profile webpack adapter', () => {
  it('routes only the exact manifest CSS through the global loader and stays idempotent', () => {
    const moduleRule = createCssRule(true);
    const globalRule = createCssRule(false);
    const webpackConfiguration = { module: { rules: [moduleRule, globalRule] } };
    const artifact = require('../packages/ui-profile/scripts/lib/delivery-artifact.cjs').resolveUiProfileDeliveryArtifact({
      packageRoot: profileRoot
    });

    expect(configureSpfxUiProfileCss(webpackConfiguration, { packageRoot: profileRoot })).toBe(webpackConfiguration);
    expect(configureSpfxUiProfileCss(webpackConfiguration, { packageRoot: profileRoot })).toBe(webpackConfiguration);
    expect(webpackConfiguration.module.rules).toHaveLength(3);

    const exactCondition = webpackConfiguration.module.rules[2].test;
    expect(matches(moduleRule.exclude, artifact.cssPath)).toBe(true);
    expect(matches(moduleRule.exclude, '/repo/src/app.global.css')).toBe(false);
    expect(matches(exactCondition, artifact.cssPath)).toBe(true);
    expect(matches(exactCondition, `${artifact.cssPath}?used`)).toBe(true);
    expect(matches(exactCondition, '/repo/src/unrelated.css')).toBe(false);
    expect(webpackConfiguration.module.rules[2].use).toBe(globalRule.use);
    expect(webpackConfiguration.plugins).toHaveLength(1);

    const emitted: Record<string, Buffer> = {};
    webpackConfiguration.plugins[0].apply({
      hooks: {
        emit: {
          tap(_name: string, callback: (compilation: any) => void) {
            const compilation = { assets: {} as Record<string, { source(): Buffer }> };
            callback(compilation);
            for (const [name, asset] of Object.entries(compilation.assets)) emitted[name] = asset.source();
          }
        }
      }
    });
    expect(emitted[`spfx-ui-profile/${artifact.cssSha256}.css`]).toEqual(readFileSync(artifact.cssPath));
    expect(JSON.parse(emitted['spfx-ui-profile/ui-profile-delivery.json'].toString('utf8'))).toMatchObject({
      profileId: artifact.profileId,
      css: { path: `spfx-ui-profile/${artifact.cssSha256}.css`, sha256: artifact.cssSha256 }
    });
  });

  it('uses the same exact-path adapter through the retained Gulp merge seam', () => {
    let customization: any;
    const build = {
      configureWebpack: {
        mergeConfig(value: any) {
          customization = value;
        }
      }
    };
    registerSpfxUiProfileGulp(build, { packageRoot: profileRoot });

    const moduleRule = createCssRule(true);
    const globalRule = createCssRule(false);
    const webpackConfiguration = { module: { rules: [moduleRule, globalRule] } };
    expect(customization.additionalConfiguration(webpackConfiguration)).toBe(webpackConfiguration);
    expect(webpackConfiguration.module.rules).toHaveLength(3);
  });

  it('fails closed without a profile root or recognizable SPFx CSS rules', () => {
    expect(() => configureSpfxUiProfileCss({ module: { rules: [] } })).toThrow('requires packageRoot');
    expect(() => configureSpfxUiProfileCss({ module: { rules: [] } }, { packageRoot: profileRoot })).toThrow(
      'Could not find the SPFx module and global CSS loader rules.'
    );
    expect(() => registerSpfxUiProfileGulp({}, { packageRoot: profileRoot })).toThrow(
      'SPFx Gulp build does not expose configureWebpack.mergeConfig.'
    );
  });
});

describe('committed build integration', () => {
  it('registers the Heft patch and verifies the profile before canary build and ship', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'examples/hello-card-spfx/package.json'), 'utf8'));
    const webpackPatch = JSON.parse(
      await readFile(path.join(repositoryRoot, 'examples/hello-card-spfx/config/webpack-patch.json'), 'utf8')
    );
    const source = await readFile(
      path.join(repositoryRoot, 'examples/hello-card-spfx/src/webparts/helloCard/HelloCard.ts'),
      'utf8'
    );

    expect(packageJson.scripts.build).toMatch(
      /^node \.\.\/\.\.\/packages\/ui-profile\/scripts\/verify-delivery-artifact\.mjs && heft /u
    );
    expect(packageJson.scripts.ship).toMatch(
      /^node \.\.\/\.\.\/packages\/ui-profile\/scripts\/verify-delivery-artifact\.mjs && heft /u
    );
    expect(webpackPatch.patchFiles).toEqual(['./config/webpack-patch/ui-profile.cjs']);
    expect(source).toContain("import '../../../../../packages/ui-profile/generated/tailwind-profile.css';");
  });
});

async function copyDeliveryFixture(): Promise<string> {
  const fixture = await mkdtemp(path.join(tmpdir(), 'ui-profile-delivery-'));
  temporaryDirectories.push(fixture);
  await mkdir(path.join(fixture, 'generated'), { recursive: true });
  await Promise.all([
    copyFile(path.join(profileRoot, 'profile.json'), path.join(fixture, 'profile.json')),
    copyFile(path.join(profileRoot, 'provenance.json'), path.join(fixture, 'provenance.json')),
    copyFile(path.join(profileRoot, 'generated', 'tailwind-profile.css'), path.join(fixture, 'generated', 'tailwind-profile.css'))
  ]);
  return fixture;
}

function createCssRule(modulesEnabled: boolean): any {
  return {
    test: modulesEnabled ? /\.css$/u : /\.global\.css$/u,
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
