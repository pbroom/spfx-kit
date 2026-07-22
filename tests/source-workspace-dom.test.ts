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

async function settleEditorFallback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
