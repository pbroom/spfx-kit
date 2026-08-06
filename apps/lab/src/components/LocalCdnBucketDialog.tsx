import * as React from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Option
} from '@fluentui/react-components';
import { Check, Database, RefreshCw, Upload, X } from 'lucide-react';
import {
  loadLocalCdnBucketInventory,
  publishLocalCdnSource,
  selectedLocalCdnRelease,
  selectLocalCdnRelease,
  type LocalCdnAppRelease,
  type LocalCdnBucketAsset,
  type LocalCdnBucketInventory,
  type LocalCdnPublishSource
} from '../api/localCdnBucket';
import { loadManagedLabAppSource } from '../api/labApi';

interface LocalCdnBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectionChanged: (appId: string, releaseId: string) => void;
  selectedAppId: string;
}

interface AdminStatus {
  phase: 'idle' | 'loading' | 'running' | 'complete' | 'error';
  message: string;
  detail?: string;
}

const releaseKey = (appId: string, releaseId: string): string => `${appId}/${releaseId}`;

export function LocalCdnBucketDialog({
  open,
  onOpenChange,
  onSelectionChanged,
  selectedAppId
}: LocalCdnBucketDialogProps): JSX.Element {
  const [inventory, setInventory] = React.useState<LocalCdnBucketInventory>();
  const [status, setStatus] = React.useState<AdminStatus>({ phase: 'idle', message: '' });
  const [selectedSourceId, setSelectedSourceId] = React.useState('');
  const [selectedReleaseKey, setSelectedReleaseKey] = React.useState('');
  const [sourceRepositoryUrl, setSourceRepositoryUrl] = React.useState('');
  const mutationInFlight = status.phase === 'running';

  const refresh = React.useCallback(async (signal?: AbortSignal, quiet = false): Promise<LocalCdnBucketInventory> => {
    if (!quiet) {
      setStatus({ phase: 'loading', message: 'Inspecting the local CDN bucket' });
    }
    try {
      const next = await loadLocalCdnBucketInventory(signal);
      setInventory(next);
      setSelectedSourceId((current) =>
        next.publishSources.some((source) => source.sourceId === current && source.status === 'verified') ? current : ''
      );
      setSelectedReleaseKey((current) =>
        next.namespaces.apps.releases.some(
          (release) => release.status === 'verified' && releaseKey(release.appId, release.releaseId) === current
        )
          ? current
          : ''
      );
      if (!quiet) {
        setStatus({ phase: 'idle', message: '' });
      }
      return next;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      setStatus({
        phase: 'error',
        message: 'Could not inspect the local CDN bucket',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
      throw error;
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [open, refresh]);

  React.useEffect(() => {
    if (!open || !selectedAppId) {
      setSourceRepositoryUrl('');
      return undefined;
    }
    const controller = new AbortController();
    void loadManagedLabAppSource(selectedAppId, controller.signal)
      .then((result) => {
        setSourceRepositoryUrl(result.repositoryUrl || '');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSourceRepositoryUrl('');
        }
      });
    return () => controller.abort();
  }, [open, selectedAppId]);

  const publishSource = async (): Promise<void> => {
    const source = inventory?.publishSources.find(
      (candidate): candidate is VerifiedPublishSource =>
        candidate.sourceId === selectedSourceId && isVerifiedPublishSource(candidate)
    );
    if (!source || mutationInFlight) {
      return;
    }
    setStatus({
      phase: 'running',
      message: 'Publishing immutable app release',
      detail: `${source.appId} · ${source.releaseId}`
    });
    try {
      await publishLocalCdnSource(source.sourceId);
    } catch (error) {
      setStatus({
        phase: 'error',
        message: 'Release was not published',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
      return;
    }
    try {
      await refresh(undefined, true);
      setStatus({
        phase: 'complete',
        message: 'Immutable release published',
        detail: `${source.appId} · ${source.releaseId} is in the local bucket. It was not selected for Lab delivery.`
      });
    } catch (error) {
      setStatus({
        phase: 'error',
        message: 'Release published; inventory needs refresh',
        detail: error instanceof Error ? error.message : 'The refreshed inventory is unavailable.'
      });
    }
  };

  const selectRelease = async (): Promise<void> => {
    const release = inventory?.namespaces.apps.releases.find(
      (candidate): candidate is InspectableRelease =>
        isSelectableRelease(candidate) && releaseKey(candidate.appId, candidate.releaseId) === selectedReleaseKey
    );
    if (!release || mutationInFlight) {
      return;
    }
    setStatus({
      phase: 'running',
      message: 'Selecting app release for the Lab',
      detail: `${release.appId} · ${release.releaseId}`
    });
    try {
      await selectLocalCdnRelease(release.appId, release.releaseId);
      onSelectionChanged(release.appId, release.releaseId);
    } catch (error) {
      setStatus({
        phase: 'error',
        message: 'Release was not selected',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
      return;
    }
    try {
      await refresh(undefined, true);
      setStatus({
        phase: 'complete',
        message: 'Selected release updated',
        detail: `${release.appId} now resolves to ${release.releaseId}. CDN mode will reload that exact descriptor; no fallback is used.`
      });
    } catch (error) {
      setStatus({
        phase: 'error',
        message: 'Selection updated; inventory needs refresh',
        detail: error instanceof Error ? error.message : 'The refreshed inventory is unavailable.'
      });
    }
  };

  const verifiedSources = inventory?.publishSources.filter(isVerifiedPublishSource) || [];
  const selectableReleases = inventory?.namespaces.apps.releases.filter(isSelectableRelease) || [];
  const activeRelease = selectedLocalCdnRelease(inventory, selectedAppId);
  const activeManifestUrl = activeRelease ? `${activeRelease.releaseBaseUrl}deployment-manifest.json` : '';

  return (
    <Dialog modalType="modal" open={open} onOpenChange={(_event, data) => onOpenChange(data.open)}>
      <DialogSurface className="local-cdn-admin">
        <DialogBody className="local-cdn-admin__body">
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close Local CDN bucket"
                icon={<X size={16} />}
                onClick={() => onOpenChange(false)}
              />
            }
          >
            Local CDN bucket
          </DialogTitle>
          <DialogContent className="local-cdn-admin__content">
            <div className="local-cdn-admin__intro">
              <p>
                Inspect and publish immutable, versioned app assets served by the separate loopback mock CDN. This control plane
                uses the same validated intake primitive as the CLI; it cannot browse arbitrary files or overwrite a release.
              </p>
              {inventory && (
                <div className="local-cdn-admin__endpoints">
                  <p>
                    <strong>Local CDN runtime origin</strong> <code>{inventory.origin}</code>
                  </p>
                  {sourceRepositoryUrl && (
                    <p>
                      <strong>GitHub source repository</strong>{' '}
                      <a
                        aria-label={`Open GitHub source repository for ${selectedAppId}`}
                        href={sourceRepositoryUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {sourceRepositoryUrl}
                      </a>
                    </p>
                  )}
                  {activeRelease && (
                    <p>
                      <strong>Active local CDN runtime manifest</strong>{' '}
                      <a
                        aria-label={`Open active local CDN runtime manifest for ${activeRelease.appId}`}
                        href={activeManifestUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {activeManifestUrl}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="local-cdn-admin__controls" aria-label="Local CDN bucket controls">
              <div className="local-cdn-admin__control-group">
                <label id="local-cdn-source-label">Approved staged release</label>
                <div>
                  <Dropdown
                    aria-labelledby="local-cdn-source-label"
                    disabled={mutationInFlight || !verifiedSources.length}
                    onOptionSelect={(_event, data) => setSelectedSourceId(data.optionValue || '')}
                    placeholder={verifiedSources.length ? 'Choose a validated source' : 'No validated sources available'}
                    selectedOptions={selectedSourceId ? [selectedSourceId] : []}
                    value={verifiedSources.find((source) => source.sourceId === selectedSourceId)?.label || ''}
                  >
                    {inventory?.publishSources.map((source) => (
                      <Option
                        disabled={source.status === 'invalid'}
                        key={source.sourceId}
                        text={source.label}
                        value={source.sourceId}
                      >
                        {source.label}
                        {source.status === 'invalid' ? ' — invalid' : ` — ${source.appId} ${source.releaseId}`}
                      </Option>
                    ))}
                  </Dropdown>
                  <Button
                    appearance="primary"
                    disabled={mutationInFlight || !selectedSourceId}
                    icon={<Upload size={14} />}
                    onClick={() => void publishSource()}
                  >
                    Publish immutable release
                  </Button>
                </div>
                <small>
                  Create-only. Publishing verifies the manifest closure and hashes, then copies only allowlisted files. It does
                  not select.
                </small>
              </div>

              <div className="local-cdn-admin__control-group">
                <label id="local-cdn-selection-label">Release used by Lab CDN mode</label>
                <div>
                  <Dropdown
                    aria-labelledby="local-cdn-selection-label"
                    disabled={mutationInFlight || !selectableReleases.length}
                    onOptionSelect={(_event, data) => setSelectedReleaseKey(data.optionValue || '')}
                    placeholder={selectableReleases.length ? 'Choose a published release' : 'No published releases available'}
                    selectedOptions={selectedReleaseKey ? [selectedReleaseKey] : []}
                    value={releaseLabelForKey(selectableReleases, selectedReleaseKey)}
                  >
                    {selectableReleases.map((release) => (
                      <Option
                        key={releaseKey(release.appId, release.releaseId)}
                        text={`${release.appId} · ${release.releaseLabel}`}
                        value={releaseKey(release.appId, release.releaseId)}
                      >
                        {release.appId} · {release.releaseLabel}
                        {release.selected ? ' — selected' : ''}
                      </Option>
                    ))}
                  </Dropdown>
                  <Button
                    appearance="secondary"
                    disabled={mutationInFlight || !selectedReleaseKey}
                    icon={<Check size={14} />}
                    onClick={() => void selectRelease()}
                  >
                    Select for Lab
                  </Button>
                </div>
                <small>
                  Selection is explicit and app-scoped. CDN mode reloads the pinned release and fails closed if it is unavailable.
                </small>
              </div>

              <Button
                appearance="subtle"
                aria-label="Refresh Local CDN bucket inventory"
                disabled={mutationInFlight || status.phase === 'loading'}
                icon={<RefreshCw size={14} />}
                onClick={() => void refresh().catch(() => undefined)}
              >
                Refresh
              </Button>
            </div>

            {status.phase !== 'idle' && (
              <section
                aria-live={status.phase === 'error' ? 'assertive' : 'polite'}
                className={`local-cdn-admin__status local-cdn-admin__status--${status.phase}`}
                role={status.phase === 'error' ? 'alert' : 'status'}
              >
                <span aria-hidden="true">{status.phase === 'complete' ? <Check size={14} /> : <RefreshCw size={14} />}</span>
                <span>
                  <strong>{status.message}</strong>
                  {status.detail && <small>{status.detail}</small>}
                </span>
              </section>
            )}

            <div aria-labelledby="local-cdn-inventory-heading" className="local-cdn-admin__inventory" role="region" tabIndex={0}>
              <h2 className="visually-hidden" id="local-cdn-inventory-heading">
                Local CDN bucket inventory
              </h2>
              <table className="local-cdn-admin-table">
                <caption className="visually-hidden">Immutable app releases, selected pointers, packages, and assets</caption>
                <thead>
                  <tr>
                    <th scope="col">Resource / path</th>
                    <th scope="col">Kind / role</th>
                    <th scope="col">Version / release</th>
                    <th scope="col">Integrity / delivery</th>
                    <th scope="col">Size</th>
                    <th scope="col">Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory?.selectedPointers.map((pointer) => (
                    <tr data-pointer-app={pointer.appId} key={`pointer:${pointer.appId}`}>
                      <th scope="row">
                        <strong>{pointer.appId}</strong>
                        <small>selected.json</small>
                      </th>
                      <td>App selection pointer</td>
                      <td>{pointer.status === 'none' ? '—' : pointer.releaseId || '—'}</td>
                      <td>
                        <BucketStatus state={pointer.status === 'selected-and-verified' ? 'selected' : 'warning'}>
                          {pointerStatusLabel(pointer.status)}
                        </BucketStatus>
                        {pointer.status === 'selected-and-verified' && (
                          <small>Manifest {shortHash(pointer.manifestSha256)}</small>
                        )}
                      </td>
                      <td aria-label="Size unavailable">—</td>
                      <td>Local control plane</td>
                    </tr>
                  ))}
                  {inventory?.namespaces.apps.releases.map((release) => (
                    <ReleaseRows key={`${release.appId}:${release.releaseId}`} origin={inventory.origin} release={release} />
                  ))}
                  {inventory && !inventory.selectedPointers.length && !inventory.namespaces.apps.releases.length && (
                    <tr>
                      <td className="local-cdn-admin-table__empty" colSpan={6}>
                        <Database aria-hidden="true" size={18} />
                        <strong>The local CDN bucket is empty.</strong>
                        <span>Publish an approved staged release above. No source path can be entered here.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <section className="local-cdn-admin__shared" aria-labelledby="local-cdn-shared-heading">
                <h3 id="local-cdn-shared-heading">Shared resources — reserved namespace</h3>
                <p>
                  <code>/shared/&lt;bundle&gt;/versions/&lt;release&gt;/</code> is reserved for a future verified shared-resource
                  contract. {inventory?.namespaces.shared.message || 'It is empty and unsupported today.'} This inventory does not
                  claim that npm packages or SharePoint loader components are hosted here.
                </p>
              </section>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function ReleaseRows({ origin, release }: { origin: string; release: LocalCdnAppRelease }): JSX.Element {
  if (release.status === 'invalid') {
    return (
      <tr className="local-cdn-admin-table__release" data-release-id={release.releaseId}>
        <th scope="row">
          <strong>{release.appId}</strong>
          <small>{release.namespacePath}deployment-manifest.json</small>
        </th>
        <td>Immutable app release</td>
        <td>{release.releaseId}</td>
        <td>
          <BucketStatus state="error">Invalid — not selectable or served</BucketStatus>
        </td>
        <td aria-label="Size unavailable">—</td>
        <td>Bucket at rest · {origin}</td>
      </tr>
    );
  }
  return (
    <>
      <tr className="local-cdn-admin-table__release" data-release-id={release.releaseId}>
        <th scope="row">
          <strong>{release.appId}</strong>
          <small>{release.namespacePath}deployment-manifest.json</small>
          <small title={release.manifestSha256}>SHA-256 {release.manifestSha256}</small>
        </th>
        <td>App release manifest</td>
        <td>
          {release.releaseLabel}
          <small>{release.releaseId}</small>
        </td>
        <td>
          <BucketStatus state={release.selected ? 'selected' : release.status === 'verified' ? 'verified' : 'warning'}>
            {release.selected
              ? 'Selected · files verified'
              : release.status === 'verified'
                ? 'Files verified · not selected'
                : release.status === 'anchored'
                  ? 'Published checksums anchored · verify on selection'
                  : 'Legacy manifest recorded · verify on selection'}
          </BucketStatus>
          <small>Local artifact passed · remote CDN and app catalog not run</small>
        </td>
        <td>{formatBytes(release.manifestBytes)}</td>
        <td>
          Bucket at rest · {origin}
          {release.sourceProvenance ? (
            <>
              <small>
                Source: GitHub staging (declared private) · {release.sourceProvenance.repository}@
                {shortHash(release.sourceProvenance.commit)}
              </small>
              <small>{release.sourceProvenance.path} · source closure verified at publish</small>
              <small title={release.sourceProvenance.descriptorSha256}>
                Descriptor SHA-256 {shortHash(release.sourceProvenance.descriptorSha256)}
              </small>
            </>
          ) : (
            <small>Source: local staged export</small>
          )}
        </td>
      </tr>
      <tr data-release-resource="package">
        <th scope="row">
          <strong>{release.package.path}</strong>
          <small title={release.package.sha256}>SHA-256 {release.package.sha256}</small>
        </th>
        <td>SPFx package / provenance</td>
        <td>{release.releaseId}</td>
        <td>
          <BucketStatus state={release.package.status === 'verified' ? 'verified' : 'warning'}>
            {release.package.status === 'verified'
              ? 'Package verified'
              : release.package.status === 'anchored'
                ? 'Package checksum anchored'
                : 'Package metadata recorded'}
          </BucketStatus>
          <small>Not served as a CDN asset</small>
          <small>
            Components: {release.components.package.length} packaged · {release.components.generated.length} generated
          </small>
        </td>
        <td>{formatBytes(release.package.bytes)}</td>
        <td>Bucket-local only</td>
      </tr>
      {release.assets.map((asset) => (
        <AssetRow asset={asset} key={asset.path} origin={origin} release={release} />
      ))}
    </>
  );
}

function AssetRow({
  asset,
  origin,
  release
}: {
  asset: LocalCdnBucketAsset;
  origin: string;
  release: InspectableRelease;
}): JSX.Element {
  return (
    <tr data-bucket-asset={asset.path}>
      <th scope="row">
        <strong>{asset.path}</strong>
        <small title={asset.sha256}>SHA-256 {asset.sha256}</small>
      </th>
      <td>
        {asset.referencedBy.length ? 'Referenced app asset' : 'Staged app asset'}
        {asset.referencedBy.length > 0 && <small>{asset.referencedBy.join(' · ')}</small>}
      </td>
      <td>{release.releaseId}</td>
      <td>
        <BucketStatus state={asset.status === 'verified' ? 'verified' : 'warning'}>
          {asset.status === 'verified'
            ? 'Hash and size verified'
            : asset.status === 'anchored'
              ? 'Published hash and size anchored'
              : 'Legacy hash and size recorded'}
        </BucketStatus>
        <small>
          {release.selected ? 'Eligible for selected-release delivery' : 'At rest; not served unless explicitly selected'}
        </small>
      </td>
      <td>{formatBytes(asset.bytes)}</td>
      <td>
        Bucket at rest · {origin}
        <small>{asset.url}</small>
      </td>
    </tr>
  );
}

function BucketStatus({
  children,
  state
}: {
  children: React.ReactNode;
  state: 'verified' | 'selected' | 'warning' | 'error';
}): JSX.Element {
  return <span className={`local-cdn-admin__badge local-cdn-admin__badge--${state}`}>{children}</span>;
}

function releaseLabelForKey(releases: InspectableRelease[], key: string): string {
  const release = releases.find((candidate) => releaseKey(candidate.appId, candidate.releaseId) === key);
  return release ? `${release.appId} · ${release.releaseLabel}` : '';
}

function pointerStatusLabel(status: 'none' | 'invalid' | 'selected-and-verified'): string {
  switch (status) {
    case 'selected-and-verified':
      return 'Selected pointer verified';
    case 'invalid':
      return 'Invalid pointer — delivery blocked';
    default:
      return 'No release selected';
  }
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…`;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

type VerifiedPublishSource = Extract<LocalCdnPublishSource, { status: 'verified' }>;

function isVerifiedPublishSource(source: LocalCdnPublishSource): source is VerifiedPublishSource {
  return source.status === 'verified';
}

type InspectableRelease = Exclude<LocalCdnAppRelease, { status: 'invalid' }>;

function isSelectableRelease(release: LocalCdnAppRelease): release is InspectableRelease {
  return release.status !== 'invalid';
}
