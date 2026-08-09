import * as React from 'react';
import LayoutRightIcon from '@hugeicons/core-free-icons/LayoutRightIcon';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../../packages/ui-profile/normalized/src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '../../../packages/ui-profile/normalized/src/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../packages/ui-profile/normalized/src/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../../packages/ui-profile/normalized/src/components/ui/tabs';
import { type SpfxUiHost, useSpfxUiDerivedId, useSpfxUiId } from '../../../packages/ui-profile/normalized/src/lib/ui-root';
import {
  Moon,
  PanelRight,
  RectangleHorizontal,
  Smartphone,
  Square,
  SquareDashed,
  Columns3,
  Columns2,
  Eye,
  Menu as MenuIcon,
  Pencil,
  Pin,
  Upload
} from 'lucide-react';
import {
  createLabTheme,
  createMockSpfxContext,
  LabBreakpoint,
  LabDisplayMode,
  LabPropertyBag,
  LabThemeMode,
  LabWebPart,
  LabWebPartRegistry,
  SHAREPOINT_BREAKPOINTS
} from '@spfx-kit/spfx-lab-runtime';
import { registerGeneratedWebParts } from './generated/lab-registry';
import { PropertyPane } from './components/PropertyPane';
import { PackageRuntimeSurface } from './components/PackageRuntimeSurface';
import { AddAppDrawer, AddAppMode } from './components/AddAppDrawer';
import { ExportDrawer } from './components/ExportDrawer';
import { AppManagementSidebar } from './components/AppManagementSidebar';
import type { ExportPackageFormat } from './api/labApi';
import { LocalCdnBucketDialog } from './components/LocalCdnBucketDialog';
import {
  getBrowserStorage,
  getLabAppId,
  persistPinnedAppId,
  readPinnedAppId,
  resolveInitialWebPartId,
  resolvePinnedAppId
} from './lib/pinnedApp';
import type { LabPackageMode } from './lib/packageMode';
import { LegacyFluentShellIslands } from './components/LegacyFluentShellIslands';
import { createLabUiThemeTokens } from './ui-profile/lab-theme';

type PropsByWebPart = Record<string, LabPropertyBag>;

const themeOptions: Array<{ label: string; value: LabThemeMode }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Custom', value: 'custom' }
];

interface LabAppProps {
  uiHost: SpfxUiHost;
}

