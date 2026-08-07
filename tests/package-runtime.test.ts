import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCdnPackageDescriptor, type CdnPackageDescriptor } from '../apps/lab/src/api/packageRuntime';

const digest = 'a'.repeat(64);
const mockOrigin = 'http://127.0.0.1:4400';
const namespacePath = 'apps/hello-card-spfx/versions/1.0.0-20260804/';
const releaseBaseUrl = `${mockOrigin}/${namespacePath}`;
const descriptor: CdnPackageDescriptor = {
  mode: 'cdn',
  appId: 'hello-card-spfx',
  releaseId: '1.0.0-20260804',
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
  packagePath: 'sharepoint/solution/hello-card.sppkg',
  assets: [
    {
      role: 'entry',
      moduleId: 'hello-card',
      assetPath: 'assets/hello-card.js',
      assetUrl: `${releaseBaseUrl}assets/hello-card.js`,
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
    [
      'a CDN base that differs from mock delivery',
      { ...descriptor, cdnBasePath: 'https://cdn.contoso.example/assets/' },
      'must match the selected local mock CDN release URL'
    ],
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
    ['missing delivery metadata', { ...descriptor, delivery: undefined }, 'delivery must be an object'],
    [
      'the Lab origin as delivery origin',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'http://lab.local', bucketBaseUrl: 'http://lab.local/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'localhost instead of the canonical loopback host',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'http://localhost:4400', bucketBaseUrl: 'http://localhost:4400/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'loopback HTTPS instead of local HTTP',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'https://127.0.0.1:4400', bucketBaseUrl: 'https://127.0.0.1:4400/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'a bracketed IPv6 loopback forwarded origin',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'https://[::1]', bucketBaseUrl: 'https://[::1]/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'an IPv6 unspecified forwarded origin',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'https://[::]', bucketBaseUrl: 'https://[::]/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'an IPv4-mapped IPv6 unspecified forwarded origin',
      {
        ...descriptor,
        delivery: {
          ...descriptor.delivery,
          origin: 'https://[::ffff:0.0.0.0]',
          bucketBaseUrl: 'https://[::ffff:0.0.0.0]/'
        }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'an alternative IPv4 loopback forwarded origin',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'https://127.0.0.2', bucketBaseUrl: 'https://127.0.0.2/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'an IPv4-mapped IPv6 loopback forwarded origin',
      {
        ...descriptor,
        delivery: {
          ...descriptor.delivery,
          origin: 'https://[::ffff:127.0.0.1]',
          bucketBaseUrl: 'https://[::ffff:127.0.0.1]/'
        }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'a loopback origin without an explicit port',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, origin: 'http://127.0.0.1', bucketBaseUrl: 'http://127.0.0.1/' }
      },
      'loopback HTTP or forwarded HTTPS origin'
    ],
    [
      'a mismatched app namespace',
      { ...descriptor, delivery: { ...descriptor.delivery, namespacePath: 'apps/other/versions/1.0.0-20260804/' } },
      'namespace does not match'
    ],
    [
      'a forged release base URL',
      { ...descriptor, delivery: { ...descriptor.delivery, releaseBaseUrl: `${mockOrigin}/apps/other/versions/1.0.0/` } },
      'does not match its immutable namespace'
    ],
    [
      'a release URL with a query',
      { ...descriptor, delivery: { ...descriptor.delivery, releaseBaseUrl: `${releaseBaseUrl}?latest=1` } },
      'selected local mock CDN origin'
    ],
    [
      'a release manifest outside the immutable release',
      {
        ...descriptor,
        delivery: { ...descriptor.delivery, releaseManifestUrl: `${mockOrigin}/deployment-manifest.json` }
      },
      'does not match its immutable release'
    ],
    [
      'an asset on another origin',
      { ...descriptor, assets: [{ ...descriptor.assets[0], assetUrl: 'http://127.0.0.1:4401/assets/hello-card.js' }] },
      'selected local mock CDN origin'
    ],
    [
      'an entry outside its immutable release',
      {
        ...descriptor,
        assets: [
          {
            ...descriptor.assets[0],
            assetUrl: `${mockOrigin}/apps/hello-card-spfx/versions/another-release/assets/hello-card.js`
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

  it('rejects a mock CDN that resolves to the Lab origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(descriptor));
    stubBrowser(fetchMock, mockOrigin);

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'separate credential-free loopback HTTP or forwarded HTTPS origin'
    );
  });

  it('accepts an immutable descriptor served through a separately forwarded HTTPS CDN', async () => {
    const publicOrigin = 'https://cdn-preview.example.test';
    const publicReleaseBaseUrl = `${publicOrigin}/${namespacePath}`;
    const forwardedDescriptor: CdnPackageDescriptor = {
      ...descriptor,
      cdnBasePath: publicReleaseBaseUrl,
      delivery: {
        ...descriptor.delivery,
        origin: publicOrigin,
        bucketBaseUrl: `${publicOrigin}/`,
        releaseBaseUrl: publicReleaseBaseUrl,
        releaseManifestUrl: `${publicReleaseBaseUrl}deployment-manifest.json`
      },
      assets: descriptor.assets.map((asset) => ({
        ...asset,
        assetUrl: `${publicReleaseBaseUrl}${asset.assetPath}`
      }))
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(forwardedDescriptor));
    stubBrowser(fetchMock, 'https://lab-preview.example.test');

    await expect(loadCdnPackageDescriptor('hello-card-spfx', undefined, new AbortController().signal)).resolves.toEqual(
      forwardedDescriptor
    );
  });

  it('validates ordered assets and explicitly deferred SharePoint component resources', async () => {
    const value: CdnPackageDescriptor = {
      ...descriptor,
      assets: [
        {
          role: 'dependency',
          moduleId: 'WebPartStrings',
          assetPath: 'strings.js',
          assetUrl: `${releaseBaseUrl}strings.js`,
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
            assetUrl: `${releaseBaseUrl}helper.js`
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

function stubBrowser(fetchMock: ReturnType<typeof vi.fn>, labOrigin = 'http://lab.local'): void {
  vi.stubGlobal('window', { location: { origin: labOrigin } });
  vi.stubGlobal('fetch', fetchMock);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
