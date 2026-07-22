/* eslint-disable @typescript-eslint/no-use-before-define -- The component composes shared workspace styles declared after its implementation. */

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { SourceEditorField, constrainFloatingRect, isCloseShortcut, resizeFloatingRect } from './SourceEditorField';
import type { FloatingRect, ResizeDirection, SourceEditorFieldProps } from './SourceEditorField';

export interface SourceWorkspaceDocument extends Omit<
  SourceEditorFieldProps,
  'embedded' | 'fillHeight' | 'onDraftChange' | 'showShortcuts'
> {
  id: string;
}

export interface SourceWorkspaceFieldProps {
  description?: string;
  documents: readonly SourceWorkspaceDocument[];
  label: string;
  defaultView?: 'first' | 'split';
}

type WorkspaceView = string | 'split';

interface SourceWorkspaceState {
  committedValues: Record<string, string>;
  drafts: Record<string, string>;
  floatingOpen: boolean;
}

type SourceWorkspaceAction =
  | { type: 'set-floating'; open: boolean }
  | { type: 'sync-documents'; documents: readonly SourceWorkspaceDocument[] }
  | { type: 'update-draft'; documentId: string; value: string };

interface PointerInteraction {
  direction?: ResizeDirection;
  mode: 'drag' | 'resize';
  startRect: FloatingRect;
  startX: number;
  startY: number;
}

let nextSourceWorkspaceInstanceId = 0;

const resizeZones: Array<{ direction: ResizeDirection; label: string }> = [
  { direction: 'n', label: 'Resize source workspace from top edge' },
  { direction: 's', label: 'Resize source workspace from bottom edge' },
  { direction: 'w', label: 'Resize source workspace from left edge' },
  { direction: 'e', label: 'Resize source workspace from right edge' },
  { direction: 'nw', label: 'Resize source workspace from top left' },
  { direction: 'ne', label: 'Resize source workspace from top right' },
  { direction: 'sw', label: 'Resize source workspace from bottom left' },
  { direction: 'se', label: 'Resize source workspace from bottom right' }
];