export function LabApp({ uiHost }: LabAppProps): JSX.Element {
  const registry = React.useMemo(() => {
    const next = new LabWebPartRegistry();
    registerGeneratedWebParts(next);
    return next;
  }, []);
  const webParts = React.useMemo(() => registry.list(), [registry]);
  const [pinnedAppId, setPinnedAppId] = React.useState(() => resolvePinnedAppId(webParts, readPinnedAppId(getBrowserStorage())));
  const [selectedId, setSelectedId] = React.useState<string>(() => resolveInitialWebPartId(webParts, pinnedAppId));
  const selected = registry.get(selectedId) || webParts[0];
  const [breakpointId, setBreakpointId] = React.useState<LabBreakpoint['id']>('one-column');
  const [displayMode, setDisplayMode] = React.useState<LabDisplayMode>('edit');
  const [packageMode, setPackageMode] = React.useState<LabPackageMode>('standalone');
  const [boundsVisible, setBoundsVisible] = React.useState(false);
  const [appSidebarOpen, setAppSidebarOpen] = React.useState(false);
  const [themeMode, setThemeMode] = React.useState<LabThemeMode>('light');
  const [themeMenuOpen, setThemeMenuOpen] = React.useState(false);
  const [customBackground, setCustomBackground] = React.useState('#eef6ff');
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<AddAppMode>('import');
  const [localCdnBucketOpen, setLocalCdnBucketOpen] = React.useState(false);
  const [cdnSelectionRevision, setCdnSelectionRevision] = React.useState(0);
  const [exportDrawerOpen, setExportDrawerOpen] = React.useState(false);
  const [exportTargets, setExportTargets] = React.useState<ExportPackageFormat[]>(['single', 'cdn']);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);
  const [webPartPickerOpen, setWebPartPickerOpen] = React.useState(false);
  const [pinAnnouncement, setPinAnnouncement] = React.useState('');
  const [propsByWebPart, setPropsByWebPart] = React.useState<PropsByWebPart>(() =>
    Object.fromEntries(webParts.map((webPart) => [webPart.id, { ...webPart.defaultProps }]))
  );

  React.useEffect(() => {
    if (!selectedId && webParts[0]) {
      setSelectedId(webParts[0].id);
    }
  }, [selectedId, webParts]);

  React.useEffect(() => {
    const handleAppCommandShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const isAppCommandShortcut =
        (key === 'o' || key === 'n' || key === 'e') && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;

      if (displayMode !== 'edit' || !isAppCommandShortcut || event.defaultPrevented || event.repeat) {
        return;
      }

      event.preventDefault();
      setAppSidebarOpen(false);

      if (key === 'o' || key === 'n') {
        setExportDrawerOpen(false);
        setAddMode(key === 'o' ? 'import' : 'create');
        setAddDrawerOpen(true);
        return;
      }

      setAddDrawerOpen(false);
      setExportTargets(['single', 'cdn']);
      setExportDrawerOpen(true);
    };

    window.addEventListener('keydown', handleAppCommandShortcut);
    return () => window.removeEventListener('keydown', handleAppCommandShortcut);
  }, [displayMode]);

  const activeBreakpoint = SHAREPOINT_BREAKPOINTS.find((item) => item.id === breakpointId) || SHAREPOINT_BREAKPOINTS[0];
  const theme = createLabTheme(themeMode, customBackground);
  const themeMenuTriggerId = useSpfxUiId('lab-theme-menu-trigger');
  const themeMenuContentId = useSpfxUiDerivedId(themeMenuTriggerId, 'content');
  const appManagementTriggerId = useSpfxUiId('lab-app-management-trigger');
  const appManagementContentId = useSpfxUiDerivedId(appManagementTriggerId, 'content');
  const webPartSelectId = useSpfxUiId('lab-webpart-select');
  const webPartSelectContentId = useSpfxUiDerivedId(webPartSelectId, 'content');
  const activeProps = selected ? propsByWebPart[selected.id] || selected.defaultProps : {};
  const webPartsByAppId = React.useMemo(() => groupWebPartsByAppId(webParts), [webParts]);
  const context = React.useMemo(() => createMockSpfxContext(), []);
  const viewerMode = displayMode === 'viewer';
  const panelHeaderOnly = viewerMode || panelCollapsed;
  const effectiveBoundsVisible = displayMode === 'edit' && boundsVisible;
  const ignorePropertyUpdate = React.useCallback((): void => undefined, []);

  React.useEffect(() => {
    uiHost.applyTheme(createLabUiThemeTokens(themeMode, theme));
  }, [theme, themeMode, uiHost]);

  const updateProps = (patch: LabPropertyBag): void => {
    if (!selected) {
      return;
    }
    setPropsByWebPart((prev) => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] || selected.defaultProps), ...patch }
    }));
  };

  const selectThemeMode = (mode: LabThemeMode): void => {
    setThemeMode(mode);
    setThemeMenuOpen(false);
  };

  const selectCustomBackground = (value: string): void => {
    setCustomBackground(value);
    setThemeMode('custom');
  };

  const selectDisplayMode = (mode: LabDisplayMode): void => {
    setDisplayMode(mode);
    setAppSidebarOpen(false);
    setThemeMenuOpen(false);
    if (mode === 'edit') {
      setPanelCollapsed(false);
    }
    if (mode === 'viewer') {
      setAddDrawerOpen(false);
      setExportDrawerOpen(false);
    }
  };

  const openAppSidebar = (): void => {
    selectDisplayMode('edit');
    setAddDrawerOpen(false);
    setExportDrawerOpen(false);
    setAppSidebarOpen(true);
  };

  const selectPackageMode = (mode: LabPackageMode): void => {
    setPackageMode(mode);
  };

  const openAddAppDrawer = (mode: AddAppMode): void => {
    selectDisplayMode('edit');
    setAddMode(mode);
    setExportDrawerOpen(false);
    setAppSidebarOpen(false);
    setAddDrawerOpen(true);
  };

  const openExportDrawer = (targets: ExportPackageFormat[] = ['single', 'cdn']): void => {
    setAppSidebarOpen(false);
    setAddDrawerOpen(false);
    setExportTargets(targets);
    setExportDrawerOpen(true);
  };

  const togglePinnedApp = (webPart: LabWebPart): void => {
    const appId = getLabAppId(webPart);
    const nextPinnedAppId = pinnedAppId === appId ? '' : appId;
    setPinnedAppId(nextPinnedAppId);
    persistPinnedAppId(getBrowserStorage(), nextPinnedAppId);
    setPinAnnouncement(nextPinnedAppId ? `${webPart.title} pinned as the startup app.` : `${webPart.title} is no longer pinned.`);
  };

  const togglePinnedAppById = (appId: string): void => {
    const webPart = webPartsByAppId.get(appId)?.[0];
    if (webPart) {
      togglePinnedApp(webPart);
    }
  };

  const selectApp = (appId: string): void => {
    const webPart = webPartsByAppId.get(appId)?.[0];
    if (webPart) {
      setSelectedId(webPart.id);
    }
  };

  const expandOptionsPanel = (): void => {
    selectDisplayMode('edit');
  };

  const Preview = selected?.render;
  const standalonePreview =
    selected && Preview ? (
      <Preview
        key={`${selected.id}:standalone`}
        props={activeProps}
        updateProps={displayMode === 'edit' ? updateProps : ignorePropertyUpdate}
        lab={{
          breakpoint: activeBreakpoint,
          displayMode,
          theme,
          spfxContext: context,
          fixtures: selected.fixtures || {},
          boundsVisible: effectiveBoundsVisible
        }}
      />
    ) : undefined;

  return (
    <main
      className={`lab-shell lab-shell--${themeMode} lab-shell--${displayMode} ${
        panelHeaderOnly ? 'lab-shell--panel-header-only' : ''
      }`}
      data-display-mode={displayMode}
      style={{ '--lab-section-background': theme.background } as React.CSSProperties}
    >
      <AppManagementSidebar
        contentId={appManagementContentId}
        open={appSidebarOpen}
        pinnedAppId={pinnedAppId}
        selectedAppId={selected?.appId || ''}
        triggerId={appManagementTriggerId}
        webPartsByAppId={webPartsByAppId}
        onOpenChange={setAppSidebarOpen}
        onOpenExport={openExportDrawer}
        onOpenImport={() => openAddAppDrawer('import')}
        onSelectApp={selectApp}
        onTogglePinned={togglePinnedAppById}
      />

      <section className="preview-area" aria-label="Web part preview area">
        <div className={`lab-toolbar lab-toolbar--preview lab-toolbar--${displayMode}`}>
          <div className="preview-toolbar__primary">
            {displayMode === 'edit' ? (
              <div className="app-menu-control" aria-label="App menu">
                <IconButton
                  controls={appManagementContentId}
                  expanded={appSidebarOpen}
                  id={appManagementTriggerId}
                  label="Open app menu"
                  onClick={appSidebarOpen ? () => setAppSidebarOpen(false) : openAppSidebar}
                >
                  <MenuIcon size={16} />
                </IconButton>
                <IconButton label="Export package" onClick={openExportDrawer}>
                  <Upload size={16} />
                </IconButton>
              </div>
            ) : null}

            <div className="package-mode-control">
              <Tabs
                className="lab-tabs-root"
                value={packageMode}
                onValueChange={(nextValue) => selectPackageMode(nextValue as LabPackageMode)}
              >
                <TabsList aria-label="App package mode" className="lab-mode-tabs package-mode-tabs">
                  <TabsTrigger value="standalone">Standalone</TabsTrigger>
                  <TabsTrigger
                    aria-describedby="cdn-package-mode-description"
                    title="Local mock-CDN staged-bundle smoke check (not a SharePoint preview)"
                    value="cdn"
                  >
                    CDN
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="visually-hidden" id="cdn-package-mode-description">
                CDN runs a staged bundle smoke check, not a SharePoint or deployment preview.
              </span>
            </div>

            <Button
              aria-label="Local CDN bucket"
              className="preview-toolbar__bucket-button"
              size="sm"
              variant="ghost"
              onClick={() => setLocalCdnBucketOpen(true)}
            >
              Local CDN
            </Button>
          </div>

          {displayMode === 'edit' ? (
            <div className="preview-toolbar__center">
              <IconButton
                label={boundsVisible ? 'Hide preview bounds' : 'Show preview bounds'}
                pressed={boundsVisible}
                onClick={() => setBoundsVisible((value) => !value)}
              >
                <SquareDashed size={16} />
              </IconButton>

              <Tabs
                className="lab-tabs-root"
                value={breakpointId}
                onValueChange={(nextValue) => setBreakpointId(nextValue as LabBreakpoint['id'])}
              >
                <TabsList aria-label="SharePoint breakpoint" className="breakpoint-tabs">
                  {SHAREPOINT_BREAKPOINTS.map((breakpoint) => (
                    <TabsTrigger
                      aria-label={breakpoint.label}
                      className="breakpoint-tab"
                      key={breakpoint.id}
                      title={`${breakpoint.label} - ${breakpoint.description}`}
                      value={breakpoint.id}
                    >
                      {iconForBreakpoint(breakpoint.id)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <DropdownMenu open={themeMenuOpen} triggerId={themeMenuTriggerId} onOpenChange={(open) => setThemeMenuOpen(open)}>
                <DropdownMenuTrigger
                  id={themeMenuTriggerId}
                  render={
                    <Button
                      aria-label={`Theme: ${themeOptions.find((option) => option.value === themeMode)?.label || themeMode}`}
                      size="icon-sm"
                      variant="ghost"
                    />
                  }
                >
                  <Moon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="theme-menu-popover" id={themeMenuContentId}>
                  <DropdownMenuRadioGroup
                    value={themeMode}
                    onValueChange={(nextValue) => selectThemeMode(nextValue as LabThemeMode)}
                  >
                    {themeOptions.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <label className="theme-color-field">
                    <span>Background</span>
                    <input
                      aria-label="Section background"
                      className="theme-color-input"
                      type="color"
                      value={customBackground}
                      onInput={(event) => selectCustomBackground(event.currentTarget.value)}
                      onChange={(event) => selectCustomBackground(event.currentTarget.value)}
                    />
                  </label>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="preview-toolbar__modes">
            <Tabs
              className="lab-tabs-root"
              value={displayMode}
              onValueChange={(nextValue) => selectDisplayMode(nextValue as LabDisplayMode)}
            >
              <TabsList aria-label="Lab display mode" className="lab-mode-tabs">
                <TabsTrigger value="edit">
                  <Pencil aria-hidden="true" data-icon="inline-start" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="viewer">
                  <Eye aria-hidden="true" data-icon="inline-start" />
                  Viewer
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <PackageRuntimeSurface
          boundsVisible={effectiveBoundsVisible}
          frameWidth={activeBreakpoint.width}
          mode={packageMode}
          selectionRevision={cdnSelectionRevision}
          selected={selected}
          standaloneContent={standalonePreview}
        />
      </section>

      <aside
        aria-label="Options panel"
        className={`options-panel ${panelHeaderOnly ? 'options-panel--header-only' : ''}`}
        data-panel-state={panelHeaderOnly ? 'header-only' : 'expanded'}
      >
        <>
          <div className="lab-toolbar lab-toolbar--panel">
            <Select
              id={webPartSelectId}
              items={Object.fromEntries(webParts.map((webPart) => [webPart.id, webPart.title]))}
              open={webPartPickerOpen}
              value={selected?.id || null}
              onValueChange={(nextValue) => {
                if (nextValue) setSelectedId(String(nextValue));
              }}
              onOpenChange={(open) => setWebPartPickerOpen(open)}
            >
              <SelectTrigger
                aria-label="Select web part"
                className="webpart-select"
                size="sm"
                onKeyDown={(event) => {
                  if (
                    !webPartPickerOpen ||
                    event.repeat ||
                    !event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.getModifierState('AltGraph') ||
                    event.code !== 'KeyP'
                  ) {
                    return;
                  }
                  const activeWebPart = selected;
                  if (!activeWebPart) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  togglePinnedApp(activeWebPart);
                }}
              >
                <SelectValue>{selected?.title || ''}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" id={webPartSelectContentId}>
                <SelectGroup>
                  {webParts.map((webPart) => {
                    const appPinned = pinnedAppId === getLabAppId(webPart);
                    return (
                      <div
                        className={`webpart-option-row ${appPinned ? 'webpart-option-row--pinned' : ''}`}
                        key={webPart.id}
                        role="presentation"
                      >
                        <SelectItem
                          aria-label={`${webPart.title}. ${appPinned ? 'Pinned' : 'Not pinned'}. Press Alt+P to ${
                            appPinned ? 'unpin' : 'pin'
                          }.`}
                          className="webpart-option"
                          value={webPart.id}
                        >
                          <span className="webpart-option__label">{webPart.title}</span>
                        </SelectItem>
                        <button
                          aria-label={`${appPinned ? 'Unpin' : 'Pin'} ${webPart.title} as startup app`}
                          aria-pressed={appPinned}
                          className="webpart-option__pin"
                          title={`${appPinned ? 'Unpin' : 'Pin'} ${webPart.title} as startup app`}
                          type="button"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            togglePinnedApp(webPart);
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (event.detail === 0) togglePinnedApp(webPart);
                          }}
                        >
                          <Pin aria-hidden="true" fill={appPinned ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span aria-live="polite" className="visually-hidden" role="status">
              {pinAnnouncement}
            </span>
            <IconButton
              label={
                panelHeaderOnly
                  ? viewerMode
                    ? 'Expand options panel and switch to edit mode'
                    : 'Expand options panel'
                  : 'Collapse options panel'
              }
              pressed={panelHeaderOnly}
              onClick={panelHeaderOnly ? expandOptionsPanel : () => setPanelCollapsed(true)}
            >
              <HugeiconsIcon aria-hidden="true" className="huge-icon" icon={LayoutRightIcon} size={16} strokeWidth={1.7} />
            </IconButton>
          </div>
          {!panelHeaderOnly ? (
            <PropertyPane themeMode={themeMode} webPart={selected} values={activeProps} onChange={updateProps} />
          ) : null}
        </>
      </aside>

      <LegacyFluentShellIslands themeMode={themeMode}>
        <LocalCdnBucketDialog
          open={localCdnBucketOpen}
          onOpenChange={setLocalCdnBucketOpen}
          onSelectionChanged={() => setCdnSelectionRevision((revision) => revision + 1)}
          selectedAppId={selected?.appId || ''}
        />
        {displayMode === 'edit' ? (
          <>
            <AddAppDrawer open={addDrawerOpen} mode={addMode} onOpenChange={setAddDrawerOpen} onModeChange={setAddMode} />

            <ExportDrawer
              open={exportDrawerOpen}
              onOpenChange={setExportDrawerOpen}
              webParts={webParts}
              selected={selected}
              initialTargets={exportTargets}
              onSelectApp={setSelectedId}
            />
          </>
        ) : null}
      </LegacyFluentShellIslands>
    </main>
  );
}

interface IconButtonProps {
  controls?: string;
  expanded?: boolean;
  id?: string;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <Button
      aria-controls={props.controls}
      aria-expanded={props.expanded}
      aria-label={props.label}
      aria-pressed={props.pressed}
      className="icon-button"
      id={props.id}
      size="icon"
      title={props.label}
      variant={props.pressed ? 'secondary' : 'ghost'}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

function groupWebPartsByAppId(webParts: LabWebPart[]): Map<string, LabWebPart[]> {
  const groups = new Map<string, LabWebPart[]>();
  for (const webPart of webParts) {
    const appId = getLabAppId(webPart);
    groups.set(appId, [...(groups.get(appId) || []), webPart]);
  }
  return groups;
}

function iconForBreakpoint(id: LabBreakpoint['id']): JSX.Element {
  switch (id) {
    case 'one-column':
      return <RectangleHorizontal size={20} />;
    case 'two-third':
      return <PanelRight size={20} />;
    case 'one-half':
      return <Columns2 size={20} />;
    case 'one-third':
      return <Columns3 size={20} />;
    case 'mobile':
      return <Smartphone size={20} />;
    default:
      return <Square size={20} />;
  }
}
