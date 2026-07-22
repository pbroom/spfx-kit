import * as React from 'react';
import { getSourceDiagnostics, shouldCommitSource } from '@spfx-kit/source-editor-core';
import type { SourceEditorDiagnostic } from '@spfx-kit/source-editor-core';

export type { SourceEditorDiagnostic } from '@spfx-kit/source-editor-core';

export interface SourceEditorProps {
  label: string;
  value: string;
  language: 'scss' | 'html';
  description?: string;
  placeholder?: string;
  height?: number;
  minHeight?: number;
  monacoBaseUrl?: string;
  monacoAdapter?: SourceEditorMonacoAdapter;
  targets?: CssEditorTarget[];
  targetComment?: string;
  maxBytes?: number;
  commitMode?: 'immediate' | 'valid';
  validate?: (value: string) => SourceEditorDiagnostic[];
  snippets?: SourceEditorSnippet[];
  embedded?: boolean;
  fillHeight?: boolean;
  showShortcuts?: boolean;
  onChange: (value: string) => void;
  onTargetRename?: (target: CssEditorTarget, nextSelector: string, nextValue: string) => void;
}

export interface SourceEditorMonacoAdapter {
  load: (baseUrl: string) => Promise<React.ComponentType<any>>;
}

export interface SourceEditorSnippet {
  label: string;
  snippet: string;
  searchText?: string;
}

// Keep in sync with the monaco-editor version pinned in apps/lab/package.json.
const defaultMonacoBaseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs';
let configuredMonacoBaseUrl = '';
let nextSourceEditorInstanceId = 0;
const configuredCssIntellisense = new WeakSet<object>();
const cssEditorTargetsByModel = new WeakMap<object, React.MutableRefObject<readonly CssEditorTarget[]>>();
export const sourceEditorAcceptSuggestionOnEnter = 'on' as const;
// Newlines stay excluded so completion does not reopen after every authored line break.
export const sourceEditorCompletionTriggerCharacters = ['.', ':', '-', '#', ' '] as const;
export const sourceEditorTabCompletion = 'on' as const;
const labMonacoAdapter: SourceEditorMonacoAdapter = {
  async load(_baseUrl) {
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Monaco's ESM core-feature entrypoint is runtime-only and has no declaration file.
      'monaco-editor/esm/vs/editor/edcore.main.js'
    );
    const [monacoReact, monaco] = await Promise.all([
      import('@monaco-editor/react'),
      import('monaco-editor/esm/vs/editor/editor.api')
    ]);
    await Promise.all([
      import('monaco-editor/esm/vs/basic-languages/css/css.contribution'),
      import('monaco-editor/esm/vs/basic-languages/html/html.contribution'),
      import('monaco-editor/esm/vs/basic-languages/scss/scss.contribution'),
      import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution')
    ]);
    configureMonacoLoader(monacoReact.loader, monaco);
    return monacoReact.default;
  }
};
const floatingResizeZones: Array<{ direction: ResizeDirection; label: string }> = [
  { direction: 'n', label: 'Resize floating editor from top edge' },
  { direction: 's', label: 'Resize floating editor from bottom edge' },
  { direction: 'w', label: 'Resize floating editor from left edge' },
  { direction: 'e', label: 'Resize floating editor from right edge' },
  { direction: 'nw', label: 'Resize floating editor from top left' },
  { direction: 'ne', label: 'Resize floating editor from top right' },
  { direction: 'sw', label: 'Resize floating editor from bottom left' },
  { direction: 'se', label: 'Resize floating editor from bottom right' }
];
const minFloatingWidth = 360;
const minFloatingHeight = 260;

