import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCdnPackageDescriptor, type CdnPackageDescriptor } from '../apps/lab/src/api/packageRuntime';

const digest = 'a'.repeat(64);
const sessionBase = 'http://lab.local/api/lab-packages/cdn-assets/0c5f3a9a-c636-4b43-8b01-48e03f46121d/';
const descriptor: CdnPackageDescriptor = {
  mode: 'cdn',
  appId: 'hello-card-spfx',
  releaseId: '1.0.0-20260804',
  generatedAt: '2026-08-04T12:00:00.000Z',
  cdnBasePath: 'https://cdn.contoso.example/spfx/hello-card/versions/1.0.0-20260804/',
  assetBaseUrl: sessionBase,
  packagePath: 'sharepoint/solution/hello-card.sppkg',
  assets: [
    {
      role: 'entry',
      moduleId: 'hello-card',
      assetPath: 'assets/hello-card.js',
      assetUrl: `${sessionBase}assets/hello-card.js`,
      bytes: 2048,
      sha256: digest,
      stageStatus: 'allowed-and-verified'
    }
  ],
  deferredResources: []
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadCdnPackageDescriptor', () => {
  it('loads one validated, session-scoped descriptor without fetching or evaluating staged scripts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(descriptor));
    stubBrowser(fetchMock);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', 'component:default', controller.signal)).resolves.toEqual(
      descriptor
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/lab-packages/cdn?app=hello-card-spfx&component=component%3Adefault', {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
  });

  it('omits an undefined component id from the descriptor request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(descriptor));
    stubBrowser(fetchMock);

    await loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/lab-packages/cdn?app=hello-card-spfx');
  });

  it('surfaces descriptor endpoint errors without attempting a local fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'No staged CDN release exists for this app.' }, 404));
    stubBrowser(fetchMock);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'Staged CDN descriptor request failed with status 404: No staged CDN release exists for this app.'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['a non-object response', [], 'must be an object'],
    ['the wrong mode', { ...descriptor, mode: 'standalone' }, 'invalid mode'],
    ['a different app', { ...descriptor, appId: 'another-app' }, 'does not match the selected app'],
    ['an invalid release id', { ...descriptor, releaseId: 'latest' }, 'releaseId is invalid'],
    ['an invalid generated time', { ...descriptor, generatedAt: 'yesterday' }, 'generatedAt is invalid'],
    ['an insecure CDN base', { ...descriptor, cdnBasePath: 'http://cdn.contoso.example/assets/' }, 'credential-free HTTPS'],
    [
      'an unsafe entry path',
      { ...descriptor, assets: [{ ...descriptor.assets[0], assetPath: '../entry.js' }] },
      'safe relative path'
    ],
    ['an unsafe package path', { ...descriptor, packagePath: 'C:\\package.sppkg' }, 'safe relative path'],
    ['missing entry bytes', { ...descriptor, assets: [{ ...descriptor.assets[0], bytes: undefined }] }, 'positive integer'],
    ['an invalid entry digest', { ...descriptor, assets: [{ ...descriptor.assets[0], sha256: 'nope' }] }, 'lowercase SHA-256'],
    ['missing assets', { ...descriptor, assets: undefined }, 'assets must contain'],
    ['missing deferred resources', { ...descriptor, deferredResources: undefined }, 'deferredResources must be an array'],
    [
      'an off-origin asset base',
      { ...descriptor, assetBaseUrl: 'https://evil.example/api/lab-packages/cdn-assets/session/' },
      'Lab CDN asset API'
    ],
    ['a non-API asset base', { ...descriptor, assetBaseUrl: 'http://lab.local/assets/' }, 'Lab CDN asset API'],
    [
      'an entry outside its session',
      {
        ...descriptor,
        assets: [
          {
            ...descriptor.assets[0],
            assetUrl: 'http://lab.local/api/lab-packages/cdn-assets/another-session/assets/hello-card.js'
          }
        ]
      },
      'does not match its assetPath'
    ]
  ])('rejects %s before any staged script is loaded', async (_label, value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(value));
    stubBrowser(fetchMock);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('validates ordered assets and explicitly deferred SharePoint component resources', async () => {
    const value: CdnPackageDescriptor = {
      ...descriptor,
      assets: [
        {
          role: 'dependency',
          moduleId: 'WebPartStrings',
          assetPath: 'strings.js',
          assetUrl: `${sessionBase}strings.js`,
          bytes: 512,
          sha256: 'b'.repeat(64),
          stageStatus: 'allowed-and-verified'
        },
        descriptor.assets[0]
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(value));
    stubBrowser(fetchMock);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).resolves.toEqual(value);
  });

  it.each([
    [
      'an entry before a dependency',
      {
        ...descriptor,
        assets: [
          descriptor.assets[0],
          {
            ...descriptor.assets[0],
            role: 'dependency',
            moduleId: 'helper',
            assetPath: 'helper.js',
            assetUrl: `${sessionBase}helper.js`
          }
        ]
      },
      'entry asset must be last'
    ],
    ['no entry asset', { ...descriptor, assets: [{ ...descriptor.assets[0], role: 'dependency' }] }, 'exactly one entry asset'],
    [
      'duplicate asset paths',
      {
        ...descriptor,
        assets: [{ ...descriptor.assets[0], role: 'dependency', moduleId: 'helper' }, descriptor.assets[0]]
      },
      'duplicate script assets'
    ],
    [
      'unverified stage metadata',
      { ...descriptor, assets: [{ ...descriptor.assets[0], stageStatus: 'pending' }] },
      'invalid stageStatus'
    ],
    [
      'forged deferred-resource semantics',
      {
        ...descriptor,
        deferredResources: [
          {
            moduleId: 'react',
            kind: 'npm-package',
            componentId: 'react',
            version: '17.0.1',
            status: 'available',
            reason: 'on-cdn'
          }
        ]
      },
      'invalid status metadata'
    ]
  ])('rejects %s', async (_label, value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(value));
    stubBrowser(fetchMock);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(message);
  });

  it('preserves abort failures from the descriptor request', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    stubBrowser(fetchMock);
    controller.abort();

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, controller.signal)).rejects.toBe(abortError);
  });
});

function stubBrowser(fetchMock: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('window', { location: { origin: 'http://lab.local' } });
  vi.stubGlobal('fetch', fetchMock);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
