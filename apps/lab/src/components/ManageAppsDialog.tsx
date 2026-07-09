import * as React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input
} from '@fluentui/react-components';
import { Check, FolderInput, FolderPlus, RefreshCw, Search, Unlink, X } from 'lucide-react';
import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import { labApiWriteHeaders, readApiJson, ManagedLabApp, ManagedLabAppsApiResult, ManageAppsApiResult } from '../api/labApi';
import { managedAppPath, titleFromSlug } from '../lib/text';
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

export function ManageAppsDialog(props: ManageAppsDialogProps): JSX.Element {
  const { open, onOpenChange, webPartsByAppId, onOpenAddAppDrawer } = props;
  const [managedApps, setManagedApps] = React.useState<ManagedLabApp[]>([]);
  const [manageAppsStatus, setManageAppsStatus] = React.useState<ManageAppsStatus>({ phase: 'idle', message: '' });
  const [manageAppsBusyAppId, setManageAppsBusyAppId] = React.useState('');
  const [appFilter, setAppFilter] = React.useState('');

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
    if (open) {
      setAppFilter('');
      setManageAppsStatus({ phase: 'idle', message: '' });
      void refreshManagedApps();
    }
  }, [open, refreshManagedApps]);

  const managedAppRows = React.useMemo(
    () => managedApps.map((app) => ({
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

  return (
    <Dialog
      modalType="modal"
      open={open}
      onOpenChange={(_event, data) => onOpenChange(data.open)}
    >
      <DialogSurface className="manage-apps-dialog">
        <DialogBody>
          <DialogTitle
            action={(
              <Button
                appearance="subtle"
                aria-label="Close manage apps"
                icon={<X size={16} />}
                onClick={() => onOpenChange(false)}
              />
            )}
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
                  icon={<FolderPlus size={14} />}
                  onClick={() => onOpenAddAppDrawer('create')}
                >
                  Create
                </Button>
                <Button
                  appearance="secondary"
                  icon={<FolderInput size={14} />}
                  onClick={() => onOpenAddAppDrawer('import')}
                >
                  Import
                </Button>
              </div>
              <Button
                appearance="subtle"
                disabled={manageAppsBusyAppId === '__all__' || manageAppsStatus.phase === 'loading'}
                icon={<RefreshCw size={14} />}
                onClick={() => void syncManagedApps()}
              >
                Re-sync
              </Button>
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
              {filteredAppRows.length ? (
                filteredAppRows.map((app) => {
                  const busy = manageAppsBusyAppId === app.id || manageAppsBusyAppId === '__all__';
                  const connected = app.status === 'connected';
                  const disconnected = app.status === 'disconnected';
                  return (
                    <section
                      className="manage-app-row manage-app-row--has-badge"
                      data-app-id={app.id}
                      key={app.id}
                    >
                      <div className="manage-app-row__main">
                        <strong>{app.title}</strong>
                        <span>{app.relativeDir}</span>
                      </div>
                      {disconnected ? (
                        <span className="manage-app-row__badge manage-app-row__badge--disconnected">
                          Disconnected
                        </span>
                      ) : connected ? (
                        <span className="manage-app-row__badge manage-app-row__badge--connected">
                          Connected
                        </span>
                      ) : (
                        <span className="manage-app-row__badge manage-app-row__badge--missing">
                          No adapter
                        </span>
                      )}
                      <div className="manage-app-row__actions">
                        {connected ? (
                          <Button
                            appearance="secondary"
                            data-action="unlink"
                            disabled={busy}
                            icon={<Unlink size={14} />}
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
