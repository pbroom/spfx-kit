import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  uiProfileCatalogDocumentation,
  uiProfileCatalogEntries,
  uiProfileCatalogImportPath,
  uiProfileCatalogPageSections
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

    const sectionIds = uiProfileCatalogEntries.flatMap((entry) =>
      uiProfileCatalogPageSections(entry.id).flatMap((section) => [
        section.id,
        ...(section.children?.map((child) => child.id) ?? [])
      ])
    );
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    for (const entry of uiProfileCatalogEntries) {
      const sections = uiProfileCatalogPageSections(entry.id);
      expect(sections[0]).toMatchObject({ kind: 'examples' });
      expect(sections[1]).toMatchObject({ kind: 'usage' });
      expect(sections.every((section) => section.id.startsWith(`ui-library-${entry.id}-`))).toBe(true);
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
      expect(example.code).toContain('@spfx-kit/ui-profile/');
      expect(example.code).not.toMatch(/installation|React Aria|Radix/iu);
    }

    const harnessSource = readFileSync(harnessPath, 'utf8');
    const breadcrumbSource = harnessSource.slice(
      harnessSource.indexOf('function BreadcrumbDocumentationExamples'),
      harnessSource.indexOf('interface AccordionDocumentationExamplesProps')
    );
    const liveExampleIds = [...breadcrumbSource.matchAll(/<CatalogDocumentationExample id="([a-z0-9-]+)"/gu)].map(
      (match) => match[1]
    );
    expect(liveExampleIds).toEqual(breadcrumb.examples?.map((example) => example.id));
    expect(harnessSource).toContain("useSpfxUiId('catalog:breadcrumb-dropdown-content')");
    expect(harnessSource).toContain("useSpfxUiId('catalog:breadcrumb-responsive-content')");
    expect(harnessSource).toContain('uiProfileCatalogExampleSectionId(activeComponent, id)');
    expect(harnessSource).toContain('aria-label={`${title} example view`}');
  });

  it('uses Accordion as the complete Base UI disclosure documentation contract', () => {
    const accordion = uiProfileCatalogDocumentation.accordion;

    expect(accordion.examples?.map((example) => example.id)).toEqual([
      'primary',
      'basic',
      'multiple',
      'disabled',
      'borders',
      'card',
      'rtl'
    ]);
    expect(accordion.api?.map((part) => part.name)).toEqual([
      'Accordion',
      'AccordionItem',
      'AccordionTrigger',
      'AccordionContent'
    ]);
    expect(accordion.composition).toHaveLength(4);
    for (const example of accordion.examples ?? []) {
      expect(example.code).toContain('@spfx-kit/ui-profile/accordion');
      expect(example.code).not.toMatch(/installation|React Aria|Radix/iu);
    }

    const harnessSource = readFileSync(harnessPath, 'utf8');
    const accordionSource = harnessSource.slice(
      harnessSource.indexOf('function AccordionDocumentationExamples'),
      harnessSource.indexOf('function ButtonDocumentationExamples')
    );
    const liveExampleIds = [...accordionSource.matchAll(/<CatalogDocumentationExample id="([a-z0-9-]+)"/gu)].map(
      (match) => match[1]
    );
    expect(liveExampleIds).toEqual(accordion.examples?.map((example) => example.id));
    expect(accordionSource).toContain('useSpfxUiDerivedId(baseId');
    expect(accordionSource).toContain("defaultValue={['notifications', 'privacy']} multiple");
    expect(accordionSource).toContain('<DirectionProvider direction="rtl">');
  });

  it('documents the complete Button, Button Group, and Spinner family contracts', () => {
    const harnessSource = readFileSync(harnessPath, 'utf8');
    const expectations = {
      button: [
        'sizes',
        'default',
        'outline',
        'secondary',
        'ghost',
        'destructive',
        'link',
        'icon',
        'with-icon',
        'rounded',
        'spinner',
        'button-group',
        'as-link',
        'rtl'
      ],
      'button-group': [
        'basic',
        'orientation',
        'sizes',
        'nested',
        'separator',
        'split',
        'input',
        'input-group',
        'dropdown-menu',
        'select',
        'popover',
        'rtl'
      ],
      spinner: ['basic', 'sizes', 'button', 'badge', 'input-group', 'empty', 'rtl']
    } as const;
    const functionBounds = {
      button: ['function ButtonDocumentationExamples', 'interface ButtonGroupDocumentationExamplesProps'],
      'button-group': ['function ButtonGroupDocumentationExamples', 'function SpinnerDocumentationExamples'],
      spinner: ['function SpinnerDocumentationExamples', 'function CatalogStatusIcon']
    } as const;

    for (const [component, expectedIds] of Object.entries(expectations)) {
      const documentation = uiProfileCatalogDocumentation[component as keyof typeof expectations];
      expect(documentation.examples?.map((example) => example.id)).toEqual(expectedIds);
      expect(documentation.composition?.length).toBeGreaterThanOrEqual(4);
      expect(documentation.api?.length).toBeGreaterThan(0);
      for (const example of documentation.examples ?? []) {
        expect(example.code).toContain('@spfx-kit/ui-profile/');
        expect(example.code).not.toMatch(/installation|React Aria|Radix/iu);
      }

      const [startMarker, endMarker] = functionBounds[component as keyof typeof functionBounds];
      const functionSource = harnessSource.slice(harnessSource.indexOf(startMarker), harnessSource.indexOf(endMarker));
      const liveIds = [...functionSource.matchAll(/id="([a-z0-9-]+)" title=/gu)].map((match) => match[1]);
      expect(liveIds).toEqual(expectedIds);
    }

    expect(harnessSource).toContain("className={buttonVariants({ variant: 'outline' })}");
    expect(harnessSource).toContain('aria-controls={selectContentId}');
    expect(harnessSource).toContain('aria-controls={popoverContentId}');
    expect(harnessSource).toContain('aria-controls={dropdownContentId}');
  });

  it('documents the complete Alert, Badge, and Progress feedback family contracts', () => {
    const harnessSource = readFileSync(harnessPath, 'utf8');
    const expectations = {
      alert: ['basic', 'destructive', 'action', 'rtl'],
      badge: ['variants', 'with-icon', 'with-spinner', 'link', 'rtl'],
      progress: ['basic', 'label', 'controlled', 'rtl']
    } as const;
    const apiParts = {
      alert: ['Alert', 'AlertTitle', 'AlertDescription', 'AlertAction'],
      badge: ['Badge'],
      progress: ['Progress', 'ProgressTrack', 'ProgressIndicator', 'ProgressValue', 'ProgressLabel']
    } as const;
    const functionBounds = {
      alert: ['function AlertDocumentationExamples', 'function BadgeDocumentationExamples'],
      badge: ['function BadgeDocumentationExamples', 'interface ProgressDocumentationExamplesProps'],
      progress: ['function ProgressDocumentationExamples', '/** A browser-smoke gallery']
    } as const;

    for (const [component, expectedIds] of Object.entries(expectations)) {
      const documentation = uiProfileCatalogDocumentation[component as keyof typeof expectations];
      expect(documentation.examples?.map((example) => example.id)).toEqual(expectedIds);
      expect(documentation.composition?.length).toBeGreaterThanOrEqual(4);
      expect(documentation.api?.map((part) => part.name)).toEqual(apiParts[component as keyof typeof apiParts]);
      for (const example of documentation.examples ?? []) {
        expect(example.code).toContain('@spfx-kit/ui-profile/');
        expect(example.code).not.toMatch(/installation|React Aria|Radix/iu);
      }

      const [startMarker, endMarker] = functionBounds[component as keyof typeof functionBounds];
      const functionSource = harnessSource.slice(harnessSource.indexOf(startMarker), harnessSource.indexOf(endMarker));
      const liveIds = [...functionSource.matchAll(/id="([a-z0-9-]+)" title=/gu)].map((match) => match[1]);
      expect(liveIds).toEqual(expectedIds);
    }

    expect(harnessSource).toContain('<Badge render={<a href="#catalog-release" />}>');
    expect(harnessSource).toContain('<Spinner aria-hidden="true" data-icon="inline-start" />');
    expect(harnessSource).toContain("useSpfxUiId('catalog:progress-controlled')");
    expect(harnessSource).toContain("useSpfxUiId('catalog:progress-labelled')");
    expect(harnessSource).toContain("useSpfxUiId('catalog:progress-rtl')");
  });

  it('keeps official component visuals and scoped host ownership intact', () => {
    const source = readFileSync(harnessPath, 'utf8');

    expect(source).not.toMatch(/className="(?:bg|text|border|shadow)-/u);
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
    expect(workspaceSource).toContain(
      '<UiProfileCatalogHarness activeComponent={activeComponent} activeExample={activeExample} />'
    );
    expect(workspaceSource).toContain('example.id === route.example');
    expect(workspaceSource).toContain('data-ui-library-active-example={activeExample}');
    expect(workspaceSource).toContain('const includedComponentCount = uiProfileCatalogEntries.length');
    expect(workspaceSource).toContain('aria-label="UI Library components"');
    expect(workspaceSource).toContain("aria-current={entry.id === activeComponent ? 'location' : undefined}");
    expect(workspaceSource).toContain("onNavigate({ workspace: 'ui-library', component: entry.id })");
    expect(workspaceSource).not.toContain('foundationPreviews');
    expect(harnessSource).toContain('aria-label="Shared UI component catalog"');
    expect(harnessSource).toContain("data-catalog-mode={activeComponent === undefined ? 'gallery' : 'single'}");
    expect(harnessSource).toContain('if (activeComponent !== undefined && !active) return null;');
    expect(harnessSource).toContain('data-catalog-example-active={selected');
    expect(harnessSource).toContain('<ActiveCatalogExampleContext.Provider value={activeExample}>');
    expect(harnessSource).not.toContain('<main aria-label="Shared UI component catalog"');
    expect(labSource).toContain('<UiLibraryWorkspace');
    expect(labSource).not.toContain('mountUiProfileCatalogHarness');
  });
});
