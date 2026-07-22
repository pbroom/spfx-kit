/* eslint-disable @typescript-eslint/no-use-before-define -- The component composes editor surfaces and shared styles declared later in this canonical vendor file. */
import * as React from 'react';
import * as ReactDom from 'react-dom';
import type * as BundledMonaco from 'monaco-editor/esm/vs/editor/editor.api';
import { getSourceDiagnostics, shouldCommitSource } from './sourceEditorCore';
import type {
  SourceEditorCommitMode,
  SourceEditorLanguage,
  SourceEditorSnippet,
  SourceEditorValidator
} from './sourceEditorCore';

type MonacoApi = typeof BundledMonaco;

export interface SourceEditorMonacoAdapter {
  load: (language: SourceEditorLanguage) => Promise<MonacoApi>;
}

export interface SourceEditorFieldProps {
  label: string;
  language: SourceEditorLanguage;
  value: string;
  description?: string;
  placeholder?: string;
  config?: SourceEditorFieldConfig;
  /** @deprecated Use config. */
  configuration?: SourceEditorFieldConfig;
  height?: number;
  maxBytes?: number;
  commitMode?: SourceEditorCommitMode;
  validate?: SourceEditorValidator;
  snippets?: readonly SourceEditorSnippet[];
  targets?: readonly SourceEditorTarget[];
  targetComment?: string;
  onChange: (value: string) => void;
  onDraftChange?: (value: string) => void;
  onTargetRename?: (target: SourceEditorTarget, nextSelector: string, nextValue: string) => void;
  embedded?: boolean;
  fillHeight?: boolean;
  showShortcuts?: boolean;
}

export interface SourceEditorFieldConfig {
  commitMode?: SourceEditorCommitMode;
  inlineHeight?: number;
  inlineModelPath?: string;
  floatingModelPath?: string;
  maxBytes?: number;
  monacoAdapter?: SourceEditorMonacoAdapter;
  snippets?: readonly SourceEditorSnippet[];
  targetComment?: string;
  targets?: readonly SourceEditorTarget[];
  toolbarLabel?: string;
  validate?: SourceEditorValidator;
  onTargetRename?: (target: SourceEditorTarget, nextSelector: string, nextValue: string) => void;
}

export interface SourceEditorTarget {
  label: string;
  selector: string;
  snippet: string;
  editable?: boolean;
  renameLabel?: string;
}

export type ISourceEditorTarget = SourceEditorTarget;

let nextSourceEditorInstanceId = 0;
const configuredCssIntellisense = new WeakSet<object>();
const cssEditorTargetsByModel = new WeakMap<object, React.MutableRefObject<readonly SourceEditorTarget[]>>();
export const sourceEditorAcceptSuggestionOnEnter = 'on' as const;
// Newlines stay excluded so completion does not reopen after every authored line break.
export const sourceEditorCompletionTriggerCharacters = ['.', ':', '-', '#', ' '] as const;
export const sourceEditorTabCompletion = 'on' as const;
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
const defaultMonacoAdapter: SourceEditorMonacoAdapter = {
  async load(language) {
    await import(
      /* webpackChunkName: "source-editor-monaco" */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Monaco's ESM core-feature entrypoint is runtime-only and has no declaration file.
      'monaco-editor/esm/vs/editor/edcore.main.js'
    );
    const monaco = await import(
      /* webpackChunkName: "source-editor-monaco" */
      'monaco-editor/esm/vs/editor/editor.api'
    );
    if (language === 'html') {
      await import(
        /* webpackChunkName: "source-editor-monaco" */
        'monaco-editor/esm/vs/basic-languages/html/html.contribution'
      );
    } else {
      await import(
        /* webpackChunkName: "source-editor-monaco" */
        'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
      );
    }
    return monaco;
  }
};

