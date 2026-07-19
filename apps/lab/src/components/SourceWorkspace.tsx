import * as React from 'react';
import { SourceEditor, SourceEditorProps, constrainFloatingRect, isCloseShortcut, resizeFloatingRect } from './SourceEditor';
import type { FloatingRect, ResizeDirection } from './SourceEditor';

export interface SourceWorkspaceDocument extends Omit<SourceEditorProps, 'embedded' | 'fillHeight' | 'showShortcuts'> {
  id: string;
}

export interface SourceWorkspaceProps {
  description?: string;
  documents: readonly SourceWorkspaceDocument[];
  label: string;
  defaultView?: 'first' | 'split';
}

type WorkspaceView = string | 'split';

let nextSourceWorkspaceInstanceId = 0;

interface PointerInteraction {
  direction?: ResizeDirection;
  mode: 'drag' | 'resize';
  startRect: FloatingRect;
  startX: number;
  startY: number;
}

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

export function SourceWorkspace(props: SourceWorkspaceProps): JSX.Element | null {
  const instanceIdRef = React.useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    nextSourceWorkspaceInstanceId += 1;
    instanceIdRef.current = nextSourceWorkspaceInstanceId;
  }
  const idPrefix = `source-workspace-${instanceIdRef.current}`;
  const panelId = `${idPrefix}-panel`;
  const firstDocumentId = props.documents[0]?.id;
  const [view, setView] = React.useState<WorkspaceView>(() =>
    props.defaultView === 'split' && props.documents.length > 1 ? 'split' : firstDocumentId || 'split'
  );
  const [floatingOpen, setFloatingOpen] = React.useState(false);
  const [floatingRect, setFloatingRect] = React.useState<FloatingRect>(() => createInitialWorkspaceRect());
  const [pointerState, setPointerState] = React.useState<PointerInteraction | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const popoutButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const closeShortcutLabel = React.useMemo(() => getCloseShortcutLabel(), []);
  const viewIds = React.useMemo(
    () => [...props.documents.map((document) => document.id), ...(props.documents.length > 1 ? ['split'] : [])],
    [props.documents]
  );

  React.useEffect(() => {
    if (view === 'split' ? props.documents.length > 1 : props.documents.some((document) => document.id === view)) {
      return;
    }
    setView(firstDocumentId || 'split');
  }, [firstDocumentId, props.documents, view]);

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

  const focusVisibleEditor = React.useCallback((): void => {
    window.requestAnimationFrame(() => {
      const editor = rootRef.current?.querySelector<HTMLElement>(
        '.source-workspace__pane:not([hidden]) textarea.ime-text-area, .source-workspace__pane:not([hidden]) .css-editor-field__textarea'
      );
      editor?.focus();
    });
  }, []);

  const openFloatingWorkspace = (): void => {
    setFloatingRect((current) => constrainFloatingRect(current));
    setFloatingOpen(true);
    focusVisibleEditor();
  };

  const closeFloatingWorkspace = React.useCallback((): void => {
    setFloatingOpen(false);
    window.requestAnimationFrame(() => popoutButtonRef.current?.focus());
  }, []);

  React.useEffect(() => {
    if (!floatingOpen) {
      return undefined;
    }
    const closeOnShortcut = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' && !isCloseShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeFloatingWorkspace();
    };
    window.addEventListener('keydown', closeOnShortcut, true);
    return () => window.removeEventListener('keydown', closeOnShortcut, true);
  }, [closeFloatingWorkspace, floatingOpen]);

  const selectView = (nextView: WorkspaceView): void => {
    setView(nextView);
    focusVisibleEditor();
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

  if (!firstDocumentId) {
    return null;
  }

  const activeTabId = `${idPrefix}-${view}-tab`;
  const viewTabs = (
    <div
      aria-label={`${props.label} views`}
      className="source-workspace__tabs"
      role="tablist"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.documents.map((document, index) => (
        <button
          aria-controls={panelId}
          aria-selected={view === document.id}
          className="source-workspace__tab"
          id={`${idPrefix}-${document.id}-tab`}
          key={document.id}
          role="tab"
          tabIndex={view === document.id ? 0 : -1}
          type="button"
          onClick={() => selectView(document.id)}
          onKeyDown={(event) => handleTabKeyDown(event, index, viewIds, selectView)}
        >
          {document.label}
        </button>
      ))}
      {props.documents.length > 1 ? (
        <button
          aria-controls={panelId}
          aria-selected={view === 'split'}
          className="source-workspace__tab source-workspace__tab--split"
          id={`${idPrefix}-split-tab`}
          role="tab"
          tabIndex={view === 'split' ? 0 : -1}
          type="button"
          onClick={() => selectView('split')}
          onKeyDown={(event) => handleTabKeyDown(event, viewIds.length - 1, viewIds, selectView)}
        >
          Split
        </button>
      ) : null}
    </div>
  );
  return (
    <div
      aria-label={floatingOpen ? `${props.label} source workspace` : undefined}
      aria-modal={floatingOpen ? 'false' : undefined}
      className={`source-workspace ${floatingOpen ? 'source-workspace--floating' : ''} ${
        pointerState?.mode === 'resize' ? 'source-workspace--resizing' : ''
      }`}
      ref={rootRef}
      role={floatingOpen ? 'dialog' : undefined}
      style={
        floatingOpen
          ? {
              height: floatingRect.height,
              left: floatingRect.left,
              top: floatingRect.top,
              width: floatingRect.width
            }
          : undefined
      }
    >
      <div className="source-workspace__titlebar" onPointerDown={(event) => startPointerInteraction('drag', event)}>
        {!floatingOpen ? <span className="source-workspace__label">{props.label}</span> : null}
        {floatingOpen ? viewTabs : null}
        {floatingOpen ? (
          <button
            aria-label="Close source workspace"
            className="css-floating-editor__close"
            title={`Close (${closeShortcutLabel})`}
            type="button"
            onClick={closeFloatingWorkspace}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>Close</span>
            <kbd className="css-floating-editor__close-shortcut">{closeShortcutLabel}</kbd>
          </button>
        ) : (
          <button
            aria-expanded="false"
            className="css-editor-field__popout"
            ref={popoutButtonRef}
            type="button"
            onClick={openFloatingWorkspace}
          >
            Pop out
          </button>
        )}
      </div>
      {props.description && !floatingOpen ? <p className="source-workspace__description">{props.description}</p> : null}
      {!floatingOpen ? viewTabs : null}
      <div
        aria-labelledby={activeTabId}
        className={`source-workspace__body ${view === 'split' ? 'source-workspace__body--split' : ''}`}
        id={panelId}
        role="tabpanel"
      >
        {props.documents.map((document) => {
          const visible = view === 'split' || view === document.id;
          return (
            <section
              aria-label={`${document.label} editor`}
              className="source-workspace__pane"
              hidden={!visible}
              key={document.id}
            >
              {view === 'split' ? <h3 className="source-workspace__pane-label">{document.label}</h3> : null}
              <SourceEditor
                {...document}
                embedded
                fillHeight={floatingOpen}
                minHeight={document.height || document.minHeight || 260}
                showShortcuts={floatingOpen}
              />
            </section>
          );
        })}
      </div>
      {floatingOpen
        ? resizeZones.map((handle) => (
            <div
              aria-label={handle.label}
              className={`css-floating-editor__resize-zone css-floating-editor__resize-zone--${handle.direction}`}
              key={handle.direction}
              role="separator"
              onPointerDown={(event) => startPointerInteraction('resize', event, handle.direction)}
            />
          ))
        : null}
    </div>
  );
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
