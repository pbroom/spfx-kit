import * as React from 'react';
import Editor, { loader } from '@monaco-editor/react';

interface CssEditorProps {
  label: string;
  value: string;
  description?: string;
  placeholder?: string;
  minHeight?: number;
  monacoBaseUrl?: string;
  targets?: CssEditorTarget[];
  targetComment?: string;
  onChange: (value: string) => void;
  onTargetRename?: (target: CssEditorTarget, nextSelector: string, nextValue: string) => void;
}

const defaultMonacoBaseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs';
let configuredMonacoBaseUrl = '';
let configuredCssIntellisense = false;
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
const cssTargetCommentMarker = 'Better Divider SCSS targets';
const defaultCssTargetComment = `/*
Better Divider SCSS targets:
:host - web part host element.
.better-divider - wrapper for alignment and vertical spacing.
.better-divider__line - visible divider line, width, color, stroke, and rounded ends.
*/`;
const defaultCssEditorTargets: CssEditorTarget[] = [
  {
    label: ':host',
    selector: ':host',
    snippet: ':host {\n  display: block;\n}'
  },
  {
    label: '.better-divider',
    selector: '.better-divider',
    snippet: '.better-divider {\n  justify-content: center;\n  padding-block: 16px;\n}'
  },
  {
    label: '.better-divider__line',
    selector: '.better-divider__line',
    snippet: '.better-divider__line {\n  width: 100%;\n  height: 1px;\n  background: #8a8886;\n  border-radius: 0;\n  border: 0;\n}'
  }
];
let latestCssEditorTargets: CssEditorTarget[] = defaultCssEditorTargets;
const minFloatingWidth = 360;
const minFloatingHeight = 260;

