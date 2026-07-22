import * as React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
  Option,
  Switch
} from '@fluentui/react-components';
import { Check, FolderInput, FolderPlus, RefreshCw, Search, X } from 'lucide-react';
import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import { labApiWriteHeaders, readApiJson, ManagedLabApp, ManagedLabAppsApiResult, ManageAppsApiResult } from '../api/labApi';
import { managedAppPath, middleTruncatePath, titleFromSlug } from '../lib/text';
import type { AddAppMode } from './AddAppDrawer';

type ManageAppsPhase = 'idle' | 'loading' | 'running' | 'complete' | 'error';

interface ManageAppsStatus {
  phase: ManageAppsPhase;
  message: string;
  detail?: string;
  reloadRecommended?: boolean;
}

interface ManageAppsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webPartsByAppId: Map<string, LabWebPart[]>;
  onOpenAddAppDrawer: (mode: AddAppMode) => void;
}

const SYNC_SUCCESS_DURATION_MS = 1_500;

export function ManageAppsDialog(props: ManageAppsDialogProps): JSX.Element {
  const { open, onOpenChange, webPartsByAppId, onOpenAddAppDrawer } = props;
  const [managedApps, setManagedApps] = React.useState<ManagedLabApp[]>([]);
  const [manageAppsStatus, setManageAppsStatus] = React.useState<ManageAppsStatus>({ phase: 'idle', message: '' });
  const [manageAppsBusyAppId, setManageAppsBusyAppId] = React.useState('');
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = React.useState(false);
  const [appFilter, setAppFilter] = React.useState('');
  const refreshInFlightRef = React.useRef(false);
  const mutationInFlightRef = React.useRef(false);
  const syncSuccessTimerRef = React.useRef<number | undefined>(undefined);

  const refreshManagedApps = React.useCallback(async (options: { quiet?: boolean } = {}): Promise<void> => {
    if (refreshInFlightRef.current || mutationInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    setManageAppsBusyAppId('__all__');
    if (!options.quiet) {
      setManageAppsStatus({ phase: 'loading', message: 'Loading apps' });
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
        setManageAppsStatus({
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
        setManageAppsStatus({
          phase: 'complete',
          message: updates.length === 1 ? 'App updated' : `${updates.length} apps updated`,
          detail: 'Reload the lab to apply the updated source.',
          reloadRecommended: true
        });
      } else if (!options.quiet) {
        setManageAppsStatus({ phase: 'idle', message: '' });
      }
    } catch (error) {
      const nextStatus: ManageAppsStatus = {
        phase: 'error',
        message: updatedCount ? 'Some apps were updated' : autoUpdating ? 'Apps were not updated' : 'Could not load apps',
        detail: updatedCount
          ? `${updatedCount} ${updatedCount === 1 ? 'app was' : 'apps were'} updated before another update failed. ${
              error instanceof Error ? error.message : 'Unknown error.'
            }`
          : error instanceof Error
            ? error.message
            : 'Unknown error.',
        reloadRecommended: updatedCount > 0
      };
      if (options.quiet && !updatedCount) {
        setManageAppsStatus((current) => (current.reloadRecommended ? current : nextStatus));
      } else {
        setManageAppsStatus(nextStatus);
      }
    } finally {
      if (autoUpdating) {
        mutationInFlightRef.current = false;
      }
      refreshInFlightRef.current = false;
      setManageAppsBusyAppId('');
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setAppFilter('');
      setManageAppsStatus({ phase: 'idle', message: '' });
      void refreshManagedApps();
    }
  }, [open, refreshManagedApps]);

  React.useEffect(
    () => () => {
      if (syncSuccessTimerRef.current !== undefined) {
        window.clearTimeout(syncSuccessTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void refreshManagedApps({ quiet: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [open, refreshManagedApps]);

  const managedAppRows = React.useMemo(
    () =>
      managedApps.map((app) => ({
        ...app,
        title: titleForManagedApp(app, webPartsByAppId),
        webPartCount: webPartsByAppId.get(app.id)?.length || 0
      })),
    [managedApps, webPartsByAppId]
  );

  const filteredAppRows = React.useMemo(() => {
    const query = appFilter.trim().toLowerCase();
    if (!query) {
      return managedAppRows;
    }

    return managedAppRows.filter((app) => {
      const haystack = `${app.title} ${app.relativeDir} ${app.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [appFilter, managedAppRows]);

  const runManageAppsAction = async (appId: string, action: 'unlink' | 'sync'): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
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
      mutationInFlightRef.current = false;
      setManageAppsBusyAppId('');
    }
  };

  const syncManagedApps = async (): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setManageAppsBusyAppId('__all__');
    if (syncSuccessTimerRef.current !== undefined) {
      window.clearTimeout(syncSuccessTimerRef.current);
      syncSuccessTimerRef.current = undefined;
    }
    setShowSyncSuccess(false);
    setManageAppsStatus({ phase: 'idle', message: '' });
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
      setManageAppsStatus({
        phase: 'error',
        message: 'Apps were not re-synced',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      mutationInFlightRef.current = false;
      setManageAppsBusyAppId('');
    }
  };

  const runAppVersionAction = async (appId: string, versionId: string): Promise<void> => {
    if (mutationInFlightRef.current || refreshInFlightRef.current) {
      return;
    }
    mutationInFlightRef.current = true;
    setManageAppsBusyAppId(appId);
    setManageAppsStatus({
      phase: 'running',
      message: 'Changing app version',
      detail: managedAppPath(appId)
    });
    try {
      const result = await requestAppVersion(appId, versionId);
      setManagedApps(result.apps);
      setManageAppsStatus({
        phase: 'complete',
        message: result.message,
        detail: 'Reload the lab to apply the updated source.',
        reloadRecommended: true
      });
    } catch (error) {
      setManageAppsStatus({
        phase: 'error',
        message: 'App version needs attention',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      mutationInFlightRef.current = false;
      setManageAppsBusyAppId('');
    }
  };

  return (
    <Dialog modalType="modal" open={open} onOpenChange={(_event, data) => onOpenChange(data.open)}>
      <DialogSurface className="manage-apps-dialog">
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close manage apps"
                icon={<X size={16} />}
                onClick={() => onOpenChange(false)}
              />
            }
          >
            Manage Apps
          </DialogTitle>
          <DialogContent className="manage-apps-dialog__content">
            <p className="manage-apps-dialog__subtitle">
              Apps linked into this lab
              <span aria-hidden="true"> · </span>
              <span>
                {appFilter.trim()
                  ? `${filteredAppRows.length} of ${managedAppRows.length} ${managedAppRows.length === 1 ? 'app' : 'apps'}`
                  : managedAppRows.length === 1
                    ? '1 app'
                    : `${managedAppRows.length} apps`}
              </span>
            </p>
            <div className="manage-apps-dialog__toolbar">
              <div className="manage-apps-dialog__toolbar-primary">
                <Button
                  appearance="primary"
                  disabled={Boolean(manageAppsBusyAppId)}
                  icon={<FolderPlus size={14} />}
                  onClick={() => onOpenAddAppDrawer('create')}
                >
                  Create
                </Button>
                <Button
                  appearance="secondary"
                  disabled={Boolean(manageAppsBusyAppId)}
                  icon={<FolderInput size={14} />}
                  onClick={() => onOpenAddAppDrawer('import')}
                >
                  Import
                </Button>
              </div>
              <div className="manage-apps-dialog__sync-control">
                {lastSyncedAt && (
                  <time
                    aria-live="polite"
                    className="manage-apps-dialog__last-synced"
                    dateTime={lastSyncedAt.toISOString()}
                    title={lastSyncedAt.toLocaleString()}
                  >
                    Last synced {formatSyncTimestamp(lastSyncedAt)}
                  </time>
                )}
                <Button
                  appearance="subtle"
                  disabled={Boolean(manageAppsBusyAppId) || manageAppsStatus.phase === 'loading'}
                  icon={
                    showSyncSuccess ? (
                      <Check aria-hidden="true" className="manage-apps-dialog__sync-success-icon" size={14} />
                    ) : (
                      <RefreshCw aria-hidden="true" size={14} />
                    )
                  }
                  onClick={() => void syncManagedApps()}
                >
                  Re-sync
                </Button>
              </div>
            </div>

            <Input
              aria-label="Filter apps"
              className="manage-apps-dialog__filter"
              contentBefore={<Search size={14} aria-hidden="true" />}
              onChange={(_event, data) => setAppFilter(data.value)}
              placeholder="Filter by name or path"
              value={appFilter}
            />

            {manageAppsStatus.phase !== 'idle' && (
              <section
                aria-live={manageAppsStatus.phase === 'error' ? 'assertive' : 'polite'}
                className={`manage-apps-status manage-apps-status--${manageAppsStatus.phase}`}
                role={manageAppsStatus.phase === 'error' ? 'alert' : 'status'}
              >
                <span
                  className={`manage-apps-status__icon manage-apps-status__icon--${manageAppsStatus.phase}`}
                  aria-hidden="true"
                >
                  {manageAppsStatus.phase === 'complete' ? (
                    <Check size={13} />
                  ) : manageAppsStatus.phase === 'error' ? (
                    <X size={13} />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                </span>
                <span>
                  <strong>{manageAppsStatus.message}</strong>
                  {manageAppsStatus.detail && <small>{manageAppsStatus.detail}</small>}
                </span>
              </section>
            )}

            <div className="manage-apps-list" aria-label="Lab apps">
              {filteredAppRows.length ? (
                filteredAppRows.map((app) => {
                  const busy = manageAppsBusyAppId === app.id || manageAppsBusyAppId === '__all__';
                  const connected = app.status === 'connected';
                  const disconnected = app.status === 'disconnected';
                  const canToggleConnection = connected || disconnected;
                  return (
                    <section
                      className={`manage-app-row ${canToggleConnection ? '' : 'manage-app-row--has-badge'}`}
                      data-app-id={app.id}
                      key={app.id}
                      aria-busy={busy}
                    >
                      <div className="manage-app-row__main">
                        <strong>{app.title}</strong>
                        <span className="manage-app-row__path" title={app.relativeDir}>
                          {middleTruncatePath(app.relativeDir)}
                        </span>
                        {app.version.detail && (
                          <span className="manage-app-row__version-detail" id={`app-version-detail-${app.id}`}>
                            {app.version.detail}
                          </span>
                        )}
                      </div>
                      {!canToggleConnection && (
                        <span className="manage-app-row__badge manage-app-row__badge--missing">No adapter</span>
                      )}
                      <div className="manage-app-row__actions">
                        <Dropdown
                          aria-describedby={app.version.detail ? `app-version-detail-${app.id}` : undefined}
                          aria-label={`Version for ${app.title}`}
                          className="manage-app-row__version"
                          disabled={busy || !app.version.canSelect}
                          onOptionSelect={(_event, data) => {
                            if (
                              data.optionValue &&
                              (data.optionValue !== app.version.selected ||
                                app.version.updateAvailable ||
                                (data.optionValue === 'latest' && !app.version.autoUpdate))
                            ) {
                              void runAppVersionAction(app.id, data.optionValue);
                            }
                          }}
                          selectedOptions={[app.version.selected]}
                          size="small"
                          value={versionDropdownLabel(app)}
                        >
                          {app.version.options.map((option) => (
                            <Option key={option.id} text={option.label} value={option.id}>
                              {option.label}
                            </Option>
                          ))}
                        </Dropdown>
                        {canToggleConnection ? (
                          <Switch
                            aria-label={`Connected: ${app.title}`}
                            checked={connected}
                            className="manage-app-row__connection"
                            data-action={connected ? 'unlink' : 'sync'}
                            disabled={busy}
                            label="Connected"
                            labelPosition="before"
                            onChange={(_event, data) => {
                              void runManageAppsAction(app.id, data.checked ? 'sync' : 'unlink');
                            }}
                          />
                        ) : null}
                      </div>
                    </section>
                  );
                })
              ) : (
                <p className="manage-apps-empty">
                  {manageAppsStatus.phase === 'loading'
                    ? 'Loading apps...'
                    : managedAppRows.length
                      ? 'No apps match this filter.'
                      : 'No workspace apps found.'}
                </p>
              )}
            </div>
          </DialogContent>
          {manageAppsStatus.reloadRecommended && (
            <DialogActions className="manage-apps-dialog__actions" fluid>
              <Button appearance="secondary" onClick={() => onOpenChange(false)}>
                Dismiss
              </Button>
              <Button appearance="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>
                Reload lab
              </Button>
            </DialogActions>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function titleForManagedApp(app: ManagedLabApp, webPartsByAppId: Map<string, LabWebPart[]>): string {
  const registeredTitle = webPartsByAppId.get(app.id)?.[0]?.title;
  return registeredTitle || titleFromSlug(app.id);
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

async function requestAppVersion(appId: string, versionId: string): Promise<ManageAppsApiResult> {
  const response = await fetch('/api/spfx-apps/version', {
    method: 'POST',
    headers: labApiWriteHeaders,
    body: JSON.stringify({ appId, versionId })
  });
  return readApiJson<ManageAppsApiResult>(response);
}
