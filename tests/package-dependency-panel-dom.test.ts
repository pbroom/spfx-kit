// @vitest-environment happy-dom

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CdnPackageDescriptor } from '../apps/lab/src/api/packageRuntime';
import { PackageDependencyPanel, type CdnSmokeStatus } from '../apps/lab/src/components/PackageDependencyPanel';
import { descriptorViewFor, PackageRuntimeSurface } from '../apps/lab/src/components/PackageRuntimeSurface';

const loadCdnPackageDescriptorMock = vi.hoisted(() => vi.fn());

vi.mock('../apps/lab/src/api/packageRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apps/lab/src/api/packageRuntime')>();
  return { ...actual, loadCdnPackageDescriptor: loadCdnPackageDescriptorMock };
});

const mockOrigin = 'http://127.0.0.1:4400';
const namespacePath = 'apps/hello-card-spfx/versions/1.2.3-panel.1/';
const releaseBaseUrl = `${mockOrigin}/${namespacePath}`;
const descriptor: CdnPackageDescriptor = {
  mode: 'cdn',
  appId: 'hello-card-spfx',
  releaseId: '1.2.3-panel.1',
  generatedAt: '2026-08-04T12:00:00.000Z',
  cdnBasePath: releaseBaseUrl,
  delivery: {
    kind: 'local-mock-cdn',
    origin: mockOrigin,
    bucketBaseUrl: `${mockOrigin}/`,
    namespaceKind: 'app-release',
    namespacePath,
    releaseBaseUrl,
    releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
    status: 'published-and-verified'
  },
  packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
  assets: [
    {
      role: 'dependency',
      moduleId: 'WebPartStrings',
      assetPath: 'strings.js',
      assetUrl: `${releaseBaseUrl}strings.js`,
      bytes: 512,
      sha256: 'a'.repeat(64),
      stageStatus: 'allowed-and-verified'
    },
    {
      role: 'entry',
      moduleId: 'hello-card',
      assetPath: 'hello-card.js',
      assetUrl: `${releaseBaseUrl}hello-card.js`,
      bytes: 2048,
      sha256: 'b'.repeat(64),
      stageStatus: 'allowed-and-verified'
    }
  ],
  deferredResources: [
    {
      moduleId: '@microsoft/sp-webpart-base',
      kind: 'spfx-component',
      componentId: '974a7777-0990-4136-8fa6-95d80114c2e0',
      version: '1.23.2',
      status: 'deferred',
      reason: 'sharepoint-loader-not-exercised'
    }
  ]
};

