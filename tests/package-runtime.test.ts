import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCdnPackage, type CdnPackageDescriptor } from '../apps/lab/src/api/packageRuntime';

const descriptor: CdnPackageDescriptor = {
  mode: 'cdn',
  appId: 'hello-card-spfx',
  releaseId: '1.0.0-20260804',
  generatedAt: '2026-08-04T12:00:00.000Z',
  cdnBasePath: 'https://cdn.contoso.example/spfx/hello-card/versions/1.0.0-20260804/',
  assetBaseUrl: 'http://lab.local/api/lab-packages/cdn-assets/hello-card-spfx/1.0.0-20260804/',
  entryAssetPath: 'assets/hello-card.js',
  entryAssetUrl: 'http://lab.local/api/lab-packages/cdn-assets/hello-card-spfx/1.0.0-20260804/assets/hello-card.js',
  packagePath: 'sharepoint/solution/hello-card.sppkg',
  dependencyAssets: []
};

const executableEntry = `
define('fixture-web-part', ['@microsoft/sp-webpart-base'], function (spWebPartBase) {
  return {
    default: class FixtureWebPart extends spWebPartBase.BaseClientSideWebPart {
      render() {}
    }
  };
});`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadCdnPackage', () => {
  it('loads and evaluates the real AMD entry asset with the caller signal', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptor))
      .mockResolvedValueOnce(javascriptResponse(executableEntry));
    stubBrowser(fetchMock);

    const loaded = await loadCdnPackage('hello-card-spfx', 'component:default', controller.signal);
    expect(loaded.descriptor).toEqual(descriptor);
    expect(new loaded.WebPart().render).toBeTypeOf('function');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/lab-packages/cdn?app=hello-card-spfx&component=component%3Adefault', {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, descriptor.entryAssetUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
  });

  it('omits an undefined component id from the descriptor request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptor))
      .mockResolvedValueOnce(javascriptResponse(executableEntry));
    stubBrowser(fetchMock);

    await loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/lab-packages/cdn?app=hello-card-spfx');
  });

  it('surfaces descriptor endpoint errors without loading an asset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'No staged CDN release exists for this app.' }, 404));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'CDN package descriptor request failed with status 404: No staged CDN release exists for this app.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a non-object response', [], 'must be an object'],
    ['the wrong mode', { ...descriptor, mode: 'standalone' }, 'invalid mode'],
    ['a different app', { ...descriptor, appId: 'another-app' }, 'does not match the selected app'],
    ['an invalid release id', { ...descriptor, releaseId: 'latest' }, 'releaseId is invalid'],
    ['an invalid generated time', { ...descriptor, generatedAt: 'yesterday' }, 'generatedAt is invalid'],
    ['an insecure CDN base', { ...descriptor, cdnBasePath: 'http://cdn.contoso.example/assets/' }, 'credential-free HTTPS'],
    ['an unsafe entry path', { ...descriptor, entryAssetPath: '../entry.js' }, 'safe relative path'],
    ['an unsafe package path', { ...descriptor, packagePath: 'C:\\package.sppkg' }, 'safe relative path'],
    ['missing dependencies', { ...descriptor, dependencyAssets: undefined }, 'dependencyAssets must be an array'],
    [
      'an off-origin asset base',
      { ...descriptor, assetBaseUrl: 'https://evil.example/api/lab-packages/cdn-assets/' },
      'Lab CDN asset API'
    ],
    ['a non-API asset base', { ...descriptor, assetBaseUrl: 'http://lab.local/assets/' }, 'Lab CDN asset API'],
    [
      'an entry outside its asset base',
      {
        ...descriptor,
        entryAssetUrl: 'http://lab.local/api/lab-packages/cdn-assets/another-release/assets/hello-card.js'
      },
      'does not match entryAssetPath'
    ]
  ])('rejects %s before loading the entry asset', async (_label, value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(value));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a zero-byte response', ''],
    ['a whitespace-only response', '  \n\t']
  ])('fails closed for %s', async (_label, body) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(descriptor)).mockResolvedValueOnce(javascriptResponse(body));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'CDN entry asset is empty.'
    );
  });

  it('fails closed when the entry asset cannot be fetched', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptor))
      .mockResolvedValueOnce(javascriptResponse('Not found', 404));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'CDN entry asset failed with status 404.'
    );
  });

  it('preserves abort failures from the descriptor request', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    stubBrowser(fetchMock);
    controller.abort();

    await expect(loadCdnPackage('hello-card-spfx', undefined, controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith('/api/lab-packages/cdn?app=hello-card-spfx', {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
  });

  it('fails closed when the entry endpoint does not return JavaScript', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptor))
      .mockResolvedValueOnce(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'CDN entry asset did not return JavaScript content.'
    );
  });

  it('loads validated path dependencies before resolving the staged entry module', async () => {
    const descriptorWithDependency: CdnPackageDescriptor = {
      ...descriptor,
      dependencyAssets: [
        {
          moduleId: 'WebPartStrings',
          assetPath: 'strings.js',
          assetUrl: 'http://lab.local/api/lab-packages/cdn-assets/hello-card-spfx/1.0.0-20260804/strings.js'
        }
      ]
    };
    const dependentEntry = `
      define('fixture-web-part', ['@microsoft/sp-webpart-base', 'WebPartStrings'], function (base, strings) {
        return { default: class extends base.BaseClientSideWebPart { render() { return strings.Title; } } };
      });`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptorWithDependency))
      .mockResolvedValueOnce(javascriptResponse(`define([], function () { return { Title: 'From CDN' }; });`))
      .mockResolvedValueOnce(javascriptResponse(dependentEntry));
    stubBrowser(fetchMock);

    const loaded = await loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal);

    expect(new loaded.WebPart().render()).toBe('From CDN');
    expect(fetchMock).toHaveBeenNthCalledWith(2, descriptorWithDependency.dependencyAssets[0].assetUrl, expect.any(Object));
  });

  it('fails closed instead of substituting the local adapter for an unsupported package dependency', async () => {
    const unsupportedEntry = `define('fixture-web-part', ['unavailable-module'], function () { return {}; });`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(descriptor))
      .mockResolvedValueOnce(javascriptResponse(unsupportedEntry));
    stubBrowser(fetchMock);

    await expect(loadCdnPackage('hello-card-spfx', undefined, new AbortController().signal)).rejects.toThrow(
      'CDN package requires unsupported module "unavailable-module".'
    );
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

function javascriptResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
}
