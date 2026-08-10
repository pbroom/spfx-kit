import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SPFX_UI_PROFILE_ID, SPFX_UI_SCOPE_VALUE, createSpfxUiHost, mapSharePointTheme } from '@spfx-kit/ui-profile';
import { Button } from '@spfx-kit/ui-profile/button';

const require = createRequire(import.meta.url);
const packageManifest = JSON.parse(readFileSync('packages/ui-profile/package.json', 'utf8')) as {
  exports: Record<string, unknown>;
  typesVersions: Record<string, Record<string, string[]>>;
  bin: Record<string, string>;
};

const componentSubpaths = [
  'accordion',
  'alert',
  'badge',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'dropdown-menu',
  'field',
  'input',
  'input-group',
  'label',
  'popover',
  'select',
  'separator',
  'sheet',
  'spinner',
  'switch',
  'tabs',
  'textarea',
  'toggle',
  'toggle-group',
  'tooltip'
];

describe('@spfx-kit/ui-profile public package', () => {
  it('exports the reviewed component catalog and stable adapters without exposing generated internals', () => {
    expect(Object.keys(packageManifest.exports).sort()).toEqual(
      [
        '.',
        ...componentSubpaths.map((subpath) => `./${subpath}`),
        './delivery',
        './spfx-gulp',
        './spfx-webpack',
        './styles.css',
        './vite'
      ].sort()
    );
    expect(Object.keys(packageManifest.exports)).not.toContain('./normalized/*');
    expect(Object.keys(packageManifest.exports)).not.toContain('./scripts/*');
    expect(Object.keys(packageManifest.typesVersions['*'])).toEqual([...componentSubpaths, 'delivery', 'vite']);
    expect(packageManifest.bin).toEqual({
      'spfx-ui-profile-prepare': './scripts/prepare-base-ui.mjs',
      'spfx-ui-profile-verify': './scripts/verify-delivery-artifact.mjs'
    });
    expect(typeof Button).toBe('object');
    expect(typeof createSpfxUiHost).toBe('function');
    expect(typeof mapSharePointTheme).toBe('function');
  });

  it('binds the public host identity and stylesheet to the committed profile manifest', () => {
    const profile = JSON.parse(readFileSync('packages/ui-profile/profile.json', 'utf8')) as {
      profileId: string;
      css: { artifact: { path: string }; scopeValue: string };
    };
    expect(SPFX_UI_PROFILE_ID).toBe(profile.profileId);
    expect(SPFX_UI_SCOPE_VALUE).toBe(profile.css.scopeValue);

    const cssPath = require.resolve('@spfx-kit/ui-profile/styles.css');
    expect(path.normalize(cssPath)).toBe(path.resolve('packages/ui-profile', profile.css.artifact.path));
    expect(statSync(cssPath).isFile()).toBe(true);
  });

  it('keeps application and build consumers on declared package entry points', () => {
    const consumerFiles = [
      'apps/lab/src/LabApp.tsx',
      'apps/lab/src/main.tsx',
      'apps/lab/src/ui-profile/lab-theme.ts',
      'apps/lab/src/components/AppManagementSidebar.tsx',
      'apps/lab/src/components/CdnSmokeCheck.tsx',
      'apps/lab/src/components/ColorField.tsx',
      'apps/lab/src/components/PackageRuntimeSurface.tsx',
      'apps/lab/src/components/PropertyPane.tsx',
      'apps/lab/src/components/UiProfileContractHarness.tsx',
      'apps/lab/vite.config.ts',
      'examples/hello-card-spfx/src/webparts/helloCard/HelloCard.ts',
      'examples/hello-card-spfx/config/webpack-patch/ui-profile.cjs',
      'packages/spfx-tools/src/cli/export-spfx-app.mjs'
    ];

    for (const file of consumerFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/packages\/ui-profile\/(?:normalized|owned|generated|scripts)/u);
    }

    const sourceEditorManifest = readFileSync('packages/source-editor-react/ui-profile.json', 'utf8');
    expect(sourceEditorManifest).toContain('source-editor-react17-base-nova-v1');
    expect(sourceEditorManifest).toContain('packages/ui-profile/normalized/src/lib/ui-root.tsx');
  });
});