export const SourceEditorField: React.FunctionComponent<SourceEditorFieldProps> = (props) => {
  const baseConfig = props.configuration || props.config || {};
  const commitMode = props.commitMode ?? baseConfig.commitMode;
  const maxBytes = props.maxBytes ?? baseConfig.maxBytes;
  const validate = props.validate ?? baseConfig.validate;
  const onTargetRename = props.onTargetRename ?? baseConfig.onTargetRename;
  const sourceEditorTargets = props.language === 'scss' ? props.targets || baseConfig.targets || [] : [];
  const sourceEditorTargetsRef = React.useRef<readonly SourceEditorTarget[]>(sourceEditorTargets);
  sourceEditorTargetsRef.current = sourceEditorTargets;
  const sourceEditorSnippets = props.snippets || baseConfig.snippets || [];
  const sourceTargetComment = props.targetComment ?? baseConfig.targetComment ?? '';
  const inlineHeight = props.height || baseConfig.inlineHeight || 190;
  const sourceEditorInstanceIdRef = React.useRef(0);
  if (sourceEditorInstanceIdRef.current === 0) {
    sourceEditorInstanceIdRef.current = ++nextSourceEditorInstanceId;
  }
  const inlineModelPath =
    baseConfig.inlineModelPath || `source-editor.${sourceEditorInstanceIdRef.current}.inline.${props.language}`;
  const floatingModelPath =
    baseConfig.floatingModelPath || `source-editor.${sourceEditorInstanceIdRef.current}.floating.${props.language}`;
  const toolbarLabel = baseConfig.toolbarLabel || `${props.language.toLocaleUpperCase()} editor shortcuts`;
  const monacoAdapter = baseConfig.monacoAdapter || defaultMonacoAdapter;
  const [draft, setDraft] = React.useState(props.value || '');
  const sourceDiagnostics = React.useMemo(() => getSourceDiagnostics(draft, maxBytes, validate), [draft, maxBytes, validate]);
  const [editorReady, setEditorReady] = React.useState(false);
  const [floatingEditorReady, setFloatingEditorReady] = React.useState(false);
  const [floatingOpen, setFloatingOpen] = React.useState(false);
  const [floatingRect, setFloatingRect] = React.useState<FloatingRect>(() => createInitialFloatingRect());
  const [pointerState, setPointerState] = React.useState<PointerInteraction | null>(null);
  const [editingTarget, setEditingTarget] = React.useState<{ selector: string; value: string } | null>(null);
  const [monacoDiagnostic, setMonacoDiagnostic] = React.useState<MonacoDiagnostic>(() => createMonacoDiagnostic('loading'));
  const floatingPanelRef = React.useRef<HTMLDivElement | null>(null);
  const inlineEditorRef = React.useRef<any>(null);
  const floatingEditorRef = React.useRef<any>(null);
  const closeShortcutLabel = React.useMemo(() => getCloseShortcutLabel(), []);
  const markMonacoReady = React.useCallback((): void => {
    const diagnostic = createMonacoDiagnostic('ready');
    setMonacoDiagnostic(diagnostic);
    publishMonacoDiagnostic(diagnostic);
  }, []);
  const markMonacoError = React.useCallback((error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = createMonacoDiagnostic('error', message);
    setMonacoDiagnostic(diagnostic);
    publishMonacoDiagnostic(diagnostic);
  }, []);

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
    setDraft(props.value || '');
  }, [props.value]);

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

  const updateValue = (value: string): void => {
    const diagnostics = getSourceDiagnostics(value, maxBytes, validate);
    setDraft(value);
    props.onDraftChange?.(value);
    if (shouldCommitSource(commitMode, diagnostics)) {
      props.onChange(value);
    }
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

  const handleFloatingTarget = (target: SourceEditorTarget): void => {
    setEditingTarget(null);
    const editor = floatingEditorRef.current || inlineEditorRef.current;
    const currentValue = editor?.getValue?.() || draft || '';
    const existingLine = findCssTargetLine(currentValue, target.selector);

    if (existingLine) {
      revealCssTarget(editor, existingLine, target.selector);
      return;
    }

    insertCssTarget(editor, currentValue, target, sourceTargetComment, updateValue);
  };

  const startTargetEdit = (target: SourceEditorTarget): void => {
    setEditingTarget({ selector: target.selector, value: target.selector });
  };

  const handleFloatingSnippet = (snippet: SourceEditorSnippet): void => {
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
    const nextValue = `${currentValue.replace(/\s+$/, '')}${separator}${snippet.snippet}\n`;
    const model = editor?.getModel?.();
    const fullRange = model?.getFullModelRange?.();

    if (!editor || !model || !fullRange || typeof editor.executeEdits !== 'function') {
      updateValue(nextValue);
      return;
    }

    editor.focus?.();
    editor.pushUndoStop?.();
    editor.executeEdits('source-editor-snippet-shortcut', [
      {
        forceMoveMarkers: true,
        range: fullRange,
        text: nextValue
      }
    ]);
    editor.pushUndoStop?.();
    settleCursorAtEditorPosition(editor, model.getPositionAt?.(nextValue.length));
  };

  const commitTargetEdit = (target: SourceEditorTarget, value: string): void => {
    const nextSelector = normalizeEditableTargetSelector(value, target.selector);
    setEditingTarget(null);

    if (nextSelector === target.selector) {
      return;
    }

    const editor = floatingEditorRef.current || inlineEditorRef.current;
    const currentValue = editor?.getValue?.() || draft || '';
    const nextValue = replaceCssTargetSelector(currentValue, target.selector, nextSelector);

    if (onTargetRename) {
      const diagnostics = getSourceDiagnostics(nextValue, maxBytes, validate);
      if (!shouldCommitSource(commitMode, diagnostics)) {
        return;
      }
      setDraft(nextValue);
      props.onDraftChange?.(nextValue);
      onTargetRename(target, nextSelector, nextValue);
      return;
    }

    updateValue(nextValue);
  };

  const sourceToolbar = (
    <SourceEditorShortcutToolbar
      ariaLabel={toolbarLabel}
      editingTarget={editingTarget}
      snippets={sourceEditorSnippets}
      targets={sourceEditorTargets}
      onApplySnippet={handleFloatingSnippet}
      onApplyTarget={handleFloatingTarget}
      onCommitTarget={commitTargetEdit}
      onEditingTargetChange={setEditingTarget}
      onEditTarget={startTargetEdit}
    />
  );

  return (
    <div
      className={`bt-css-editor ${props.embedded ? 'bt-css-editor--embedded' : ''} ${
        props.fillHeight ? 'bt-css-editor--fill' : ''
      }`}
    >
      <style>{editorCss}</style>
      {!props.embedded && (
        <div className="bt-css-editor__header">
          <label className="bt-css-editor__label">{props.label}</label>
          <button aria-expanded={floatingOpen} className="bt-css-editor__popout" type="button" onClick={toggleFloatingEditor}>
            Pop out
          </button>
        </div>
      )}
      {!props.embedded && props.description && <p className="bt-css-editor__description">{props.description}</p>}
      {sourceDiagnostics.length > 0 && (
        <div aria-live="polite" className="bt-css-editor__source-diagnostics">
          {sourceDiagnostics.map((diagnostic, index) => (
            <div
              className={`bt-css-editor__source-diagnostic bt-css-editor__source-diagnostic--${diagnostic.level}`}
              key={`${diagnostic.level}-${index}`}
            >
              {diagnostic.message}
            </div>
          ))}
        </div>
      )}
      {shouldShowMonacoDiagnostic(monacoDiagnostic) && <MonacoDiagnosticNotice diagnostic={monacoDiagnostic} />}
      {props.showShortcuts ? sourceToolbar : null}
      <div
        className="bt-css-editor__frame"
        onClick={stopEditorEventPropagation}
        onMouseDown={stopEditorEventPropagation}
        onPointerDown={stopEditorEventPropagation}
        style={props.fillHeight ? { height: '100%', minHeight: inlineHeight } : { height: inlineHeight, minHeight: inlineHeight }}
      >
        {!editorReady && (
          <FallbackSourceEditor
            label={props.label}
            language={props.language}
            placeholder={props.placeholder}
            value={draft}
            onChange={updateValue}
          />
        )}
        <div className={`bt-css-editor__monaco ${editorReady ? 'bt-css-editor__monaco--ready' : ''}`}>
          <BundledMonacoEditor
            adapter={monacoAdapter}
            height={`${inlineHeight}px`}
            language={props.language}
            path={inlineModelPath}
            theme="vs-dark"
            value={draft}
            beforeMount={(monaco) => configureSourceEditorMonaco(monaco, props.language)}
            onMount={(editor) => {
              inlineEditorRef.current = editor;
              handleCssEditorMount(editor, sourceEditorTargetsRef, () => {
                setEditorReady(true);
                markMonacoReady();
              });
            }}
            onChange={(value) => {
              const nextValue = value || '';
              updateValue(nextValue);
            }}
            onLoadError={markMonacoError}
            options={{
              acceptSuggestionOnEnter: sourceEditorAcceptSuggestionOnEnter,
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
              tabCompletion: sourceEditorTabCompletion,
              tabSize: 2,
              wordBasedSuggestions: 'off',
              wordWrap: 'on',
              ...(props.placeholder ? { placeholder: props.placeholder } : {})
            }}
          />
        </div>
      </div>
      {floatingOpen &&
        renderFloatingEditorLayer(
          <div
            aria-label={`${props.label} floating editor`}
            aria-modal="false"
            className={`bt-floating-editor ${pointerState?.mode === 'resize' ? 'bt-floating-editor--resizing' : ''}`}
            ref={floatingPanelRef}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleFloatingKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              height: floatingRect.height,
              left: floatingRect.left,
              top: floatingRect.top,
              width: floatingRect.width
            }}
          >
            <div className="bt-floating-editor__titlebar" onPointerDown={startFloatingMove}>
              <span>{props.label}</span>
              <button
                aria-label="Close floating editor"
                className="bt-floating-editor__close"
                title={`Close (${closeShortcutLabel})`}
                type="button"
                onClick={closeFloatingEditor}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>Close</span>
                <kbd className="bt-floating-editor__close-shortcut">{closeShortcutLabel}</kbd>
              </button>
            </div>
            {sourceToolbar}
            <div className="bt-floating-editor__body">
              {!floatingEditorReady && (
                <FallbackSourceEditor
                  label={`${props.label} floating editor`}
                  language={props.language}
                  placeholder={props.placeholder}
                  value={draft}
                  onChange={updateValue}
                />
              )}
              <div className={`bt-css-editor__monaco ${floatingEditorReady ? 'bt-css-editor__monaco--ready' : ''}`}>
                <BundledMonacoEditor
                  adapter={monacoAdapter}
                  height="100%"
                  language={props.language}
                  path={floatingModelPath}
                  theme="vs-dark"
                  value={draft}
                  beforeMount={(monaco) => configureSourceEditorMonaco(monaco, props.language)}
                  onMount={(editor) => {
                    floatingEditorRef.current = editor;
                    handleCssEditorMount(
                      editor,
                      sourceEditorTargetsRef,
                      () => {
                        setFloatingEditorReady(true);
                        markMonacoReady();
                      },
                      closeFloatingEditor
                    );
                  }}
                  onChange={(value) => updateValue(value || '')}
                  onLoadError={markMonacoError}
                  options={{
                    acceptSuggestionOnEnter: sourceEditorAcceptSuggestionOnEnter,
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
                    tabCompletion: sourceEditorTabCompletion,
                    tabSize: 2,
                    wordBasedSuggestions: 'off',
                    wordWrap: 'on',
                    ...(props.placeholder ? { placeholder: props.placeholder } : {})
                  }}
                />
              </div>
            </div>
            {floatingResizeZones.map((handle) => (
              <div
                aria-label={handle.label}
                className={`bt-floating-editor__resize-zone bt-floating-editor__resize-zone--${handle.direction}`}
                key={handle.direction}
                role="separator"
                onPointerDown={(event) => startFloatingResize(event, handle.direction)}
              />
            ))}
          </div>
        )}
    </div>
  );
};