export const SourceWorkspaceField: React.FunctionComponent<SourceWorkspaceFieldProps> = (props) => {
  const instanceIdRef = React.useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    nextSourceWorkspaceInstanceId += 1;
    instanceIdRef.current = nextSourceWorkspaceInstanceId;
  }

  const idPrefix = `source-workspace-${instanceIdRef.current}`;
  const firstDocumentId = props.documents[0]?.id;
  const [view, setView] = React.useState<WorkspaceView>(() =>
    props.defaultView === 'split' && props.documents.length > 1 ? 'split' : firstDocumentId || 'split'
  );
  const [lastDocumentView, setLastDocumentView] = React.useState<string>(() => firstDocumentId || 'split');
  const [workspaceState, dispatchWorkspaceAction] = React.useReducer(
    reduceSourceWorkspaceState,
    props.documents,
    createSourceWorkspaceState
  );
  const floatingOpen = workspaceState.floatingOpen;
  const [floatingRect, setFloatingRect] = React.useState<FloatingRect>(() => createInitialWorkspaceRect());
  const [pointerState, setPointerState] = React.useState<PointerInteraction | null>(null);
  const inlineRootRef = React.useRef<HTMLDivElement | null>(null);
  const floatingRootRef = React.useRef<HTMLDivElement | null>(null);
  const popoutButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const closeShortcutLabel = React.useMemo(() => getCloseShortcutLabel(), []);
  const documentViewIds = React.useMemo(() => props.documents.map((document) => document.id), [props.documents]);

  React.useEffect(() => {
    if (view === 'split' ? props.documents.length > 1 : props.documents.some((document) => document.id === view)) {
      return;
    }
    setView(firstDocumentId || 'split');
  }, [firstDocumentId, props.documents, view]);

  React.useEffect(() => {
    if (props.documents.some((document) => document.id === lastDocumentView)) {
      return;
    }
    setLastDocumentView(firstDocumentId || 'split');
  }, [firstDocumentId, lastDocumentView, props.documents]);

  React.useEffect(() => {
    dispatchWorkspaceAction({ type: 'sync-documents', documents: props.documents });
  }, [props.documents]);

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

  const focusVisibleEditor = React.useCallback((floating: boolean): void => {
    window.requestAnimationFrame(() => {
      const editor = (floating ? floatingRootRef.current : inlineRootRef.current)?.querySelector<HTMLElement>(
        '.bt-source-workspace__pane:not([hidden]) textarea.ime-text-area, .bt-source-workspace__pane:not([hidden]) .bt-css-editor__textarea'
      );
      editor?.focus();
    });
  }, []);

  const closeFloatingWorkspace = React.useCallback((): void => {
    setView((currentView) => (currentView === 'split' ? lastDocumentView : currentView));
    dispatchWorkspaceAction({ type: 'set-floating', open: false });
    window.requestAnimationFrame(() => popoutButtonRef.current?.focus());
  }, [lastDocumentView]);

  React.useEffect(() => {
    if (!floatingOpen) {
      return undefined;
    }
    const closeOnShortcut = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || (event.key !== 'Escape' && !isCloseShortcut(event))) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeFloatingWorkspace();
    };
    window.addEventListener('keydown', closeOnShortcut);
    return () => window.removeEventListener('keydown', closeOnShortcut);
  }, [closeFloatingWorkspace, floatingOpen]);

  if (!firstDocumentId) {
    return null;
  }

  const selectView = (nextView: WorkspaceView, floating: boolean): void => {
    if (nextView !== 'split') {
      setLastDocumentView(nextView);
    }
    setView(nextView);
    focusVisibleEditor(floating);
  };

  const startPointerInteraction = (
    mode: PointerInteraction['mode'],
    event: React.PointerEvent<HTMLDivElement>,
    direction?: ResizeDirection
  ): void => {
    if (!floatingOpen || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPointerState({
      direction,
      mode,
      startRect: floatingRect,
      startX: event.clientX,
      startY: event.clientY
    });
  };

  const renderViewTabs = (floating: boolean): JSX.Element => {
    const surfaceId = floating ? 'floating' : 'inline';
    const panelId = `${idPrefix}-${surfaceId}-panel`;
    const selectedView = floating || view !== 'split' ? view : lastDocumentView;
    const viewIds = floating && props.documents.length > 1 ? [...documentViewIds, 'split'] : documentViewIds;

    return (
      <div
        aria-label={`${props.label} views`}
        className="bt-source-workspace__tabs"
        role="tablist"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {props.documents.map((document, index) => (
          <button
            aria-controls={panelId}
            aria-selected={selectedView === document.id}
            className="bt-source-workspace__tab"
            id={`${idPrefix}-${surfaceId}-${document.id}-tab`}
            key={document.id}
            role="tab"
            tabIndex={selectedView === document.id ? 0 : -1}
            type="button"
            onClick={() => selectView(document.id, floating)}
            onKeyDown={(event) => handleTabKeyDown(event, index, viewIds, (nextView) => selectView(nextView, floating))}
          >
            {document.label}
          </button>
        ))}
        {floating && props.documents.length > 1 ? (
          <button
            aria-controls={panelId}
            aria-label="Split"
            aria-selected={view === 'split'}
            className="bt-source-workspace__tab bt-source-workspace__tab--split"
            id={`${idPrefix}-${surfaceId}-split-tab`}
            role="tab"
            tabIndex={view === 'split' ? 0 : -1}
            title="Split view"
            type="button"
            onClick={() => selectView('split', floating)}
            onKeyDown={(event) =>
              handleTabKeyDown(event, viewIds.length - 1, viewIds, (nextView) => selectView(nextView, floating))
            }
          >
            <svg aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 3a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6ZM4 6c0-1.1.9-2 2-2h3.5v12H6a2 2 0 0 1-2-2V6Zm6.5 10V4H14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.5Z" />
            </svg>
          </button>
        ) : null}
      </div>
    );
  };

  const renderWorkspace = (floating: boolean): JSX.Element => {
    const surfaceId = floating ? 'floating' : 'inline';
    const panelId = `${idPrefix}-${surfaceId}-panel`;
    const selectedView = floating || view !== 'split' ? view : lastDocumentView;
    const activeTabId = `${idPrefix}-${surfaceId}-${selectedView}-tab`;

    return (
      <div
        aria-label={floating ? `${props.label} source workspace` : undefined}
        aria-modal={floating ? 'false' : undefined}
        className={`bt-source-workspace ${floating ? 'bt-source-workspace--floating' : ''} ${
          floating && pointerState?.mode === 'resize' ? 'bt-source-workspace--resizing' : ''
        }`}
        ref={floating ? floatingRootRef : inlineRootRef}
        role={floating ? 'dialog' : undefined}
        style={
          floating
            ? {
                height: floatingRect.height,
                left: floatingRect.left,
                top: floatingRect.top,
                width: floatingRect.width
              }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <style>{workspaceCss}</style>
        <div
          className="bt-source-workspace__titlebar"
          onPointerDown={(event) => floating && startPointerInteraction('drag', event)}
        >
          {!floating ? <span className="bt-source-workspace__label">{props.label}</span> : null}
          {floating ? renderViewTabs(true) : null}
          {floating ? (
            <button
              aria-label="Close source workspace"
              className="bt-floating-editor__close"
              title={`Close (${closeShortcutLabel})`}
              type="button"
              onClick={closeFloatingWorkspace}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span>Close</span>
              <kbd className="bt-floating-editor__close-shortcut">{closeShortcutLabel}</kbd>
            </button>
          ) : (
            <button
              aria-expanded={floatingOpen}
              className="bt-css-editor__popout"
              ref={popoutButtonRef}
              type="button"
              onClick={() => {
                if (floatingOpen) {
                  focusVisibleEditor(true);
                  return;
                }
                setFloatingRect((current) => constrainFloatingRect(current));
                dispatchWorkspaceAction({ type: 'set-floating', open: true });
                focusVisibleEditor(true);
              }}
            >
              {floatingOpen ? 'Focus pop-out' : 'Pop out'}
            </button>
          )}
        </div>
        {props.description && !floating ? <p className="bt-source-workspace__description">{props.description}</p> : null}
        {!floating ? renderViewTabs(false) : null}
        <div
          aria-labelledby={activeTabId}
          className={`bt-source-workspace__body ${selectedView === 'split' ? 'bt-source-workspace__body--split' : ''}`}
          id={panelId}
          role="tabpanel"
        >
          {props.documents.map((document) => {
            const visible = selectedView === 'split' || selectedView === document.id;
            const baseConfig = document.configuration || document.config || {};
            const modelPathPrefix = `${idPrefix}.${surfaceId}.${document.id}`;
            return (
              <section
                aria-label={`${document.label} editor`}
                className="bt-source-workspace__pane"
                hidden={!visible}
                key={`${surfaceId}-${document.id}`}
              >
                {selectedView === 'split' ? <h3 className="bt-source-workspace__pane-label">{document.label}</h3> : null}
                <SourceEditorField
                  {...document}
                  config={{
                    ...baseConfig,
                    inlineModelPath: baseConfig.inlineModelPath
                      ? `${baseConfig.inlineModelPath}.${surfaceId}`
                      : `${modelPathPrefix}.inline`,
                    floatingModelPath: baseConfig.floatingModelPath
                      ? `${baseConfig.floatingModelPath}.${surfaceId}`
                      : `${modelPathPrefix}.floating`
                  }}
                  configuration={undefined}
                  embedded
                  fillHeight={floating}
                  height={document.height || 190}
                  showShortcuts={floating}
                  value={workspaceState.drafts[document.id] ?? document.value}
                  onDraftChange={(value) => dispatchWorkspaceAction({ type: 'update-draft', documentId: document.id, value })}
                />
              </section>
            );
          })}
        </div>
        {floating
          ? resizeZones.map((handle) => (
              <div
                aria-label={handle.label}
                className={`bt-floating-editor__resize-zone bt-floating-editor__resize-zone--${handle.direction}`}
                key={handle.direction}
                role="separator"
                onPointerDown={(event) => startPointerInteraction('resize', event, handle.direction)}
              />
            ))
          : null}
      </div>
    );
  };

  return (
    <>
      {renderWorkspace(false)}
      {floatingOpen ? renderFloatingEditorLayer(renderWorkspace(true)) : null}
    </>
  );
};

function createSourceWorkspaceState(documents: readonly SourceWorkspaceDocument[]): SourceWorkspaceState {
  const values = documents.reduce<Record<string, string>>((result, document) => {
    result[document.id] = document.value || '';
    return result;
  }, {});
  return {
    committedValues: values,
    drafts: { ...values },
    floatingOpen: false
  };
}

function reduceSourceWorkspaceState(state: SourceWorkspaceState, action: SourceWorkspaceAction): SourceWorkspaceState {
  if (action.type === 'set-floating') {
    return state.floatingOpen === action.open ? state : { ...state, floatingOpen: action.open };
  }
  if (action.type === 'update-draft') {
    return state.drafts[action.documentId] === action.value
      ? state
      : { ...state, drafts: { ...state.drafts, [action.documentId]: action.value } };
  }

  const nextCommittedValues: Record<string, string> = {};
  const nextDrafts: Record<string, string> = {};
  let changed = Object.keys(state.committedValues).length !== action.documents.length;
  for (const document of action.documents) {
    const nextValue = document.value || '';
    const previousCommittedValue = state.committedValues[document.id];
    nextCommittedValues[document.id] = nextValue;
    nextDrafts[document.id] = previousCommittedValue === nextValue ? (state.drafts[document.id] ?? nextValue) : nextValue;
    changed ||= previousCommittedValue !== nextValue || state.drafts[document.id] !== nextDrafts[document.id];
  }
  return changed ? { ...state, committedValues: nextCommittedValues, drafts: nextDrafts } : state;
}

function handleTabKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  index: number,
  viewIds: readonly string[],
  selectView: (view: WorkspaceView) => void
): void {
  let nextIndex: number | undefined;
  if (event.key === 'ArrowRight') {
    nextIndex = (index + 1) % viewIds.length;
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (index - 1 + viewIds.length) % viewIds.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = viewIds.length - 1;
  }
  if (nextIndex === undefined) {
    return;
  }
  event.preventDefault();
  selectView(viewIds[nextIndex]);
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[nextIndex]?.focus();
}

