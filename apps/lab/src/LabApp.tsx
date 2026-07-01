import * as React from 'react';
import LayoutRightIcon from '@hugeicons/core-free-icons/LayoutRightIcon';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Dropdown,
  Field,
  FluentProvider,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Tab,
  TabList,
  webDarkTheme,
  webLightTheme
} from '@fluentui/react-components';
import {
  Moon,
  PanelRight,
  PanelRightOpen,
  RectangleHorizontal,
  Smartphone,
  Square,
  SquareDashed,
  Columns3,
  Columns2,
  Check,
  Download,
  FolderInput,
  FolderPlus,
  Menu as MenuIcon,
  PackagePlus,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  createLabTheme,
  createMockSpfxContext,
  LabBreakpoint,
  LabPropertyBag,
  LabThemeMode,
  LabWebPart,
  LabWebPartRegistry,
  SHAREPOINT_BREAKPOINTS
} from '@spfx-kit/spfx-lab-runtime';
import { registerGeneratedWebParts } from './generated/lab-registry';
import { PropertyPane } from './components/PropertyPane';

type PropsByWebPart = Record<string, LabPropertyBag>;
type ExportPackageFormat = 'single' | 'cdn' | 'standalone';
type ExportSelections = Record<ExportPackageFormat, boolean>;
type ExportProgressPhase = 'idle' | 'queued' | 'configuring' | 'preparing' | 'building' | 'assembling' | 'packaging' | 'complete' | 'error';
type AddAppMode = 'import' | 'create';
type AddAppPhase = 'idle' | 'running' | 'complete' | 'error';
type ManageAppsPhase = 'idle' | 'loading' | 'running' | 'complete' | 'error';

interface ExportProgressState {
  phase: ExportProgressPhase;
  value?: number;
  message: string;
  detail?: string;
}

interface ExportTargetProgressState {
  phase: ExportProgressPhase;
  value: number;
  status: string;
}

type ExportTargetProgressMap = Partial<Record<ExportPackageFormat, ExportTargetProgressState>>;

interface AddAppStatus {
  phase: AddAppPhase;
  message: string;
  detail?: string;
  appId?: string;
}

interface AddSpfxAppApiResult {
  appId: string;
  message: string;
  syncedAdapters?: number;
}

interface ManagedLabApp {
  id: string;
  packageName: string;
  relativeDir: string;
  status: 'connected' | 'disconnected' | 'missing';
  adapterPath?: string;
  disabledAdapterPath?: string;
}

interface ManagedLabAppsApiResult {
  apps: ManagedLabApp[];
}

interface ManageAppsApiResult extends ManagedLabAppsApiResult {
  appId?: string;
  message: string;
  syncedAdapters?: number;
}

interface ManageAppsStatus {
  phase: ManageAppsPhase;
  message: string;
  detail?: string;
  reloadRecommended?: boolean;
}

interface ExportPackageOption {
  id: ExportPackageFormat;
  label: string;
  description: string;
  totalSize: string;
  files: Array<{ name: string; size: string }>;
}

interface ExportEstimate {
  totalSize?: string;
  files?: Array<{ name: string; size: string }>;
}

type ExportEstimates = Partial<Record<ExportPackageFormat, ExportEstimate>>;

interface ExportApiSummary {
  archivePath: string;
  slug: string;
  targets: Array<{
    id: ExportPackageFormat;
    label: string;
    totalSize: string;
    files: Array<{ relativePath: string; size: string }>;
  }>;
}

interface ExportStreamEvent {
  type: 'start' | 'target' | 'archive' | 'summary' | 'error';
  target?: ExportPackageFormat;
  targets?: ExportPackageFormat[];
  phase?: ExportProgressPhase;
  progress?: number;
  message?: string;
  summary?: ExportApiSummary;
}

const themeOptions: Array<{ label: string; value: LabThemeMode }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Custom', value: 'custom' }
];

const labApiWriteHeaders = {
  'Content-Type': 'application/json',
  'X-SPFX-KIT-Lab-Intent': 'same-origin'
};

