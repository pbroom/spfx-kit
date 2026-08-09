import * as React from 'react';
import { Check, Download, FolderInput, Pin, PinOff, RefreshCw, Save, X } from 'lucide-react';
import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../../../../packages/ui-profile/normalized/src/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '../../../../packages/ui-profile/normalized/src/components/ui/alert';
import { Button } from '../../../../packages/ui-profile/normalized/src/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle
} from '../../../../packages/ui-profile/normalized/src/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '../../../../packages/ui-profile/normalized/src/components/ui/input-group';
import { Input } from '../../../../packages/ui-profile/normalized/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../../packages/ui-profile/normalized/src/components/ui/select';
import { Separator } from '../../../../packages/ui-profile/normalized/src/components/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../../../packages/ui-profile/normalized/src/components/ui/sheet';
import { Spinner } from '../../../../packages/ui-profile/normalized/src/components/ui/spinner';
import { Switch } from '../../../../packages/ui-profile/normalized/src/components/ui/switch';
import { Textarea } from '../../../../packages/ui-profile/normalized/src/components/ui/textarea';
import { useSpfxUiDerivedId } from '../../../../packages/ui-profile/normalized/src/lib/ui-root';
import {
  ExportPackageFormat,
  labApiWriteHeaders,
  loadManagedLabApps,
  ManagedAppExportConfig,
  ManagedLabApp,
  ManageAppsApiResult,
  readApiJson
} from '../api/labApi';
import {
  loadLocalCdnBucketInventory,
  publicLocalCdnManifestUrl,
  selectedLocalCdnRelease,
  type LocalCdnBucketInventory
} from '../api/localCdnBucket';
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
  contentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webPartsByAppId: Map<string, LabWebPart[]>;
  selectedAppId: string;
  onSelectApp: (appId: string) => void;
  pinnedAppId: string;
  onTogglePinned: (appId: string) => void;
  onOpenImport: () => void;
  onOpenExport: (targets: ExportPackageFormat[]) => void;
  triggerId: string;
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

function isPinShortcut(event: React.KeyboardEvent<HTMLElement>): boolean {
  return (
    !event.repeat &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.getModifierState('AltGraph') &&
    event.code === 'KeyP'
  );
}

interface AppSettingsFieldProps {
  children: (controlId: string, descriptionId: string) => React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  label: React.ReactNode;
  name: string;
  ownerId: string;
}

function AppSettingsField({ children, className, description, label, name, ownerId }: AppSettingsFieldProps): JSX.Element {
  const controlId = useSpfxUiDerivedId(ownerId, name);
  const descriptionId = useSpfxUiDerivedId(controlId, 'description');

  return (
    <Field className={className}>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children(controlId, descriptionId)}
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
    </Field>
  );
}

