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
    expect(trigger.classList.contains('fui-MenuButton')).toBe(true);
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await openMenu(trigger);
    let menu = getMenu();
    expect(container.contains(menu)).toBe(true);
    expect(menu.closest('.bt-floating-editor__shortcut-menu-popover')?.parentElement).toBe(
      container.querySelector('.bt-floating-editor__toolbar')
    );
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
    expect(getMenuTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('remeasures workspace style mutations without ResizeObserver and disconnects on cleanup', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const NativeMutationObserver = MutationObserver;
    const workspaceDisconnect = vi.fn();
    class TrackingMutationObserver extends NativeMutationObserver {
      private observesWorkspace = false;

      public observe(target: Node, options?: MutationObserverInit): void {
        this.observesWorkspace = target instanceof Element && target.classList.contains('bt-source-workspace');
        super.observe(target, options);
      }

      public disconnect(): void {
        if (this.observesWorkspace) {
          workspaceDisconnect();
        }
        super.disconnect();
      }
    }
    vi.stubGlobal('MutationObserver', TrackingMutationObserver);
    await renderEditor({
      snippets: [
        { label: 'Web part', snippet: '.better-list {}' },
        { label: 'Header', snippet: '.better-list__header {}' }
      ]
    });

    expect(getMenuTrigger()).not.toBeNull();

    toolbarWidth = 800;
    const workspace = container.querySelector<HTMLElement>('.bt-source-workspace');
    expect(workspace).not.toBeNull();
    act(() => {
      (workspace as HTMLElement).style.width = '800px';
    });
    await settleMutationObserver();

    expect(container.querySelector('button[aria-label="Open SCSS editor shortcuts"]')).toBeNull();

    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    expect(workspaceDisconnect).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  async function renderEditor(
    options: Pick<React.ComponentProps<typeof SourceEditorField>, 'onChange' | 'snippets' | 'targets'>
  ): Promise<void> {
    await act(async () => {
      ReactDom.render(
        React.createElement(
          FluentProvider,
          { theme: webLightTheme },
          React.createElement(
            'div',
            { className: 'bt-source-workspace' },
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
          )
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

async function settleMutationObserver(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await settleMenu();
}
