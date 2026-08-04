import * as React from 'react';
import { Spinner } from '@fluentui/react-components';
import type { CdnPackageDescriptor } from '../api/packageRuntime';
import { parseCdnSmokeMessage, type CdnSmokeAssetEvidence, type CdnSmokeRegistration } from '../lib/cdnSmokeProtocol';

const SMOKE_TIMEOUT_MS = 15_000;

interface CdnSmokeCheckProps {
  descriptor: CdnPackageDescriptor;
  onRetry: () => void;
  onStatusChange: (status: CdnSmokeCheckStatus) => void;
}

export type CdnSmokeCheckStatus =
  | { status: 'loading'; assetEvidence: CdnSmokeAssetEvidence[] }
  | { status: 'ready'; assetEvidence: CdnSmokeAssetEvidence[]; registrations: CdnSmokeRegistration[] }
  | { status: 'error'; assetEvidence: CdnSmokeAssetEvidence[]; message: string };

export function CdnSmokeCheck({ descriptor, onRetry, onStatusChange }: CdnSmokeCheckProps): JSX.Element | null {
  const { origin: deliveryOrigin, releaseBaseUrl } = descriptor.delivery;
  const requestId = React.useMemo(createRequestId, [releaseBaseUrl]);
  const assets = React.useMemo(
    () => descriptor.assets.map((asset) => ({ path: asset.assetPath, url: asset.assetUrl })),
    [descriptor.assets]
  );
  const expectedPaths = React.useMemo(() => assets.map((asset) => asset.path), [assets]);
  const [state, setState] = React.useState<CdnSmokeCheckStatus>({ status: 'loading', assetEvidence: [] });

  React.useEffect(() => {
    const loadingState: CdnSmokeCheckStatus = { status: 'loading', assetEvidence: [] };
    setState(loadingState);
    onStatusChange(loadingState);
    let settled = false;
    let latestEvidence: CdnSmokeAssetEvidence[] = [];
    if (typeof Worker === 'undefined') {
      const errorState: CdnSmokeCheckStatus = {
        status: 'error',
        assetEvidence: [],
        message: 'This browser cannot run the isolated staged CDN smoke check because Web Workers are unavailable.'
      };
      setState(errorState);
      onStatusChange(errorState);
      return;
    }
    const worker = new Worker(new URL('../workers/cdnSmokeWorker.js', import.meta.url), {
      name: 'spfx-kit-cdn-smoke-check'
    });
    const fail = (message: string, assetEvidence: CdnSmokeAssetEvidence[] = latestEvidence): void => {
      if (!settled) {
        settled = true;
        const errorState: CdnSmokeCheckStatus = {
          status: 'error',
          assetEvidence: terminalFailureEvidence(assetEvidence),
          message
        };
        setState(errorState);
        onStatusChange(errorState);
      }
    };
    const handleMessage = (event: MessageEvent): void => {
      const message = parseCdnSmokeMessage(event.data, requestId);
      if (!message || settled) {
        return;
      }
      if (!evidenceMatchesExpectedPrefix(message.assetEvidence, expectedPaths)) {
        fail('The staged CDN smoke check returned unexpected asset evidence.');
        return;
      }
      if (message.status === 'progress') {
        latestEvidence = message.assetEvidence;
        const progressState: CdnSmokeCheckStatus = { status: 'loading', assetEvidence: latestEvidence };
        setState(progressState);
        onStatusChange(progressState);
        return;
      }
      if (message.status === 'error') {
        latestEvidence = message.assetEvidence;
        fail(message.message, message.assetEvidence);
        return;
      }
      if (!sameStrings(message.loadedAssetPaths, expectedPaths)) {
        fail('The staged CDN smoke check returned unexpected asset evidence.');
        return;
      }
      settled = true;
      latestEvidence = message.assetEvidence;
      const readyState: CdnSmokeCheckStatus = {
        status: 'ready',
        assetEvidence: message.assetEvidence,
        registrations: message.registrations
      };
      setState(readyState);
      onStatusChange(readyState);
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
    worker.postMessage({ requestId, deliveryOrigin, releaseBaseUrl, assets });
    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
    };
  }, [assets, deliveryOrigin, expectedPaths, onStatusChange, releaseBaseUrl, requestId]);

  if (state.status === 'ready') {
    return null;
  }

  return (
    <div
      className={`package-runtime-state cdn-smoke-check ${state.status === 'error' ? 'package-runtime-state--error' : ''}`}
      data-cdn-smoke-check={state.status}
      role={state.status === 'error' ? 'alert' : 'status'}
    >
      {state.status === 'loading' ? (
        <>
          <Spinner size="small" />
          <strong>Checking mock-CDN delivery</strong>
          <span>Loading the pinned staged scripts from {descriptor.delivery.origin}.</span>
        </>
      ) : (
        <>
          <strong>Mock-CDN delivery or staged-script execution failed</strong>
          <span>{state.message}</span>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
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

function evidenceMatchesExpectedPrefix(evidence: CdnSmokeAssetEvidence[], expectedPaths: string[]): boolean {
  return (
    evidence.length <= expectedPaths.length &&
    evidence.every((item, index) => item.path === expectedPaths[index]) &&
    evidence.slice(0, -1).every((item) => item.status === 'loaded')
  );
}

function terminalFailureEvidence(evidence: CdnSmokeAssetEvidence[]): CdnSmokeAssetEvidence[] {
  return evidence.map((item) => ({ ...item, status: item.status === 'loading' ? 'failed' : item.status }));
}
