// @vitest-environment happy-dom

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceEditorField, type SourceEditorMonacoAdapter } from '../packages/source-editor-react/src/SourceEditorField';

describe('SourceEditorField shortcut overflow menu', () => {
  let container: HTMLDivElement;
  let toolbarWidth: number;
  let shortcutWidth: number;
  const unavailableMonaco: SourceEditorMonacoAdapter = {
    load: () => Promise.reject(new Error('Monaco unavailable'))
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.stubGlobal('ResizeObserver', undefined);
    toolbarWidth = 120;
    shortcutWidth = 640;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function getClientWidth() {
      return this.classList.contains('bt-floating-editor__toolbar') ? toolbarWidth : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function getScrollWidth() {
      return this.classList.contains('bt-floating-editor__toolbar-items') ? shortcutWidth : 0;
    });
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses standard menu keyboard navigation, click-away dismissal, and selection behavior', async () => {
    const onChange = vi.fn();
    await renderEditor({
      onChange,
      snippets: [
        { label: 'Web part', snippet: '.better-list {}' },
        { label: 'Header', snippet: '.better-list__header {}' },
        { label: 'Tabs', snippet: '.better-list__tabs {}' }
      ]
    });

    const trigger = getMenuTrigger();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBeNull();

    await openMenu(trigger);
    let menu = getMenu();
    let items = getMenuItems(menu);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items.map((item) => item.textContent)).toEqual(['Web part', 'Header', 'Tabs']);

    items[0].focus();
    pressKey(items[0], 'End');
    expect(document.activeElement).toBe(items[2]);
    pressKey(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
    pressKey(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);

    pressKey(items[1], 'Escape');
    await settleMenu();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await openMenu(trigger);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    act(() => {
      document.body.click();
    });
    await settleMenu();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    await openMenu(trigger);
    menu = getMenu();
    items = getMenuItems(menu);
    act(() => {
      items[0].click();
    });
    await settleMenu();
    expect(onChange).toHaveBeenCalledWith('.better-list {}\n');
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('lets Escape dismiss the menu while an editable shortcut is active', async () => {
    await renderEditor({
      targets: [
        {
          editable: true,
          label: 'Item',
          renameLabel: 'Rename item selector',
          selector: '.better-list__item',
          snippet: '.better-list__item {}'
        }
      ]
    });

    const trigger = getMenuTrigger();
    await openMenu(trigger);
    const editItem = document.body.querySelector<HTMLElement>('[role="menuitem"][aria-label="Rename item selector"]');
    expect(editItem).not.toBeNull();
    act(() => {
      Simulate.click(editItem as HTMLElement);
    });
    await settleMenu();

    const input = document.body.querySelector<HTMLInputElement>(
      'input.bt-floating-editor__target-input--menu[aria-label="Rename item selector"]'
    );
    expect(input).not.toBeNull();
    pressKey(input as HTMLInputElement, 'Escape');
    await settleMenu();

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not reopen an overflow menu after the toolbar expands and collapses again', async () => {
    await renderEditor({
      snippets: [
        { label: 'Web part', snippet: '.better-list {}' },
        { label: 'Header', snippet: '.better-list__header {}' }
      ]
    });

    const trigger = getMenuTrigger();
    await openMenu(trigger);
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    toolbarWidth = 800;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await settleMenu();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    toolbarWidth = 120;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await settleMenu();
    expect(getMenuTrigger().getAttribute('aria-expanded')).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  async function renderEditor(
    options: Pick<React.ComponentProps<typeof SourceEditorField>, 'onChange' | 'snippets' | 'targets'>
  ): Promise<void> {
    await act(async () => {
      ReactDom.render(
        React.createElement(
          FluentProvider,
          { theme: webLightTheme },
          React.createElement(SourceEditorField, {
            config: { monacoAdapter: unavailableMonaco },
            label: 'Custom CSS/SCSS',
            language: 'scss',
            onChange: options.onChange || (() => undefined),
            showShortcuts: true,
            snippets: options.snippets,
            targets: options.targets,
            value: ''
          })
        ),
        container
      );
      await settleMenu();
    });
  }

  function getMenuTrigger(): HTMLButtonElement {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open SCSS editor shortcuts"]');
    expect(trigger).not.toBeNull();
    return trigger as HTMLButtonElement;
  }
});

async function openMenu(trigger: HTMLButtonElement): Promise<void> {
  act(() => {
    Simulate.click(trigger);
  });
  await settleMenu();
}

function getMenu(): HTMLElement {
  const menu = document.body.querySelector<HTMLElement>('[role="menu"][aria-label="SCSS editor shortcuts"]');
  expect(menu).not.toBeNull();
  return menu as HTMLElement;
}

function getMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function pressKey(target: HTMLElement, key: string): void {
  act(() => {
    Simulate.keyDown(target, { key });
  });
}

async function settleMenu(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
