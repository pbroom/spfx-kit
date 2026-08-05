import * as React from 'react';
import { Pin16Filled, Pin16Regular } from '@fluentui/react-icons';
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
import { Check, ChevronRight, Download, FolderInput, RefreshCw, Save, X } from 'lucide-react';
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
  longDescription: '',
  videoUrl: '',
  appIcon: '',
  catalogIconPath: '',
  screenshotPaths: [],
  categories: [],
  developerName: '',
  developerWebsiteUrl: '',
  privacyUrl: '',
  termsOfUseUrl: '',
  partnerId: '',
  version: '',
  cdnUrl: ''
};

const SYNC_SUCCESS_DURATION_MS = 1_500;
const SPPKG_EXTENSION = '.sppkg';
const SPPKG_EXTENSION_PATTERN = /\.sppkg$/i;
const MAX_CATALOG_CATEGORIES = 3;
const CATALOG_CATEGORY_OPTIONS = [
  'Accounting + Finance',
  'Collaboration',
  'Content management',
  'CRM',
  'Data + analytics',
  'File managers',
  'IT/admin',
  'Legal + HR',
  'News + weather',
  'Productivity',
  'Project management',
  'Reference',
  'Sales + marketing',
  'Site Design',
  'Social',
  'Workflow & Process Management'
] as const;

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
  const [selectedAppPickerOpen, setSelectedAppPickerOpen] = React.useState(false);
  const refreshInFlightRef = React.useRef(false);
  const mutationInFlightRef = React.useRef(false);
  const syncSuccessTimerRef = React.useRef<number | undefined>(undefined);
  const activeAppOptionIdRef = React.useRef(selectedAppId);

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
      activeAppOptionIdRef.current = selectedAppId;
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
  const selectedConfigLongDescription = selectedConfig?.longDescription || '';
  const selectedConfigVideoUrl = selectedConfig?.videoUrl || '';
  const selectedConfigAppIcon = selectedConfig?.appIcon || '';
  const selectedConfigCatalogIconPath = selectedConfig?.catalogIconPath || '';
  const selectedConfigScreenshotPaths = selectedConfig?.screenshotPaths || EMPTY_EXPORT_CONFIG.screenshotPaths;
  const selectedConfigCategories = selectedConfig?.categories || EMPTY_EXPORT_CONFIG.categories;
  const selectedConfigDeveloperName = selectedConfig?.developerName || '';
  const selectedConfigDeveloperWebsiteUrl = selectedConfig?.developerWebsiteUrl || '';
  const selectedConfigPrivacyUrl = selectedConfig?.privacyUrl || '';
  const selectedConfigTermsOfUseUrl = selectedConfig?.termsOfUseUrl || '';
  const selectedConfigPartnerId = selectedConfig?.partnerId || '';
  const selectedConfigVersion = selectedConfig?.version || '';
  const selectedConfigCdnUrl = selectedConfig?.cdnUrl || '';

  React.useEffect(() => {
    setExportConfig({
      appName: selectedConfigAppName,
      fileName: selectedConfigFileName,
      description: selectedConfigDescription,
      longDescription: selectedConfigLongDescription,
      videoUrl: selectedConfigVideoUrl,
      appIcon: selectedConfigAppIcon,
      catalogIconPath: selectedConfigCatalogIconPath,
      screenshotPaths: selectedConfigScreenshotPaths,
      categories: selectedConfigCategories,
      developerName: selectedConfigDeveloperName,
      developerWebsiteUrl: selectedConfigDeveloperWebsiteUrl,
      privacyUrl: selectedConfigPrivacyUrl,
      termsOfUseUrl: selectedConfigTermsOfUseUrl,
      partnerId: selectedConfigPartnerId,
      version: selectedConfigVersion,
      cdnUrl: selectedConfigCdnUrl
    });
  }, [
    selectedApp?.id,
    selectedConfigAppName,
    selectedConfigFileName,
    selectedConfigDescription,
    selectedConfigLongDescription,
    selectedConfigVideoUrl,
    selectedConfigAppIcon,
    selectedConfigCatalogIconPath,
    selectedConfigScreenshotPaths,
    selectedConfigCategories,
    selectedConfigDeveloperName,
    selectedConfigDeveloperWebsiteUrl,
    selectedConfigPrivacyUrl,
    selectedConfigTermsOfUseUrl,
    selectedConfigPartnerId,
    selectedConfigVersion,
    selectedConfigCdnUrl
  ]);

  const updateExportConfig = <FieldName extends keyof ManagedAppExportConfig>(
    field: FieldName,
    value: ManagedAppExportConfig[FieldName]
  ): void => {
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
              open={selectedAppPickerOpen}
              selectedOptions={selectedApp ? [selectedApp.id] : []}
              value={selectedApp?.title || ''}
              onActiveOptionChange={(_event, data) => {
                activeAppOptionIdRef.current = data.nextOption?.value || selectedApp?.id || '';
              }}
              onKeyDown={(event) => {
                if (!selectedAppPickerOpen || !event.altKey || event.key.toLowerCase() !== 'p') {
                  return;
                }
                const activeAppId = activeAppOptionIdRef.current;
                if (!webPartsByAppId.has(activeAppId)) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onTogglePinned(activeAppId);
              }}
              onOpenChange={(_event, data) => {
                setSelectedAppPickerOpen(data.open);
                if (data.open) {
                  activeAppOptionIdRef.current = selectedApp?.id || '';
                }
              }}
              onOptionSelect={(_event, data) => {
                if (data.optionValue) {
                  setSidebarSelectedAppId(data.optionValue);
                  if (webPartsByAppId.has(data.optionValue)) {
                    onSelectApp(data.optionValue);
                  }
                }
              }}
            >
              {appRows.map((app) => {
                const appLoaded = webPartsByAppId.has(app.id);
                const appPinned = pinnedAppId === app.id;
                return (
                  <div
                    className={`webpart-option-row ${appPinned ? 'webpart-option-row--pinned' : ''}`}
                    key={app.id}
                    role="presentation"
                  >
                    <Option
                      aria-label={`${app.title}. ${
                        appLoaded
                          ? `${appPinned ? 'Pinned' : 'Not pinned'}. Press Alt+P to ${appPinned ? 'unpin' : 'pin'}.`
                          : 'Pin unavailable.'
                      }`}
                      className="webpart-option"
                      text={app.title}
                      value={app.id}
                    >
                      <span className="webpart-option__label">{app.title}</span>
                    </Option>
                    {appLoaded ? (
                      <button
                        aria-label={`${appPinned ? 'Unpin' : 'Pin'} ${app.title} as startup app`}
                        aria-pressed={appPinned}
                        className="webpart-option__pin"
                        title={`${appPinned ? 'Unpin' : 'Pin'} ${app.title} as startup app`}
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onTogglePinned(app.id);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.detail === 0) {
                            onTogglePinned(app.id);
                          }
                        }}
                      >
                        {appPinned ? <Pin16Filled aria-hidden="true" /> : <Pin16Regular aria-hidden="true" />}
                      </button>
                    ) : null}
                  </div>
                );
              })}
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

          <div className="app-management-sidebar__catalog-intro">
            <h3>App catalog details</h3>
            <p>Optional information shown on the SharePoint app details page. Leave a field blank to omit it from the package.</p>
          </div>

          <div className="app-management-sidebar__catalog-groups">
            <details className="app-management-sidebar__catalog-group">
              <summary>
                <span className="app-management-sidebar__catalog-summary-label">
                  <ChevronRight aria-hidden="true" className="app-management-sidebar__catalog-chevron" size={15} />
                  <span>Listing &amp; About</span>
                </span>
                <small>Optional</small>
              </summary>
              <div className="app-management-sidebar__catalog-fields">
                <Field
                  hint="The concise description used by the package and app listing. Existing Description values are preserved here."
                  label="Short description"
                  size="small"
                >
                  <Textarea
                    aria-label="App catalog short description"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    resize="vertical"
                    value={exportConfig.description}
                    onChange={(_event, data) => updateExportConfig('description', data.value)}
                  />
                </Field>
                <Field hint="Additional About content for the SharePoint app details page." label="Long description" size="small">
                  <Textarea
                    aria-label="App catalog long description"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    resize="vertical"
                    value={exportConfig.longDescription}
                    onChange={(_event, data) => updateExportConfig('longDescription', data.value)}
                  />
                </Field>
                <Field hint="Optional YouTube or Vimeo video for the app details page." label="Video URL" size="small">
                  <Input
                    aria-label="App catalog video URL"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    type="url"
                    value={exportConfig.videoUrl}
                    onChange={(_event, data) => updateExportConfig('videoUrl', data.value)}
                  />
                </Field>
              </div>
            </details>

            <details className="app-management-sidebar__catalog-group">
              <summary>
                <span className="app-management-sidebar__catalog-summary-label">
                  <ChevronRight aria-hidden="true" className="app-management-sidebar__catalog-chevron" size={15} />
                  <span>Visuals</span>
                </span>
                <small>Optional</small>
              </summary>
              <div className="app-management-sidebar__catalog-fields">
                <Field
                  hint="Fabric icon name or image URL/path used in the web part toolbox. This does not set the App Catalog listing image."
                  label="Toolbox icon"
                  size="small"
                >
                  <Input
                    aria-label="Web part toolbox icon"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    value={exportConfig.appIcon}
                    onChange={(_event, data) => updateExportConfig('appIcon', data.value)}
                  />
                </Field>
                <Field
                  hint="Package-directory-relative path to the PNG bundled for the App Catalog listing."
                  label="App Catalog icon"
                  size="small"
                >
                  <Input
                    aria-label="App catalog icon path"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    value={exportConfig.catalogIconPath}
                    onChange={(_event, data) => updateExportConfig('catalogIconPath', data.value)}
                  />
                </Field>
                <Field
                  hint="Up to five package-directory-relative PNG paths or credential-free HTTPS image URLs, one per line."
                  label="Screenshots"
                  size="small"
                >
                  <Textarea
                    aria-label="App catalog screenshot paths"
                    className="app-management-sidebar__path-list"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    resize="vertical"
                    value={exportConfig.screenshotPaths.join('\n')}
                    onChange={(_event, data) => updateExportConfig('screenshotPaths', linesToValues(data.value))}
                  />
                </Field>
              </div>
            </details>

            <details className="app-management-sidebar__catalog-group">
              <summary>
                <span className="app-management-sidebar__catalog-summary-label">
                  <ChevronRight aria-hidden="true" className="app-management-sidebar__catalog-chevron" size={15} />
                  <span>Details &amp; Support</span>
                </span>
                <small>Optional</small>
              </summary>
              <div className="app-management-sidebar__catalog-fields">
                <Field hint="Choose up to three categories." label="Categories" size="small">
                  <Dropdown
                    aria-label="App catalog categories"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    multiselect
                    placeholder="Select categories"
                    selectedOptions={exportConfig.categories}
                    value={categorySelectionLabel(exportConfig.categories)}
                    onOptionSelect={(_event, data) => {
                      if (data.selectedOptions.length <= MAX_CATALOG_CATEGORIES) {
                        updateExportConfig('categories', data.selectedOptions);
                      }
                    }}
                  >
                    {CATALOG_CATEGORY_OPTIONS.map((category) => (
                      <Option
                        disabled={
                          exportConfig.categories.length >= MAX_CATALOG_CATEGORIES && !exportConfig.categories.includes(category)
                        }
                        key={category}
                        text={category}
                        value={category}
                      >
                        {category}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label="Developer or organization name" size="small">
                  <Input
                    aria-label="App catalog developer name"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    value={exportConfig.developerName}
                    onChange={(_event, data) => updateExportConfig('developerName', data.value)}
                  />
                </Field>
                <Field label="Website URL" size="small">
                  <Input
                    aria-label="App catalog developer website URL"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    type="url"
                    value={exportConfig.developerWebsiteUrl}
                    onChange={(_event, data) => updateExportConfig('developerWebsiteUrl', data.value)}
                  />
                </Field>
                <Field label="Privacy URL" size="small">
                  <Input
                    aria-label="App catalog privacy URL"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    type="url"
                    value={exportConfig.privacyUrl}
                    onChange={(_event, data) => updateExportConfig('privacyUrl', data.value)}
                  />
                </Field>
                <Field label="Terms-of-use URL" size="small">
                  <Input
                    aria-label="App catalog terms of use URL"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    type="url"
                    value={exportConfig.termsOfUseUrl}
                    onChange={(_event, data) => updateExportConfig('termsOfUseUrl', data.value)}
                  />
                </Field>
                <Field hint="Microsoft Partner Network identifier, when applicable." label="Partner ID" size="small">
                  <Input
                    aria-label="App catalog partner ID"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    value={exportConfig.partnerId}
                    onChange={(_event, data) => updateExportConfig('partnerId', data.value)}
                  />
                </Field>
                <p className="app-management-sidebar__hint">
                  This export writes the package’s default metadata. App Catalog administrators can override listing details, and
                  localized listing text remains managed in the app’s source files. Publisher, support URL, and featured status
                  are catalog-admin settings rather than SPFx package fields.
                </p>
              </div>
            </details>
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
            <Button
              disabled={!selectedAppLoaded || busy}
              icon={<Download size={14} />}
              onClick={() => onOpenExport(['standalone'])}
            >
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

function linesToValues(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function categorySelectionLabel(categories: string[]): string {
  if (!categories.length) {
    return '';
  }
  return categories.length === 1 ? categories[0] : `${categories.length} categories selected`;
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
