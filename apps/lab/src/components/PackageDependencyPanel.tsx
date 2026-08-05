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
      data-package-delivery-kind={descriptor?.delivery.kind}
      data-package-delivery-origin={descriptor?.delivery.origin}
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
          The local standalone adapter is active. No mock-CDN browser check is active. Select CDN to resolve the app's explicitly
          selected staged release and load its allowlisted scripts from the separate local mock CDN.
        </p>
      ) : descriptorLoading ? (
        <p className="package-dependency-panel__message" role="status">
          Resolving the app's selected immutable release and validating its mock-CDN manifest closure.
        </p>
      ) : descriptorError ? (
        <div className="package-dependency-panel__error" role="alert">
          <div>
            <strong>CDN resources unavailable</strong>
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
              <dt>Staged release</dt>
              <dd>{descriptor.releaseId}</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{descriptor.generatedAt}</dd>
            </div>
            <div>
              <dt>Package</dt>
              <dd>{descriptor.packagePath}</dd>
            </div>
            <div>
              <dt>Mock CDN origin</dt>
              <dd>{descriptor.delivery.origin}</dd>
            </div>
            <div>
              <dt>Bucket namespace</dt>
              <dd>{descriptor.delivery.namespacePath}</dd>
            </div>
            <div>
              <dt>Release manifest</dt>
              <dd>{descriptor.delivery.releaseManifestUrl}</dd>
            </div>
          </dl>

          <div aria-live="polite" className="visually-hidden" role="status">
            {summary.announcement}
          </div>

          <section aria-labelledby={`${headingId}-staged`} className="package-resource-group">
            <h3 id={`${headingId}-staged`}>App scripts — selected default paths</h3>
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
              Staged integrity is verified before publication. Browser delivery and top-level execution are tracked separately.
              For localized resources, only the selected default-locale path is loaded.
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
            The local mock CDN is an app-independent development bucket; this check uses its app-release namespace. It executes
            staged scripts' top-level code only and does not invoke AMD factories or exercise the SharePoint loader, web-part
            lifecycle, services, property pane, CSP, or deployment behavior.
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
          <dt>Staged</dt>
          <dd>Hash and size verified</dd>
        </div>
        <div>
          <dt>Mock bucket</dt>
          <dd>Published and verified</dd>
        </div>
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
      return 'Delivered — top-level code executed';
    case 'loading':
      return 'Loading from mock CDN';
    case 'failed':
      return 'Delivery or execution failed';
    default:
      return 'Waiting for browser delivery';
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
    return { state: 'standalone', label: 'Standalone', announcement: 'Standalone mode. No mock-CDN browser check is active.' };
  }
  if (descriptorLoading) {
    return { state: 'loading', label: 'Connecting', announcement: 'Connecting a validated release to the local mock CDN.' };
  }
  if (descriptorError) {
    return { state: 'error', label: 'Unavailable', announcement: `CDN resources unavailable. ${descriptorError}` };
  }
  if (!descriptor) {
    return { state: 'loading', label: 'Connecting', announcement: 'Preparing local mock-CDN delivery.' };
  }
  if (smoke.status === 'error') {
    return {
      state: 'error',
      label: 'Delivery check failed',
      announcement: `Mock-CDN delivery or staged-script execution failed. ${loadedCount} of ${descriptor.assets.length} scripts loaded.`
    };
  }
  if (smoke.status === 'ready') {
    return {
      state: 'ready',
      label: `${loadedCount}/${descriptor.assets.length} delivered`,
      announcement: `Local mock-CDN smoke check passed. ${loadedCount} of ${descriptor.assets.length} scripts loaded.`
    };
  }
  return {
    state: 'loading',
    label: `${loadedCount}/${descriptor.assets.length} delivered`,
    announcement: `${loadedCount} of ${descriptor.assets.length} staged scripts delivered by the local mock CDN.`
  };
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KiB`;
}
