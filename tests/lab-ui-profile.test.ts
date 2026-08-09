// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLabTheme, type LabWebPart } from '../packages/spfx-lab-runtime/src/index';
import { createSpfxUiHost, SpfxUiHostProvider, type SpfxUiHost } from '../packages/ui-profile/normalized/src/lib/ui-root';
import { PropertyPane } from '../apps/lab/src/components/PropertyPane';
import { createLabUiThemeTokens } from '../apps/lab/src/ui-profile/lab-theme';

const migratedLabFiles = [
  'apps/lab/src/LabApp.tsx',
  'apps/lab/src/components/ColorField.tsx',
  'apps/lab/src/components/PropertyPane.tsx',
  'apps/lab/src/components/PackageRuntimeSurface.tsx',
  'apps/lab/src/components/CdnSmokeCheck.tsx'
];

describe('Lab UI profile slice', () => {
  let mountPoint: HTMLDivElement;
  let portalParent: HTMLDivElement;
  let host: SpfxUiHost;

  beforeEach(() => {
    mountPoint = document.createElement('div');
    portalParent = document.createElement('div');
    document.body.append(mountPoint, portalParent);
    host = createSpfxUiHost({
      mountPoint,
      portalParent,
      targetDocument: document,
      instanceId: 'lab-generic-controls-test',
      profileId: 'spfx-react17-base-nova-v1',
      scopeValue: 'skui-7dbbe5a120453773',
      theme: createLabUiThemeTokens('light', createLabTheme('light'))
    });
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(host.appRoot);
    });
    host.dispose();
    mountPoint.remove();
    portalParent.remove();
  });

  it('keeps direct Fluent imports outside the migrated shell and generic-control files', () => {
    for (const file of migratedLabFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/@fluentui\/react-(?:components|icons)/u);
    }

    const colorSource = readFileSync('apps/lab/src/components/ColorField.tsx', 'utf8');
    expect(colorSource).toContain('export interface ColorFieldProps');
    expect(colorSource).toContain("from '../../../../packages/ui-profile/normalized/src/components/ui/popover'");
    expect(readFileSync('apps/lab/src/components/PropertyPane.tsx', 'utf8')).not.toMatch(
      /LegacyFluentShellIslands[^]*?<ColorField/u
    );
  });

  it('prepares the ignored Base UI compatibility tree before direct Lab dev and build entrypoints', () => {
    const labPackage = JSON.parse(readFileSync('apps/lab/package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(labPackage.scripts['prepare:ui-profile']).toBe('npm --workspace @spfx-kit/ui-profile run profile:prepare:base-ui');
    expect(labPackage.scripts.predev).toBe('npm run prepare:ui-profile');
    expect(labPackage.scripts.prebuild).toBe('npm run prepare:ui-profile');

    const prepareSource = readFileSync('packages/ui-profile/scripts/prepare-base-ui.mjs', 'utf8');
    expect(prepareSource).toContain('acquirePreparationLock(lockRoot)');
    expect(prepareSource).toContain('beginBaseUiPreparationTransaction');
  });

  it('renders generic fields under the owned root and sends select portals to the owned host', async () => {
    const onChange = vi.fn();
    const webPart = {
      title: 'Profile fixture',
      controls: [
        { name: 'title', label: 'Title', type: 'text' },
        {
          name: 'layout',
          label: 'Layout',
          type: 'select',
          options: [
            { label: 'Compact', value: 'compact' },
            { label: 'Comfortable', value: 'comfortable' }
          ]
        }
      ]
    } as unknown as LabWebPart;

    act(() => {
      ReactDom.render(
        React.createElement(
          SpfxUiHostProvider,
          { host },
          React.createElement(PropertyPane, {
            themeMode: 'light',
            webPart,
            values: { title: 'Hello', layout: 'compact' },
            onChange
          })
        ),
        host.appRoot
      );
    });

    const title = host.appRoot.querySelector<HTMLInputElement>('input[aria-label="Title"], input[type="text"]');
    expect(title).not.toBeNull();
    (title as HTMLInputElement).value = 'Updated';
    act(() => Simulate.change(title as HTMLInputElement));
    expect(onChange).toHaveBeenCalledWith({ title: 'Updated' });

    const select = host.appRoot.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="Layout"]');
    expect(select).not.toBeNull();
    await act(async () => {
      Simulate.click(select as HTMLButtonElement);
      await Promise.resolve();
    });

    expect(host.portalHost.querySelector('[role="option"]')).not.toBeNull();
    expect(host.portalHost.querySelector('[data-slot="select-content"]')?.id).toContain('spfx-ui-');
    expect(document.body.querySelectorAll('[data-spfx-ui-portal-host]')).toHaveLength(1);
  });

  it('persists the same string value from pointer and keyboard combobox selection', async () => {
    const options = [
      { label: 'Aptos', value: 'aptos' },
      { label: 'Segoe UI', value: 'segoe-ui' }
    ];
    const webPart = {
      title: 'Combobox fixture',
      controls: [{ name: 'font', label: 'Font', type: 'combobox', options }]
    } as unknown as LabWebPart;
    const render = (onChange: ReturnType<typeof vi.fn>): void => {
      act(() => {
        ReactDom.render(
          React.createElement(
            SpfxUiHostProvider,
            { host },
            React.createElement(PropertyPane, {
              themeMode: 'light',
              webPart,
              values: { font: '' },
              onChange
            })
          ),
          host.appRoot
        );
      });
    };

    const pointerChange = vi.fn();
    render(pointerChange);
    let input = host.appRoot.querySelector<HTMLInputElement>('[role="combobox"][aria-label="Font"]');
    const trigger = host.appRoot.querySelector<HTMLButtonElement>('[data-slot="input-group-button"]');
    expect(input).not.toBeNull();
    expect(trigger).not.toBeNull();
    await act(async () => {
      Simulate.click(trigger as HTMLButtonElement);
      await Promise.resolve();
    });
    const pointerOption = Array.from(host.portalHost.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (option) => option.textContent === 'Aptos'
    );
    expect(pointerOption).toBeDefined();
    await act(async () => {
      Simulate.click(pointerOption as HTMLElement);
      await Promise.resolve();
    });
    expect(pointerChange).toHaveBeenCalledWith({ font: 'aptos' });

    const keyboardChange = vi.fn();
    render(keyboardChange);
    input = host.appRoot.querySelector<HTMLInputElement>('[role="combobox"][aria-label="Font"]');
    await act(async () => {
      Simulate.keyDown(input as HTMLInputElement, { key: 'ArrowDown', code: 'ArrowDown' });
      await Promise.resolve();
    });
    await act(async () => {
      Simulate.keyDown(input as HTMLInputElement, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });
    expect(keyboardChange).toHaveBeenCalledWith({ font: 'aptos' });
    expect(typeof keyboardChange.mock.calls[0][0].font).toBe('string');
  });

  it('applies dark and custom-section tokens to both owned surfaces', () => {
    host.applyTheme(createLabUiThemeTokens('dark', createLabTheme('dark')));
    expect(host.appRoot.getAttribute('data-spfx-ui-theme')).toBe('dark');
    expect(host.portalHost.style.getPropertyValue('--spfx-ui-color-background')).toBe('#2b2b2b');

    host.applyTheme(createLabUiThemeTokens('custom', createLabTheme('custom', '#ddeeff')));
    expect(host.appRoot.getAttribute('data-spfx-ui-theme')).toBe('light');
    expect(host.portalHost.style.getPropertyValue('--spfx-ui-color-foreground')).toBe('#242424');
  });
});
