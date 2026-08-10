import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from '@spfx-kit/ui-profile/combobox';
import { SpfxUiHostProvider, createSpfxUiHost, mapSharePointTheme, type SpfxUiHost } from '@spfx-kit/ui-profile';
// @ts-expect-error plain .mjs exact-scale workload fixture without type declarations
import { FONT_OPTIONS } from './font-options.mjs';

interface PublicFontOption {
  id: string;
  label: string;
  value: string;
}

let container: HTMLDivElement;
let mountPoint: HTMLDivElement;
let host: SpfxUiHost;

beforeEach(() => {
  mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  host = createSpfxUiHost({
    mountPoint,
    portalParent: mountPoint,
    targetDocument: document,
    instanceId: 'combobox-workload-root',
    theme: mapSharePointTheme({
      palette: {
        white: '#ffffff',
        neutralPrimary: '#222222',
        neutralSecondary: '#666666',
        neutralLight: '#d8d8d8',
        neutralLighter: '#eeeeee',
        neutralLighterAlt: '#f6f6f6',
        themePrimary: '#0f6cbd',
        themeDarkAlt: '#115ea3',
        themeLighter: '#deecf9',
        redDark: '#a4262c'
      }
    })
  });
  container = host.appRoot as HTMLDivElement;
  if (typeof HTMLElement.prototype.scrollIntoView === 'function') {
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  } else {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
  }
});

afterEach(() => {
  act(() => {
    ReactDom.unmountComponentAtNode(container);
  });
  host.dispose();
  mountPoint.remove();
  vi.restoreAllMocks();
});

it('opens, filters, keyboard-selects, and tears down with all 1,940 synthetic public options', async () => {
  const selected: Array<PublicFontOption | null> = [];
  const options = FONT_OPTIONS as readonly PublicFontOption[];

  act(() => {
    ReactDom.render(
      React.createElement(
        SpfxUiHostProvider,
        { host },
        React.createElement(
          Combobox,
          {
            id: host.idFor('font-combobox-root'),
            items: options,
            itemToStringLabel: (option: PublicFontOption) => option.label,
            itemToStringValue: (option: PublicFontOption) => option.value,
            onValueChange: (option: PublicFontOption | null) => selected.push(option)
          },
          React.createElement(ComboboxInput, {
            'aria-label': 'Public exact-scale font workload',
            showClear: false,
            showTrigger: true
          }),
          React.createElement(
            ComboboxContent,
            { id: host.idFor('font-combobox-content') },
            React.createElement(ComboboxList, null, (option: PublicFontOption, index: number) =>
              React.createElement(ComboboxItem, { index, key: option.id, value: option }, option.label)
            )
          )
        )
      ),
      container
    );
  });

  const input = container.querySelector<HTMLInputElement>('input[aria-label="Public exact-scale font workload"]');
  expect(input).not.toBeNull();
  const trigger = container.querySelector<HTMLButtonElement>('[data-slot="input-group-button"]');
  expect(trigger).not.toBeNull();
  act(() =>
    Simulate.mouseDown(trigger as HTMLButtonElement, {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 1
    })
  );
  await settle();

  expect(host.portalHost.querySelector('[data-slot="combobox-content"]')).not.toBeNull();
  expect(host.portalHost.querySelectorAll('[data-slot="combobox-item"]')).toHaveLength(1_940);

  act(() => {
    (input as HTMLInputElement).value = 'Font Family 1939';
    Simulate.change(
      input as HTMLInputElement,
      {
        nativeEvent: { inputType: 'insertText' }
      } as never
    );
  });
  await settle();
  const visibleItems = Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]:not([hidden])'));
  expect(visibleItems).toHaveLength(1);
  expect(visibleItems[0]?.textContent?.trim()).toBe('Font Family 1939');

  act(() => Simulate.keyDown(input as HTMLInputElement, { key: 'ArrowDown', code: 'ArrowDown' }));
  act(() => Simulate.keyDown(input as HTMLInputElement, { key: 'Enter', code: 'Enter' }));
  await settle();

  expect(selected.at(-1)).toEqual(options[1_938]);
  expect((input as HTMLInputElement).value).toBe('Font Family 1939');
  expect(document.body.querySelector('[data-slot="combobox-content"]')).toBeNull();

  act(() => {
    ReactDom.unmountComponentAtNode(container);
  });
  await settle();
  expect(host.portalHost.querySelector('[data-slot="combobox-content"]')).toBeNull();
  expect(host.portalHost.querySelectorAll('[data-slot="combobox-item"]')).toHaveLength(0);
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}
