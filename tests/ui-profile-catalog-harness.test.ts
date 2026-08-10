import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const harnessPath = 'apps/lab/src/components/UiProfileCatalogHarness.tsx';
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
    const samples = [...source.matchAll(/<CatalogSample component="([a-z0-9-]+)"/gu)].map((match) => match[1]);

    expect(samples).toHaveLength(57);
    expect(new Set(samples).size).toBe(samples.length);
    expect([...samples].sort()).toEqual([...catalogSubpaths].sort());
    expect(source).toContain('data-ui-profile-catalog="base-nova"');
  });

  it('keeps official component visuals and scoped host ownership intact', () => {
    const source = readFileSync(harnessPath, 'utf8');

    expect(source).not.toContain('className=');
    expect(source).not.toMatch(/(?:id|aria-controls|aria-describedby|aria-labelledby)="catalog:/u);
    expect(source).toContain("useSpfxUiId('catalog:toast-portal')");
    expect(source).toContain('<ToastPortal id={toastPortalId}>');
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
});
