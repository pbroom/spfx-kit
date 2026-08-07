import * as React from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import { loadCdnPackageDescriptor, type CdnPackageDescriptor } from '../api/packageRuntime';
import { cdnPackageSelectionKey, type LabPackageMode } from '../lib/packageMode';
import { CdnSmokeCheck, type CdnSmokeCheckStatus } from './CdnSmokeCheck';
import { PackageDependencyPanel, type CdnSmokeStatus } from './PackageDependencyPanel';

interface PackageRuntimeSelection {
  id: string;
  appId: string;
  componentId?: string;
  title: string;
}

interface PackageRuntimeSurfaceProps {
  boundsVisible: boolean;
  frameWidth: number;
  mode: LabPackageMode;
  selectionRevision?: number;
  selected?: PackageRuntimeSelection;
  standaloneContent?: React.ReactNode;
}

export type PackageDescriptorState =
  | { status: 'standalone' }
  | { status: 'loading'; selectionKey: string }
  | { status: 'ready'; descriptor: CdnPackageDescriptor; selectionKey: string }
  | { status: 'error'; message: string; selectionKey: string };

const idleSmokeStatus: CdnSmokeStatus = { status: 'idle', assetEvidence: [] };

export function PackageRuntimeSurface({
  boundsVisible,
  frameWidth,
  mode,
  selectionRevision = 0,
  selected,
  standaloneContent
}: PackageRuntimeSurfaceProps): JSX.Element {
  const [descriptorState, setDescriptorState] = React.useState<PackageDescriptorState>({ status: 'standalone' });
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [smokeStatus, setSmokeStatus] = React.useState<CdnSmokeStatus>(idleSmokeStatus);

  React.useEffect(() => {
    setSmokeStatus(idleSmokeStatus);
    if (mode === 'standalone') {
      setDescriptorState({ status: 'standalone' });
      return;
    }
    if (!selected) {
      setDescriptorState({ status: 'error', message: 'No app is selected.', selectionKey: '' });
      return;
    }

    const controller = new AbortController();
    const selectionKey = cdnPackageSelectionKey(selected);
    setDescriptorState({ status: 'loading', selectionKey });
    void loadCdnPackageDescriptor(selected.appId, selected.componentId, controller.signal)
      .then((descriptor) => {
        if (!controller.signal.aborted) {
          setDescriptorState({ status: 'ready', descriptor, selectionKey });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDescriptorState({
            status: 'error',
            message: error instanceof Error ? error.message : 'The staged CDN bundle could not be checked.',
            selectionKey
          });
        }
      });

    return () => controller.abort();
  }, [loadAttempt, mode, selected, selectionRevision]);

  const selectionKey = selected ? cdnPackageSelectionKey(selected) : '';
  const { descriptor, descriptorError, descriptorLoading } = descriptorViewFor(descriptorState, mode, selectionKey);
  const retry = React.useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
  const updateSmokeStatus = React.useCallback((status: CdnSmokeCheckStatus): void => {
    setSmokeStatus(status);
  }, []);

  return (
    <>
      {mode === 'cdn' ? (
        <PackageDependencyPanel
          appTitle={selected?.title || 'No app selected'}
          descriptor={descriptor}
          descriptorError={descriptorError}
          descriptorLoading={descriptorLoading}
          mode={mode}
          smoke={smokeStatus}
          onRetry={retry}
        />
      ) : null}
      <div className={`preview-canvas ${mode === 'cdn' && smokeStatus.status === 'ready' ? 'preview-canvas--cdn-ready' : ''}`}>
        <div
          className={`preview-frame ${boundsVisible ? 'preview-frame--bounded' : ''}`}
          aria-busy={mode === 'cdn' && (descriptorLoading || smokeStatus.status === 'loading')}
          data-package-artifact={descriptor?.releaseId}
          data-package-delivery-origin={descriptor?.delivery.origin}
          data-package-mode={mode}
          style={{ width: `min(${frameWidth}px, calc(100% - 48px))` }}
        >
          {mode === 'cdn' && descriptorLoading ? (
            <div className="package-runtime-state" role="status">
              <Spinner size="small" />
              <strong>Preparing local mock-CDN smoke check</strong>
              <span>Validating the staged release and pinning its separate-origin delivery URL.</span>
            </div>
          ) : mode === 'cdn' && descriptorState.status === 'error' ? (
            <div className="package-runtime-state package-runtime-state--error" role="status">
              <strong>CDN resources unavailable</strong>
              <span>{descriptorState.message}</span>
              <Button appearance="primary" size="small" onClick={retry}>
                Retry
              </Button>
            </div>
          ) : descriptor && selected ? (
            <CdnSmokeCheck
              key={`${selected.id}:cdn:${descriptor.releaseId}:${descriptor.delivery.releaseBaseUrl}`}
              descriptor={descriptor}
              onRetry={retry}
              onStatusChange={updateSmokeStatus}
            />
          ) : mode === 'standalone' && standaloneContent ? (
            standaloneContent
          ) : (
            <div className="empty-preview">
              <strong>No web parts registered</strong>
              <span>Import an SPFx app or add a lab adapter.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function descriptorViewFor(
  state: PackageDescriptorState,
  mode: LabPackageMode,
  selectionKey: string
): { descriptor?: CdnPackageDescriptor; descriptorError?: string; descriptorLoading: boolean } {
  if (mode === 'standalone') {
    return { descriptorLoading: false };
  }
  if (state.status === 'ready' && state.selectionKey === selectionKey) {
    return { descriptor: state.descriptor, descriptorLoading: false };
  }
  if (state.status === 'error' && state.selectionKey === selectionKey) {
    return { descriptorError: state.message, descriptorLoading: false };
  }
  return { descriptorLoading: true };
}