export function CssEditor(props: CssEditorProps): JSX.Element {
  const minHeight = props.minHeight || 180;
  const monacoBaseUrl = normalizeBaseUrl(props.monacoBaseUrl || defaultMonacoBaseUrl);
  const editorPath = pathForLabel(props.label);
  const [editorReady, setEditorReady] = React.useState(false);
  const [floatingEditorReady, setFloatingEditorReady] = React.useState(false);
  const [floatingOpen, setFloatingOpen] = React.useState(false);
  const [floatingRect, setFloatingRect] = React.useState<FloatingRect>(() => createInitialFloatingRect());
  const [pointerState, setPointerState] = React.useState<PointerInteraction | null>(null);
  const [editingTarget, setEditingTarget] = React.useState<{ selector: string; value: string } | null>(null);
  const floatingPanelRef = React.useRef<HTMLDivElement | null>(null);
  const floatingEditorRef = React.useRef<any>(null);
  const cssEditorTargets = props.targets?.length ? props.targets : defaultCssEditorTargets;
  const cssTargetComment = props.targetComment || defaultCssTargetComment;
  const closeShortcutLabel = React.useMemo(() => getCloseShortcutLabel(), []);

  if (monacoBaseUrl) {
    configureMonaco(monacoBaseUrl);
  }

  const closeFloatingEditor = React.useCallback((): void => {
    floatingEditorRef.current = null;
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

  const applyFloatingTarget = (target: CssEditorTarget): void => {
    setEditingTarget(null);
    const editor = floatingEditorRef.current;
    const currentValue = editor?.getValue?.() || props.value || '';
    const existingLine = findCssTargetLine(currentValue, target.selector);

    if (existingLine) {
      revealCssTarget(editor, existingLine, target.selector);
      return;
    }

    insertCssTarget(editor, currentValue, target, cssTargetComment, props.onChange);
  };

  const startTargetEdit = (target: CssEditorTarget): void => {
    setEditingTarget({ selector: target.selector, value: target.selector });
  };

  const commitTargetEdit = (target: CssEditorTarget, value: string): void => {
    const nextSelector = normalizeEditableTargetSelector(value, target.selector);
    setEditingTarget(null);

    if (nextSelector === target.selector) {
      return;
    }

    const editor = floatingEditorRef.current;
    const currentValue = editor?.getValue?.() || props.value || '';
    const nextValue = replaceCssTargetSelector(currentValue, target.selector, nextSelector);

    if (props.onTargetRename) {
      props.onTargetRename(target, nextSelector, nextValue);
      return;
    }

    props.onChange(nextValue);
  };

  return (
    <div className="css-editor-field">
      <div className="css-editor-field__header">
        <label className="css-editor-field__label">{props.label}</label>
        <button
          aria-expanded={floatingOpen}
          className="css-editor-field__popout"
          type="button"
          onClick={toggleFloatingEditor}
        >
          Pop out
        </button>
      </div>
      {props.description && <p className="css-editor-field__description">{props.description}</p>}
      <div className="css-editor-field__frame" style={{ height: minHeight, minHeight }}>
        {(!monacoBaseUrl || !editorReady) && (
          <FallbackCssEditor
            label={props.label}
            value={props.value}
            onChange={props.onChange}
          />
        )}
        {monacoBaseUrl && (
          <div className={`css-editor-field__monaco ${editorReady ? 'css-editor-field__monaco--ready' : ''}`}>
            <Editor
              height={`${minHeight}px`}
              language="scss"
              path={editorPath}
              theme="vs-dark"
              value={props.value}
              beforeMount={(monaco) => configureCssEditorMonaco(monaco, cssEditorTargets)}
              onMount={(editor) => handleCssEditorMount(editor, () => setEditorReady(true))}
              onChange={(value) => props.onChange(value || '')}
              options={{
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                automaticLayout: true,
                colorDecorators: true,
                fixedOverflowWidgets: true,
                fontFamily: 'Menlo, Consolas, "Courier New", monospace',
                fontSize: 12,
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 8,
                lineHeight: 18,
                lineNumbers: 'off',
                minimap: { enabled: false },
                quickSuggestions: { other: true, comments: false, strings: true },
                scrollBeyondLastLine: false,
                snippetSuggestions: 'top',
                suggestOnTriggerCharacters: true,
                tabCompletion: 'on',
                tabSize: 2,
                wordBasedSuggestions: false,
                wordWrap: 'on'
              }}
            />
          </div>
        )}
      </div>
      {floatingOpen && (
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
          <div className="css-floating-editor__toolbar" aria-label="SCSS target shortcuts">
            {cssEditorTargets.map((target) => {
              const isEditing = editingTarget?.selector === target.selector;

              if (target.editable) {
                return (
                  <span
                    className={`css-floating-editor__target-chip ${isEditing ? 'css-floating-editor__target-chip--editing' : ''}`}
                    key={target.selector}
                  >
                    {isEditing ? (
                      <input
                        aria-label={target.renameLabel || `Edit ${target.selector}`}
                        autoFocus
                        className="css-floating-editor__target-input"
                        value={editingTarget.value}
                        onBlur={(event) => commitTargetEdit(target, event.currentTarget.value)}
                        onChange={(event) =>
                          setEditingTarget({ selector: target.selector, value: event.currentTarget.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingTarget(null);
                            return;
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitTargetEdit(target, event.currentTarget.value);
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <>
                        <button
                          className="css-floating-editor__target-button"
                          aria-label={`Add or jump to ${target.selector}`}
                          title={`Add or jump to ${target.selector}`}
                          type="button"
                          onClick={() => applyFloatingTarget(target)}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          {target.label}
                        </button>
                        <button
                          aria-label={target.renameLabel || `Edit ${target.selector}`}
                          className="css-floating-editor__target-edit-button"
                          title={target.renameLabel || `Edit ${target.selector}`}
                          type="button"
                          onClick={() => startTargetEdit(target)}
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
                  className="css-floating-editor__target-button"
                  key={target.selector}
                  aria-label={`Add or jump to ${target.selector}`}
                  title={`Add or jump to ${target.selector}`}
                  type="button"
                  onClick={() => applyFloatingTarget(target)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {target.label}
                </button>
              );
            })}
          </div>
          <div className="css-floating-editor__body">
            {(!monacoBaseUrl || !floatingEditorReady) && (
              <FallbackCssEditor
                label={`${props.label} floating editor`}
                value={props.value}
                onChange={props.onChange}
              />
            )}
            {monacoBaseUrl && (
              <div className={`css-editor-field__monaco ${floatingEditorReady ? 'css-editor-field__monaco--ready' : ''}`}>
                <Editor
                  height="100%"
                  language="scss"
                  path={`${editorPath}.floating`}
                  theme="vs-dark"
                  value={props.value}
                  beforeMount={(monaco) => configureCssEditorMonaco(monaco, cssEditorTargets)}
                  onMount={(editor) => {
                    floatingEditorRef.current = editor;
                    handleCssEditorMount(editor, () => setFloatingEditorReady(true), closeFloatingEditor);
                  }}
                  onChange={(value) => props.onChange(value || '')}
                  options={{
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    automaticLayout: true,
                    colorDecorators: true,
                    fixedOverflowWidgets: true,
                    fontFamily: 'Menlo, Consolas, "Courier New", monospace',
                    fontSize: 13,
                    lineHeight: 20,
                    lineNumbers: 'on',
                    minimap: { enabled: true },
                    quickSuggestions: { other: true, comments: false, strings: true },
                    scrollBeyondLastLine: false,
                    snippetSuggestions: 'top',
                    suggestOnTriggerCharacters: true,
                    tabCompletion: 'on',
                    tabSize: 2,
                    wordBasedSuggestions: false,
                    wordWrap: 'on'
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

interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface PointerInteraction {
  mode: 'drag' | 'resize';
  direction?: ResizeDirection;
  startX: number;
  startY: number;
  startRect: FloatingRect;
}

interface FallbackCssEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface CssEditorTarget {
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

function FallbackCssEditor(props: FallbackCssEditorProps): JSX.Element {
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
        dangerouslySetInnerHTML={{ __html: highlightCss(source) }}
        ref={highlightRef}
      />
      <textarea
        aria-label={props.label}
        className="css-editor-field__textarea"
        spellCheck={false}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onScroll={syncScroll}
      />
    </>
  );
}

function configureMonaco(monacoBaseUrl: string): void {
  if (configuredMonacoBaseUrl === monacoBaseUrl) {
    return;
  }
  configuredMonacoBaseUrl = monacoBaseUrl;
  loader.config({
    paths: {
      vs: monacoBaseUrl
    }
  });
}

function configureCssEditorMonaco(monaco: any, targets: CssEditorTarget[]): void {
  latestCssEditorTargets = targets;
  configureCssLanguage(monaco);
  registerBetterDividerCompletions(monaco);
}

function handleCssEditorMount(editor: any, onReady: () => void, onCloseShortcut?: () => void): void {
  editor.updateOptions?.({ tabFocusMode: false });
  installTabTraversalGuard(editor);
  if (onCloseShortcut) {
    installCloseShortcutGuard(editor, onCloseShortcut);
  }
  onReady();
}

function isCloseShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>): boolean {
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

function installTabTraversalGuard(editor: any): void {
  const editorNode: HTMLElement | null | undefined = editor.getDomNode?.();
  if (!editorNode) {
    return;
  }

  const preventBrowserTabTraversal = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
  };

  editorNode.addEventListener('keydown', preventBrowserTabTraversal, true);
  editor.onDidDispose?.(() => editorNode.removeEventListener('keydown', preventBrowserTabTraversal, true));
}

function appendCssTarget(source: string, target: CssEditorTarget, targetComment: string): string {
  const withComment = ensureCssTargetComment(source, targetComment);
  return `${withComment.trimEnd()}\n\n${target.snippet}\n`;
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
  editor.executeEdits?.('better-divider-target-shortcut', [
    {
      forceMoveMarkers: true,
      range: fullRange,
      text: nextValue
    }
  ], cursorSelection ? [cursorSelection] : undefined);
  editor.pushUndoStop?.();
  settleCursorAtEditorPosition(editor, findCssTargetInteriorPositionInModel(model, target.selector) || cursorPosition);
}

function ensureCssTargetComment(source: string, targetComment: string): string {
  const trimmed = source.trimStart();
  if (!trimmed) {
    return targetComment;
  }
  if (trimmed.includes(cssTargetCommentMarker)) {
    return trimmed;
  }
  return `${targetComment}\n\n${trimmed}`;
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

function replaceCssTargetSelector(source: string, previousSelector: string, nextSelector: string): string {
  return source.replace(createCssSelectorPattern(previousSelector), nextSelector);
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

function registerBetterDividerCompletions(monaco: any): void {
  if (configuredCssIntellisense) {
    return;
  }
  configuredCssIntellisense = true;
  monaco.languages?.registerCompletionItemProvider?.('scss', {
    triggerCharacters: ['.', ':', '-', '#', ' ', '\n'],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      return {
        suggestions: [
          ...createSelectorSuggestions(monaco, range, latestCssEditorTargets),
          ...createPropertySuggestions(monaco, range),
          ...createValueSuggestions(monaco, range)
        ]
      };
    }
  });
}

function createSelectorSuggestions(monaco: any, range: any, targets: CssEditorTarget[]): any[] {
  const snippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  return targets.map((target) => ({
    label: target.selector,
    kind: monaco.languages.CompletionItemKind.Class,
    detail: target.selector === ':host' ? 'Better Divider host selector' : 'Better Divider selector',
    documentation: target.selector.startsWith('.bd-')
      ? 'Targets only this generated Better Divider instance.'
      : 'Targets a Better Divider element.',
    insertText: target.snippet.replace(/ {2}/g, '\t'),
    insertTextRules: snippetRule,
    range
  }));
}

function createPropertySuggestions(monaco: any, range: any): any[] {
  const snippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  return [
    ['justify-content', 'justify-content: ${1|center,flex-start,flex-end|};', 'Divider alignment'],
    ['padding-block', 'padding-block: ${1:16px};', 'Vertical spacing'],
    ['width', 'width: ${1:100%};', 'Divider width'],
    ['height', 'height: ${1:1px};', 'Solid divider thickness'],
    ['background', 'background: ${1:#8a8886};', 'Solid divider color'],
    ['border', 'border: ${1:0};', 'Reset or set border'],
    ['border-top', 'border-top: ${1:1px} ${2|solid,dashed,dotted|} ${3:#8a8886};', 'Dashed or dotted divider stroke'],
    ['border-radius', 'border-radius: ${1|0,999px|};', 'Rounded divider ends'],
    ['box-shadow', 'box-shadow: ${1:0 1px 2px rgb(0 0 0 / 20%)};', 'Optional custom visual effect']
  ].map(([label, insertText, detail]) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Property,
    detail,
    insertText,
    insertTextRules: snippetRule,
    range
  }));
}

function createValueSuggestions(monaco: any, range: any): any[] {
  return [
    ['center', 'Center alignment'],
    ['flex-start', 'Left alignment'],
    ['flex-end', 'Right alignment'],
    ['solid', 'Solid stroke'],
    ['dashed', 'Dashed stroke'],
    ['dotted', 'Dotted stroke'],
    ['transparent', 'Transparent color'],
    ['#8a8886', 'Default SharePoint neutral divider color'],
    ['#0078d4', 'SharePoint blue'],
    ['#c50f1f', 'SharePoint red'],
    ['999px', 'Rounded ends'],
    ['0', 'Square ends or reset'],
    ['100%', 'Full width']
  ].map(([label, detail]) => ({
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

function pathForLabel(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'custom-css-scss';
  return `spfx-kit.${slug}.scss`;
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

function resizeFloatingRect(
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

function constrainFloatingRect(rect: FloatingRect): FloatingRect {
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
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