export function LabApp(): JSX.Element {
  const registry = React.useMemo(() => {
    const next = new LabWebPartRegistry();
    registerGeneratedWebParts(next);
    return next;
  }, []);
  const webParts = registry.list();
  const [selectedId, setSelectedId] = React.useState<string>(webParts[0]?.id || '');
  const selected = registry.get(selectedId) || webParts[0];
  const [breakpointId, setBreakpointId] = React.useState<LabBreakpoint['id']>('one-column');
  const [boundsVisible, setBoundsVisible] = React.useState(false);
  const [appMenuOpen, setAppMenuOpen] = React.useState(false);
  const [themeMode, setThemeMode] = React.useState<LabThemeMode>('light');
  const [themeMenuOpen, setThemeMenuOpen] = React.useState(false);
  const [customBackground, setCustomBackground] = React.useState('#eef6ff');
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<AddAppMode>('import');
  const [importSource, setImportSource] = React.useState('');
  const [importName, setImportName] = React.useState('');
  const [importRef, setImportRef] = React.useState('');
  const [createName, setCreateName] = React.useState('');
  const [createTitle, setCreateTitle] = React.useState('');
  const [createWebPart, setCreateWebPart] = React.useState('');
  const [addForce, setAddForce] = React.useState(false);
  const [addingApp, setAddingApp] = React.useState(false);
  const [addStatus, setAddStatus] = React.useState<AddAppStatus>({ phase: 'idle', message: '' });
  const [manageAppsOpen, setManageAppsOpen] = React.useState(false);
  const [managedApps, setManagedApps] = React.useState<ManagedLabApp[]>([]);
  const [manageAppsStatus, setManageAppsStatus] = React.useState<ManageAppsStatus>({ phase: 'idle', message: '' });
  const [manageAppsBusyAppId, setManageAppsBusyAppId] = React.useState('');
  const [exportDrawerOpen, setExportDrawerOpen] = React.useState(false);
  const [exportSelections, setExportSelections] = React.useState<ExportSelections>({ single: true, cdn: true, standalone: false });
  const [exportEstimates, setExportEstimates] = React.useState<ExportEstimates>({});
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [exportProgress, setExportProgress] = React.useState<ExportProgressState>({ phase: 'idle', message: '' });
  const [exportTargetProgress, setExportTargetProgress] = React.useState<ExportTargetProgressMap>({});
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);
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
        (key === 'o' || key === 'n' || key === 'e') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;

      if (!isAppCommandShortcut || event.defaultPrevented || event.repeat) {
        return;
      }

      event.preventDefault();
      setAppMenuOpen(false);

      if (key === 'o' || key === 'n') {
        setExportDrawerOpen(false);
        setAddMode(key === 'o' ? 'import' : 'create');
        if (!addingApp) {
          setAddStatus({ phase: 'idle', message: '' });
        }
        setAddDrawerOpen(true);
        return;
      }

      setAddDrawerOpen(false);
      if (!exporting) {
        setExportProgress({ phase: 'idle', message: '' });
        setExportTargetProgress({});
        setExportError('');
      }
      setExportDrawerOpen(true);
    };

    window.addEventListener('keydown', handleAppCommandShortcut);
    return () => window.removeEventListener('keydown', handleAppCommandShortcut);
  }, [addingApp, exporting]);

  const refreshManagedApps = React.useCallback(async (options: { quiet?: boolean } = {}): Promise<void> => {
    if (!options.quiet) {
      setManageAppsStatus({ phase: 'loading', message: 'Loading apps' });
    }
    try {
      const response = await fetch('/api/spfx-apps/');
      const result = await readApiJson<ManagedLabAppsApiResult>(response);
      setManagedApps(result.apps);
      if (!options.quiet) {
        setManageAppsStatus({ phase: 'idle', message: '' });
      }
    } catch (error) {
      setManageAppsStatus({
        phase: 'error',
        message: 'Could not load apps',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    }
  }, []);

  React.useEffect(() => {
    if (manageAppsOpen) {
      void refreshManagedApps();
    }
  }, [manageAppsOpen, refreshManagedApps]);

  const activeBreakpoint = SHAREPOINT_BREAKPOINTS.find((item) => item.id === breakpointId) || SHAREPOINT_BREAKPOINTS[0];
  const theme = createLabTheme(themeMode, customBackground);
  const fluentTheme = themeMode === 'dark' ? webDarkTheme : webLightTheme;
  const activeProps = selected ? propsByWebPart[selected.id] || selected.defaultProps : {};
  const exportSlug = selected?.appId || slugify(selected?.title || selected?.id || 'spfx-web-part');
  const exportOptions = React.useMemo(() => createExportPackageOptions(exportSlug, exportEstimates), [exportEstimates, exportSlug]);
  const selectedExportOptions = exportOptions.filter((option) => exportSelections[option.id]);
  const exportAppName = selected?.title || 'selected app';
  const webPartsByAppId = React.useMemo(() => groupWebPartsByAppId(webParts), [webParts]);
  const managedAppRows = React.useMemo(
    () => managedApps.map((app) => ({
      ...app,
      title: titleForManagedApp(app, webPartsByAppId),
      webPartCount: webPartsByAppId.get(app.id)?.length || 0
    })),
    [managedApps, webPartsByAppId]
  );
  const importShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('O'), []);
  const createShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('N'), []);
  const exportShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('E'), []);
  const exportCardMode = exportProgress.phase !== 'idle';
  const canDownloadExport = selectedExportOptions.length > 0 && !exporting;
  const canSubmitAddApp = addMode === 'import'
    ? Boolean(importSource.trim() && isSlugInput(importName.trim()) && !addingApp)
    : Boolean(isSlugInput(createName.trim()) && createTitle.trim() && createWebPart.trim() && !addingApp);
  const addActionLabel = addMode === 'import' ? 'Import app' : 'Create app';
  const context = React.useMemo(() => createMockSpfxContext(), []);

  React.useEffect(() => {
    if (!selected?.appId) {
      setExportEstimates({});
      return;
    }
    let disposed = false;
    fetch(`/api/export-spfx-app/estimate?app=${encodeURIComponent(selected.appId)}`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: ExportEstimates | undefined) => {
        if (!disposed && value) {
          setExportEstimates(value);
        }
      })
      .catch(() => {
        if (!disposed) {
          setExportEstimates({});
        }
      });
    return () => {
      disposed = true;
    };
  }, [selected?.appId]);

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

  const setExportSelection = (id: ExportPackageFormat, checked: boolean): void => {
    setExportSelections((prev) => ({ ...prev, [id]: checked }));
    if (!exporting) {
      setExportProgress({ phase: 'idle', message: '' });
      setExportTargetProgress({});
      setExportError('');
    }
  };

  const selectExportApp = (nextId: string): void => {
    if (exporting) {
      return;
    }
    setSelectedId(nextId);
    setExportProgress({ phase: 'idle', message: '' });
    setExportTargetProgress({});
    setExportError('');
  };

  const openManageApps = (): void => {
    setManageAppsOpen(true);
    setManageAppsStatus({ phase: 'idle', message: '' });
  };

  const runManageAppsAction = async (appId: string, action: 'unlink' | 'sync'): Promise<void> => {
    setManageAppsBusyAppId(appId);
    setManageAppsStatus({
      phase: 'running',
      message: action === 'unlink' ? 'Unlinking app' : 'Re-syncing app',
      detail: managedAppPath(appId)
    });

    try {
      const response = await fetch(`/api/spfx-apps/${action === 'unlink' ? 'unlink' : 'sync'}`, {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({ appId })
      });
      const result = await readApiJson<ManageAppsApiResult>(response);
      setManagedApps(result.apps);
      setManageAppsStatus({
        phase: 'complete',
        message: result.message,
        detail: `Synced ${result.syncedAdapters ?? 'the'} lab adapter${result.syncedAdapters === 1 ? '' : 's'}. Reload the lab to apply registry changes.`,
        reloadRecommended: true
      });
    } catch (error) {
      setManageAppsStatus({
        phase: 'error',
        message: action === 'unlink' ? 'App was not unlinked' : 'App was not re-synced',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      setManageAppsBusyAppId('');
    }
  };

  const syncManagedApps = async (): Promise<void> => {
    setManageAppsBusyAppId('__all__');
    setManageAppsStatus({
      phase: 'running',
      message: 'Re-syncing apps',
      detail: 'Regenerating the lab registry.'
    });
    try {
      const response = await fetch('/api/spfx-apps/sync', {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({})
      });
      const result = await readApiJson<ManageAppsApiResult>(response);
      setManagedApps(result.apps);
      setManageAppsStatus({
        phase: 'complete',
        message: result.message,
        detail: `Synced ${result.syncedAdapters ?? 'the'} lab adapter${result.syncedAdapters === 1 ? '' : 's'}. Reload the lab to apply registry changes.`,
        reloadRecommended: true
      });
    } catch (error) {
      setManageAppsStatus({
        phase: 'error',
        message: 'Apps were not re-synced',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      setManageAppsBusyAppId('');
    }
  };

  const openAddAppDrawer = (mode: AddAppMode): void => {
    setAddMode(mode);
    setAppMenuOpen(false);
    setExportDrawerOpen(false);
    setManageAppsOpen(false);
    if (!addingApp) {
      setAddStatus({ phase: 'idle', message: '' });
    }
    setAddDrawerOpen(true);
  };

  const submitAddApp = async (): Promise<void> => {
    if (!canSubmitAddApp) {
      return;
    }

    const endpoint = addMode === 'import' ? '/api/spfx-apps/import' : '/api/spfx-apps/create';
    const body = addMode === 'import'
      ? {
          source: importSource.trim(),
          name: importName.trim(),
          ref: importRef.trim() || undefined,
          force: addForce
        }
      : {
          name: createName.trim(),
          title: createTitle.trim(),
          webpart: createWebPart.trim(),
          force: addForce
        };

    setAddingApp(true);
    setAddStatus({
      phase: 'running',
      message: addMode === 'import' ? 'Importing SPFx app' : 'Creating SPFx app',
      detail: 'Running the local SPFx Kit tools.'
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify(body)
      });
      const result = await readApiJson<AddSpfxAppApiResult>(response);
      setAddStatus({
        phase: 'complete',
        message: result.message,
        detail: `Synced ${result.syncedAdapters ?? 'the'} lab adapter${result.syncedAdapters === 1 ? '' : 's'}. Reload to pick up ${result.appId}.`,
        appId: result.appId
      });
    } catch (error) {
      setAddStatus({
        phase: 'error',
        message: 'SPFx app was not added',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      setAddingApp(false);
    }
  };

  const downloadExportSelection = async (): Promise<void> => {
    if (!canDownloadExport || !selected?.appId) {
      return;
    }
    const selectedTargets = selectedExportOptions.map((option) => option.id);
    const targetLabels = selectedExportOptions.map((option) => option.label).join(', ');
    let exportSummary: ExportApiSummary | undefined;
    setExporting(true);
    setExportError('');
    setExportTargetProgress(createQueuedExportProgress(selectedExportOptions));
    setExportProgress({
      phase: 'queued',
      value: 0.03,
      message: 'Starting export',
      detail: targetLabels
    });
    try {
      const response = await fetch('/api/export-spfx-app/stream', {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({
          app: selected.appId,
          targets: selectedTargets
        })
      });
      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || 'Export failed.');
      }

      await readExportStream(response, (event) => {
        if (event.type === 'error') {
          throw new Error(event.message || 'Export failed.');
        }

        if (event.type === 'target' && event.target) {
          const phase = normalizeExportPhase(event.phase);
          const value = clampProgress(event.progress);
          const status = event.message || getDefaultProgressStatus(phase);
          setExportProgress({ phase, value, message: status, detail: event.target });
          setExportTargetProgress((prev) => ({
            ...prev,
            [event.target as ExportPackageFormat]: { phase, value, status }
          }));
          return;
        }

        if (event.type === 'archive') {
          const phase = normalizeExportPhase(event.phase);
          const value = clampProgress(event.progress);
          const status = event.message || getDefaultProgressStatus(phase);
          setExportProgress({ phase, value, message: status, detail: targetLabels });
          setExportTargetProgress((prev) => updateAllActiveExportTargets(prev, selectedTargets, phase, value, status));
          return;
        }

        if (event.type === 'summary' && event.summary) {
          exportSummary = event.summary;
          setExportProgress({
            phase: 'complete',
            value: 1,
            message: 'Export ready',
            detail: 'Archive ready to download.'
          });
          setExportTargetProgress((prev) =>
            updateAllActiveExportTargets(prev, selectedTargets, 'complete', 1, 'Ready to download.')
          );
        }
      });

      if (!exportSummary) {
        throw new Error('Export completed without a summary.');
      }

      const url = `/api/export-spfx-app/archive?path=${encodeURIComponent(exportSummary.archivePath)}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = exportSummary.archivePath.split('/').pop() || `${exportSummary.slug}-export.tar.gz`;
      document.body.append(link);
      link.click();
      link.remove();
      setExportProgress({
        phase: 'complete',
        value: 1,
        message: 'Export ready',
        detail: `Download started for ${link.download}.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.';
      setExportError(message);
      setExportProgress({
        phase: 'error',
        value: 1,
        message: 'Export failed',
        detail: message
      });
      setExportTargetProgress((prev) =>
        updateAllActiveExportTargets(prev, selectedTargets, 'error', 1, message)
      );
    } finally {
      setExporting(false);
    }
  };

  const Preview = selected?.render;

  return (
    <FluentProvider theme={fluentTheme}>
      <main className={`lab-shell lab-shell--${themeMode}`} style={{ '--lab-section-background': theme.background } as React.CSSProperties}>
        <section className="preview-area" aria-label="Web part preview area">
          <div className="lab-toolbar lab-toolbar--preview">
            <div className="app-menu-control" aria-label="App menu">
              <Menu
                open={appMenuOpen}
                positioning={{ position: 'below', align: 'start' }}
                onOpenChange={(_event, data) => setAppMenuOpen(data.open)}
              >
                <MenuTrigger disableButtonEnhancement>
                  <MenuButton
                    appearance="subtle"
                    aria-label="Open app menu"
                    className="app-menu-button"
                    icon={<MenuIcon size={16} />}
                    size="small"
                    title="Open app menu"
                  />
                </MenuTrigger>
                <MenuPopover className="app-menu-popover">
                  <MenuList>
                    <MenuItem
                      icon={<FolderInput size={14} />}
                      onClick={() => openAddAppDrawer('import')}
                    >
                      <span className="app-menu-command">
                        <span>Import SPFx app</span>
                        <kbd className="app-menu-shortcut">{importShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                    <MenuItem
                      icon={<FolderPlus size={14} />}
                      onClick={() => openAddAppDrawer('create')}
                    >
                      <span className="app-menu-command">
                        <span>Create SPFx app</span>
                        <kbd className="app-menu-shortcut">{createShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                    <MenuItem
                      icon={<Upload size={14} />}
                      onClick={() => {
                        if (!exporting) {
                          setExportProgress({ phase: 'idle', message: '' });
                          setExportTargetProgress({});
                          setExportError('');
                        }
                        setAppMenuOpen(false);
                        setAddDrawerOpen(false);
                        setExportDrawerOpen(true);
                      }}
                    >
                      <span className="app-menu-command">
                        <span>Export package</span>
                        <kbd className="app-menu-shortcut">{exportShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>

            <div className="preview-toolbar__center">
              <IconButton
                label={boundsVisible ? 'Hide preview bounds' : 'Show preview bounds'}
                pressed={boundsVisible}
                onClick={() => setBoundsVisible((value) => !value)}
              >
                <SquareDashed size={16} />
              </IconButton>

              <TabList
                aria-label="SharePoint breakpoint"
                className="breakpoint-tabs"
                selectedValue={breakpointId}
                size="small"
                onTabSelect={(_event, data) => setBreakpointId(data.value as LabBreakpoint['id'])}
              >
                {SHAREPOINT_BREAKPOINTS.map((breakpoint) => (
                  <Tab
                    aria-label={breakpoint.label}
                    icon={iconForBreakpoint(breakpoint.id)}
                    key={breakpoint.id}
                    title={`${breakpoint.label} - ${breakpoint.description}`}
                    value={breakpoint.id}
                    onClick={() => setBreakpointId(breakpoint.id)}
                  />
                ))}
              </TabList>

              <Menu
                checkedValues={{ theme: [themeMode] }}
                open={themeMenuOpen}
                positioning={{ position: 'below', align: 'start' }}
                onOpenChange={(_event, data) => setThemeMenuOpen(data.open)}
              >
                <MenuTrigger disableButtonEnhancement>
                  <MenuButton
                    appearance="subtle"
                    aria-label={`Theme: ${themeOptions.find((option) => option.value === themeMode)?.label || themeMode}`}
                    className="theme-menu-trigger"
                    icon={<Moon size={16} />}
                    size="small"
                  />
                </MenuTrigger>
                <MenuPopover className="theme-menu-popover">
                  <MenuList>
                    {themeOptions.map((option) => (
                      <MenuItemRadio
                        key={option.value}
                        name="theme"
                        value={option.value}
                        onClick={() => selectThemeMode(option.value)}
                      >
                        {option.label}
                      </MenuItemRadio>
                    ))}
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
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
          </div>

          <div className="preview-canvas">
            <div
              className={`preview-frame ${boundsVisible ? 'preview-frame--bounded' : ''}`}
              style={{ width: `min(${activeBreakpoint.width}px, calc(100% - 48px))` }}
            >
              {Preview ? (
                <Preview
                  props={activeProps}
                  updateProps={updateProps}
                  lab={{
                    breakpoint: activeBreakpoint,
                    theme,
                    spfxContext: context,
                    fixtures: selected.fixtures || {},
                    boundsVisible
                  }}
                />
              ) : (
                <div className="empty-preview">
                  <strong>No web parts registered</strong>
                  <span>Import an SPFx app or add a lab adapter.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className={`options-panel ${panelCollapsed ? 'options-panel--collapsed' : ''}`} aria-label="Options panel">
          {!panelCollapsed && (
            <>
              <div className="lab-toolbar lab-toolbar--panel">
                <Dropdown
                  aria-label="Select web part"
                  className="webpart-select"
                  selectedOptions={selected?.id ? [selected.id] : []}
                  size="small"
                  value={selected?.title || ''}
                  onOptionSelect={(_event, data) => {
                    if (data.optionValue) {
                      setSelectedId(data.optionValue);
                    }
                  }}
                >
                  {webParts.map((webPart) => (
                    <Option key={webPart.id} value={webPart.id}>
                      {webPart.title}
                    </Option>
                  ))}
                </Dropdown>
                <IconButton label="Manage apps" onClick={openManageApps}>
                  <Settings size={16} />
                </IconButton>
                <IconButton label="Collapse options panel" onClick={() => setPanelCollapsed(true)}>
                  <HugeiconsIcon className="huge-icon" icon={LayoutRightIcon} size={16} strokeWidth={1.7} aria-hidden="true" />
                </IconButton>
              </div>
              <PropertyPane
                webPart={selected}
                values={activeProps}
                onChange={updateProps}
              />
            </>
          )}
        </aside>

        {panelCollapsed && (
          <Button
            appearance="subtle"
            aria-label="Expand options panel"
            className="floating-panel-toggle"
            icon={<PanelRightOpen size={16} />}
            onClick={() => setPanelCollapsed(false)}
          />
        )}

        <Dialog
          modalType="modal"
          open={manageAppsOpen}
          onOpenChange={(_event, data) => setManageAppsOpen(data.open)}
        >
          <DialogSurface className="manage-apps-dialog">
            <DialogBody>
              <DialogTitle
                action={(
                  <Button
                    appearance="subtle"
                    aria-label="Close manage apps"
                    icon={<X size={16} />}
                    onClick={() => setManageAppsOpen(false)}
                  />
                )}
              >
                Manage Apps
              </DialogTitle>
              <DialogContent className="manage-apps-dialog__content">
                <div className="manage-apps-dialog__toolbar">
                  <Button
                    appearance="secondary"
                    icon={<FolderInput size={14} />}
                    onClick={() => openAddAppDrawer('import')}
                  >
                    Import
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<FolderPlus size={14} />}
                    onClick={() => openAddAppDrawer('create')}
                  >
                    Create
                  </Button>
                  <Button
                    appearance="subtle"
                    disabled={manageAppsBusyAppId === '__all__' || manageAppsStatus.phase === 'loading'}
                    icon={<RefreshCw size={14} />}
                    onClick={() => void syncManagedApps()}
                  >
                    Re-sync
                  </Button>
                </div>

                {manageAppsStatus.phase !== 'idle' && (
                  <section
                    aria-live={manageAppsStatus.phase === 'error' ? 'assertive' : 'polite'}
                    className={`manage-apps-status manage-apps-status--${manageAppsStatus.phase}`}
                    role={manageAppsStatus.phase === 'error' ? 'alert' : 'status'}
                  >
                    <span className={`manage-apps-status__icon manage-apps-status__icon--${manageAppsStatus.phase}`} aria-hidden="true">
                      {manageAppsStatus.phase === 'complete' ? <Check size={13} /> : manageAppsStatus.phase === 'error' ? <X size={13} /> : <RefreshCw size={13} />}
                    </span>
                    <span>
                      <strong>{manageAppsStatus.message}</strong>
                      {manageAppsStatus.detail && <small>{manageAppsStatus.detail}</small>}
                    </span>
                  </section>
                )}

                <div className="manage-apps-list" aria-label="Lab apps">
                  {managedAppRows.length ? (
                    managedAppRows.map((app) => {
                      const busy = manageAppsBusyAppId === app.id || manageAppsBusyAppId === '__all__';
                      const connected = app.status === 'connected';
                      const disconnected = app.status === 'disconnected';
                      return (
                        <section
                          className={`manage-app-row ${disconnected ? 'manage-app-row--has-badge' : ''}`}
                          data-app-id={app.id}
                          key={app.id}
                        >
                          <div className="manage-app-row__main">
                            <strong>{app.title}</strong>
                            <span>{app.relativeDir}</span>
                          </div>
                          {disconnected && (
                            <span className="manage-app-row__badge manage-app-row__badge--disconnected">
                              Disconnected
                            </span>
                          )}
                          <div className="manage-app-row__actions">
                            {connected ? (
                              <Button
                                appearance="secondary"
                                data-action="unlink"
                                disabled={busy}
                                icon={<Trash2 size={14} />}
                                onClick={() => void runManageAppsAction(app.id, 'unlink')}
                              >
                                Unlink
                              </Button>
                            ) : (
                              <Button
                                appearance="primary"
                                data-action="sync"
                                disabled={!disconnected || busy}
                                icon={<RefreshCw size={14} />}
                                onClick={() => void runManageAppsAction(app.id, 'sync')}
                              >
                                {disconnected ? 'Re-sync' : 'No adapter'}
                              </Button>
                            )}
                          </div>
                        </section>
                      );
                    })
                  ) : (
                    <p className="manage-apps-empty">
                      {manageAppsStatus.phase === 'loading' ? 'Loading apps...' : 'No workspace apps found.'}
                    </p>
                  )}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setManageAppsOpen(false)}>
                  Close
                </Button>
                {manageAppsStatus.reloadRecommended && (
                  <Button appearance="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>
                    Reload lab
                  </Button>
                )}
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Drawer
          className="spfx-app-drawer"
          modalType="modal"
          onOpenChange={(_event, data) => setAddDrawerOpen(data.open)}
          open={addDrawerOpen}
          position="start"
          size="medium"
          type="overlay"
        >
          <DrawerHeader>
            <DrawerHeaderTitle
              action={(
                <Button
                  appearance="subtle"
                  aria-label="Close add SPFx app drawer"
                  icon={<X size={16} />}
                  onClick={() => setAddDrawerOpen(false)}
                />
              )}
            >
              Add SPFx app
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody className="spfx-app-drawer__body">
            <p className="spfx-app-drawer__description">
              Bring an existing team SPFx project into the lab, or start a new managed SPFx app scaffold.
            </p>
            <TabList
              aria-label="Add SPFx app mode"
              className="spfx-app-drawer__tabs"
              selectedValue={addMode}
              size="small"
              onTabSelect={(_event, data) => {
                setAddMode(data.value as AddAppMode);
                if (!addingApp) {
                  setAddStatus({ phase: 'idle', message: '' });
                }
              }}
            >
              <Tab icon={<FolderInput size={14} />} value="import">
                Import
              </Tab>
              <Tab icon={<FolderPlus size={14} />} value="create">
                Create
              </Tab>
            </TabList>

            {addMode === 'import' ? (
              <div className="spfx-app-drawer__form">
                <Field
                  hint="Git URL or local path to an SPFx project."
                  label="Source"
                  required
                  size="small"
                >
                  <Input
                    placeholder="https://github.com/team/app.git or /path/to/app"
                    value={importSource}
                    onChange={(event) => setImportSource(event.currentTarget.value)}
                  />
                </Field>
                <div className="spfx-app-drawer__field-row">
                  <Field
                    hint="-spfx is added if omitted."
                    label="App slug"
                    required
                    size="small"
                  >
                    <Input
                      placeholder="team-dashboard"
                      value={importName}
                      onChange={(event) => setImportName(slugInputValue(event.currentTarget.value))}
                    />
                  </Field>
                  <Field
                    hint="Branch, tag, or commit."
                    label="Git ref"
                    size="small"
                  >
                    <Input
                      placeholder="main"
                      value={importRef}
                      onChange={(event) => setImportRef(event.currentTarget.value)}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="spfx-app-drawer__form">
                <Field
                  hint="-spfx is added if omitted."
                  label="App slug"
                  required
                  size="small"
                >
                  <Input
                    placeholder="team-dashboard"
                    value={createName}
                    onChange={(event) => setCreateName(slugInputValue(event.currentTarget.value))}
                  />
                </Field>
                <Field label="App title" required size="small">
                  <Input
                    placeholder="Team Dashboard"
                    value={createTitle}
                    onChange={(event) => setCreateTitle(event.currentTarget.value)}
                  />
                </Field>
                <Field
                  hint="Used for the generated web part class name."
                  label="Web part name"
                  required
                  size="small"
                >
                  <Input
                    placeholder="TeamDashboard"
                    value={createWebPart}
                    onChange={(event) => setCreateWebPart(event.currentTarget.value)}
                  />
                </Field>
              </div>
            )}

            <Checkbox
              checked={addForce}
              className="spfx-app-drawer__force"
              label="Replace existing app with this slug"
              onChange={(_event, data) => setAddForce(data.checked === true)}
            />

            {addStatus.phase !== 'idle' && (
              <section
                aria-live={addStatus.phase === 'error' ? 'assertive' : 'polite'}
                className={`spfx-app-drawer__status spfx-app-drawer__status--${addStatus.phase}`}
                role={addStatus.phase === 'error' ? 'alert' : 'status'}
              >
                <span className={`spfx-app-drawer__status-icon spfx-app-drawer__status-icon--${addStatus.phase}`} aria-hidden="true">
                  {addStatus.phase === 'complete' ? <Check size={13} /> : addStatus.phase === 'error' ? <X size={13} /> : <RefreshCw size={13} />}
                </span>
                <span>
                  <strong>{addStatus.message}</strong>
                  {addStatus.detail && <small>{addStatus.detail}</small>}
                </span>
              </section>
            )}
          </DrawerBody>
          <DrawerFooter className="spfx-app-drawer__footer">
            <Button appearance="secondary" disabled={addingApp} onClick={() => setAddDrawerOpen(false)}>
              {addStatus.phase === 'complete' ? 'Close' : 'Cancel'}
            </Button>
            {addStatus.phase === 'complete' ? (
              <Button appearance="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>
                Reload lab
              </Button>
            ) : (
              <Button
                appearance="primary"
                disabled={!canSubmitAddApp}
                icon={<PackagePlus size={14} />}
                onClick={() => void submitAddApp()}
              >
                {addingApp ? 'Adding...' : addActionLabel}
              </Button>
            )}
          </DrawerFooter>
        </Drawer>

        <Drawer
          className="export-drawer"
          modalType="modal"
          onOpenChange={(_event, data) => setExportDrawerOpen(data.open)}
          open={exportDrawerOpen}
          position="start"
          size="medium"
          type="overlay"
        >
          <DrawerHeader>
            <DrawerHeaderTitle
              action={(
                <Button
                  appearance="subtle"
                  aria-label="Close export package drawer"
                  icon={<X size={16} />}
                  onClick={() => setExportDrawerOpen(false)}
                />
              )}
            >
              <span className="export-drawer__title">
                <span>Export</span>
                <Dropdown
                  aria-label="Select app to export"
                  className="export-app-select"
                  disabled={exporting}
                  selectedOptions={selected?.id ? [selected.id] : []}
                  value={exportAppName}
                  onOptionSelect={(_event, data) => {
                    if (data.optionValue) {
                      selectExportApp(data.optionValue);
                    }
                  }}
                >
                  {webParts.map((webPart) => (
                    <Option key={webPart.id} value={webPart.id}>
                      {webPart.title}
                    </Option>
                  ))}
                </Dropdown>
              </span>
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody className="export-drawer__body">
            <p className="export-drawer__description">
              Select one or more package formats to include in the download.
            </p>
            <div className="export-drawer__options">
              {exportOptions.map((option) => {
                const selectedForExport = exportSelections[option.id];
                const hiddenDuringExport = exportCardMode && !selectedForExport;
                const targetProgress = exportTargetProgress[option.id];
                const optionPhase = targetProgress?.phase || exportProgress.phase;
                const progressPercent = Math.round((targetProgress?.value ?? exportProgress.value ?? 0) * 100);
                const optionInFlight = exportCardMode && selectedForExport && isExportPhaseInFlight(optionPhase);
                const statusText = exportCardMode ? getExportOptionStatus(option, targetProgress, exportProgress, exportError) : option.description;

                return (
                  <section
                    aria-hidden={hiddenDuringExport}
                    className={[
                      'export-option',
                      selectedForExport ? 'export-option--selected' : '',
                      hiddenDuringExport ? 'export-option--hidden' : '',
                      optionInFlight ? 'export-option--running' : '',
                      optionPhase === 'complete' && selectedForExport ? 'export-option--complete' : '',
                      optionPhase === 'error' && selectedForExport ? 'export-option--error' : ''
                    ].filter(Boolean).join(' ')}
                    key={option.id}
                  >
                    <div className="export-option__header">
                      {exportCardMode && selectedForExport ? (
                        <div className="export-option__state-label">
                          <ExportOptionStateIcon
                            phase={optionPhase}
                            progress={progressPercent}
                          />
                          <span>{option.label}</span>
                        </div>
                      ) : (
                        <Checkbox
                          aria-label={`Include ${option.label}`}
                          checked={selectedForExport}
                          label={option.label}
                          onChange={(_event, data) => setExportSelection(option.id, data.checked === true)}
                        />
                      )}
                      <span className="export-option__total">{option.totalSize}</span>
                    </div>
                    <p
                      aria-live={exportCardMode && selectedForExport ? 'polite' : undefined}
                      className={`export-option__description ${exportCardMode ? 'export-option__description--status' : ''}`}
                    >
                      {statusText}
                    </p>
                    {!exportCardMode && (
                      <details className="export-option__details">
                        <summary className="export-option__summary">
                          <span>{option.files.length} files</span>
                        </summary>
                        <ul className="export-option__files" aria-label={`${option.label} estimated files`}>
                          {option.files.map((file) => (
                            <li className="export-option__file" key={file.name}>
                              <span>{file.name}</span>
                              <strong>{file.size}</strong>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                );
              })}
            </div>
          </DrawerBody>
          <DrawerFooter className="export-drawer__footer">
            <Button appearance="secondary" onClick={() => setExportDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              aria-label="Download selected export packages"
              disabled={!canDownloadExport}
              icon={<Download size={14} />}
              onClick={downloadExportSelection}
            >
              {exporting ? 'Exporting...' : 'Download'}
            </Button>
          </DrawerFooter>
        </Drawer>
      </main>
    </FluentProvider>
  );
}

interface IconButtonProps {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <Button
      appearance={props.pressed ? 'secondary' : 'subtle'}
      aria-label={props.label}
      aria-pressed={props.pressed}
      className="icon-button"
      icon={props.children as React.ReactElement}
      size="small"
      title={props.label}
      onClick={props.onClick}
    />
  );
}

function groupWebPartsByAppId(webParts: LabWebPart[]): Map<string, LabWebPart[]> {
  const groups = new Map<string, LabWebPart[]>();
  for (const webPart of webParts) {
    const appId = webPart.appId || slugify(webPart.title || webPart.id);
    groups.set(appId, [...(groups.get(appId) || []), webPart]);
  }
  return groups;
}

function titleForManagedApp(app: ManagedLabApp, webPartsByAppId: Map<string, LabWebPart[]>): string {
  const registeredTitle = webPartsByAppId.get(app.id)?.[0]?.title;
  return registeredTitle || titleFromSlug(app.id);
}

interface ExportOptionStateIconProps {
  phase: ExportProgressPhase;
  progress: number;
}

function ExportOptionStateIcon(props: ExportOptionStateIconProps): JSX.Element {
  if (props.phase === 'complete') {
    return (
      <span className="export-option__state-icon export-option__state-icon--complete" aria-hidden="true">
        <Check size={12} />
      </span>
    );
  }

  if (props.phase === 'error') {
    return (
      <span className="export-option__state-icon export-option__state-icon--error" aria-hidden="true">
        <X size={12} />
      </span>
    );
  }

  return (
    <span
      className="export-option__state-icon export-option__state-icon--progress"
      aria-hidden="true"
      style={{ '--export-progress': `${props.progress}%` } as React.CSSProperties}
    />
  );
}

function createQueuedExportProgress(options: ExportPackageOption[]): ExportTargetProgressMap {
  return Object.fromEntries(
    options.map((option) => [
      option.id,
      {
        phase: 'queued' as ExportProgressPhase,
        value: 0.02,
        status: 'Waiting to start.'
      }
    ])
  );
}

function updateAllActiveExportTargets(
  previous: ExportTargetProgressMap,
  targets: ExportPackageFormat[],
  phase: ExportProgressPhase,
  value: number,
  status: string
): ExportTargetProgressMap {
  const next: ExportTargetProgressMap = { ...previous };
  for (const target of targets) {
    const existing = next[target];
    const canOverrideSettledPhase =
      phase === 'packaging' ||
      phase === 'complete' ||
      phase === 'error';
    if ((existing?.phase === 'complete' || existing?.phase === 'error') && !canOverrideSettledPhase) {
      continue;
    }
    next[target] = {
      phase,
      value: Math.max(existing?.value || 0, value),
      status
    };
  }
  return next;
}

async function readExportStream(response: Response, onEvent: (event: ExportStreamEvent) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Export stream is unavailable.');
  }
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      handleExportStreamLine(line, onEvent);
    }
  }

  buffer += decoder.decode();
  handleExportStreamLine(buffer, onEvent);
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof value.error === 'string' ? value.error : text || 'Request failed.';
    throw new Error(message);
  }
  return value as T;
}

function handleExportStreamLine(line: string, onEvent: (event: ExportStreamEvent) => void): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  onEvent(JSON.parse(trimmed) as ExportStreamEvent);
}

function normalizeExportPhase(phase: ExportProgressPhase | undefined): ExportProgressPhase {
  switch (phase) {
    case 'queued':
    case 'configuring':
    case 'preparing':
    case 'building':
    case 'assembling':
    case 'packaging':
    case 'complete':
    case 'error':
      return phase;
    case 'idle':
    default:
      return 'preparing';
  }
}

function clampProgress(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.02;
  }
  return Math.max(0.02, Math.min(1, value));
}

function isExportPhaseInFlight(phase: ExportProgressPhase): boolean {
  return phase !== 'idle' && phase !== 'complete' && phase !== 'error';
}

function getDefaultProgressStatus(phase: ExportProgressPhase): string {
  switch (phase) {
    case 'queued':
      return 'Waiting to start.';
    case 'configuring':
      return 'Configuring export.';
    case 'building':
      return 'Running ship build.';
    case 'assembling':
      return 'Assembling files.';
    case 'packaging':
      return 'Packaging archive.';
    case 'complete':
      return 'Ready to download.';
    case 'error':
      return 'Export failed.';
    case 'preparing':
    case 'idle':
    default:
      return 'Preparing export.';
  }
}

function getExportOptionStatus(
  option: ExportPackageOption,
  targetProgress: ExportTargetProgressState | undefined,
  progress: ExportProgressState,
  fallbackError: string
): string {
  if (targetProgress) {
    return targetProgress.status;
  }

  switch (progress.phase) {
    case 'queued':
      return `${option.label} is waiting to start.`;
    case 'configuring':
      return `Configuring ${option.label}.`;
    case 'preparing':
      return `Preparing ${option.label}.`;
    case 'building':
      return `Running ship build for ${option.label}.`;
    case 'assembling':
      return `Assembling ${option.label}.`;
    case 'packaging':
      return `Packaging ${option.label}.`;
    case 'complete':
      return `${option.label} ready.`;
    case 'error':
      return progress.detail || fallbackError || `${option.label} export failed.`;
    case 'idle':
    default:
      return option.description;
  }
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

function createExportPackageOptions(slug: string, estimates: ExportEstimates): ExportPackageOption[] {
  return [
    {
      id: 'single',
      label: `${slug}-standalone`,
      description: 'Exports one SharePoint package with the web part bundle embedded for tenant app catalog upload.',
      totalSize: estimates.single?.totalSize || 'Calculated on export',
      files: estimates.single?.files?.length ? estimates.single.files : [
        { name: `${slug}-standalone/${slug}-standalone.sppkg`, size: '~420 KB' },
        { name: `${slug}-standalone/README.md`, size: 'generated' }
      ]
    },
    {
      id: 'cdn',
      label: 'SPFx + CDN JS package',
      description: 'Exports a small SharePoint package plus JavaScript and CSS assets intended for your configured CDN path.',
      totalSize: estimates.cdn?.totalSize || 'Calculated on export',
      files: estimates.cdn?.files?.length ? estimates.cdn.files : [
        { name: 'cdn/README.md', size: 'generated' },
        { name: `cdn/sharepoint/solution/${slug}.cdn.sppkg`, size: '~34 KB' },
        { name: 'cdn/release/assets', size: 'from latest build' },
        { name: 'cdn/cdn-handoff', size: 'from latest build' }
      ]
    },
    {
      id: 'standalone',
      label: `${slug}-repo`,
      description: 'Exports a clean house-standard SPFx repo that can run by itself or be imported into another SPFx Kit lab.',
      totalSize: estimates.standalone?.totalSize || 'Calculated on export',
      files: estimates.standalone?.files?.length ? estimates.standalone.files : [
        { name: `${slug}-repo/package.json`, size: 'generated' },
        { name: `${slug}-repo/package-lock.json`, size: 'generated' },
        { name: `${slug}-repo/SPFX-KIT-EXPORT-README.md`, size: 'upload instructions' }
      ]
    }
  ];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'spfx-web-part';
}

function managedAppPath(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}

function titleFromSlug(value: string): string {
  return value
    .replace(/-spfx$/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ') || value;
}

function slugInputValue(value: string): string {
  return value
    .trimStart()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function isSlugInput(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function getPrimaryShortcutLabel(key: string): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
    return `⌘${key.toUpperCase()}`;
  }

  return `Ctrl+${key.toUpperCase()}`;
}