export function AppManagementSidebar(props: AppManagementSidebarProps): JSX.Element {
  const {
    contentId,
    open,
    onOpenChange,
    webPartsByAppId,
    selectedAppId,
    onSelectApp,
    pinnedAppId,
    onTogglePinned,
    onOpenImport,
    onOpenExport,
    triggerId
  } = props;
  const [managedApps, setManagedApps] = React.useState<ManagedLabApp[]>([]);
  const [status, setStatus] = React.useState<AppManagementStatus>({ phase: 'idle', message: '' });
  const [busyAppId, setBusyAppId] = React.useState('');
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = React.useState(false);
  const [exportConfig, setExportConfig] = React.useState<ManagedAppExportConfig>(EMPTY_EXPORT_CONFIG);
  const [localCdnInventory, setLocalCdnInventory] = React.useState<LocalCdnBucketInventory>();
  const [sidebarSelectedAppId, setSidebarSelectedAppId] = React.useState(selectedAppId);
  const [selectedAppPickerOpen, setSelectedAppPickerOpen] = React.useState(false);
  const [versionPickerOpen, setVersionPickerOpen] = React.useState(false);
  const [categoriesPickerOpen, setCategoriesPickerOpen] = React.useState(false);
  const [pinAnnouncement, setPinAnnouncement] = React.useState('');
  const refreshInFlightRef = React.useRef(false);
  const mutationInFlightRef = React.useRef(false);
  const syncSuccessTimerRef = React.useRef<number | undefined>(undefined);
  const selectedAppContentRef = React.useRef<HTMLDivElement>(null);
  const titleId = useSpfxUiDerivedId(contentId, 'title');
  const descriptionId = useSpfxUiDerivedId(contentId, 'description');
  const selectedAppHeadingId = useSpfxUiDerivedId(contentId, 'selected-app-heading');
  const exportConfigHeadingId = useSpfxUiDerivedId(contentId, 'export-config-heading');
  const appActionsHeadingId = useSpfxUiDerivedId(contentId, 'app-actions-heading');
  const selectedAppSelectId = useSpfxUiDerivedId(contentId, 'selected-app');
  const selectedAppSelectContentId = useSpfxUiDerivedId(selectedAppSelectId, 'content');
  const connectionSwitchId = useSpfxUiDerivedId(contentId, 'connection');
  const versionSelectId = useSpfxUiDerivedId(contentId, 'version');
  const versionSelectContentId = useSpfxUiDerivedId(versionSelectId, 'content');
  const categoriesSelectId = useSpfxUiDerivedId(contentId, 'categories');
  const categoriesSelectContentId = useSpfxUiDerivedId(categoriesSelectId, 'content');
  const listingAccordionId = useSpfxUiDerivedId(contentId, 'catalog-listing');
  const visualsAccordionId = useSpfxUiDerivedId(contentId, 'catalog-visuals');
  const supportAccordionId = useSpfxUiDerivedId(contentId, 'catalog-support');

  React.useEffect(() => {
    if (!open) {
      setSelectedAppPickerOpen(false);
      setVersionPickerOpen(false);
      setCategoriesPickerOpen(false);
    }
  }, [open]);

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
      const result = await loadManagedLabApps();
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
    const controller = new AbortController();
    void loadLocalCdnBucketInventory(controller.signal)
      .then(setLocalCdnInventory)
      .catch(() => {
        if (!controller.signal.aborted) {
          setLocalCdnInventory(undefined);
        }
      });
    return () => controller.abort();
  }, [open]);

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
  const activeLocalCdnRelease = selectedApp ? selectedLocalCdnRelease(localCdnInventory, selectedApp.id) : undefined;

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
  const togglePinnedAppWithAnnouncement = (appId: string): void => {
    const app = appRows.find((item) => item.id === appId);
    if (!app) {
      return;
    }
    const nextPinnedAppId = pinnedAppId === appId ? '' : appId;
    onTogglePinned(appId);
    setPinAnnouncement(nextPinnedAppId ? `${app.title} pinned as the startup app.` : `${app.title} is no longer pinned.`);
  };
  const handleSelectedAppPickerKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!selectedAppPickerOpen || !isPinShortcut(event)) {
      return;
    }
    const activeAppId =
      selectedAppContentRef.current?.querySelector<HTMLElement>('[data-highlighted][data-app-id]')?.dataset.appId ||
      selectedApp?.id ||
      '';
    if (!webPartsByAppId.has(activeAppId)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    togglePinnedAppWithAnnouncement(activeAppId);
  };
  const activeLocalCdnManifestUrl =
    localCdnInventory && activeLocalCdnRelease ? publicLocalCdnManifestUrl(localCdnInventory, activeLocalCdnRelease) : undefined;
  const sourceRepositoryUrl = selectedManagedApp?.version.repositoryUrl;

  return (
    <Sheet
      open={open}
      triggerId={triggerId}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          eventDetails.reason === 'escape-key' &&
          (selectedAppPickerOpen || versionPickerOpen || categoriesPickerOpen)
        ) {
          eventDetails.cancel();
          setSelectedAppPickerOpen(false);
          setVersionPickerOpen(false);
          setCategoriesPickerOpen(false);
          return;
        }
        if (!nextOpen) {
          setSelectedAppPickerOpen(false);
          setVersionPickerOpen(false);
          setCategoriesPickerOpen(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="app-management-sidebar"
        data-sidebar="sidebar"
        id={contentId}
        side="left"
        showCloseButton={false}
        onKeyDown={handleSelectedAppPickerKeyDown}
      >
        <SheetHeader className="app-management-sidebar__header">
          <SheetTitle id={titleId}>App settings</SheetTitle>
          <SheetDescription className="visually-hidden" id={descriptionId}>
            Manage the selected Lab app, its export settings, and package actions.
          </SheetDescription>
          <SheetClose
            aria-label="Close app settings sidebar"
            render={<Button className="app-management-sidebar__close" size="icon-sm" variant="ghost" />}
          >
            <X />
          </SheetClose>
        </SheetHeader>

        <div className="app-management-sidebar__body" data-sidebar="content">
          <section aria-labelledby={selectedAppHeadingId} className="app-management-sidebar__section">
            <h2 id={selectedAppHeadingId}>Selected App</h2>
            <AppSettingsField label="App" name="selected-app" ownerId={contentId}>
              {(controlId) => (
                <Select
                  id={controlId}
                  disabled={busy || !appRows.length}
                  items={Object.fromEntries(appRows.map((app) => [app.id, app.title]))}
                  open={selectedAppPickerOpen}
                  value={selectedApp?.id || null}
                  onOpenChange={setSelectedAppPickerOpen}
                  onValueChange={(nextValue) => {
                    if (nextValue) {
                      setSidebarSelectedAppId(nextValue);
                      if (webPartsByAppId.has(nextValue)) {
                        onSelectApp(nextValue);
                      }
                    }
                  }}
                >
                  <SelectTrigger aria-label="Selected app" size="sm" onKeyDown={handleSelectedAppPickerKeyDown}>
                    <SelectValue>{selectedApp?.title || ''}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    id={selectedAppSelectContentId}
                    ref={selectedAppContentRef}
                    onKeyDown={handleSelectedAppPickerKeyDown}
                  >
                    <SelectGroup>
                      {appRows.map((app) => {
                        const appLoaded = webPartsByAppId.has(app.id);
                        const appPinned = pinnedAppId === app.id;
                        return (
                          <SelectItem
                            aria-label={`${app.title}. ${
                              appLoaded
                                ? `${appPinned ? 'Pinned' : 'Not pinned'}. Press Alt+P to ${appPinned ? 'unpin' : 'pin'}.`
                                : 'Pin unavailable.'
                            }`}
                            data-app-id={app.id}
                            key={app.id}
                            value={app.id}
                            onKeyDown={handleSelectedAppPickerKeyDown}
                          >
                            {app.title}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </AppSettingsField>
            {selectedApp ? (
              <Button
                aria-label={`${pinnedAppId === selectedApp.id ? 'Unpin' : 'Pin'} ${selectedApp.title} as startup app`}
                aria-pressed={pinnedAppId === selectedApp.id}
                disabled={!webPartsByAppId.has(selectedApp.id)}
                variant="outline"
                onClick={() => togglePinnedAppWithAnnouncement(selectedApp.id)}
              >
                {pinnedAppId === selectedApp.id ? <PinOff data-icon="inline-start" /> : <Pin data-icon="inline-start" />}
                {pinnedAppId === selectedApp.id ? 'Unpin startup app' : 'Pin as startup app'}
              </Button>
            ) : null}
            <span aria-live="polite" className="visually-hidden" role="status">
              {pinAnnouncement}
            </span>

            {selectedApp ? (
              <div className="app-management-sidebar__app-controls">
                {!selectedManagedApp ? (
                  <p className="app-management-sidebar__hint">
                    This loaded app is not managed by SPFx Kit. Active state, source version, and export config are unavailable.
                  </p>
                ) : null}
                <Field data-disabled={selectedAppBusy || !selectedManagedApp || !canToggleConnection} orientation="horizontal">
                  <Switch
                    checked={connected}
                    disabled={selectedAppBusy || !selectedManagedApp || !canToggleConnection}
                    id={connectionSwitchId}
                    onCheckedChange={(checked) => {
                      if (selectedManagedApp) {
                        void runConnectionAction(selectedManagedApp, checked);
                      }
                    }}
                  />
                  <FieldLabel htmlFor={connectionSwitchId}>
                    {selectedManagedApp ? (connected ? 'Active' : 'Inactive') : 'Active status unavailable'}
                  </FieldLabel>
                </Field>

                <AppSettingsField
                  description={selectedManagedApp?.version.detail}
                  label="Version"
                  name="version"
                  ownerId={contentId}
                >
                  {(controlId) => (
                    <Select
                      id={controlId}
                      disabled={selectedAppBusy || !selectedManagedApp?.version.canSelect}
                      items={Object.fromEntries(
                        (selectedManagedApp?.version.options || []).map((option) => [option.id, option.label])
                      )}
                      open={versionPickerOpen}
                      value={selectedManagedApp?.version.selected || null}
                      onOpenChange={setVersionPickerOpen}
                      onValueChange={(nextValue) => {
                        if (
                          selectedManagedApp &&
                          nextValue &&
                          (nextValue !== selectedManagedApp.version.selected ||
                            selectedManagedApp.version.updateAvailable ||
                            (nextValue === 'latest' && !selectedManagedApp.version.autoUpdate))
                        ) {
                          void runVersionAction(selectedManagedApp.id, nextValue);
                        }
                      }}
                    >
                      <SelectTrigger aria-label={`Source version for ${selectedApp.title}`} size="sm">
                        <SelectValue>
                          {selectedManagedApp ? versionDropdownLabel(selectedManagedApp) : 'Local / unmanaged'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" id={versionSelectContentId}>
                        <SelectGroup>
                          {(selectedManagedApp?.version.options || []).map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </AppSettingsField>
              </div>
            ) : (
              <p className="app-management-sidebar__empty">No workspace apps found.</p>
            )}
          </section>
          <Separator />

          <section aria-labelledby={exportConfigHeadingId} className="app-management-sidebar__section">
            <h2 id={exportConfigHeadingId}>App export config</h2>
            <div className="app-management-sidebar__config-grid">
              <AppSettingsField label="App Name" name="export-app-name" ownerId={contentId}>
                {(controlId) => (
                  <Input
                    aria-label="Export app name"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    id={controlId}
                    value={exportConfig.appName}
                    onChange={(event) => updateExportConfig('appName', event.currentTarget.value)}
                  />
                )}
              </AppSettingsField>
              <AppSettingsField
                description={`The ${SPPKG_EXTENSION} extension is added automatically.`}
                label="File Name"
                name="export-file-name"
                ownerId={contentId}
              >
                {(controlId, fieldDescriptionId) => (
                  <InputGroup className="app-management-sidebar__file-name-control">
                    <InputGroupInput
                      aria-describedby={fieldDescriptionId}
                      aria-label="Export file name"
                      disabled={!selectedManagedApp || selectedAppBusy}
                      id={controlId}
                      value={fileNameStem(exportConfig.fileName)}
                      onChange={(event) =>
                        updateExportConfig('fileName', `${fileNameStem(event.currentTarget.value)}${SPPKG_EXTENSION}`)
                      }
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{SPPKG_EXTENSION}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                )}
              </AppSettingsField>
              <AppSettingsField label="Version" name="export-version" ownerId={contentId}>
                {(controlId) => (
                  <Input
                    aria-label="Export version"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    id={controlId}
                    value={exportConfig.version}
                    onChange={(event) => updateExportConfig('version', event.currentTarget.value)}
                  />
                )}
              </AppSettingsField>
              <Field className="app-management-sidebar__wide-field">
                <FieldTitle>GitHub source repository</FieldTitle>
                {sourceRepositoryUrl ? (
                  <a
                    aria-label={`Open GitHub source repository for ${selectedApp?.title || selectedManagedApp?.id || 'selected app'}`}
                    className="app-management-sidebar__url-link"
                    href={sourceRepositoryUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {sourceRepositoryUrl}
                  </a>
                ) : (
                  <span className="app-management-sidebar__url-unavailable">No tracked GitHub source repository.</span>
                )}
              </Field>
              <Field className="app-management-sidebar__wide-field">
                <FieldTitle>Active local CDN runtime manifest</FieldTitle>
                {activeLocalCdnManifestUrl ? (
                  <a
                    aria-label={`Open active local CDN runtime manifest for ${selectedApp?.title || selectedManagedApp?.id || 'selected app'}`}
                    className="app-management-sidebar__url-link"
                    href={activeLocalCdnManifestUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {activeLocalCdnManifestUrl}
                  </a>
                ) : (
                  <span className="app-management-sidebar__url-unavailable">No local CDN release is selected.</span>
                )}
                <FieldDescription>Selected immutable release used only by the Lab's loopback CDN runtime.</FieldDescription>
              </Field>
              <AppSettingsField
                className="app-management-sidebar__wide-field"
                label="Deployment CDN URL"
                name="export-cdn-url"
                ownerId={contentId}
              >
                {(controlId) => (
                  <Input
                    aria-label="Export CDN URL"
                    disabled={!selectedManagedApp || selectedAppBusy}
                    id={controlId}
                    type="url"
                    value={exportConfig.cdnUrl}
                    onChange={(event) => updateExportConfig('cdnUrl', event.currentTarget.value)}
                  />
                )}
              </AppSettingsField>
            </div>

            <div className="app-management-sidebar__catalog-intro">
              <h3>App catalog details</h3>
              <p>
                Optional information shown on the SharePoint app details page. Leave a field blank to omit it from the package.
              </p>
            </div>

            <Accordion className="app-management-sidebar__catalog-groups" multiple>
              <AccordionItem className="app-management-sidebar__catalog-group" id={listingAccordionId} value="listing">
                <AccordionTrigger>
                  <span>Listing &amp; About</span>
                  <small>Optional</small>
                </AccordionTrigger>
                <AccordionContent className="app-management-sidebar__catalog-fields">
                  <AppSettingsField
                    description="The concise description used by the package and app listing. Existing Description values are preserved here."
                    label="Short description"
                    name="catalog-short-description"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Textarea
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog short description"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.description}
                        onChange={(event) => updateExportConfig('description', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField
                    description="Additional About content for the SharePoint app details page."
                    label="Long description"
                    name="catalog-long-description"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Textarea
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog long description"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.longDescription}
                        onChange={(event) => updateExportConfig('longDescription', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField
                    description="Optional YouTube or Vimeo video for the app details page."
                    label="Video URL"
                    name="catalog-video-url"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Input
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog video URL"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        type="url"
                        value={exportConfig.videoUrl}
                        onChange={(event) => updateExportConfig('videoUrl', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="app-management-sidebar__catalog-group" id={visualsAccordionId} value="visuals">
                <AccordionTrigger>
                  <span>Visuals</span>
                  <small>Optional</small>
                </AccordionTrigger>
                <AccordionContent className="app-management-sidebar__catalog-fields">
                  <AppSettingsField
                    description="Fabric icon name or image URL/path used in the web part toolbox. This does not set the App Catalog listing image."
                    label="Toolbox icon"
                    name="catalog-toolbox-icon"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Input
                        aria-describedby={fieldDescriptionId}
                        aria-label="Web part toolbox icon"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.appIcon}
                        onChange={(event) => updateExportConfig('appIcon', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField
                    description="Package-directory-relative path to the PNG bundled for the App Catalog listing."
                    label="App Catalog icon"
                    name="catalog-icon"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Input
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog icon path"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.catalogIconPath}
                        onChange={(event) => updateExportConfig('catalogIconPath', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField
                    description="Up to five package-directory-relative PNG paths or credential-free HTTPS image URLs, one per line."
                    label="Screenshots"
                    name="catalog-screenshots"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Textarea
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog screenshot paths"
                        className="app-management-sidebar__path-list"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.screenshotPaths.join('\n')}
                        onChange={(event) => updateExportConfig('screenshotPaths', linesToValues(event.currentTarget.value))}
                      />
                    )}
                  </AppSettingsField>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="app-management-sidebar__catalog-group" id={supportAccordionId} value="support">
                <AccordionTrigger>
                  <span>Details &amp; Support</span>
                  <small>Optional</small>
                </AccordionTrigger>
                <AccordionContent className="app-management-sidebar__catalog-fields">
                  <AppSettingsField
                    description="Choose up to three categories."
                    label="Categories"
                    name="categories"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Select
                        id={controlId}
                        disabled={!selectedManagedApp || selectedAppBusy}
                        items={Object.fromEntries(CATALOG_CATEGORY_OPTIONS.map((category) => [category, category]))}
                        multiple
                        open={categoriesPickerOpen}
                        value={exportConfig.categories}
                        onOpenChange={setCategoriesPickerOpen}
                        onValueChange={(nextCategories) => {
                          if (nextCategories.length <= MAX_CATALOG_CATEGORIES) {
                            updateExportConfig('categories', nextCategories);
                          }
                        }}
                      >
                        <SelectTrigger aria-describedby={fieldDescriptionId} aria-label="App catalog categories" size="sm">
                          <SelectValue placeholder="Select categories">
                            {(values) => categorySelectionLabel(values as string[])}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" id={categoriesSelectContentId}>
                          <SelectGroup>
                            {CATALOG_CATEGORY_OPTIONS.map((category) => (
                              <SelectItem
                                disabled={
                                  exportConfig.categories.length >= MAX_CATALOG_CATEGORIES &&
                                  !exportConfig.categories.includes(category)
                                }
                                key={category}
                                value={category}
                              >
                                {category}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </AppSettingsField>
                  <AppSettingsField label="Developer or organization name" name="catalog-developer-name" ownerId={contentId}>
                    {(controlId) => (
                      <Input
                        aria-label="App catalog developer name"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.developerName}
                        onChange={(event) => updateExportConfig('developerName', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField label="Website URL" name="catalog-website-url" ownerId={contentId}>
                    {(controlId) => (
                      <Input
                        aria-label="App catalog developer website URL"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        type="url"
                        value={exportConfig.developerWebsiteUrl}
                        onChange={(event) => updateExportConfig('developerWebsiteUrl', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField label="Privacy URL" name="catalog-privacy-url" ownerId={contentId}>
                    {(controlId) => (
                      <Input
                        aria-label="App catalog privacy URL"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        type="url"
                        value={exportConfig.privacyUrl}
                        onChange={(event) => updateExportConfig('privacyUrl', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField label="Terms-of-use URL" name="catalog-terms-url" ownerId={contentId}>
                    {(controlId) => (
                      <Input
                        aria-label="App catalog terms of use URL"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        type="url"
                        value={exportConfig.termsOfUseUrl}
                        onChange={(event) => updateExportConfig('termsOfUseUrl', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <AppSettingsField
                    description="Microsoft Partner Network identifier, when applicable."
                    label="Partner ID"
                    name="catalog-partner-id"
                    ownerId={contentId}
                  >
                    {(controlId, fieldDescriptionId) => (
                      <Input
                        aria-describedby={fieldDescriptionId}
                        aria-label="App catalog partner ID"
                        disabled={!selectedManagedApp || selectedAppBusy}
                        id={controlId}
                        value={exportConfig.partnerId}
                        onChange={(event) => updateExportConfig('partnerId', event.currentTarget.value)}
                      />
                    )}
                  </AppSettingsField>
                  <p className="app-management-sidebar__hint">
                    This export writes the package’s default metadata. App Catalog administrators can override listing details,
                    and localized listing text remains managed in the app’s source files. Publisher, support URL, and featured
                    status are catalog-admin settings rather than SPFx package fields.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <Button
              aria-label="Save app export config"
              disabled={!selectedManagedApp || selectedAppBusy}
              onClick={() => void saveExportConfig()}
            >
              <Save data-icon="inline-start" />
              Save
            </Button>
          </section>

          <Separator />
          <section aria-labelledby={appActionsHeadingId} className="app-management-sidebar__section">
            <h2 id={appActionsHeadingId}>App actions</h2>
            <div className="app-management-sidebar__actions">
              <Button disabled={busy} variant="outline" onClick={onOpenImport}>
                <FolderInput data-icon="inline-start" />
                Import
              </Button>
              <Button disabled={!selectedAppLoaded || busy} variant="outline" onClick={() => onOpenExport(['standalone'])}>
                <Download data-icon="inline-start" />
                Download standalone
              </Button>
              <Button disabled={!selectedAppLoaded || busy} variant="outline" onClick={() => onOpenExport(['cdn'])}>
                <Download data-icon="inline-start" />
                Download CDN-ready
              </Button>
            </div>
          </section>

          {status.phase !== 'idle' ? (
            <Alert
              aria-live={status.phase === 'error' ? 'assertive' : 'polite'}
              className={`app-management-sidebar__status app-management-sidebar__status--${status.phase}`}
              role={status.phase === 'error' ? 'alert' : 'status'}
              variant={status.phase === 'error' ? 'destructive' : 'default'}
            >
              {status.phase === 'complete' ? <Check /> : status.phase === 'error' ? <X /> : <Spinner />}
              <AlertTitle>{status.message}</AlertTitle>
              {status.detail ? <AlertDescription>{status.detail}</AlertDescription> : null}
            </Alert>
          ) : null}
        </div>

        <SheetFooter className="app-management-sidebar__footer" data-sidebar="footer">
          <span className="app-management-sidebar__sync-meta">
            {lastSyncedAt ? (
              <time dateTime={lastSyncedAt.toISOString()} title={lastSyncedAt.toLocaleString()}>
                Last synced {formatSyncTimestamp(lastSyncedAt)}
              </time>
            ) : null}
            <Button
              aria-label="Re-sync apps"
              disabled={busy || status.phase === 'loading'}
              size="sm"
              variant="ghost"
              onClick={() => void syncManagedApps()}
            >
              {showSyncSuccess ? <Check data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              Re-sync
            </Button>
          </span>
          {status.reloadRecommended ? (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw data-icon="inline-start" />
              Reload lab
            </Button>
          ) : (
            <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