function renderFloatingEditorLayer(element: JSX.Element): React.ReactNode {
  if (typeof document === 'undefined' || !document.body) {
    return element;
  }

  return ReactDom.createPortal(element, document.body);
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
  language: SourceEditorLanguage;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

interface BundledMonacoEditorProps {
  adapter: SourceEditorMonacoAdapter;
  height: string;
  language: SourceEditorLanguage;
  path: string;
  theme: string;
  value: string;
  beforeMount: (monaco: MonacoApi) => void;
  onMount: (editor: BundledMonaco.editor.IStandaloneCodeEditor) => void;
  onChange: (value: string | undefined) => void;
  onLoadError: (error: unknown) => void;
  options: BundledMonaco.editor.IStandaloneEditorConstructionOptions;
}

type MonacoDiagnosticStatus = 'not-configured' | 'loading' | 'slow' | 'ready' | 'error';

interface MonacoDiagnostic {
  status: MonacoDiagnosticStatus;
  updatedAt: string;
  message?: string;
}

interface MonacoDiagnosticNoticeProps {
  diagnostic: MonacoDiagnostic;
}

interface SourceEditorShortcutToolbarProps {
  ariaLabel: string;
  editingTarget: { selector: string; value: string } | null;
  snippets: readonly SourceEditorSnippet[];
  targets: readonly SourceEditorTarget[];
  onApplySnippet: (snippet: SourceEditorSnippet) => void;
  onApplyTarget: (target: SourceEditorTarget) => void;
  onCommitTarget: (target: SourceEditorTarget, value: string) => void;
  onEditingTargetChange: React.Dispatch<React.SetStateAction<{ selector: string; value: string } | null>>;
  onEditTarget: (target: SourceEditorTarget) => void;
}

const SourceEditorShortcutToolbar: React.FunctionComponent<SourceEditorShortcutToolbarProps> = (props) => {
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

  const renderTarget = (target: SourceEditorTarget, location: 'inline' | 'menu'): React.ReactNode => {
    const isEditing = props.editingTarget?.selector === target.selector;
    const isHiddenMeasurement = location === 'inline' && isCollapsed;

    if (target.editable) {
      return (
        <span
          className={`bt-floating-editor__target-chip ${isEditing ? 'bt-floating-editor__target-chip--editing' : ''} ${
            location === 'menu' ? 'bt-floating-editor__target-chip--menu' : ''
          }`}
          key={`${location}-${target.selector}`}
        >
          {isEditing ? (
            <input
              aria-label={target.renameLabel || `Edit ${target.selector}`}
              autoFocus={!isHiddenMeasurement}
              className="bt-floating-editor__target-input"
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
                className="bt-floating-editor__target-button"
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
                className="bt-floating-editor__target-edit-button"
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
        className={`bt-floating-editor__target-button ${location === 'menu' ? 'bt-floating-editor__target-button--menu' : ''}`}
        key={`${location}-${target.selector}`}
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
        aria-label={snippet.label}
        className={`bt-floating-editor__target-button ${location === 'menu' ? 'bt-floating-editor__target-button--menu' : ''}`}
        key={`${location}-${snippet.label}:${snippet.searchText || snippet.snippet}`}
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
    <div className="bt-floating-editor__toolbar" aria-label={props.ariaLabel} ref={toolbarRef} role="toolbar">
      <div
        aria-hidden={isCollapsed ? 'true' : undefined}
        className={`bt-floating-editor__toolbar-items-viewport ${
          isCollapsed ? 'bt-floating-editor__toolbar-items-viewport--measuring' : ''
        }`}
      >
        <div className="bt-floating-editor__toolbar-items" ref={itemsRef}>
          {props.targets.map((target) => renderTarget(target, 'inline'))}
          {props.snippets.map((snippet) => renderSnippet(snippet, 'inline'))}
        </div>
      </div>
      {isCollapsed ? (
        <details className="bt-floating-editor__shortcut-menu" ref={menuRef}>
          <summary
            aria-haspopup="true"
            aria-label={`Open ${props.ariaLabel}`}
            className="bt-floating-editor__shortcut-menu-trigger"
            role="button"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>Shortcuts</span>
            <span className="bt-floating-editor__shortcut-menu-count">{shortcutCount}</span>
            <ChevronDownIcon />
          </summary>
          <div aria-label={props.ariaLabel} className="bt-floating-editor__shortcut-menu-list" role="group">
            {props.targets.map((target) => renderTarget(target, 'menu'))}
            {props.snippets.map((snippet) => renderSnippet(snippet, 'menu'))}
          </div>
        </details>
      ) : null}
    </div>
  );
};

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
      const nextCollapsed = shouldCollapseShortcutToolbar(availableWidth, items.scrollWidth);
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

const MonacoDiagnosticNotice: React.FunctionComponent<MonacoDiagnosticNoticeProps> = (props) => {
  const diagnostic = props.diagnostic;
  const message =
    diagnostic.status === 'error'
      ? `Monaco failed to load: ${diagnostic.message || 'Unknown error'}`
      : 'Monaco is still loading. Fallback editor is active.';

  return (
    <div className={`bt-css-editor__diagnostic bt-css-editor__diagnostic--${diagnostic.status}`}>
      <span>{message}</span>
      <button className="bt-css-editor__diagnostic-copy" type="button" onClick={() => copyMonacoDiagnostic(diagnostic)}>
        Copy diagnostics
      </button>
    </div>
  );
};

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

const FallbackSourceEditor: React.FunctionComponent<FallbackSourceEditorProps> = (props) => {
  const highlightRef = React.useRef<HTMLPreElement | null>(null);

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
        className="bt-css-editor__highlight"
        dangerouslySetInnerHTML={{
          __html: props.language === 'scss' ? highlightCss(props.value || '') : escapeHtml(props.value || '')
        }}
        ref={highlightRef}
      />
      <textarea
        aria-label={props.label}
        className="bt-css-editor__textarea"
        placeholder={props.placeholder}
        spellCheck={false}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onClick={stopEditorEventPropagation}
        onMouseDown={stopEditorEventPropagation}
        onPointerDown={stopEditorEventPropagation}
        onScroll={syncScroll}
      />
    </>
  );
};

const BundledMonacoEditor: React.FunctionComponent<BundledMonacoEditorProps> = (props) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<BundledMonaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoApi, setMonacoApi] = React.useState<MonacoApi | null>(null);
  const beforeMountRef = React.useRef(props.beforeMount);
  const onMountRef = React.useRef(props.onMount);
  const onChangeRef = React.useRef(props.onChange);
  const onLoadErrorRef = React.useRef(props.onLoadError);

  React.useEffect(() => {
    beforeMountRef.current = props.beforeMount;
  }, [props.beforeMount]);

  React.useEffect(() => {
    onMountRef.current = props.onMount;
  }, [props.onMount]);

  React.useEffect(() => {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  React.useEffect(() => {
    onLoadErrorRef.current = props.onLoadError;
  }, [props.onLoadError]);

  React.useEffect(() => {
    let active = true;
    setMonacoApi(null);
    void props.adapter
      .load(props.language)
      .then((api) => {
        if (active) {
          setMonacoApi(api);
        }
      })
      .catch((error) => {
        if (active) {
          onLoadErrorRef.current(error);
        }
      });
    return () => {
      active = false;
    };
  }, [props.adapter, props.language]);

  React.useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.updateOptions(props.options);
  }, [props.options]);

  React.useEffect(() => {
    monacoApi?.editor.setTheme(props.theme);
  }, [monacoApi, props.theme]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === props.value) {
      return;
    }

    editor.setValue(props.value);
  }, [props.value]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !monacoApi) {
      return undefined;
    }

    beforeMountRef.current(monacoApi);

    const modelUri = monacoApi.Uri.parse(`inmemory://source-editor/${props.path}`);
    const existingModel = monacoApi.editor.getModel(modelUri);
    const model = existingModel || monacoApi.editor.createModel(props.value, props.language, modelUri);
    if (model.getValue() !== props.value) {
      model.setValue(props.value);
    }

    const editor = monacoApi.editor.create(container, {
      ...props.options,
      automaticLayout: true,
      model,
      theme: props.theme
    });
    editorRef.current = editor;

    const changeSubscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });
    onMountRef.current(editor);

    return () => {
      changeSubscription.dispose();
      editor.dispose();
      if (!existingModel) {
        model.dispose();
      }
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
    // Model identity owns this editor lifecycle. Value, options, and theme are synchronized by the effects above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monacoApi, props.language, props.path]);

  return <div ref={containerRef} style={{ height: props.height, width: '100%' }} />;
};

function stopEditorEventPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

function createMonacoDiagnostic(status: MonacoDiagnosticStatus, message?: string): MonacoDiagnostic {
  return {
    status,
    updatedAt: new Date().toISOString(),
    message
  };
}

function shouldShowMonacoDiagnostic(diagnostic: MonacoDiagnostic): boolean {
  return diagnostic.status === 'slow' || diagnostic.status === 'error';
}

function publishMonacoDiagnostic(diagnostic: MonacoDiagnostic): void {
  if (typeof window === 'undefined') {
    return;
  }

  const diagnosticWindow = window as unknown as {
    __betterTextMonaco?: MonacoDiagnostic;
    __sourceEditorMonaco?: MonacoDiagnostic;
  };
  diagnosticWindow.__sourceEditorMonaco = diagnostic;
  diagnosticWindow.__betterTextMonaco = diagnostic;
}

function copyMonacoDiagnostic(diagnostic: MonacoDiagnostic): void {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }

  navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2)).catch(() => undefined);
}

function configureSourceEditorMonaco(monaco: any, language: SourceEditorLanguage): void {
  if (language !== 'scss') {
    return;
  }
  configureCssLanguage(monaco);
  registerSourceEditorCompletions(monaco);
}

function handleCssEditorMount(
  editor: any,
  targetsRef: React.MutableRefObject<readonly SourceEditorTarget[]>,
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

function appendCssTarget(source: string, target: SourceEditorTarget, targetComment: string): string {
  const withComment = ensureCssTargetComment(source, targetComment);
  return withComment.trim() ? `${withComment.replace(/\s+$/, '')}\n\n${target.snippet}\n` : `${target.snippet}\n`;
}

function insertCssTarget(
  editor: any,
  source: string,
  target: SourceEditorTarget,
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
    'source-editor-target-shortcut',
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
  const trimmed = source.replace(/^\s+/, '');
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
  targetsRef: React.MutableRefObject<readonly SourceEditorTarget[]>
): void {
  if (typeof model === 'object' && model !== null) {
    cssEditorTargetsByModel.set(model, targetsRef);
  }
}

export function getCssEditorTargetsForModel(model: unknown): readonly SourceEditorTarget[] {
  return typeof model === 'object' && model !== null ? cssEditorTargetsByModel.get(model)?.current || [] : [];
}

export function createSourceEditorSuggestions(
  monaco: any,
  range: Record<string, number>,
  targets: readonly SourceEditorTarget[]
): any[] {
  return [
    ...createSelectorSuggestions(monaco, range, targets),
    ...createPropertySuggestions(monaco, range),
    ...createValueSuggestions(monaco, range)
  ];
}

function createSelectorSuggestions(monaco: any, range: any, targets: readonly SourceEditorTarget[]): any[] {
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
    return `<span class="bt-css-token bt-css-token--comment">${value}</span>`;
  }
  if (match[2]) {
    return `<span class="bt-css-token bt-css-token--string">${value}</span>`;
  }
  if (match[3]) {
    return `<span class="bt-css-token bt-css-token--at-rule">${value}</span>`;
  }
  if (match[4]) {
    return `<span class="bt-css-token bt-css-token--color">${value}</span>`;
  }
  if (match[5]) {
    return `<span class="bt-css-token bt-css-token--punctuation">${value}</span>`;
  }
  if (match[6]) {
    return `<span class="bt-css-token bt-css-token--selector">${value}</span>`;
  }
  if (match[7]) {
    return `<span class="bt-css-token bt-css-token--property">${value}</span>`;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const editorCss = `.bt-css-editor {
  display: grid;
  gap: 6px;
  font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.bt-css-editor--embedded {
  min-width: 0;
}

.bt-css-editor--fill {
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.bt-css-editor--fill .bt-css-editor__frame {
  min-height: 0 !important;
}

.bt-css-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bt-css-editor__label {
  color: #323130;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.bt-css-editor__description {
  margin: 0;
  color: #605e5c;
  font-size: 12px;
  line-height: 16px;
}

.bt-css-editor__diagnostic {
  display: grid;
  gap: 4px;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  padding: 6px 8px;
  color: #78350f;
  background: #fffbeb;
  font-size: 11px;
  line-height: 15px;
}

.bt-css-editor__diagnostic--error {
  border-color: #fca5a5;
  color: #7f1d1d;
  background: #fef2f2;
}

.bt-css-editor__diagnostic code {
  overflow-wrap: anywhere;
  color: inherit;
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 10px;
  line-height: 14px;
}

.bt-css-editor__diagnostic-copy {
  justify-self: start;
  border: 1px solid currentColor;
  border-radius: 2px;
  padding: 1px 6px;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.bt-css-editor__source-diagnostics {
  display: grid;
  gap: 4px;
}

.bt-css-editor__source-diagnostic {
  border: 1px solid #fbbf24;
  border-radius: 4px;
  padding: 6px 8px;
  color: #78350f;
  background: #fffbeb;
  font-size: 11px;
  line-height: 15px;
}

.bt-css-editor__source-diagnostic--error {
  border-color: #fca5a5;
  color: #7f1d1d;
  background: #fef2f2;
}

.bt-css-editor__popout,
.bt-floating-editor__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #c8c6c4;
  border-radius: 2px;
  padding: 2px 8px;
  color: #323130;
  background: #ffffff;
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.bt-css-editor__popout:hover,
.bt-css-editor__popout:focus-visible,
.bt-floating-editor__close:hover,
.bt-floating-editor__close:focus-visible {
  border-color: #0078d4;
  outline: none;
}

.bt-css-editor__frame {
  position: relative;
  min-height: 190px;
  height: 190px;
  overflow: hidden;
  border: 1px solid #334155;
  border-radius: 4px;
  background: #0f172a;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%);
  isolation: isolate;
}

.bt-css-editor__monaco {
  position: absolute;
  inset: 0;
  z-index: 2;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}

.bt-css-editor__monaco--ready {
  opacity: 1;
  pointer-events: auto;
}

.bt-css-editor__monaco-loading {
  display: none;
}

.bt-css-editor__highlight,
.bt-css-editor__textarea {
  position: absolute;
  inset: 0;
  overflow: auto;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  padding: 8px;
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 18px;
  tab-size: 2;
  white-space: pre;
}

.bt-css-editor__highlight {
  z-index: 0;
  pointer-events: none;
  color: #dbeafe;
}

.bt-css-editor__textarea {
  z-index: 1;
  color: transparent;
  background: transparent;
  caret-color: #ffffff;
  outline: none;
  pointer-events: auto;
  resize: none;
}

.bt-css-editor__textarea::selection {
  background: rgb(96 165 250 / 34%);
}

.bt-css-token--comment {
  color: #7dd3fc;
}

.bt-css-token--string,
.bt-css-token--color {
  color: #fca5a5;
}

.bt-css-token--at-rule {
  color: #c084fc;
}

.bt-css-token--selector {
  color: #93c5fd;
}

.bt-css-token--property {
  color: #fcd34d;
}

.bt-css-token--punctuation {
  color: #cbd5e1;
}

.bt-floating-editor {
  position: fixed;
  z-index: 2147483647;
  isolation: isolate;
  pointer-events: auto;
  display: grid;
  grid-template-rows: 36px auto minmax(0, 1fr);
  min-width: 360px;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid #475569;
  border-radius: 8px;
  background: #0f172a;
  box-shadow: 0 24px 64px rgb(0 0 0 / 28%), 0 8px 24px rgb(0 0 0 / 18%);
  font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.bt-floating-editor button,
.bt-floating-editor input,
.bt-floating-editor kbd {
  font-family: inherit;
}

.bt-floating-editor__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #334155;
  padding: 0 8px 0 12px;
  color: #f8fafc;
  background: #111827;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  cursor: move;
  user-select: none;
}

.bt-floating-editor__close {
  position: relative;
  z-index: 5;
  border-color: #475569;
  color: #f8fafc;
  background: #1e293b;
}

.bt-floating-editor__close-shortcut {
  border: 0;
  padding: 0;
  color: rgb(248 250 252 / 58%);
  background: transparent;
  font: inherit;
  font-size: 10px;
  line-height: 14px;
}

.bt-floating-editor__toolbar {
  position: relative;
  z-index: 6;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: visible;
  border-bottom: 1px solid #334155;
  padding: 6px 8px;
  background: #0b1220;
}

.bt-floating-editor__toolbar-items-viewport {
  min-width: 0;
  overflow: hidden;
}

.bt-floating-editor__toolbar-items {
  display: flex;
  width: max-content;
  align-items: center;
  gap: 6px;
}

.bt-floating-editor__toolbar-items-viewport--measuring {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}

.bt-floating-editor__shortcut-menu {
  position: relative;
}

.bt-floating-editor__shortcut-menu-trigger {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  gap: 6px;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 3px 8px;
  color: #dbeafe;
  background: #1e293b;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  cursor: pointer;
  list-style: none;
}

.bt-floating-editor__shortcut-menu-trigger::-webkit-details-marker {
  display: none;
}

.bt-floating-editor__shortcut-menu-trigger svg {
  width: 14px;
  height: 14px;
  transition: transform 120ms ease;
}

.bt-floating-editor__shortcut-menu[open] .bt-floating-editor__shortcut-menu-trigger svg {
  transform: rotate(180deg);
}

.bt-floating-editor__shortcut-menu-count {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.bt-floating-editor__shortcut-menu-list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  display: grid;
  width: max-content;
  min-width: 220px;
  max-width: min(360px, calc(100vw - 32px));
  max-height: min(320px, calc(100vh - 180px));
  gap: 4px;
  overflow-y: auto;
  border: 1px solid #475569;
  border-radius: 8px;
  padding: 6px;
  background: #111827;
  box-shadow: 0 12px 28px rgb(0 0 0 / 32%);
}

.bt-floating-editor__target-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 3px 8px;
  color: #dbeafe;
  background: #1e293b;
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.bt-floating-editor__target-button--menu {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.bt-floating-editor__target-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
}

.bt-floating-editor__target-chip--menu {
  width: 100%;
}

.bt-floating-editor__target-chip--menu .bt-floating-editor__target-button {
  min-width: 0;
  flex: 1 1 auto;
  text-align: left;
}

.bt-floating-editor__target-chip .bt-floating-editor__target-button {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.bt-floating-editor__target-edit-button {
  display: inline-grid;
  width: 26px;
  min-width: 26px;
  place-items: center;
  border: 0;
  border-left: 1px solid #475569;
  color: #bfdbfe;
  background: transparent;
  cursor: pointer;
}

.bt-floating-editor__target-edit-button svg {
  width: 14px;
  height: 14px;
}

.bt-floating-editor__target-input {
  width: 132px;
  border: 0;
  padding: 3px 8px;
  color: #f8fafc;
  background: #020617;
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 16px;
  outline: 1px solid #60a5fa;
  outline-offset: -1px;
}

.bt-floating-editor__target-button:hover,
.bt-floating-editor__target-button:focus-visible,
.bt-floating-editor__target-edit-button:hover,
.bt-floating-editor__target-edit-button:focus-visible {
  border-color: #93c5fd;
  color: #ffffff;
  background: #24324a;
}

.bt-floating-editor__body {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.bt-floating-editor--resizing,
.bt-floating-editor--resizing * {
  user-select: none;
}

.bt-floating-editor__resize-zone {
  position: absolute;
  z-index: 4;
  border: 0;
  padding: 0;
  background: transparent;
  touch-action: none;
}

.bt-floating-editor__resize-zone--n,
.bt-floating-editor__resize-zone--s {
  right: 18px;
  left: 18px;
  height: 10px;
  cursor: ns-resize;
}

.bt-floating-editor__resize-zone--n {
  top: 0;
}

.bt-floating-editor__resize-zone--s {
  bottom: 0;
}

.bt-floating-editor__resize-zone--e,
.bt-floating-editor__resize-zone--w {
  top: 18px;
  bottom: 18px;
  width: 10px;
  cursor: ew-resize;
}

.bt-floating-editor__resize-zone--e {
  right: 0;
}

.bt-floating-editor__resize-zone--w {
  left: 0;
}

.bt-floating-editor__resize-zone--ne,
.bt-floating-editor__resize-zone--nw,
.bt-floating-editor__resize-zone--se,
.bt-floating-editor__resize-zone--sw {
  width: 18px;
  height: 18px;
}

.bt-floating-editor__resize-zone--ne,
.bt-floating-editor__resize-zone--sw {
  cursor: nesw-resize;
}

.bt-floating-editor__resize-zone--nw,
.bt-floating-editor__resize-zone--se {
  cursor: nwse-resize;
}

.bt-floating-editor__resize-zone--ne,
.bt-floating-editor__resize-zone--nw {
  top: 0;
}

.bt-floating-editor__resize-zone--se,
.bt-floating-editor__resize-zone--sw {
  bottom: 0;
}

.bt-floating-editor__resize-zone--ne,
.bt-floating-editor__resize-zone--se {
  right: 0;
}

.bt-floating-editor__resize-zone--nw,
.bt-floating-editor__resize-zone--sw {
  left: 0;
}`;
