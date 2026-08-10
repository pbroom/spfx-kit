import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  uiProfileCatalogDocumentation,
  uiProfileCatalogEntries,
  uiProfileCatalogImportPath
} from '../apps/lab/src/components/uiProfileCatalogEntries';

const harnessPath = 'apps/lab/src/components/UiProfileCatalogHarness.tsx';
const entriesPath = 'apps/lab/src/components/uiProfileCatalogEntries.ts';
const catalogSubpaths = [
  'accordion',
  'alert',
  'alert-dialog',
  'aspect-ratio',
  'attachment',
  'avatar',
  'badge',
  'breadcrumb',
  'bubble',
  'button',
  'button-group',
  'calendar',
  'card',
  'carousel',
  'chart',
  'checkbox',
  'collapsible',
  'combobox',
  'context-menu',
  'dialog',
  'direction',
  'drawer',
  'dropdown-menu',
  'empty',
  'field',
  'hover-card',
  'input',
  'input-group',
  'input-otp',
  'item',
  'kbd',
  'label',
  'marker',
  'menubar',
  'message',
  'native-select',
  'navigation-menu',
  'pagination',
  'popover',
  'progress',
  'radio-group',
  'scroll-area',
  'select',
  'separator',
  'sheet',
  'sidebar',
  'skeleton',
  'slider',
  'spinner',
  'switch',
  'table',
  'tabs',
  'textarea',
  'toast',
  'toggle',
  'toggle-group',
  'tooltip'
] as const;

