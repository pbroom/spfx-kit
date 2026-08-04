import * as React from 'react';
import type { CdnPackageDescriptor, CdnPackageScriptAsset } from '../api/packageRuntime';
import type { CdnSmokeAssetEvidence } from '../lib/cdnSmokeProtocol';
import type { LabPackageMode } from '../lib/packageMode';

export type CdnAssetLoadStatus = 'verified' | 'loading' | 'loaded' | 'failed';

export interface CdnSmokeStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  assetEvidence: CdnSmokeAssetEvidence[];
  message?: string;
}

let nextPackageDependencyPanelId = 0;

interface PackageDependencyPanelProps {
  appTitle: string;
  descriptor?: CdnPackageDescriptor;
  descriptorError?: string;
  descriptorLoading: boolean;
  mode: LabPackageMode;
  smoke: CdnSmokeStatus;
  onRetry: () => void;
}

export function PackageDependencyPanel({
  appTitle,
  descriptor,
  descriptorError,
  descriptorLoading,
  mode,
  smoke,
  onRetry
}: PackageDependencyPanelProps): JSX.Element {
  const headingIdRef = React.useRef('');
  if (!headingIdRef.current) {
    headingIdRef.current = `package-resources-${++nextPackageDependencyPanelId}`;
  }
  const headingId = headingIdRef.current;
  const loadedCount = descriptor ? descriptor.assets.filter((asset) => assetStatus(asset, smoke) === 'loaded').length : 0;
  const summary = packageSummary(mode, descriptor, descriptorError, descriptorLoading, smoke, loadedCount);

  return (
    <section
      aria-busy={mode === 'cdn' && (descriptorLoading || smoke.status === 'loading')}
      aria-labelledby={headingId}
      className={`package-dependency-panel package-dependency-panel--${mode}`}
      data-package-resource-state={summary.state}
    >
      <div className="package-dependency-panel__header">
        <div>
          <h2 id={headingId}>Package resources</h2>
          <p>{appTitle}</p>
        </div>
        <span className={`package-resource-summary package-resource-summary--${summary.state}`}>{summary.label}</span>
      </div>

      {mode === 'standalone' ? (
        <p className="package-dependency-panel__standalone">
          The local standalone adapter is active. No staged CDN session is selected, and its resources are not assumed to be
          CDN-hosted. Select CDN to validate a staging export for this app.
        </p>
      ) : descriptorLoading ? (
        <p className="package-dependency-panel__message" role="status">
          Validating and pinning one local staging-CDN release for {appTitle}.
        </p>
      ) : descriptorError ? (
        <div className="package-dependency-panel__error" role="alert">
          <div>
            <strong>Staged CDN resources unavailable</strong>
            <span>{descriptorError}</span>
          </div>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : descriptor ? (
        <div className="package-dependency-panel__body">
          <dl className="package-release-details">
            <div>
              <dt>Release</dt>
              <dd>{descriptor.releaseId}</dd>
            </div>
            <div>
              <dt>Manifest</dt>
              <dd>{descriptor.generatedAt}</dd>
            </div>
            <div>
              <dt>Package</dt>
              <dd>{descriptor.packagePath}</dd>
            </div>
          </dl>

          <div aria-live="polite" className="visually-hidden" role="status">
            {summary.announcement}
          </div>

          <section aria-labelledby={`${headingId}-staged`} className="package-resource-group">
            <h3 id={`${headingId}-staged`}>Staged scripts — selected default paths</h3>
            <ul className="package-resource-list">
              {descriptor.assets.map((asset) => (
                <StagedAssetRow
                  asset={asset}
                  key={`${asset.role}:${asset.moduleId}:${asset.assetPath}`}
                  status={assetStatus(asset, smoke)}
                />
              ))}
            </ul>
            <p className="package-resource-group__note">
              For localized script resources, this list shows the package's selected default-locale path. Locale-specific
              alternatives are not loaded by this smoke check.
            </p>
          </section>

          <section aria-labelledby={`${headingId}-deferred`} className="package-resource-group">
            <h3 id={`${headingId}-deferred`}>SharePoint loader references — not staged files</h3>
            {descriptor.deferredResources.length ? (
              <ul className="package-resource-list package-resource-list--deferred">
                {descriptor.deferredResources.map((resource) => (
                  <li className="package-resource-row" key={`${resource.moduleId}:${resource.componentId}`}>
                    <div className="package-resource-row__heading">
                      <strong>{resource.moduleId}</strong>
                      <span className="package-resource-status package-resource-status--deferred">
                        Deferred — SharePoint loader required
                      </span>
                    </div>
                    <dl className="package-resource-row__details">
                      <div>
                        <dt>Component</dt>
                        <dd>{resource.componentId}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{resource.version}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="package-resource-group__empty">No separate SharePoint component references were declared.</p>
            )}
            <p className="package-resource-group__note">
              These are SPFx component references that SharePoint normally resolves. They are deliberately not loaded here and do
              not imply that arbitrary npm packages are hosted on a CDN.
            </p>
          </section>

          <p className="package-dependency-panel__limitation">
            This smoke check executes staged scripts' top-level code only. It does not invoke AMD factories or exercise the
            SharePoint loader, web-part lifecycle, services, property pane, CSP, or deployment behavior.
          </p>
        </div>
      ) : null}
    </section>
  );
}

interface StagedAssetRowProps {
  asset: CdnPackageScriptAsset;
  status: CdnAssetLoadStatus;
}

function StagedAssetRow({ asset, status }: StagedAssetRowProps): JSX.Element {
  return (
    <li className="package-resource-row" data-asset-path={asset.assetPath} data-asset-status={status}>
      <div className="package-resource-row__heading">
        <span>
          <strong>{asset.moduleId}</strong>
          <small>{asset.role === 'entry' ? 'Entry' : 'Dependency'}</small>
        </span>
        <span className={`package-resource-status package-resource-status--${status}`}>{assetStatusLabel(status)}</span>
      </div>
      <dl className="package-resource-row__details">
        <div>
          <dt>Path</dt>
          <dd>{asset.assetPath}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(asset.bytes)}</dd>
        </div>
        <div className="package-resource-row__hash">
          <dt>SHA-256</dt>
          <dd>{asset.sha256}</dd>
        </div>
      </dl>
    </li>
  );
}

export function assetStatus(asset: CdnPackageScriptAsset, smoke: CdnSmokeStatus): CdnAssetLoadStatus {
  const evidence = smoke.assetEvidence.find((candidate) => candidate.path === asset.assetPath);
  if (evidence) {
    return evidence.status;
  }
  return 'verified';
}

function assetStatusLabel(status: CdnAssetLoadStatus): string {
  switch (status) {
    case 'loaded':
      return 'Loaded — top-level code executed';
    case 'loading':
      return 'Loading';
    case 'failed':
      return 'Failed or blocked';
    default:
      return 'Allowed — hash and size verified';
  }
}

function packageSummary(
  mode: LabPackageMode,
  descriptor: CdnPackageDescriptor | undefined,
  descriptorError: string | undefined,
  descriptorLoading: boolean,
  smoke: CdnSmokeStatus,
  loadedCount: number
): { state: string; label: string; announcement: string } {
  if (mode === 'standalone') {
    return { state: 'standalone', label: 'Standalone', announcement: 'Standalone mode. No CDN session is selected.' };
  }
  if (descriptorLoading) {
    return { state: 'loading', label: 'Pinning stage', announcement: 'Validating and pinning a staged CDN release.' };
  }
  if (descriptorError) {
    return { state: 'error', label: 'Unavailable', announcement: `Staged CDN resources unavailable. ${descriptorError}` };
  }
  if (!descriptor) {
    return { state: 'loading', label: 'Preparing', announcement: 'Preparing staged CDN resources.' };
  }
  if (smoke.status === 'error') {
    return {
      state: 'error',
      label: 'Smoke check failed',
      announcement: `Staged CDN smoke check failed. ${loadedCount} of ${descriptor.assets.length} scripts loaded.`
    };
  }
  if (smoke.status === 'ready') {
    return {
      state: 'ready',
      label: `${loadedCount}/${descriptor.assets.length} loaded`,
      announcement: `Staged CDN smoke check passed. ${loadedCount} of ${descriptor.assets.length} scripts loaded.`
    };
  }
  return {
    state: 'loading',
    label: `${loadedCount}/${descriptor.assets.length} loading`,
    announcement: `${loadedCount} of ${descriptor.assets.length} staged scripts loaded.`
  };
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KiB`;
}
