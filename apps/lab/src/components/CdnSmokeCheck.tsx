import * as React from 'react';
import { Spinner } from '@fluentui/react-components';
import type { CdnPackageDescriptor } from '../api/packageRuntime';
import { parseCdnSmokeMessage, type CdnSmokeRegistration } from '../lib/cdnSmokeProtocol';

const SMOKE_TIMEOUT_MS = 15_000;

interface CdnSmokeCheckProps {
  descriptor: CdnPackageDescriptor;
  onError: (message: string) => void;
}

type SmokeState = { status: 'loading' } | { status: 'ready'; loadedAssetPaths: string[]; registrations: CdnSmokeRegistration[] };

export function CdnSmokeCheck({ descriptor, onError }: CdnSmokeCheckProps): JSX.Element {
  const requestId = React.useMemo(createRequestId, [descriptor.assetBaseUrl]);
  const assets = React.useMemo(
    () => [
      ...descriptor.dependencyAssets.map((asset) => ({ path: asset.assetPath, url: asset.assetUrl })),
      { path: descriptor.entryAssetPath, url: descriptor.entryAssetUrl }
    ],
    [descriptor]
  );
  const expectedPaths = React.useMemo(() => assets.map((asset) => asset.path), [assets]);
  const [state, setState] = React.useState<SmokeState>({ status: 'loading' });

  React.useEffect(() => {
    setState({ status: 'loading' });
    let settled = false;
    if (typeof Worker === 'undefined') {
      onError('This browser cannot run the isolated staged CDN smoke check because Web Workers are unavailable.');
      return;
    }
    const worker = new Worker(new URL('../workers/cdnSmokeWorker.js', import.meta.url), {
      name: 'spfx-kit-cdn-smoke-check'
    });
    const fail = (message: string): void => {
      if (!settled) {
        settled = true;
        onError(message);
      }
    };
    const handleMessage = (event: MessageEvent): void => {
      const message = parseCdnSmokeMessage(event.data, requestId);
      if (!message || settled) {
        return;
      }
      if (message.status === 'error') {
        fail(message.message);
        return;
      }
      if (!sameStrings(message.loadedAssetPaths, expectedPaths)) {
        fail('The staged CDN smoke check returned unexpected asset evidence.');
        return;
      }
      settled = true;
      setState({
        status: 'ready',
        loadedAssetPaths: message.loadedAssetPaths,
        registrations: message.registrations
      });
    };
    const handleWorkerError = (event: ErrorEvent): void => {
      event.preventDefault();
      fail(`The isolated staged CDN script check failed: ${event.message || 'unknown worker error'}`);
    };
    const timeoutId = window.setTimeout(
      () => fail('The staged CDN bundle did not finish loading within 15 seconds.'),
      SMOKE_TIMEOUT_MS
    );
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ requestId, assets });
    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
    };
  }, [assets, expectedPaths, onError, requestId]);

  return (
    <div className="package-runtime-state cdn-smoke-check" data-cdn-smoke-check={state.status} role="status">
      {state.status === 'loading' ? (
        <>
          <Spinner size="small" />
          <strong>Checking staged CDN bundle</strong>
          <span>Loading the pinned staged scripts through the Lab's same-origin CDN asset route.</span>
        </>
      ) : (
        <>
          <strong>Staged CDN bundle smoke check passed</strong>
          <span>
            Loaded {state.loadedAssetPaths.length} immutable staged script{state.loadedAssetPaths.length === 1 ? '' : 's'};
            detected {state.registrations.length} AMD module registration{state.registrations.length === 1 ? '' : 's'}.
          </span>
          <dl className="cdn-smoke-evidence">
            <div>
              <dt>Release</dt>
              <dd>{descriptor.releaseId}</dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>{descriptor.entryAssetPath}</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd>{descriptor.entryAssetSha256}</dd>
            </div>
            <div>
              <dt>Verified size</dt>
              <dd>{formatBytes(descriptor.entryAssetBytes)}</dd>
            </div>
          </dl>
          <span className="cdn-smoke-limitation">
            The worker executed each staged script's top-level code. The Lab did not invoke registered AMD factories or
            instantiate a web part. This is not a SharePoint or deployment preview; dynamic chunks, external component modules,
            SPFx lifecycle, services, property pane, loader, and CSP behavior are not exercised.
          </span>
        </>
      )}
    </div>
  );
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sameStrings(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KiB`;
}