function createInitialWorkspaceRect(): FloatingRect {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const width = Math.min(1040, Math.max(520, viewportWidth - 64));
  const height = Math.min(680, Math.max(360, viewportHeight - 96));
  return {
    height,
    left: Math.max(16, viewportWidth - width - 32),
    top: 48,
    width
  };
}

function getCloseShortcutLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘S' : 'Ctrl+S';
}

function renderFloatingEditorLayer(element: JSX.Element): JSX.Element {
  if (typeof document === 'undefined' || !document.body) {
    return element;
  }
  return ReactDom.createPortal(element, document.body) as unknown as JSX.Element;
}

const workspaceCss = `.bt-source-workspace {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.bt-source-workspace__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bt-source-workspace__label {
  color: #323130;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.bt-source-workspace__description {
  margin: 0;
  color: #605e5c;
  font-size: 12px;
  line-height: 16px;
}

.bt-source-workspace__tabs {
  display: flex;
  align-items: center;
  justify-self: start;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  padding: 2px;
  background: #f5f5f5;
}

.bt-source-workspace__tab {
  min-width: 0;
  border: 0;
  border-radius: 3px;
  padding: 3px 9px;
  color: #424242;
  background: transparent;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.bt-source-workspace__tab:hover,
.bt-source-workspace__tab:focus-visible {
  color: #242424;
  background: #e5e5e5;
  outline: none;
}

.bt-source-workspace__tab[aria-selected='true'] {
  color: #ffffff;
  background: #0f6cbd;
}

.bt-source-workspace__tab--split {
  display: inline-grid;
  width: 26px;
  min-width: 26px;
  place-items: center;
  padding: 3px;
}

.bt-source-workspace__tab--split svg {
  width: 16px;
  height: 16px;
}

.bt-source-workspace__body {
  min-width: 0;
}

.bt-source-workspace__body--split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.bt-source-workspace__pane {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.bt-source-workspace__body--split .bt-source-workspace__pane {
  grid-template-rows: auto minmax(0, 1fr);
}

.bt-source-workspace__pane[hidden] {
  display: none;
}

.bt-source-workspace__pane-label {
  margin: 0;
  padding: 5px 8px;
  color: #dbeafe;
  background: #0b1220;
  font-size: 11px;
  line-height: 16px;
}

.bt-source-workspace--floating {
  position: fixed;
  z-index: 2147483647;
  isolation: isolate;
  pointer-events: auto;
  grid-template-rows: 36px minmax(0, 1fr);
  gap: 0;
  min-width: 520px;
  min-height: 360px;
  overflow: hidden;
  border: 1px solid #475569;
  border-radius: 8px;
  background: #0f172a;
  box-shadow: 0 24px 64px rgb(0 0 0 / 28%), 0 8px 24px rgb(0 0 0 / 18%);
}

.bt-source-workspace--floating .bt-source-workspace__titlebar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border-bottom: 1px solid #334155;
  padding: 4px 8px;
  background: #111827;
  cursor: move;
  user-select: none;
}

.bt-source-workspace--floating .bt-source-workspace__tabs {
  justify-self: start;
  overflow-x: auto;
  border: 0;
  background: transparent;
}

.bt-source-workspace--floating .bt-source-workspace__tab {
  color: #dbeafe;
  white-space: nowrap;
}

.bt-source-workspace--floating .bt-source-workspace__tab:hover,
.bt-source-workspace--floating .bt-source-workspace__tab:focus-visible {
  color: #ffffff;
  background: #24324a;
}

.bt-source-workspace--floating .bt-source-workspace__tab[aria-selected='true'] {
  color: #ffffff;
  background: #1d4ed8;
}

.bt-source-workspace--floating .bt-source-workspace__body,
.bt-source-workspace--floating .bt-source-workspace__pane,
.bt-source-workspace--floating .bt-css-editor {
  min-height: 0;
  height: 100%;
}

.bt-source-workspace--floating .bt-css-editor--fill > .bt-floating-editor__toolbar {
  margin-block-end: -6px;
}

.bt-source-workspace--floating .bt-source-workspace__body--split {
  gap: 1px;
  background: #334155;
}

.bt-source-workspace--resizing,
.bt-source-workspace--resizing * {
  user-select: none;
}

@media (max-width: 700px) {
  .bt-source-workspace--floating {
    right: 8px !important;
    bottom: 8px !important;
    left: 8px !important;
    top: 8px !important;
    width: auto !important;
    height: auto !important;
    min-width: 0;
  }

  .bt-source-workspace--floating .bt-source-workspace__body--split {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }
}`;
