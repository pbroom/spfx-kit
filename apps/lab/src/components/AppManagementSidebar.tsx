import * as React from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Switch,
  Textarea
} from '@fluentui/react-components';
import { Check, Download, FolderInput, RefreshCw, Save, X } from 'lucide-react';
import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import {
  ExportPackageFormat,
  labApiWriteHeaders,
  ManagedAppExportConfig,
  ManagedLabApp,
  ManagedLabAppsApiResult,
  ManageAppsApiResult,
  readApiJson
} from '../api/labApi';
import { managedAppPath, titleFromSlug } from '../lib/text';

type AppManagementPhase = 'idle' | 'loading' | 'running' | 'complete' | 'error';

interface AppManagementStatus {
  phase: AppManagementPhase;
  message: string;
  detail?: string;
  reloadRecommended?: boolean;
}

interface AppManagementRow {
  id: string;
  title: string;
  managed?: ManagedLabApp;
}

export interface AppManagementSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webPartsByAppId: Map<string, LabWebPart[]>;
  selectedAppId: string;
  onSelectApp: (appId: string) => void;
  pinnedAppId: string;
  onTogglePinned: (appId: string) => void;
  onOpenImport: () => void;
  onOpenExport: (targets: ExportPackageFormat[]) => void;
}

const EMPTY_EXPORT_CONFIG: ManagedAppExportConfig = {
  appName: '',
  fileName: '',
  description: '',
  appIcon: '',
  version: '',
  cdnUrl: ''
};

const SYNC_SUCCESS_DURATION_MS = 1_500;
const SPPKG_EXTENSION = '.sppkg';
const SPPKG_EXTENSION_PATTERN = /\.sppkg$/i;