describe('PackageDependencyPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    loadCdnPackageDescriptorMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => ReactDom.unmountComponentAtNode(container));
    container.remove();
  });

  it('does not claim a CDN session or dependency inventory in Standalone mode', () => {
    renderPanel({ status: 'idle', assetEvidence: [] }, { mode: 'standalone' });

    expect(container.textContent).toContain('No mock-CDN browser check is active');
    expect(container.textContent).not.toContain(descriptor.releaseId);
    expect(container.querySelectorAll('[data-asset-path]')).toHaveLength(0);
    expect(container.querySelector('[data-package-resource-state]')?.getAttribute('data-package-resource-state')).toBe(
      'standalone'
    );
  });

  it('renders canonical staged and deferred resources with direct per-asset evidence', () => {
    renderPanel(
      {
        status: 'loading',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'hello-card.js', status: 'loading', registrationCount: 0 }
        ]
      },
      { mode: 'cdn', descriptor }
    );

    expect(container.textContent).toContain(descriptor.releaseId);
    expect(container.textContent).toContain(mockOrigin);
    expect(container.textContent).toContain(namespacePath);
    expect(container.textContent).toContain(descriptor.delivery.releaseManifestUrl);
    expect(container.textContent).toContain(descriptor.assets[0].sha256);
    expect(container.textContent).toContain('Hash and size verified');
    expect(container.textContent).toContain('Published and verified');
    expect(container.textContent).toContain('@microsoft/sp-webpart-base');
    expect(container.textContent).toContain('Deferred — SharePoint loader required');
    expect(container.textContent).toContain('do not imply that arbitrary npm packages are hosted on a CDN');
    expect(assetRow('strings.js').getAttribute('data-asset-status')).toBe('loaded');
    expect(assetRow('hello-card.js').getAttribute('data-asset-status')).toBe('loading');
    expect(assetRow('strings.js').textContent).toContain('Delivered — top-level code executed');
    expect(assetRow('hello-card.js').textContent).toContain('Loading from mock CDN');

    renderPanel(
      {
        status: 'error',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'hello-card.js', status: 'failed', registrationCount: 0 }
        ],
        message: 'The selected asset was blocked.'
      },
      { mode: 'cdn', descriptor }
    );

    expect(assetRow('strings.js').getAttribute('data-asset-status')).toBe('loaded');
    expect(assetRow('hello-card.js').getAttribute('data-asset-status')).toBe('failed');
    expect(container.textContent).toContain('Delivery check failed');
    expect(assetRow('hello-card.js').textContent).toContain('Delivery or execution failed');
  });

  it('shows a single actionable descriptor error without inventing resource rows', () => {
    const onRetry = vi.fn();
    renderPanel(
      { status: 'idle', assetEvidence: [] },
      { mode: 'cdn', descriptorError: 'No validated staging CDN artifact was found.', onRetry }
    );

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('No validated staging CDN artifact was found.');
    expect(container.querySelectorAll('[data-asset-path]')).toHaveLength(0);
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('never exposes a previous app descriptor or error after the current app changes', () => {
    expect(
      descriptorViewFor(
        { status: 'ready', descriptor, selectionKey: 'hello-card-spfx:component-a' },
        'cdn',
        'another-app:component-b'
      )
    ).toEqual({ descriptorLoading: true });
    expect(
      descriptorViewFor(
        { status: 'error', message: 'App A stage is missing.', selectionKey: 'hello-card-spfx:component-a' },
        'cdn',
        'another-app:component-b'
      )
    ).toEqual({ descriptorLoading: true });
    expect(descriptorViewFor({ status: 'standalone' }, 'standalone', 'another-app:component-b')).toEqual({
      descriptorLoading: false
    });
  });

  it('aborts the previous app session and clears its evidence immediately when the selected app changes', async () => {
    const pending = new Map<
      string,
      {
        signal: AbortSignal;
        resolve: (value: CdnPackageDescriptor) => void;
        reject: (reason: unknown) => void;
      }
    >();
    loadCdnPackageDescriptorMock.mockImplementation((appId: string, _componentId: string | undefined, signal: AbortSignal) => {
      return new Promise<CdnPackageDescriptor>((resolve, reject) => {
        pending.set(appId, { signal, resolve, reject });
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const appA = { id: 'app-a:default', appId: 'app-a', componentId: 'component-a', title: 'App A' };
    const appB = { id: 'app-b:default', appId: 'app-b', componentId: 'component-b', title: 'App B' };
    const descriptorA = { ...descriptor, appId: 'app-a', releaseId: '1.0.0-app-a' };
    const descriptorB = { ...descriptor, appId: 'app-b', releaseId: '2.0.0-app-b' };

    await renderRuntime('cdn', appA);
    expect(loadCdnPackageDescriptorMock).toHaveBeenCalledWith('app-a', 'component-a', expect.any(AbortSignal));

    await renderRuntime('cdn', appB);
    expect(pending.get('app-a')?.signal.aborted).toBe(true);
    expect(container.textContent).toContain('App B');
    expect(container.textContent).not.toContain(descriptorA.releaseId);
    expect(container.querySelectorAll('[data-asset-path]')).toHaveLength(0);

    await act(async () => {
      pending.get('app-b')?.resolve(descriptorB);
      await Promise.resolve();
    });
    expect(container.textContent).toContain(descriptorB.releaseId);
    expect(container.textContent).not.toContain(descriptorA.releaseId);

    await renderRuntime('standalone', appB);
    expect(container.textContent).toContain('No mock-CDN browser check is active');
    expect(container.textContent).not.toContain(descriptorB.releaseId);

    // Keep the unused fixture explicit: app A never becomes visible even if its old promise resolves late.
    pending.get('app-a')?.resolve(descriptorA);
  });

  function renderPanel(
    smoke: CdnSmokeStatus,
    options: {
      mode: 'standalone' | 'cdn';
      descriptor?: CdnPackageDescriptor;
      descriptorError?: string;
      onRetry?: () => void;
    }
  ): void {
    act(() => {
      ReactDom.render(
        React.createElement(PackageDependencyPanel, {
          appTitle: 'Hello Card',
          descriptor: options.descriptor,
          descriptorError: options.descriptorError,
          descriptorLoading: false,
          mode: options.mode,
          smoke,
          onRetry: options.onRetry || vi.fn()
        }),
        container
      );
    });
  }

  function assetRow(path: string): HTMLElement {
    const row = container.querySelector<HTMLElement>(`[data-asset-path="${path}"]`);
    if (!row) {
      throw new Error(`Missing resource row for ${path}`);
    }
    return row;
  }

  async function renderRuntime(
    mode: 'standalone' | 'cdn',
    selected: { id: string; appId: string; componentId: string; title: string }
  ): Promise<void> {
    await act(async () => {
      ReactDom.render(
        React.createElement(PackageRuntimeSurface, {
          boundsVisible: false,
          frameWidth: 800,
          mode,
          selected,
          standaloneContent: React.createElement('div', null, `${selected.title} standalone`)
        }),
        container
      );
      await Promise.resolve();
    });
  }
});
