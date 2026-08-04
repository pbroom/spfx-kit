import * as React from 'react';
import type { LabDisplayMode, LabPropertyBag, MockSpfxContext } from '@spfx-kit/spfx-lab-runtime';
import type { CdnWebPartConstructor, CdnWebPartInstance } from '../api/packageRuntime';

interface CdnPackagePreviewProps {
  WebPart: CdnWebPartConstructor;
  properties: LabPropertyBag;
  context: MockSpfxContext;
  displayMode: LabDisplayMode;
  onError: (message: string) => void;
}

export function CdnPackagePreview({ WebPart, properties, context, displayMode, onError }: CdnPackagePreviewProps): JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const instanceRef = React.useRef<CdnWebPartInstance>();

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    try {
      const instance = new WebPart();
      instance.domElement = container;
      instanceRef.current = instance;
    } catch (error) {
      onError(errorMessage(error, 'The staged CDN web part could not be created.'));
    }

    return () => {
      const instance = instanceRef.current;
      instanceRef.current = undefined;
      try {
        instance?.onDispose?.();
      } catch {
        // The container is cleared below even if the package cleanup hook fails.
      }
      container.replaceChildren();
    };
  }, [WebPart, onError]);

  React.useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    try {
      instance.properties = { ...properties };
      instance.context = context;
      instance.displayMode = displayMode === 'edit' ? 2 : 1;
      instance.render();
    } catch (error) {
      onError(errorMessage(error, 'The staged CDN web part failed while rendering.'));
    }
  }, [context, displayMode, onError, properties, WebPart]);

  return <div className="cdn-package-preview" data-cdn-renderer="staged-bundle" ref={containerRef} />;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback;
}