describe('Lab UI profile catalog harness', () => {
  it('imports every included public component subpath exactly once', () => {
    const source = readFileSync(harnessPath, 'utf8');
    const catalog = JSON.parse(readFileSync('packages/ui-profile/catalog.json', 'utf8')) as {
      includedComponentIds: string[];
    };
    const imports = [...source.matchAll(/from '@spfx-kit\/ui-profile\/([a-z0-9-]+)'/gu)].map((match) => match[1]);

    expect(catalog.includedComponentIds).toEqual(catalogSubpaths);
    expect(imports).toHaveLength(57);
    expect(new Set(imports).size).toBe(imports.length);
    expect([...imports].sort()).toEqual([...catalogSubpaths].sort());
    expect(source).not.toMatch(/packages\/ui-profile\/(?:normalized|owned|generated|scripts)/u);
  });

  it('renders one stable smoke target for every included catalog component', () => {
    const source = readFileSync(harnessPath, 'utf8');
    const entriesSource = readFileSync(entriesPath, 'utf8');
    const samples = [...source.matchAll(/<CatalogSample component="([a-z0-9-]+)"/gu)].map((match) => match[1]);
    const navigationEntries = [...entriesSource.matchAll(/\{ id: '([a-z0-9-]+)', title: '[^']+' \}/gu)].map((match) => match[1]);

    expect(samples).toHaveLength(57);
    expect(new Set(samples).size).toBe(samples.length);
    expect([...samples].sort()).toEqual([...catalogSubpaths].sort());
    expect(navigationEntries).toHaveLength(57);
    expect(new Set(navigationEntries).size).toBe(navigationEntries.length);
    expect(navigationEntries).toEqual(samples);
    expect(source).toContain('data-ui-profile-catalog="base-nova"');
  });

  it('provides original documentation metadata for every supported entry', () => {
    const documentedComponentIds = Object.keys(uiProfileCatalogDocumentation);

    expect(documentedComponentIds).toEqual(catalogSubpaths);
    expect(uiProfileCatalogEntries.map((entry) => entry.id)).toEqual(catalogSubpaths);
    for (const entry of uiProfileCatalogEntries) {
      const documentation = uiProfileCatalogDocumentation[entry.id];
      expect(documentation.primaryExport).toMatch(/^[A-Z][A-Za-z0-9]+$/u);
      expect(documentation.summary.length).toBeGreaterThan(24);
      expect(documentation.summary).not.toMatch(/installation|React Aria|Radix/iu);
      expect(uiProfileCatalogImportPath(entry.id)).toBe(`@spfx-kit/ui-profile/${entry.id}`);
    }
  });

  it('uses Breadcrumb as the complete typed documentation contract', () => {
    const breadcrumb = uiProfileCatalogDocumentation.breadcrumb;

    expect(breadcrumb.examples?.map((example) => example.id)).toEqual([
      'basic',
      'custom-separator',
      'dropdown',
      'collapsed',
      'custom-link',
      'responsive',
      'rtl'
    ]);
    expect(breadcrumb.api?.map((part) => part.name)).toEqual([
      'Breadcrumb',
      'BreadcrumbList',
      'BreadcrumbItem',
      'BreadcrumbLink',
      'BreadcrumbPage',
      'BreadcrumbSeparator',
      'BreadcrumbEllipsis'
    ]);
    expect(breadcrumb.composition).toHaveLength(4);
    for (const example of breadcrumb.examples ?? []) {
      expect(example.code).toContain("@spfx-kit/ui-profile/");
      expect(example.code).not.toMatch(/installation|React Aria|Radix/iu);
    }

    const harnessSource = readFileSync(harnessPath, 'utf8');
    const liveExampleIds = [...harnessSource.matchAll(/data-catalog-example="([a-z0-9-]+)"/gu)].map((match) => match[1]);
    expect(liveExampleIds).toEqual(breadcrumb.examples?.map((example) => example.id));
    expect(harnessSource).toContain("useSpfxUiId('catalog:breadcrumb-dropdown-content')");
    expect(harnessSource).toContain("useSpfxUiId('catalog:breadcrumb-responsive-content')");
  });

  it('keeps official component visuals and scoped host ownership intact', () => {
    const source = readFileSync(harnessPath, 'utf8');

    expect(source).not.toContain('className=');
    expect(source).not.toMatch(/(?:id|aria-controls|aria-describedby|aria-labelledby)="catalog:/u);
    expect(source).toContain("useSpfxUiId('catalog:toast-portal')");
    expect(source).toContain('<ToastPortal id={toastPortalId}>');
    expect(source).toContain('<Sidebar collapsible="none" id={sidebarId}>');
    expect(source).toContain('const toastManager = React.useMemo(() => createToastManager(), []);');
    expect(source).not.toMatch(/\b(?:document|window)\./u);
  });

  it('is reviewable through an isolated query route without changing the normal Lab shell', () => {
    const entrySource = readFileSync('apps/lab/src/main.tsx', 'utf8');

    expect(entrySource).toContain("searchParams.get('ui-profile-catalog') === '1'");
    expect(entrySource).toContain("import('./components/UiProfileCatalogHarness')");
    expect(entrySource).toContain('mountUiProfileCatalogHarness(root)');
    expect(entrySource).toMatch(/if \(isUiProfileCatalogRoute\)[^]*else if \(isUiProfileContractRoute\)/u);
  });

  it('reuses the complete catalog as a selected preview inside the query-routed first-party Lab workspace', () => {
    const harnessSource = readFileSync(harnessPath, 'utf8');
    const workspaceSource = readFileSync('apps/lab/src/components/UiLibraryWorkspace.tsx', 'utf8');
    const labSource = readFileSync('apps/lab/src/LabApp.tsx', 'utf8');

    expect(workspaceSource).toContain("import('./UiProfileCatalogHarness')");
    expect(workspaceSource).toContain('module.UiProfileCatalogHarness');
    expect(workspaceSource).toContain('<React.Suspense');
    expect(workspaceSource).toContain('<UiProfileCatalogHarness activeComponent={activeComponent} />');
    expect(workspaceSource).toContain('const includedComponentCount = uiProfileCatalogEntries.length');
    expect(workspaceSource).toContain('aria-label="UI Library components"');
    expect(workspaceSource).toContain("aria-current={entry.id === activeComponent ? 'location' : undefined}");
    expect(workspaceSource).toContain("onNavigate({ workspace: 'ui-library', component: entry.id })");
    expect(workspaceSource).not.toContain('foundationPreviews');
    expect(harnessSource).toContain('aria-label="Shared UI component catalog"');
    expect(harnessSource).toContain("data-catalog-mode={activeComponent === undefined ? 'gallery' : 'single'}");
    expect(harnessSource).toContain('if (activeComponent !== undefined && !active) return null;');
    expect(harnessSource).not.toContain('<main aria-label="Shared UI component catalog"');
    expect(labSource).toContain('<UiLibraryWorkspace');
    expect(labSource).not.toContain('mountUiProfileCatalogHarness');
  });
});