export function SourceEditor(props: SourceEditorProps): JSX.Element {
  const minHeight = props.height || props.minHeight || 180;
  const monacoBaseUrl = normalizeBaseUrl(props.monacoBaseUrl || defaultMonacoBaseUrl);
  const monacoAdapter = props.monacoAdapter || labMonacoAdapter;
  const sourceEditorInstanceIdRef = React.useRef(0);
  if (sourceEditorInstanceIdRef.current === 0) {
    sourceEditorInstanceIdRef.current = ++nextSourceEditorInstanceId;
  }
  const editorPath = pathForLabel(props.label, props.language, sourceEditorInstanceIdRef.current);
  const [draft, setDraft] = React.useState(props.value);
  const [editorReady, setEditorReady] = React.useState(false);
  const [floatingEditorReady, setFloatingEditorReady] = React.useState(false);
  const [floatingOpen, setFloatingOpen] = React.useState(false);
  const [floatingRect, setFloatingRect] = React.useState<FloatingRect>(() => createInitialFloatingRect());
  const [pointerState, setPointerState] = React.useState<PointerInteraction | null>(null);
  const [editingTarget, setEditingTarget] = React.useState<{ selector: string; value: string } | null>(null);
  const floatingPanelRef = React.useRef<HTMLDivElement | null>(null);
  const inlineEditorRef = React.useRef<any>(null);
  const floatingEditorRef = React.useRef<any>(null);
  const cssEditorTargets = props.language === 'scss' ? props.targets || [] : [];
  const cssEditorTargetsRef = React.useRef<readonly CssEditorTarget[]>(cssEditorTargets);
  cssEditorTargetsRef.current = cssEditorTargets;
  const cssTargetComment = props.targetComment || '';
  const sourceEditorSnippets = props.snippets || [];
  const { commitMode, maxBytes, onChange, validate } = props;
  const closeShortcutLabel = React.useMemo(() => getCloseShortcutLabel(), []);
  const diagnostics = React.useMemo(() => getSourceDiagnostics(draft, maxBytes, validate), [draft, maxBytes, validate]);

  React.useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  const updateValue = React.useCallback(
    (nextValue: string): void => {
      setDraft(nextValue);
      const nextDiagnostics = getSourceDiagnostics(nextValue, maxBytes, validate);
      if (shouldCommitSource(commitMode, nextDiagnostics)) {
        onChange(nextValue);
      }
    },
    [commitMode, maxBytes, onChange, validate]
  );

  const closeFloatingEditor = React.useCallback((): void => {
    floatingEditorRef.current = null;
    setFloatingEditorReady(false);
    setFloatingOpen(false);
  }, []);

  React.useEffect(() => {
    if (!floatingOpen) {
      return undefined;
    }

    const closeOnShortcut = (event: KeyboardEvent): void => {
      if (!isCloseShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeFloatingEditor();
    };

    window.addEventListener('keydown', closeOnShortcut, true);
    return () => window.removeEventListener('keydown', closeOnShortcut, true);
  }, [closeFloatingEditor, floatingOpen]);

  React.useEffect(() => {
    if (!pointerState) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      event.preventDefault();
      const deltaX = event.clientX - pointerState.startX;
      const deltaY = event.clientY - pointerState.startY;

      if (pointerState.mode === 'drag') {
        setFloatingRect(
          constrainFloatingRect({
            ...pointerState.startRect,
            left: pointerState.startRect.left + deltaX,
            top: pointerState.startRect.top + deltaY
          })
        );
        return;
      }

      setFloatingRect(resizeFloatingRect(pointerState.startRect, deltaX, deltaY, pointerState.direction || 'se'));
    };

    const stopPointerInteraction = (): void => setPointerState(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPointerInteraction, { once: true });
    window.addEventListener('pointercancel', stopPointerInteraction, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopPointerInteraction);
      window.removeEventListener('pointercancel', stopPointerInteraction);
    };
  }, [pointerState]);

  const openFloatingEditor = (): void => {
    setFloatingRect((current) => constrainFloatingRect(current));
    setFloatingOpen(true);
  };

  const toggleFloatingEditor = (): void => {
    if (floatingOpen) {
      closeFloatingEditor();
      return;
    }

    openFloatingEditor();
  };

  const handleFloatingKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!isCloseShortcut(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeFloatingEditor();
  };

  const startFloatingMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setPointerState(createPointerInteraction('drag', event, floatingPanelRef.current, floatingRect));
  };

  const startFloatingResize = (event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPointerState(createPointerInteraction('resize', event, floatingPanelRef.current, floatingRect, direction));
  };

  const applyTarget = (target: CssEditorTarget): void => {
    setEditingTarget(null);
    const editor = floatingEditorRef.current || inlineEditorRef.current;
    const currentValue = editor?.getValue?.() || draft || '';
    const existingLine = findCssTargetLine(currentValue, target.selector);

    if (existingLine) {
      revealCssTarget(editor, existingLine, target.selector);
      return;
    }

    insertCssTarget(editor, currentValue, target, cssTargetComment, updateValue);
  };

  const startTargetEdit = (target: CssEditorTarget): void => {
    setEditingTarget({ selector: target.selector, value: target.selector });
  };

  const applySnippet = (snippet: SourceEditorSnippet): void => {
    const editor = floatingEditorRef.current || inlineEditorRef.current;
    const currentValue = editor?.getValue?.() || draft || '';
    const searchText = snippet.searchText || snippet.snippet;
    const existingIndex = currentValue.indexOf(searchText);
    if (existingIndex >= 0 && editor) {
      const model = editor.getModel?.();
      const start = model?.getPositionAt?.(existingIndex);
      const end = model?.getPositionAt?.(existingIndex + searchText.length);
      if (start && end) {
        editor.setSelection?.({
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        });
        editor.revealLineInCenter?.(start.lineNumber);
        editor.focus?.();
        return;
      }
    }

    const separator = currentValue.trim() ? '\n\n' : '';
    const nextValue = `${currentValue.trimEnd()}${separator}${snippet.snippet}\n`;
    updateValue(nextValue);
    editor?.setValue?.(nextValue);
    editor?.focus?.();
  };

  const commitTargetEdit = (target: CssEditorTarget, value: string): void => {
    const nextSelector = normalizeEditableTargetSelector(value, target.selector);
    setEditingTarget(null);

    if (nextSelector === target.selector) {
      return;
    }

    const editor = floatingEditorRef.current || inlineEditorRef.current;
    const currentValue = editor?.getValue?.() || draft || '';
    const rename = evaluateSourceTargetRename(currentValue, target.selector, nextSelector, commitMode, maxBytes, validate);
    if (!rename.shouldCommit) {
      return;
    }
    setDraft(rename.value);

    if (props.onTargetRename) {
      props.onTargetRename(target, nextSelector, rename.value);
      return;
    }

    onChange(rename.value);
  };

  return (
    <div
      className={`css-editor-field ${props.embedded ? 'css-editor-field--embedded' : ''} ${
        props.fillHeight ? 'css-editor-field--fill' : ''
      }`}
    >
      {!props.embedded && (
        <div className="css-editor-field__header">
          <label className="css-editor-field__label">{props.label}</label>
          <button aria-expanded={floatingOpen} className="css-editor-field__popout" type="button" onClick={toggleFloatingEditor}>
            Pop out
          </button>
        </div>
      )}
      {props.description && !(props.embedded && props.showShortcuts) ? (
        <p className="css-editor-field__description">{props.description}</p>
      ) : null}
      {props.embedded && props.showShortcuts && (
        <SourceEditorShortcutToolbar
          ariaLabel={`${props.language.toUpperCase()} editor shortcuts`}
          editingTarget={editingTarget}
          snippets={sourceEditorSnippets}
          targets={cssEditorTargets}
          onApplySnippet={applySnippet}
          onApplyTarget={applyTarget}
          onCommitTarget={commitTargetEdit}
          onEditTarget={startTargetEdit}
          onEditingTargetChange={setEditingTarget}
        />
      )}
      <div
        className="css-editor-field__frame"
        style={{
          height: props.fillHeight ? '100%' : minHeight,
          minHeight: props.fillHeight ? 0 : minHeight
        }}
      >
        {(!monacoBaseUrl || !editorReady) && (
          <FallbackSourceEditor
            label={props.label}
            language={props.language}
            placeholder={props.placeholder}
            value={draft}
            onChange={updateValue}
          />
        )}
        {monacoBaseUrl && (
          <div className={`css-editor-field__monaco ${editorReady ? 'css-editor-field__monaco--ready' : ''}`}>
            <MonacoSurface
              adapter={monacoAdapter}
              baseUrl={monacoBaseUrl}
              height={props.fillHeight ? '100%' : `${minHeight}px`}
              language={props.language}
              path={editorPath}
              theme="vs-dark"
              value={draft}
              beforeMount={(monaco: any) => configureSourceEditorMonaco(monaco, props.language)}
              onMount={(editor: any) => {
                inlineEditorRef.current = editor;
                handleSourceEditorMount(editor, cssEditorTargetsRef, () => setEditorReady(true));
              }}
              onChange={(value: string | undefined) => updateValue(value || '')}
              options={{
                acceptSuggestionOnEnter: sourceEditorAcceptSuggestionOnEnter,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                automaticLayout: true,
                colorDecorators: true,
                fixedOverflowWidgets: true,
                fontFamily: 'Menlo, Consolas, "Courier New", monospace',
                fontSize: 12,
                folding: Boolean(props.fillHeight),
                glyphMargin: false,
                lineDecorationsWidth: 8,
                lineHeight: 18,
                lineNumbers: props.fillHeight ? 'on' : 'off',
                minimap: { enabled: Boolean(props.fillHeight) },
                quickSuggestions: { other: true, comments: false, strings: true },
                scrollBeyondLastLine: false,
                snippetSuggestions: 'top',
                showFoldingControls: props.fillHeight ? 'always' : 'never',
                suggestOnTriggerCharacters: true,
                tabCompletion: sourceEditorTabCompletion,
                tabSize: 2,
                wordBasedSuggestions: 'off',
                wordWrap: 'on',
                ...(props.placeholder ? { placeholder: props.placeholder } : {})
              }}
            />
          </div>
        )}
      </div>
      {diagnostics.length > 0 && (
        <div className="css-editor-field__diagnostics" aria-live="polite">
          {diagnostics.map((diagnostic, index) => (
            <p
              className={`css-editor-field__diagnostic css-editor-field__diagnostic--${diagnostic.level}`}
              key={`${diagnostic.level}-${index}`}
            >
              {diagnostic.message}
            </p>
          ))}
        </div>
      )}
      {!props.embedded && floatingOpen && (
        <div
          aria-label={`${props.label} floating editor`}
          aria-modal="false"
          className={`css-floating-editor ${pointerState?.mode === 'resize' ? 'css-floating-editor--resizing' : ''}`}
          ref={floatingPanelRef}
          role="dialog"
          onKeyDown={handleFloatingKeyDown}
          style={{
            height: floatingRect.height,
            left: floatingRect.left,
            top: floatingRect.top,
            width: floatingRect.width
          }}
        >
          <div className="css-floating-editor__titlebar" onPointerDown={startFloatingMove}>
            <span>{props.label}</span>
            <button
              aria-label="Close floating editor"
              className="css-floating-editor__close"
              title={`Close (${closeShortcutLabel})`}
              type="button"
              onClick={closeFloatingEditor}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span>Close</span>
              <kbd className="css-floating-editor__close-shortcut">{closeShortcutLabel}</kbd>
            </button>
          </div>
          <SourceEditorShortcutToolbar
            ariaLabel={`${props.language.toUpperCase()} editor shortcuts`}
            editingTarget={editingTarget}
            snippets={sourceEditorSnippets}
            targets={cssEditorTargets}
            onApplySnippet={applySnippet}
            onApplyTarget={applyTarget}
            onCommitTarget={commitTargetEdit}
            onEditTarget={startTargetEdit}
            onEditingTargetChange={setEditingTarget}
          />
          <div className="css-floating-editor__body">
            {(!monacoBaseUrl || !floatingEditorReady) && (
              <FallbackSourceEditor
                label={`${props.label} floating editor`}
                language={props.language}
                placeholder={props.placeholder}
                value={draft}
                onChange={updateValue}
              />
            )}
            {monacoBaseUrl && (
              <div className={`css-editor-field__monaco ${floatingEditorReady ? 'css-editor-field__monaco--ready' : ''}`}>
                <MonacoSurface
                  adapter={monacoAdapter}
                  baseUrl={monacoBaseUrl}
                  height="100%"
                  language={props.language}
                  path={`${editorPath}.floating`}
                  theme="vs-dark"
                  value={draft}
                  beforeMount={(monaco: any) => configureSourceEditorMonaco(monaco, props.language)}
                  onMount={(editor: any) => {
                    floatingEditorRef.current = editor;
                    handleSourceEditorMount(editor, cssEditorTargetsRef, () => setFloatingEditorReady(true), closeFloatingEditor);
                  }}
                  onChange={(value: string | undefined) => updateValue(value || '')}
                  options={{
                    acceptSuggestionOnEnter: sourceEditorAcceptSuggestionOnEnter,
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    automaticLayout: true,
                    colorDecorators: true,
                    fixedOverflowWidgets: true,
                    fontFamily: 'Menlo, Consolas, "Courier New", monospace',
                    fontSize: 13,
                    folding: true,
                    lineHeight: 20,
                    lineNumbers: 'on',
                    minimap: { enabled: true },
                    quickSuggestions: { other: true, comments: false, strings: true },
                    scrollBeyondLastLine: false,
                    snippetSuggestions: 'top',
                    showFoldingControls: 'always',
                    suggestOnTriggerCharacters: true,
                    tabCompletion: sourceEditorTabCompletion,
                    tabSize: 2,
                    wordBasedSuggestions: 'off',
                    wordWrap: 'on',
                    ...(props.placeholder ? { placeholder: props.placeholder } : {})
                  }}
                />
              </div>
            )}
          </div>
          {floatingResizeZones.map((handle) => (
            <div
              aria-label={handle.label}
              className={`css-floating-editor__resize-zone css-floating-editor__resize-zone--${handle.direction}`}
              key={handle.direction}
              role="separator"
              onPointerDown={(event) => startFloatingResize(event, handle.direction)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SourceEditorShortcutToolbarProps {
  ariaLabel: string;
  editingTarget: { selector: string; value: string } | null;
  snippets: readonly SourceEditorSnippet[];
  targets: readonly CssEditorTarget[];
  onApplySnippet: (snippet: SourceEditorSnippet) => void;
  onApplyTarget: (target: CssEditorTarget) => void;
  onCommitTarget: (target: CssEditorTarget, value: string) => void;
  onEditingTargetChange: React.Dispatch<React.SetStateAction<{ selector: string; value: string } | null>>;
  onEditTarget: (target: CssEditorTarget) => void;
}

function SourceEditorShortcutToolbar(props: SourceEditorShortcutToolbarProps): JSX.Element | null {
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const itemsRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDetailsElement | null>(null);
  const shortcutSignature = [
    ...props.targets.map((target) => `${target.label}:${target.selector}:${target.editable ? 'editable' : 'fixed'}`),
    ...props.snippets.map((snippet) => `${snippet.label}:${snippet.searchText || snippet.snippet}`)
  ].join('|');
  const isCollapsed = useShortcutToolbarOverflow(toolbarRef, itemsRef, shortcutSignature);
  const shortcutCount = props.targets.length + props.snippets.length;

  if (shortcutCount === 0) {
    return null;
  }

  const closeMenu = (): void => {
    menuRef.current?.removeAttribute('open');
  };

  const renderTarget = (target: CssEditorTarget, location: 'inline' | 'menu'): React.ReactNode => {
    const isEditing = props.editingTarget?.selector === target.selector;
    const isHiddenMeasurement = location === 'inline' && isCollapsed;
    const key = `${location}-${target.selector}`;

    if (target.editable) {
      return (
        <span
          className={`css-floating-editor__target-chip ${isEditing ? 'css-floating-editor__target-chip--editing' : ''} ${
            location === 'menu' ? 'css-floating-editor__target-chip--menu' : ''
          }`}
          key={key}
        >
          {isEditing ? (
            <input
              aria-label={target.renameLabel || `Edit ${target.selector}`}
              autoFocus={!isHiddenMeasurement}
              className="css-floating-editor__target-input"
              tabIndex={isHiddenMeasurement ? -1 : undefined}
              value={props.editingTarget?.value || target.selector}
              onBlur={(event) => props.onCommitTarget(target, event.currentTarget.value)}
              onChange={(event) => props.onEditingTargetChange({ selector: target.selector, value: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  props.onEditingTargetChange(null);
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  props.onCommitTarget(target, event.currentTarget.value);
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : (
            <>
              <button
                aria-label={`Add or jump to ${target.selector}`}
                className="css-floating-editor__target-button"
                tabIndex={isHiddenMeasurement ? -1 : undefined}
                title={`Add or jump to ${target.selector}`}
                type="button"
                onClick={() => {
                  props.onApplyTarget(target);
                  if (location === 'menu') {
                    closeMenu();
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {target.label}
              </button>
              <button
                aria-label={target.renameLabel || `Edit ${target.selector}`}
                className="css-floating-editor__target-edit-button"
                tabIndex={isHiddenMeasurement ? -1 : undefined}
                title={target.renameLabel || `Edit ${target.selector}`}
                type="button"
                onClick={() => props.onEditTarget(target)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <EditIcon />
              </button>
            </>
          )}
        </span>
      );
    }

    return (
      <button
        aria-label={`Add or jump to ${target.selector}`}
        className={`css-floating-editor__target-button ${location === 'menu' ? 'css-floating-editor__target-button--menu' : ''}`}
        key={key}
        tabIndex={isHiddenMeasurement ? -1 : undefined}
        title={`Add or jump to ${target.selector}`}
        type="button"
        onClick={() => {
          props.onApplyTarget(target);
          if (location === 'menu') {
            closeMenu();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {target.label}
      </button>
    );
  };

  const renderSnippet = (snippet: SourceEditorSnippet, location: 'inline' | 'menu'): React.ReactNode => {
    const isHiddenMeasurement = location === 'inline' && isCollapsed;

    return (
      <button
        className={`css-floating-editor__target-button ${location === 'menu' ? 'css-floating-editor__target-button--menu' : ''}`}
        key={`${location}-${snippet.label}-${snippet.searchText || snippet.snippet}`}
        tabIndex={isHiddenMeasurement ? -1 : undefined}
        type="button"
        onClick={() => {
          props.onApplySnippet(snippet);
          if (location === 'menu') {
            closeMenu();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {snippet.label}
      </button>
    );
  };

  return (
    <div className="css-floating-editor__toolbar" aria-label={props.ariaLabel} ref={toolbarRef} role="toolbar">
      <div
        aria-hidden={isCollapsed ? 'true' : undefined}
        className={`css-floating-editor__toolbar-items-viewport ${
          isCollapsed ? 'css-floating-editor__toolbar-items-viewport--measuring' : ''
        }`}
      >
        <div className="css-floating-editor__toolbar-items" ref={itemsRef}>
          {props.targets.map((target) => renderTarget(target, 'inline'))}
          {props.snippets.map((snippet) => renderSnippet(snippet, 'inline'))}
        </div>
      </div>
      {isCollapsed ? (
        <details className="css-floating-editor__shortcut-menu" ref={menuRef}>
          <summary
            aria-haspopup="true"
            aria-label={`Open ${props.ariaLabel}`}
            className="css-floating-editor__shortcut-menu-trigger"
            role="button"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>Shortcuts</span>
            <span className="css-floating-editor__shortcut-menu-count">{shortcutCount}</span>
            <ChevronDownIcon />
          </summary>
          <div aria-label={props.ariaLabel} className="css-floating-editor__shortcut-menu-list" role="group">
            {props.targets.map((target) => renderTarget(target, 'menu'))}
            {props.snippets.map((snippet) => renderSnippet(snippet, 'menu'))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function shouldCollapseShortcutToolbar(availableWidth: number, requiredWidth: number): boolean {
  return requiredWidth > availableWidth;
}

function useShortcutToolbarOverflow(
  toolbarRef: React.RefObject<HTMLDivElement>,
  itemsRef: React.RefObject<HTMLDivElement>,
  shortcutSignature: string
): boolean {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    const items = itemsRef.current;
    if (!toolbar || !items) {
      return undefined;
    }

    const measure = (): void => {
      const computedStyle = window.getComputedStyle(toolbar);
      const horizontalPadding =
        Number.parseFloat(computedStyle.paddingLeft || '0') + Number.parseFloat(computedStyle.paddingRight || '0');
      const availableWidth = Math.max(0, toolbar.clientWidth - horizontalPadding);
      const requiredWidth = items.scrollWidth;
      const nextCollapsed = shouldCollapseShortcutToolbar(availableWidth, requiredWidth);
      setIsCollapsed((current) => (current === nextCollapsed ? current : nextCollapsed));
    };

    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(toolbar);
      observer.observe(items);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [itemsRef, shortcutSignature, toolbarRef]);

  return isCollapsed;
}

export interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface PointerInteraction {
  mode: 'drag' | 'resize';
  direction?: ResizeDirection;
  startX: number;
  startY: number;
  startRect: FloatingRect;
}

interface FallbackSourceEditorProps {
  label: string;
  language: 'scss' | 'html';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export interface CssEditorTarget {
  label: string;
  selector: string;
  snippet: string;
  editable?: boolean;
  renameLabel?: string;
}

function EditIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path
        d="M14.7 2.3a1.1 1.1 0 0 1 1.6 0l1.4 1.4a1.1 1.1 0 0 1 0 1.6l-9.9 9.9-4.1 1.1 1.1-4.1 9.9-9.9Zm-8.8 10.5-.5 1.8 1.8-.5 7.2-7.2-1.3-1.3-7.2 7.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path d="m5.8 7.5 4.2 4.2 4.2-4.2 1.1 1.1-5.3 5.3-5.3-5.3 1.1-1.1Z" fill="currentColor" />
    </svg>
  );
}

function FallbackSourceEditor(props: FallbackSourceEditorProps): JSX.Element {
  const highlightRef = React.useRef<HTMLPreElement | null>(null);
  const source = props.value || '';

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>): void => {
    if (!highlightRef.current) {
      return;
    }
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <>
      <pre
        aria-hidden="true"
        className="css-editor-field__highlight"
        dangerouslySetInnerHTML={{
          __html: props.language === 'scss' ? highlightCss(source) : escapeHtml(source)
        }}
        ref={highlightRef}
      />
      <textarea
        aria-label={props.label}
        className="css-editor-field__textarea"
        placeholder={props.placeholder}
        spellCheck={false}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onScroll={syncScroll}
      />
    </>
  );
}

function MonacoSurface(
  props: {
    adapter: SourceEditorMonacoAdapter;
    baseUrl: string;
  } & Record<string, unknown>
): JSX.Element | null {
  const { adapter, baseUrl, ...editorProps } = props;
  const [EditorComponent, setEditorComponent] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    let active = true;
    void adapter
      .load(baseUrl)
      .then((component) => {
        if (active) {
          setEditorComponent(() => component);
        }
      })
      .catch(() => {
        if (active) {
          setEditorComponent(null);
        }
      });
    return () => {
      active = false;
    };
  }, [adapter, baseUrl]);

  return EditorComponent ? <EditorComponent {...editorProps} /> : null;
}

function configureMonacoLoader(
  monacoLoader: (typeof import('@monaco-editor/react'))['loader'],
  monaco: typeof import('monaco-editor/esm/vs/editor/editor.api')
): void {
  if (configuredMonacoBaseUrl === 'bundled') {
    return;
  }
  configuredMonacoBaseUrl = 'bundled';
  monacoLoader.config({ monaco });
}

function configureSourceEditorMonaco(monaco: any, language: 'scss' | 'html'): void {
  if (language !== 'scss') {
    return;
  }
  configureCssLanguage(monaco);
  registerSourceEditorCompletions(monaco);
}

function handleSourceEditorMount(
  editor: any,
  targetsRef: React.MutableRefObject<readonly CssEditorTarget[]>,
  onReady: () => void,
  onCloseShortcut?: () => void
): void {
  setCssEditorTargetsForModel(editor.getModel?.(), targetsRef);
  editor.updateOptions?.({ tabFocusMode: false });
  if (onCloseShortcut) {
    installCloseShortcutGuard(editor, onCloseShortcut);
  }
  onReady();
}

export function isCloseShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's';
}

function getCloseShortcutLabel(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
    return '⌘S';
  }

  return 'Ctrl+S';
}

function installCloseShortcutGuard(editor: any, onClose: () => void): void {
  const editorNode: HTMLElement | null | undefined = editor.getDomNode?.();
  if (!editorNode) {
    return;
  }

  const closeFloatingEditor = (event: KeyboardEvent): void => {
    if (!isCloseShortcut(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  editorNode.addEventListener('keydown', closeFloatingEditor, true);
  editor.onDidDispose?.(() => editorNode.removeEventListener('keydown', closeFloatingEditor, true));
}

export function appendCssTarget(source: string, target: CssEditorTarget, targetComment: string): string {
  const withComment = ensureCssTargetComment(source, targetComment);
  return withComment.trim() ? `${withComment.trimEnd()}\n\n${target.snippet}\n` : `${target.snippet}\n`;
}

function insertCssTarget(
  editor: any,
  source: string,
  target: CssEditorTarget,
  targetComment: string,
  onChange: (value: string) => void
): void {
  const nextValue = appendCssTarget(source, target, targetComment);
  const model = editor?.getModel?.();
  const fullRange = model?.getFullModelRange?.();
  const cursorPosition = findCssTargetInteriorPosition(nextValue, target.selector);
  const cursorSelection = cursorPosition ? createEmptyEditorSelection(cursorPosition) : undefined;

  if (!editor || !model || !fullRange) {
    onChange(nextValue);
    return;
  }

  editor.focus?.();
  editor.pushUndoStop?.();
  editor.executeEdits?.(
    'better-divider-target-shortcut',
    [
      {
        forceMoveMarkers: true,
        range: fullRange,
        text: nextValue
      }
    ],
    cursorSelection ? [cursorSelection] : undefined
  );
  editor.pushUndoStop?.();
  settleCursorAtEditorPosition(editor, findCssTargetInteriorPositionInModel(model, target.selector) || cursorPosition);
}

function ensureCssTargetComment(source: string, targetComment: string): string {
  const trimmed = source.trimStart();
  const normalizedComment = targetComment.trim();
  if (!normalizedComment) {
    return trimmed;
  }
  if (!trimmed) {
    return normalizedComment;
  }
  if (trimmed.includes(normalizedComment)) {
    return trimmed;
  }
  return `${normalizedComment}\n\n${trimmed}`;
}

function findCssTargetLine(source: string, selector: string): number | undefined {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|\\n)[\\t ]*${escapedSelector}[\\t ]*\\{`).exec(source);
  if (!match) {
    return undefined;
  }
  return source.slice(0, match.index + match[1].length).split('\n').length;
}

interface EditorPosition {
  lineNumber: number;
  column: number;
}

function findCssTargetInteriorPosition(source: string, selector: string): EditorPosition | undefined {
  const lineNumber = findCssTargetLine(source, selector);
  if (!lineNumber) {
    return undefined;
  }

  const innerLineNumber = lineNumber + 1;
  const innerLineContent = source.split(/\r\n|\r|\n/)[innerLineNumber - 1] || '';
  const leadingWhitespace = innerLineContent.match(/^\s*/)?.[0].length || 0;

  return {
    lineNumber: innerLineNumber,
    column: Math.max(1, leadingWhitespace + 1)
  };
}

function findCssTargetInteriorPositionInModel(model: any, selector: string): EditorPosition | undefined {
  if (!model?.getLineCount || !model?.getLineContent) {
    return undefined;
  }

  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetPattern = new RegExp(`^[\\t ]*${escapedSelector}[\\t ]*\\{`);
  const lineCount = model.getLineCount();

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
    if (!targetPattern.test(model.getLineContent(lineNumber))) {
      continue;
    }

    const innerLineNumber = Math.min(lineNumber + 1, lineCount);
    const innerLineContent = model.getLineContent(innerLineNumber) || '';
    const leadingWhitespace = innerLineContent.match(/^\s*/)?.[0].length || 0;

    return {
      lineNumber: innerLineNumber,
      column: Math.max(1, leadingWhitespace + 1)
    };
  }

  return undefined;
}

function createEmptyEditorSelection(position: EditorPosition): Record<string, number> {
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
    selectionStartLineNumber: position.lineNumber,
    selectionStartColumn: position.column,
    positionLineNumber: position.lineNumber,
    positionColumn: position.column
  };
}

function revealCssTarget(editor: any, lineNumber: number | undefined, selector: string): void {
  if (!editor || !lineNumber) {
    return;
  }

  const lineContent = editor.getModel?.()?.getLineContent?.(lineNumber) || '';
  const column = Math.max(1, lineContent.indexOf(selector) + 1);
  editor.focus?.();
  editor.revealLineInCenterIfOutsideViewport?.(lineNumber);
  editor.setPosition?.({ lineNumber, column });
  editor.setSelection?.({
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column + selector.length
  });
}

function moveCursorToEditorPosition(editor: any, position: EditorPosition | undefined): void {
  if (!editor || !position) {
    return;
  }

  editor.focus?.();
  editor.revealLineInCenterIfOutsideViewport?.(position.lineNumber);
  editor.setPosition?.(position);
  editor.setSelection?.(createEmptyEditorSelection(position));
}

function settleCursorAtEditorPosition(editor: any, position: EditorPosition | undefined): void {
  moveCursorToEditorPosition(editor, position);

  if (typeof window === 'undefined') {
    return;
  }

  window.setTimeout(() => moveCursorToEditorPosition(editor, position), 0);
  window.setTimeout(() => moveCursorToEditorPosition(editor, position), 50);
}

function normalizeEditableTargetSelector(value: string, fallbackSelector: string): string {
  const className = value.trim().replace(/^\./, '');
  if (/^[A-Za-z_][-_A-Za-z0-9]{1,31}$/.test(className)) {
    return `.${className}`;
  }
  return fallbackSelector;
}

export function replaceCssTargetSelector(source: string, previousSelector: string, nextSelector: string): string {
  return source.replace(createCssSelectorPattern(previousSelector), nextSelector);
}

export function evaluateSourceTargetRename(
  source: string,
  previousSelector: string,
  nextSelector: string,
  commitMode: 'immediate' | 'valid' | undefined,
  maxBytes?: number,
  validate?: (value: string) => SourceEditorDiagnostic[]
): { value: string; shouldCommit: boolean } {
  const value = replaceCssTargetSelector(source, previousSelector, nextSelector);
  const diagnostics = getSourceDiagnostics(value, maxBytes, validate);
  return { value, shouldCommit: shouldCommitSource(commitMode, diagnostics) };
}

function createCssSelectorPattern(selector: string): RegExp {
  return new RegExp(`${escapeRegExp(selector)}(?=$|[^-_A-Za-z0-9])`, 'g');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function configureCssLanguage(monaco: any): void {
  const cssDefaults = monaco.languages?.css?.scssDefaults || monaco.languages?.css?.cssDefaults;
  cssDefaults?.setOptions?.({
    validate: true,
    lint: {
      compatibleVendorPrefixes: 'warning',
      duplicateProperties: 'warning',
      emptyRules: 'ignore',
      hexColorLength: 'warning',
      propertyIgnoredDueToDisplay: 'warning',
      unknownProperties: 'warning',
      zeroUnits: 'ignore'
    }
  });
  cssDefaults?.setModeConfiguration?.({
    completionItems: true,
    colors: true,
    diagnostics: true,
    documentFormattingEdits: true,
    documentRangeFormattingEdits: true,
    documentSymbols: true,
    foldingRanges: true,
    hovers: true,
    references: true,
    rename: true,
    selectionRanges: true
  });
}

function registerSourceEditorCompletions(monaco: any): void {
  if (typeof monaco !== 'object' || monaco === null || configuredCssIntellisense.has(monaco)) {
    return;
  }
  configuredCssIntellisense.add(monaco);
  monaco.languages?.registerCompletionItemProvider?.('scss', {
    triggerCharacters: [...sourceEditorCompletionTriggerCharacters],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      return {
        suggestions: createSourceEditorSuggestions(monaco, range, getCssEditorTargetsForModel(model))
      };
    }
  });
}

export function setCssEditorTargetsForModel(
  model: unknown,
  targetsRef: React.MutableRefObject<readonly CssEditorTarget[]>
): void {
  if (typeof model === 'object' && model !== null) {
    cssEditorTargetsByModel.set(model, targetsRef);
  }
}

export function getCssEditorTargetsForModel(model: unknown): readonly CssEditorTarget[] {
  return typeof model === 'object' && model !== null ? cssEditorTargetsByModel.get(model)?.current || [] : [];
}

export function createSourceEditorSuggestions(
  monaco: any,
  range: Record<string, number>,
  targets: readonly CssEditorTarget[]
): any[] {
  return [
    ...createSelectorSuggestions(monaco, range, targets),
    ...createPropertySuggestions(monaco, range),
    ...createValueSuggestions(monaco, range)
  ];
}

function createSelectorSuggestions(monaco: any, range: any, targets: readonly CssEditorTarget[]): any[] {
  const snippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  return targets.map((target) => ({
    label: target.selector,
    kind: monaco.languages.CompletionItemKind.Class,
    detail: target.selector === ':host' ? 'Web part host selector' : `${target.label} selector`,
    documentation: `Insert the configured ${target.label} target.`,
    insertText: target.snippet.replace(/ {2}/g, '\t'),
    insertTextRules: snippetRule,
    range
  }));
}

function createPropertySuggestions(monaco: any, range: any): any[] {
  const snippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  const properties = [
    ['display', 'display: ${1|block,flex,grid,inline,none|};', 'Layout mode'],
    ['position', 'position: ${1|relative,absolute,fixed,sticky|};', 'Positioning mode'],
    ['inset', 'inset: ${1:0};', 'Logical positioning shorthand'],
    ['width', 'width: ${1:100%};', 'Element width'],
    ['min-width', 'min-width: ${1:0};', 'Minimum width'],
    ['max-width', 'max-width: ${1:100%};', 'Maximum width'],
    ['height', 'height: ${1:auto};', 'Element height'],
    ['margin', 'margin: ${1:0};', 'Outer spacing'],
    ['padding', 'padding: ${1:16px};', 'Inner spacing'],
    ['gap', 'gap: ${1:8px};', 'Flex or grid spacing'],
    ['grid-template-columns', 'grid-template-columns: ${1:repeat(2, minmax(0, 1fr))};', 'Grid columns'],
    ['align-items', 'align-items: ${1|stretch,center,flex-start,flex-end|};', 'Cross-axis alignment'],
    ['justify-content', 'justify-content: ${1|flex-start,center,flex-end,space-between|};', 'Main-axis alignment'],
    ['color', 'color: ${1:#242424};', 'Foreground color'],
    ['background', 'background: ${1:#ffffff};', 'Background color or image'],
    ['border', 'border: ${1:1px solid #d1d1d1};', 'Border shorthand'],
    ['border-radius', 'border-radius: ${1:6px};', 'Corner radius'],
    ['box-shadow', 'box-shadow: ${1:0 1px 2px rgb(0 0 0 / 12%)};', 'Element shadow'],
    ['font-size', 'font-size: ${1:14px};', 'Text size'],
    ['font-weight', 'font-weight: ${1|400,500,600,700|};', 'Text weight'],
    ['line-height', 'line-height: ${1:1.5};', 'Line height'],
    ['text-align', 'text-align: ${1|left,center,right|};', 'Text alignment'],
    ['overflow', 'overflow: ${1|visible,hidden,auto|};', 'Overflow behavior'],
    ['opacity', 'opacity: ${1:1};', 'Element opacity'],
    ['transform', 'transform: ${1:translateY(0)};', 'Element transform'],
    ['transition', 'transition: ${1:all 160ms ease};', 'Transition shorthand']
  ];

  return properties.map(([label, insertText, detail]) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Property,
    detail,
    insertText,
    insertTextRules: snippetRule,
    range
  }));
}

function createValueSuggestions(monaco: any, range: any): any[] {
  const values = [
    ['var(--colorNeutralForeground1, #242424)', 'Fluent neutral foreground'],
    ['var(--colorNeutralBackground1, #ffffff)', 'Fluent neutral background'],
    ['var(--colorNeutralStroke2, #e0e0e0)', 'Fluent neutral border'],
    ['var(--colorBrandForeground1, #0f6cbd)', 'Fluent brand foreground'],
    ['transparent', 'Transparent color'],
    ['currentColor', 'Current text color'],
    ['#ffffff', 'White'],
    ['#242424', 'Fluent neutral foreground'],
    ['#0f6cbd', 'Fluent brand blue'],
    ['#c50f1f', 'Fluent danger red'],
    ['0', 'Reset value'],
    ['100%', 'Full available size'],
    ['auto', 'Automatic sizing'],
    ['inherit', 'Inherit from parent']
  ];

  return values.map(([label, detail]) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Value,
    detail,
    insertText: label,
    range
  }));
}

function normalizeBaseUrl(value: string | undefined): string {
  return value ? value.replace(/\/+$/, '') : '';
}

function pathForLabel(label: string, language: 'scss' | 'html', instanceId: number): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `custom-${language}`;
  return `spfx-kit.${slug}.${instanceId}.${language}`;
}

function createInitialFloatingRect(): FloatingRect {
  const viewport = getViewportSize();
  const width = Math.min(760, Math.max(360, viewport.width - 48));
  const height = Math.min(560, Math.max(300, viewport.height - 96));
  return {
    left: Math.max(16, viewport.width - width - 48),
    top: 64,
    width,
    height
  };
}

function createPointerInteraction(
  mode: PointerInteraction['mode'],
  event: React.PointerEvent,
  panel: HTMLDivElement | null,
  fallbackRect: FloatingRect,
  direction?: ResizeDirection
): PointerInteraction {
  const bounds = panel?.getBoundingClientRect();
  return {
    direction: mode === 'resize' ? direction || 'se' : undefined,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    startRect: bounds
      ? {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height
        }
      : fallbackRect
  };
}

export function resizeFloatingRect(
  startRect: FloatingRect,
  deltaX: number,
  deltaY: number,
  direction: ResizeDirection
): FloatingRect {
  const next = { ...startRect };

  if (direction.includes('e')) {
    next.width = startRect.width + deltaX;
  }
  if (direction.includes('w')) {
    next.left = startRect.left + deltaX;
    next.width = startRect.width - deltaX;
    if (next.width < minFloatingWidth) {
      next.left = startRect.left + startRect.width - minFloatingWidth;
      next.width = minFloatingWidth;
    }
  }
  if (direction.includes('s')) {
    next.height = startRect.height + deltaY;
  }
  if (direction.includes('n')) {
    next.top = startRect.top + deltaY;
    next.height = startRect.height - deltaY;
    if (next.height < minFloatingHeight) {
      next.top = startRect.top + startRect.height - minFloatingHeight;
      next.height = minFloatingHeight;
    }
  }

  return constrainFloatingRect(next);
}

export function constrainFloatingRect(rect: FloatingRect): FloatingRect {
  const viewport = getViewportSize();
  const width = Math.min(Math.max(rect.width, minFloatingWidth), Math.max(minFloatingWidth, viewport.width - 16));
  const height = Math.min(Math.max(rect.height, minFloatingHeight), Math.max(minFloatingHeight, viewport.height - 16));
  return {
    left: clamp(rect.left, 8, Math.max(8, viewport.width - width - 8)),
    top: clamp(rect.top, 8, Math.max(8, viewport.height - height - 8)),
    width,
    height
  };
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 800
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function highlightCss(source: string): string {
  const tokenPattern =
    /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"])*"|'(?:\\.|[^'])*')|(@[-_a-zA-Z][-_a-zA-Z0-9]*)|(#[0-9a-fA-F]{3,8}\b)|([{}:;(),>+~])|((?:\.|#)[-_a-zA-Z][-_a-zA-Z0-9]*)|([-_a-zA-Z][-_a-zA-Z0-9]*(?=\s*:))/g;
  let cursor = 0;
  let output = '';
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source))) {
    output += escapeHtml(source.slice(cursor, match.index));
    output += renderToken(match);
    cursor = match.index + match[0].length;
  }

  output += escapeHtml(source.slice(cursor));
  return output;
}

function renderToken(match: RegExpExecArray): string {
  const value = escapeHtml(match[0]);
  if (match[1]) {
    return `<span class="css-token css-token--comment">${value}</span>`;
  }
  if (match[2]) {
    return `<span class="css-token css-token--string">${value}</span>`;
  }
  if (match[3]) {
    return `<span class="css-token css-token--at-rule">${value}</span>`;
  }
  if (match[4]) {
    return `<span class="css-token css-token--color">${value}</span>`;
  }
  if (match[5]) {
    return `<span class="css-token css-token--punctuation">${value}</span>`;
  }
  if (match[6]) {
    return `<span class="css-token css-token--selector">${value}</span>`;
  }
  if (match[7]) {
    return `<span class="css-token css-token--property">${value}</span>`;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
