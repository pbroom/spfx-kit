// @vitest-environment happy-dom

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceWorkspaceField } from '../packages/source-editor-react/src/SourceWorkspaceField';
import type { SourceEditorMonacoAdapter } from '../packages/source-editor-react/src/SourceEditorField';
import type { SourceEditorDiagnostic } from '../packages/source-editor-react/src/sourceEditorCore';

describe('SourceWorkspaceField', () => {
  let container: HTMLDivElement;
  const unavailableMonaco: SourceEditorMonacoAdapter = {
    load: () => Promise.reject(new Error('Monaco unavailable'))
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('preserves a deferred draft while moving the workspace in and out of its portal', async () => {
    const committedValue = '<article>Committed</article>';
    const deferredDraft = '<article>Deferred';
    const floatingDraft = '<article>Floating draft';
    const onChange = vi.fn();
    const validate = (value: string): SourceEditorDiagnostic[] =>
      value.startsWith('<article>') && !value.endsWith('</article>')
        ? [{ level: 'error', message: 'Close the article element.' }]
        : [];
    const documents = [
      {
        commitMode: 'valid' as const,
        config: { monacoAdapter: unavailableMonaco },
        id: 'html',
        label: 'HTML template',
        language: 'html' as const,
        onChange,
        validate,
        value: committedValue
      }
    ];
    const render = (nextDocuments = documents): void => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          documents: nextDocuments,
          instanceId: 'draft-preservation-workspace',
          label: 'Styles & template'
        }),
        container
      );
    };

    await act(async () => {
      render();
      await settleEditorFallback();
    });
    changeTextarea(getTextarea(container), deferredDraft);
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      render(documents.map((document) => ({ ...document })));
    });
    expect(getTextarea(container).value).toBe(deferredDraft);

    const popOut = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Pop out');
    expect(popOut).toBeDefined();
    act(() => {
      Simulate.click(popOut as HTMLButtonElement);
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Styles & template source workspace"]');
    expect(dialog).not.toBeNull();
    expect(getTextarea(dialog as HTMLElement).value).toBe(deferredDraft);
    expect(getTextarea(container).value).toBe(deferredDraft);
    expect(popOut?.textContent).toBe('Focus pop-out');
    expect(onChange).not.toHaveBeenCalled();

    changeTextarea(getTextarea(dialog as HTMLElement), floatingDraft);
    expect(getTextarea(dialog as HTMLElement).value).toBe(floatingDraft);
    expect(getTextarea(container).value).toBe(floatingDraft);
    expect(onChange).not.toHaveBeenCalled();

    const close = dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close source workspace"]');
    expect(close).not.toBeNull();
    act(() => {
      Simulate.click(close as HTMLButtonElement);
    });

    expect(document.body.querySelector('[role="dialog"][aria-label="Styles & template source workspace"]')).toBeNull();
    expect(getTextarea(container).value).toBe(floatingDraft);
    expect(onChange).not.toHaveBeenCalled();

    const externallyCommittedValue = '<article>Externally committed</article>';
    await act(async () => {
      render([{ ...documents[0], value: externallyCommittedValue }]);
      await Promise.resolve();
    });
    expect(getTextarea(container).value).toBe(externallyCommittedValue);

    act(() => {
      render([]);
    });
    await act(async () => {
      render();
      await settleEditorFallback();
    });
    expect(getTextarea(container).value).toBe(committedValue);
  });

  it('offers split view only in the pop-out and restores an accessible inline document view on close', async () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });
    const documents = [
      {
        config: { monacoAdapter: unavailableMonaco },
        id: 'scss',
        label: 'CSS/SCSS',
        language: 'scss' as const,
        onChange: () => undefined,
        value: '.better-list {}'
      },
      {
        config: { monacoAdapter: unavailableMonaco },
        id: 'html',
        label: 'HTML template',
        language: 'html' as const,
        onChange: () => undefined,
        value: '<template data-bl-fragment="item"></template>'
      }
    ];

    await act(async () => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          defaultView: 'split',
          documents,
          instanceId: 'split-view-workspace',
          label: 'Styles & template'
        }),
        container
      );
      await settleEditorFallback();
    });

    const inlineTablist = container.querySelector<HTMLElement>('[role="tablist"]');
    expect(inlineTablist).not.toBeNull();
    expect(inlineTablist?.querySelector('[aria-label="Split"]')).toBeNull();
    expect(inlineTablist?.querySelector('[aria-selected="true"]')?.textContent).toContain('CSS/SCSS');
    expect(container.querySelector('.bt-source-workspace__body--split')).toBeNull();
    expect(container.querySelector<HTMLElement>('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      inlineTablist?.querySelector<HTMLElement>('[aria-selected="true"]')?.id
    );
    expect(getWorkspacePanes(container).map((pane) => pane.hidden)).toEqual([false, true]);

    const popOut = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Pop out');
    expect(popOut).toBeDefined();
    act(() => {
      Simulate.click(popOut as HTMLButtonElement);
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Styles & template source workspace"]');
    expect(dialog).not.toBeNull();
    const portalHost = dialog?.closest<HTMLElement>('[data-spfx-ui-portal-host]');
    expect(portalHost).not.toBeNull();
    expect(portalHost?.ownerDocument).toBe(document);
    const floatingSplit = dialog?.querySelector<HTMLButtonElement>('[role="tab"][aria-label="Split"]');
    expect(floatingSplit).not.toBeNull();
    expect(floatingSplit?.querySelector('svg[data-icon="inline-start"]')).not.toBeNull();
    expect(floatingSplit?.getAttribute('aria-selected')).toBe('true');
    expect(floatingSplit?.tabIndex).toBe(0);
    expect(dialog?.querySelector('.bt-source-workspace__body--split')).not.toBeNull();
    expect(dialog?.querySelector<HTMLElement>('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(floatingSplit?.id);
    expect(getWorkspacePanes(dialog as HTMLElement).map((pane) => pane.hidden)).toEqual([false, false]);

    const close = dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close source workspace"]');
    expect(close).not.toBeNull();
    act(() => {
      Simulate.click(close as HTMLButtonElement);
    });

    expect(document.body.querySelector('[role="dialog"][aria-label="Styles & template source workspace"]')).toBeNull();
    expect(container.querySelector('.bt-source-workspace__body--split')).toBeNull();
    expect(inlineTablist?.querySelector('[aria-selected="true"]')?.textContent).toContain('CSS/SCSS');
    expect(getWorkspacePanes(container).map((pane) => pane.hidden)).toEqual([false, true]);
    expect(document.activeElement).toBe(popOut);
    requestAnimationFrame.mockRestore();
  });

  it('owns its root, theme, IDs, and floating portal in the requested document', async () => {
    const portalParent = document.createElement('div');
    document.body.appendChild(portalParent);
    const documents = [
      {
        config: { monacoAdapter: unavailableMonaco },
        id: 'scss',
        label: 'CSS/SCSS',
        language: 'scss' as const,
        onChange: () => undefined,
        value: '.better-list {}'
      },
      {
        config: { monacoAdapter: unavailableMonaco },
        id: 'html',
        label: 'HTML template',
        language: 'html' as const,
        onChange: () => undefined,
        value: '<template></template>'
      }
    ];

    await act(async () => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          documents,
          instanceId: 'owned-workspace',
          label: 'Owned workspace',
          portalParent,
          targetDocument: document
        }),
        container
      );
      await settleEditorFallback();
    });

    const hostRoot = container.querySelector<HTMLElement>('[data-spfx-ui-root]');
    expect(hostRoot).not.toBeNull();
    expect(hostRoot?.getAttribute('data-spfx-ui-profile')).toBe('source-editor-react17-base-nova-v1');
    expect(hostRoot?.getAttribute('data-spfx-ui-scope')).toBe('skui-d0cb51634265e868');
    const inlineTab = hostRoot?.querySelector<HTMLElement>('[role="tab"]');
    const inlinePanel = hostRoot?.querySelector<HTMLElement>('[role="tabpanel"]');
    expect(inlineTab?.id).toContain('spfx-ui-');
    expect(inlineTab?.getAttribute('aria-controls')).toBe(inlinePanel?.id);
    expect(inlinePanel?.getAttribute('aria-labelledby')).toBe(inlineTab?.id);

    const popOut = Array.from(hostRoot?.querySelectorAll('button') || []).find((button) => button.textContent === 'Pop out');
    act(() => {
      Simulate.click(popOut as HTMLButtonElement);
    });

    const portalHost = portalParent.querySelector<HTMLElement>('[data-spfx-ui-portal-host]');
    const dialog = portalHost?.querySelector<HTMLElement>('[role="dialog"]');
    expect(portalHost).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(dialog?.ownerDocument).toBe(document);
    expect(dialog?.querySelector('[role="tab"]')?.getAttribute('aria-controls')).toBe(
      dialog?.querySelector('[role="tabpanel"]')?.id
    );

    const firstMountIds = Array.from(
      container.querySelectorAll<HTMLElement>('[role="tab"], [role="tabpanel"]'),
      (element) => element.id
    );
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    expect(portalParent.querySelector('[data-spfx-ui-portal-host]')).toBeNull();

    await act(async () => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          documents,
          instanceId: 'owned-workspace',
          label: 'Owned workspace',
          portalParent,
          targetDocument: document
        }),
        container
      );
      await settleEditorFallback();
    });
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('[role="tab"], [role="tabpanel"]'), (element) => element.id)
    ).toEqual(firstMountIds);

    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    await act(async () => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          documents,
          instanceId: 'independent-bundle-workspace',
          label: 'Owned workspace',
          portalParent,
          targetDocument: document
        }),
        secondContainer
      );
      await settleEditorFallback();
    });
    const firstBundleTabId = container.querySelector<HTMLElement>('[role="tab"]')?.id;
    const secondBundleTabId = secondContainer.querySelector<HTMLElement>('[role="tab"]')?.id;
    expect(firstBundleTabId).toBeTruthy();
    expect(secondBundleTabId).toBeTruthy();
    expect(secondBundleTabId).not.toBe(firstBundleTabId);
    act(() => {
      ReactDom.unmountComponentAtNode(secondContainer);
    });
    secondContainer.remove();
    portalParent.remove();
  });

  it('sizes, constrains, drags, and resizes against the owner window viewport', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const ownerDocument = frame.contentDocument;
    const ownerWindow = frame.contentWindow;
    expect(ownerDocument).not.toBeNull();
    expect(ownerWindow).not.toBeNull();
    Object.defineProperty(ownerWindow, 'innerWidth', { configurable: true, value: 640 });
    Object.defineProperty(ownerWindow, 'innerHeight', { configurable: true, value: 480 });
    const ownerContainer = ownerDocument!.createElement('div');
    const portalParent = ownerDocument!.createElement('div');
    ownerDocument!.body.append(ownerContainer, portalParent);

    await act(async () => {
      ReactDom.render(
        React.createElement(SourceWorkspaceField, {
          documents: [
            {
              config: { monacoAdapter: unavailableMonaco },
              id: 'scss',
              label: 'CSS/SCSS',
              language: 'scss',
              onChange: () => undefined,
              value: '.better-list {}'
            }
          ],
          instanceId: 'owner-window-geometry',
          label: 'Owner geometry',
          portalParent,
          targetDocument: ownerDocument!
        }),
        ownerContainer
      );
      await settleEditorFallback();
    });
    const popOut = Array.from(ownerContainer.querySelectorAll('button')).find((button) => button.textContent === 'Pop out');
    act(() => {
      Simulate.click(popOut as HTMLButtonElement);
    });
    const dialog = portalParent.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.style.width).toBe('576px');
    expect(dialog?.style.height).toBe('384px');

    const titlebar = dialog?.querySelector<HTMLElement>('.bt-source-workspace__titlebar');
    act(() => {
      Simulate.pointerDown(titlebar as HTMLElement, { button: 0, clientX: 32, clientY: 48 });
    });
    act(() => {
      ownerWindow!.dispatchEvent(new ownerWindow!.PointerEvent('pointermove', { clientX: 1000, clientY: 1000 }));
    });
    expect(dialog?.style.left).toBe('56px');
    expect(dialog?.style.top).toBe('88px');

    const resizeHandle = dialog?.querySelector<HTMLElement>('.bt-floating-editor__resize-zone--se');
    act(() => {
      Simulate.pointerDown(resizeHandle as HTMLElement, { button: 0, clientX: 0, clientY: 0 });
    });
    act(() => {
      ownerWindow!.dispatchEvent(new ownerWindow!.PointerEvent('pointermove', { clientX: 1000, clientY: 1000 }));
    });
    expect(dialog?.style.width).toBe('624px');
    expect(dialog?.style.height).toBe('464px');

    act(() => {
      ReactDom.unmountComponentAtNode(ownerContainer);
    });
    frame.remove();
  });
});

function getTextarea(root: ParentNode): HTMLTextAreaElement {
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea.bt-css-editor__textarea');
  expect(textarea).not.toBeNull();
  return textarea as HTMLTextAreaElement;
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  act(() => {
    textarea.value = value;
    Simulate.change(textarea);
  });
}

function getWorkspacePanes(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.bt-source-workspace__pane'));
}

async function settleEditorFallback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
