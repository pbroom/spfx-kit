import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { SPFX_UI_PROFILE_ID, SPFX_UI_SCOPE_VALUE, createSpfxUiHost, mapSharePointTheme } from '@spfx-kit/ui-profile';
import { Button } from '@spfx-kit/ui-profile/button';

const require = createRequire(import.meta.url);
const repositoryRoot = process.cwd();
const profileRoot = path.join(repositoryRoot, 'packages', 'ui-profile');
const packageManifest = JSON.parse(readFileSync('packages/ui-profile/package.json', 'utf8')) as {
  exports: Record<string, unknown>;
  typesVersions: Record<string, Record<string, string[]>>;
  bin: Record<string, string>;
};
const catalog = JSON.parse(readFileSync('packages/ui-profile/catalog.json', 'utf8')) as {
  includedComponentIds: string[];
  excludedComponents: Array<{ id: string }>;
  documentedCompositions: Array<{ id: string }>;
  supportRegistryIds: string[];
};
const componentSubpaths = catalog.includedComponentIds;
const nonPublicSubpaths = [
  ...catalog.excludedComponents.map(({ id }) => id),
  ...catalog.documentedCompositions.map(({ id }) => id),
  ...catalog.supportRegistryIds
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
    expect(Object.keys(packageManifest.typesVersions['*']).sort()).toEqual([...componentSubpaths, 'delivery', 'vite'].sort());
    for (const component of componentSubpaths) {
      const declaration = `dist/normalized/src/components/ui/${component}.d.ts`;
      expect(packageManifest.typesVersions['*'][component]).toEqual([declaration]);
      expect(packageManifest.exports[`./${component}`]).toMatchObject({ types: `./${declaration}` });

      const emitted = readFileSync(path.join(profileRoot, declaration), 'utf8');
      expect(emitted, component).toMatch(
        /^\/\/\/ <reference path="\.\.\/\.\.\/\.\.\/\.\.\/compat-consumers\/react17-base-ui-jsx\.d\.ts" \/>/u
      );
      expect(emitted, component).not.toMatch(/["']@base-ui\/react(?:\/[^"']*)?["']/u);
      expect(emitted, component).not.toContain('"../../../../.prepared/base-ui"');
      expect(emitted, component).not.toContain('"class-variance-authority/dist/types"');
    }
    expect(statSync(path.join(profileRoot, 'dist/compat-consumers/react17-base-ui-jsx.d.ts')).isFile()).toBe(true);
    expect(packageManifest.typesVersions['<5.4']).toEqual({
      chart: ['dist/compat-consumers/typescript53/chart.d.ts'],
      delivery: ['delivery.d.ts'],
      vite: ['vite.d.ts'],
      '*': ['dist/normalized/src/components/ui/*.d.ts']
    });
    expect(readFileSync(path.join(profileRoot, 'dist/compat-consumers/typescript53/chart.d.ts'), 'utf8')).toContain(
      'reference path="../typescript53-globals.d.ts"'
    );
    for (const subpath of nonPublicSubpaths) {
      expect(packageManifest.exports, subpath).not.toHaveProperty(`./${subpath}`);
      expect(packageManifest.typesVersions['*'], subpath).not.toHaveProperty(subpath);
    }
    expect(packageManifest.bin).toEqual({
      'spfx-ui-profile-prepare': './scripts/prepare-base-ui.mjs',
      'spfx-ui-profile-verify': './scripts/verify-delivery-artifact.mjs'
    });
    expect(typeof Button).toBe('object');
    expect(typeof createSpfxUiHost).toBe('function');
    expect(typeof mapSharePointTheme).toBe('function');
  });

  it('typechecks direct component subpaths for strict external React 17 consumers', () => {
    const consumerRoot = mkdtempSync(path.join(tmpdir(), 'spfx-ui-profile-consumer-'));
    try {
      const packageScope = path.join(consumerRoot, 'node_modules', '@spfx-kit');
      mkdirSync(packageScope, { recursive: true });
      symlinkSync(profileRoot, path.join(packageScope, 'ui-profile'), 'dir');
      const consumer = path.join(consumerRoot, 'index.tsx');
      writeFileSync(
        consumer,
        [
          "import * as React from 'react';",
          ...componentSubpaths.map(
            (component, index) => `import * as Component${index} from '@spfx-kit/ui-profile/${component}';`
          ),
          "import { Dialog, DialogContent } from '@spfx-kit/ui-profile/dialog';",
          "import { Select, SelectItem } from '@spfx-kit/ui-profile/select';",
          ...componentSubpaths.map((_component, index) => `void Component${index};`),
          'export const fixture = (',
          '  <Dialog>',
          '    <DialogContent>',
          '      <Select defaultValue="one"><SelectItem value="one">One</SelectItem></Select>',
          '    </DialogContent>',
          '  </Dialog>',
          ');',
          ''
        ].join('\n')
      );

      const commonArguments = [
        '--noEmit',
        '--module',
        'ESNext',
        '--target',
        'ES2020',
        '--jsx',
        'react',
        '--strict',
        '--esModuleInterop',
        '--allowSyntheticDefaultImports',
        '--skipLibCheck',
        'false',
        '--types',
        'react',
        '--typeRoots',
        path.join(repositoryRoot, 'node_modules', '@types'),
        consumer
      ];
      for (const [compiler, moduleResolution] of [
        ['typescript', 'Node'],
        ['typescript-5-8', 'Bundler']
      ]) {
        const result = spawnSync(
          process.execPath,
          [
            path.join(repositoryRoot, 'node_modules', compiler, 'bin', 'tsc'),
            ...commonArguments,
            '--moduleResolution',
            moduleResolution
          ],
          { cwd: consumerRoot, encoding: 'utf8' }
        );
        expect(`${result.stdout}${result.stderr}`, `${compiler} external consumer`).toBe('');
        expect(result.status, `${compiler} external consumer`).toBe(0);
      }
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true });
    }
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
      'apps/lab/src/components/UiLibraryWorkspace.tsx',
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