export function AppManagementSidebar(props: AppManagementSidebarProps): JSX.Element {
  const {
    open,
    onOpenChange,
    webPartsByAppId,
    selectedAppId,
    onSelectApp,
    pinnedAppId,
    onTogglePinned,
    onOpenImport,
    onOpenExport
  } = props;
  const [managedApps, setManagedApps] = React.useState<ManagedLabApp[]>([]);
  const [status, setStatus] = React.useState<AppManagementStatus>({ phase: 'idle', message: '' });
  const [busyAppId, setBusyAppId] = React.useState('');
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = React.useState(false);
  const [exportConfig, setExportConfig] = React.useState<ManagedAppExportConfig>(EMPTY_EXPORT_CONFIG);
  const [sidebarSelectedAppId, setSidebarSelectedAppId] = React.useState(selectedAppId);
  const refreshInFlightRef = React.useRef(false);
  const mutationInFlightRef = React.useRef(false);
  const syncSuccessTimerRef = React.useRef<number | undefined>(undefined);

  const refreshManagedApps = React.useCallback(async (options: { quiet?: boolean } = {}): Promise<void> => {
    if (refreshInFlightRef.current || mutationInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    setBusyAppId('__all__');
    if (!options.quiet) {
      setStatus({ phase: 'loading', message: 'Loading apps' });
    }

    let autoUpdating = false;
    let updatedCount = 0;
    try {
      const response = await fetch('/api/spfx-apps/');
      const result = await readApiJson<ManagedLabAppsApiResult>(response);
      let apps = result.apps;
      setManagedApps(apps);
      const updates = apps.filter(
        (app) =>
          app.version.selected === 'latest' && app.version.autoUpdate && app.version.canAutoUpdate && app.version.updateAvailable
      );

      if (updates.length) {
        autoUpdating = true;
        mutationInFlightRef.current = true;
        setStatus({
          phase: 'running',
          message: updates.length === 1 ? 'Updating app' : 'Updating apps',
          detail: 'Fetching the newest tracked versions.'
        });
        for (const app of updates) {
          const updateResult = await requestAppVersion(app.id, 'latest');
          apps = updateResult.apps;
          updatedCount += 1;
          setManagedApps(apps);
        }
        setStatus({
          phase: 'complete',
          message: updates.length === 1 ? 'App updated' : `${updates.length} apps updated`,
          detail: 'Reload the lab to apply the updated source.',
          reloadRecommended: true
        });
      } else if (!options.quiet) {
        setStatus({ phase: 'idle', message: '' });
      }
    } catch (error) {
      const nextStatus: AppManagementStatus = {
        phase: 'error',
        message: updatedCount ? 'Some apps were updated' : autoUpdating ? 'Apps were not updated' : 'Could not load apps',
        detail: updatedCount
          ? `${updatedCount} ${updatedCount === 1 ? 'app was' : 'apps were'} updated before another update failed. ${errorMessage(error)}`
          : errorMessage(error),
        reloadRecommended: updatedCount > 0
      };
      if (options.quiet && !updatedCount) {
        setStatus((current) => (current.reloadRecommended ? current : nextStatus));
      } else {
        setStatus(nextStatus);
      }
    } finally {
      if (autoUpdating) {
        mutationInFlightRef.current = false;
      }
      refreshInFlightRef.current = false;
      setBusyAppId('');
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setSidebarSelectedAppId(selectedAppId);
      setStatus({ phase: 'idle', message: '' });
      void refreshManagedApps();
    }
  }, [open, refreshManagedApps, selectedAppId]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void refreshManagedApps({ quiet: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [open, refreshManagedApps]);

  React.useEffect(
    () => () => {
      if (syncSuccessTimerRef.current !== undefined) {
        window.clearTimeout(syncSuccessTimerRef.current);
      }
    },
    []
  );

  const appRows = React.useMemo(() => {
    const rows = new Map<string, AppManagementRow>();
    for (const [appId, webParts] of webPartsByAppId) {
      rows.set(appId, {
        id: appId,
        title: webParts[0]?.title || titleFromSlug(appId)
      });
    }
    for (const app of managedApps) {
      rows.set(app.id, {
        id: app.id,
        title: titleForManagedApp(app, webPartsByAppId),
        managed: app
      });
    }
    return [...rows.values()].sort((left, right) => left.title.localeCompare(right.title));
  }, [managedApps, webPartsByAppId]);
  const selectedApp = appRows.find((app) => app.id === sidebarSelectedAppId) || appRows[0];
  const selectedManagedApp = selectedApp?.managed;
  const selectedAppLoaded = Boolean(selectedApp && webPartsByAppId.has(selectedApp.id));
  const selectedConfig = selectedManagedApp?.exportConfig;
  const selectedConfigAppName = selectedConfig?.appName || '';
  const selectedConfigFileName = selectedConfig?.fileName || '';
  const selectedConfigDescription = selectedConfig?.description || '';
  const selectedConfigAppIcon = selectedConfig?.appIcon || '';
  const selectedConfigVersion = selectedConfig?.version || '';
  const selectedConfigCdnUrl = selectedConfig?.cdnUrl || '';

  React.useEffect(() => {
    setExportConfig({
      appName: selectedConfigAppName,
      fileName: selectedConfigFileName,
      description: selectedConfigDescription,
      appIcon: selectedConfigAppIcon,
      version: selectedConfigVersion,
      cdnUrl: selectedConfigCdnUrl
    });
  }, [
    selectedApp?.id,
    selectedConfigAppName,
    selectedConfigFileName,
    selectedConfigDescription,
    selectedConfigAppIcon,
    selectedConfigVersion,
    selectedConfigCdnUrl
  ]);

  const updateExportConfig = (field: keyof ManagedAppExportConfig, value: string): void => {
    setExportConfig((current) => ({ ...current, [field]: value }));
  };

  const runConnectionAction = async (app: ManagedLabApp, connect: boolean): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setBusyAppId(app.id);
    setStatus({
      phase: 'running',
      message: connect ? 'Activating app' : 'Deactivating app',
      detail: managedAppPath(app.id)
    });
    try {
      const response = await fetch(`/api/spfx-apps/${connect ? 'sync' : 'unlink'}`, {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({ appId: app.id })
      });
      const result = await readApiJson<ManageAppsApiResult>(response);
      setManagedApps(result.apps);
      setStatus({
        phase: 'complete',
        message: result.message,
        detail: `Synced ${result.syncedAdapters ?? 'the'} lab adapter${result.syncedAdapters === 1 ? '' : 's'}. Reload the lab to apply registry changes.`,
        reloadRecommended: true
      });
    } catch (error) {
      setStatus({
        phase: 'error',
        message: connect ? 'App was not activated' : 'App was not deactivated',
        detail: errorMessage(error)
      });
    } finally {
      mutationInFlightRef.current = false;
      setBusyAppId('');
    }
  };

  const runVersionAction = async (appId: string, versionId: string): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setBusyAppId(appId);
    setStatus({ phase: 'running', message: 'Changing app version', detail: managedAppPath(appId) });
    try {
      const result = await requestAppVersion(appId, versionId);
      setManagedApps(result.apps);
      setStatus({
        phase: 'complete',
        message: result.message,
        detail: 'Reload the lab to apply the updated source.',
        reloadRecommended: true
      });
    } catch (error) {
      setStatus({ phase: 'error', message: 'App version needs attention', detail: errorMessage(error) });
    } finally {
      mutationInFlightRef.current = false;
      setBusyAppId('');
    }
  };

  const syncManagedApps = async (): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setBusyAppId('__all__');
    if (syncSuccessTimerRef.current !== undefined) {
      window.clearTimeout(syncSuccessTimerRef.current);
      syncSuccessTimerRef.current = undefined;
    }
    setShowSyncSuccess(false);
    setStatus({ phase: 'idle', message: '' });
    try {
      const response = await fetch('/api/spfx-apps/sync', {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({})
      });
      const result = await readApiJson<ManageAppsApiResult>(response);
      setManagedApps(result.apps);
      const syncedAt = new Date();
      setLastSyncedAt(null);
      setShowSyncSuccess(true);
      syncSuccessTimerRef.current = window.setTimeout(() => {
        setShowSyncSuccess(false);
        setLastSyncedAt(syncedAt);
        syncSuccessTimerRef.current = undefined;
      }, SYNC_SUCCESS_DURATION_MS);
    } catch (error) {
      setStatus({ phase: 'error', message: 'Apps were not re-synced', detail: errorMessage(error) });
    } finally {
      mutationInFlightRef.current = false;
      setBusyAppId('');
    }
  };

  const saveExportConfig = async (): Promise<void> => {
    if (!selectedManagedApp || mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setBusyAppId(selectedManagedApp.id);
    setStatus({ phase: 'running', message: 'Saving app export config', detail: managedAppPath(selectedManagedApp.id) });
    try {
      const response = await fetch('/api/spfx-apps/export-config', {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({ appId: selectedManagedApp.id, exportConfig })
      });
      const result = await readApiJson<ExportConfigSaveResult>(response);
      const savedConfig = result.exportConfig || exportConfig;
      if (result.apps) {
        setManagedApps(result.apps);
      } else {
        setManagedApps((apps) =>
          apps.map((app) => (app.id === selectedManagedApp.id ? { ...app, exportConfig: savedConfig } : app))
        );
      }
      setExportConfig(savedConfig);
      setStatus({ phase: 'complete', message: result.message || 'App export config saved.' });
    } catch (error) {
      setStatus({ phase: 'error', message: 'App export config was not saved', detail: errorMessage(error) });
    } finally {
      mutationInFlightRef.current = false;
      setBusyAppId('');
    }
  };

  const busy = Boolean(busyAppId);
  const selectedAppBusy = busyAppId === selectedApp?.id || busyAppId === '__all__';
  const connected = selectedManagedApp?.status === 'connected';
  const canToggleConnection = selectedManagedApp?.status === 'connected' || selectedManagedApp?.status === 'disconnected';
  const pinned = Boolean(selectedApp && pinnedAppId === selectedApp.id);

  return (
    <Drawer
      className="app-management-sidebar"
      id="app-management-sidebar"
      modalType="modal"
      onOpenChange={(_event, data) => onOpenChange(data.open)}
      open={open}
      position="start"
      size="medium"
      type="overlay"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              aria-label="Close app settings sidebar"
              icon={<X size={16} />}
              onClick={() => onOpenChange(false)}
            />
          }
        >
          App settings
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody className="app-management-sidebar__body">
        <section aria-labelledby="selected-app-heading" className="app-management-sidebar__section">
          <h2 id="selected-app-heading">Selected App</h2>
          <Field label="App" size="small">
            <Dropdown
              aria-label="Selected app"
              disabled={busy || !appRows.length}
              selectedOptions={selectedApp ? [selectedApp.id] : []}
              value={selectedApp?.title || ''}
              onOptionSelect={(_event, data) => {
                if (data.optionValue) {
                  setSidebarSelectedAppId(data.optionValue);
                  if (webPartsByAppId.has(data.optionValue)) {
                    onSelectApp(data.optionValue);
                  }
                }
              }}
            >
              {appRows.map((app) => (
                <Option key={app.id} text={app.title} value={app.id}>
                  {app.title}
                </Option>
              ))}
            </Dropdown>
          </Field>

          {selectedApp ? (
            <div className="app-management-sidebar__app-controls">
              {!selectedManagedApp ? (
                <p className="app-management-sidebar__hint">
                  This loaded app is not managed by SPFx Kit. Active state, source version, and export config are unavailable.
                </p>
              ) : null}
              <Switch
                aria-label={`${connected ? 'Active' : 'Inactive'}: ${selectedApp.title}`}
                checked={connected}
                disabled={selectedAppBusy || !selectedManagedApp || !canToggleConnection}
                label={selectedManagedApp ? (connected ? 'Active' : 'Inactive') : 'Active status unavailable'}
                onChange={(_event, data) => {
                  if (selectedManagedApp) {
                    void runConnectionAction(selectedManagedApp, data.checked);
                  }
                }}
              />

              <Field hint={selectedManagedApp?.version.detail} label="Version" size="small">
                <Dropdown
                  aria-label={`Source version for ${selectedApp.title}`}
                  disabled={selectedAppBusy || !selectedManagedApp?.version.canSelect}
                  selectedOptions={selectedManagedApp ? [selectedManagedApp.version.selected] : []}
                  value={selectedManagedApp ? versionDropdownLabel(selectedManagedApp) : 'Local / unmanaged'}
                  onOptionSelect={(_event, data) => {
                    if (
                      selectedManagedApp &&
                      data.optionValue &&
                      (data.optionValue !== selectedManagedApp.version.selected ||
                        selectedManagedApp.version.updateAvailable ||
                        (data.optionValue === 'latest' && !selectedManagedApp.version.autoUpdate))
                    ) {
                      void runVersionAction(selectedManagedApp.id, data.optionValue);
                    }
                  }}
                >
                  {(selectedManagedApp?.version.options || []).map((option) => (
                    <Option key={option.id} text={option.label} value={option.id}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Switch
                aria-label={`${pinned ? 'Pinned' : 'Not pinned'}: ${selectedApp.title}`}
                checked={pinned}
                disabled={selectedAppBusy || !selectedAppLoaded}
                label={pinned ? 'Pinned' : 'Not pinned'}
                onChange={() => onTogglePinned(selectedApp.id)}
              />
            </div>
          ) : (
            <p className="app-management-sidebar__empty">No workspace apps found.</p>
          )}
        </section>

        <section aria-labelledby="export-config-heading" className="app-management-sidebar__section">
          <h2 id="export-config-heading">App export config</h2>
          <div className="app-management-sidebar__config-grid">
            <Field label="App Name" size="small">
              <Input
                aria-label="Export app name"
                disabled={!selectedManagedApp || selectedAppBusy}
                value={exportConfig.appName}
                onChange={(_event, data) => updateExportConfig('appName', data.value)}
              />
            </Field>
            <Field label="File Name" size="small">
              <div className="app-management-sidebar__file-name-control">
                <Input
                  aria-describedby="export-file-name-description"
                  aria-label="Export file name"
                  className="app-management-sidebar__file-name-input"
                  disabled={!selectedManagedApp || selectedAppBusy}
                  value={fileNameStem(exportConfig.fileName)}
                  onChange={(_event, data) => updateExportConfig('fileName', `${fileNameStem(data.value)}${SPPKG_EXTENSION}`)}
                />
                <span aria-hidden="true" className="app-management-sidebar__file-name-overlay">
                  <span className="app-management-sidebar__file-name-mirror">{fileNameStem(exportConfig.fileName)}</span>
                  <span className="app-management-sidebar__file-name-suffix">{SPPKG_EXTENSION}</span>
                </span>
                <span className="visually-hidden" id="export-file-name-description">
                  The {SPPKG_EXTENSION} extension is added automatically.
                </span>
              </div>
            </Field>
            <Field className="app-management-sidebar__wide-field" label="Description" size="small">
              <Textarea
                aria-label="Export description"
                disabled={!selectedManagedApp || selectedAppBusy}
                resize="vertical"
                value={exportConfig.description}
                onChange={(_event, data) => updateExportConfig('description', data.value)}
              />
            </Field>
            <Field label="App Icon" size="small">
              <Input
                aria-label="Export app icon"
                disabled={!selectedManagedApp || selectedAppBusy}
                value={exportConfig.appIcon}
                onChange={(_event, data) => updateExportConfig('appIcon', data.value)}
              />
            </Field>
            <Field label="Version" size="small">
              <Input
                aria-label="Export version"
                disabled={!selectedManagedApp || selectedAppBusy}
                value={exportConfig.version}
                onChange={(_event, data) => updateExportConfig('version', data.value)}
              />
            </Field>
            <Field className="app-management-sidebar__wide-field" label="CDN URL" size="small">
              <Input
                aria-label="Export CDN URL"
                disabled={!selectedManagedApp || selectedAppBusy}
                type="url"
                value={exportConfig.cdnUrl}
                onChange={(_event, data) => updateExportConfig('cdnUrl', data.value)}
              />
            </Field>
          </div>
          <Button
            appearance="primary"
            aria-label="Save app export config"
            disabled={!selectedManagedApp || selectedAppBusy}
            icon={<Save size={14} />}
            onClick={() => void saveExportConfig()}
          >
            Save
          </Button>
        </section>

        <section aria-labelledby="app-actions-heading" className="app-management-sidebar__section">
          <h2 id="app-actions-heading">App actions</h2>
          <div className="app-management-sidebar__actions">
            <Button disabled={busy} icon={<FolderInput size={14} />} onClick={onOpenImport}>
              Import
            </Button>
            <Button disabled={!selectedAppLoaded || busy} icon={<Download size={14} />} onClick={() => onOpenExport(['single'])}>
              Download standalone
            </Button>
            <Button disabled={!selectedAppLoaded || busy} icon={<Download size={14} />} onClick={() => onOpenExport(['cdn'])}>
              Download CDN-ready
            </Button>
          </div>
        </section>

        {status.phase !== 'idle' ? (
          <section
            aria-live={status.phase === 'error' ? 'assertive' : 'polite'}
            className={`app-management-sidebar__status app-management-sidebar__status--${status.phase}`}
            role={status.phase === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true" className="app-management-sidebar__status-icon">
              {status.phase === 'complete' ? (
                <Check size={13} />
              ) : status.phase === 'error' ? (
                <X size={13} />
              ) : (
                <RefreshCw size={13} />
              )}
            </span>
            <span>
              <strong>{status.message}</strong>
              {status.detail ? <small>{status.detail}</small> : null}
            </span>
          </section>
        ) : null}
      </DrawerBody>

      <DrawerFooter className="app-management-sidebar__footer">
        <span className="app-management-sidebar__sync-meta">
          {lastSyncedAt ? (
            <time dateTime={lastSyncedAt.toISOString()} title={lastSyncedAt.toLocaleString()}>
              Last synced {formatSyncTimestamp(lastSyncedAt)}
            </time>
          ) : null}
          <Button
            appearance="subtle"
            aria-label="Re-sync apps"
            disabled={busy || status.phase === 'loading'}
            icon={showSyncSuccess ? <Check size={14} /> : <RefreshCw size={14} />}
            onClick={() => void syncManagedApps()}
          >
            Re-sync
          </Button>
        </span>
        {status.reloadRecommended ? (
          <Button appearance="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>
            Reload lab
          </Button>
        ) : (
          <Button appearance="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        )}
      </DrawerFooter>
    </Drawer>
  );
}

interface ExportConfigSaveResult {
  appId?: string;
  message?: string;
  exportConfig?: ManagedAppExportConfig;
  apps?: ManagedLabApp[];
}

function fileNameStem(value: string): string {
  return value.replace(SPPKG_EXTENSION_PATTERN, '');
}

function titleForManagedApp(app: ManagedLabApp, webPartsByAppId: Map<string, LabWebPart[]>): string {
  return app.exportConfig?.appName || webPartsByAppId.get(app.id)?.[0]?.title || titleFromSlug(app.id);
}

function versionDropdownLabel(app: ManagedLabApp): string {
  const selected = app.version.options.find((option) => option.id === app.version.selected)?.label || 'Version';
  if (app.version.current === 'Unknown' || selected.replace(/^v/, '') === app.version.current) {
    return selected;
  }
  return `${selected} · v${app.version.current}`;
}

function formatSyncTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

async function requestAppVersion(appId: string, versionId: string): Promise<ManageAppsApiResult> {
  const response = await fetch('/api/spfx-apps/version', {
    method: 'POST',
    headers: labApiWriteHeaders,
    body: JSON.stringify({ appId, versionId })
  });
  return readApiJson<ManageAppsApiResult>(response);
}
