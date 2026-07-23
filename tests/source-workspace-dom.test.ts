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
    expect(container.querySelector<HTMLElement>('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toContain(
      '-inline-scss-tab'
    );
    expect(getWorkspacePanes(container).map((pane) => pane.hidden)).toEqual([false, true]);

    const popOut = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Pop out');
    expect(popOut).toBeDefined();
    act(() => {
      Simulate.click(popOut as HTMLButtonElement);
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Styles & template source workspace"]');
    expect(dialog).not.toBeNull();
    const floatingSplit = dialog?.querySelector<HTMLButtonElement>('[role="tab"][aria-label="Split"]');
    expect(floatingSplit).not.toBeNull();
    expect(floatingSplit?.getAttribute('aria-selected')).toBe('true');
    expect(floatingSplit?.tabIndex).toBe(0);
    expect(dialog?.querySelector('.bt-source-workspace__body--split')).not.toBeNull();
    expect(dialog?.querySelector<HTMLElement>('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toContain(
      '-floating-split-tab'
    );
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
