import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CDN_SMOKE_MESSAGE_SOURCE, parseCdnSmokeMessage } from '../apps/lab/src/lib/cdnSmokeProtocol';

const origin = 'http://127.0.0.1:4173';
const mockOrigin = 'http://127.0.0.1:4174';
const releaseBaseUrl = `${mockOrigin}/apps/hello-card-spfx/versions/1.0.0-20260804T120000000Z-browser01/`;
const workerSource = readFileSync(new URL('../apps/lab/src/workers/cdnSmokeWorker.js', import.meta.url), 'utf8');

describe('actual staged CDN smoke-check worker', () => {
  it('loads only assets under the selected immutable mock-CDN release and reports registration evidence', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
      } else if (url.endsWith('/hello-card.js')) {
        worker.define?.('hello-card-web-part', ['WebPartStrings'], () => undefined);
      }
    });

    harness.dispatch({
      requestId: 'request-1',
      deliveryOrigin: mockOrigin,
      releaseBaseUrl,
      assets: [
        { path: 'strings.js', url: `${releaseBaseUrl}strings.js` },
        { path: 'assets/hello-card.js', url: `${releaseBaseUrl}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toEqual([`${releaseBaseUrl}strings.js`, `${releaseBaseUrl}assets/hello-card.js`]);
    expect(harness.messages.at(-1)).toEqual(
      expect.objectContaining({
        source: CDN_SMOKE_MESSAGE_SOURCE,
        requestId: 'request-1',
        status: 'ready',
        loadedAssetPaths: ['strings.js', 'assets/hello-card.js'],
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'assets/hello-card.js', status: 'loaded', registrationCount: 1 }
        ]
      })
    );
    expect(harness.messages.slice(0, -1)).toEqual([
      expect.objectContaining({
        status: 'progress',
        assetEvidence: [{ path: 'strings.js', status: 'loading', registrationCount: 0 }]
      }),
      expect.objectContaining({
        status: 'progress',
        assetEvidence: [{ path: 'strings.js', status: 'loaded', registrationCount: 1 }]
      }),
      expect.objectContaining({
        status: 'progress',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'assets/hello-card.js', status: 'loading', registrationCount: 0 }
        ]
      }),
      expect.objectContaining({
        status: 'progress',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'assets/hello-card.js', status: 'loaded', registrationCount: 1 }
        ]
      })
    ]);
  });

  it('accepts a separately forwarded HTTPS CDN origin with the same immutable-release rules', () => {
    const publicOrigin = 'https://cdn-preview.example.test';
    const publicReleaseBaseUrl = `${publicOrigin}/apps/hello-card-spfx/versions/1.0.0-20260804T120000000Z-browser01/`;
    const harness = createWorkerHarness((_url, worker) => {
      worker.define?.('hello-card-web-part', [], () => undefined);
    });

    harness.dispatch({
      requestId: 'request-forwarded',
      deliveryOrigin: publicOrigin,
      releaseBaseUrl: publicReleaseBaseUrl,
      assets: [{ path: 'assets/hello-card.js', url: `${publicReleaseBaseUrl}assets/hello-card.js` }]
    });

    expect(harness.loadedUrls).toEqual([`${publicReleaseBaseUrl}assets/hello-card.js`]);
    expect(harness.messages.at(-1)).toEqual(expect.objectContaining({ requestId: 'request-forwarded', status: 'ready' }));
  });

  it.each(['https://[::1]', 'https://127.0.0.2', 'https://[::ffff:127.0.0.1]'])(
    'rejects loopback CDN origin %s before importScripts runs',
    (loopbackOrigin) => {
      const harness = createWorkerHarness();

      harness.dispatch({
        requestId: 'request-ipv6-loopback',
        deliveryOrigin: loopbackOrigin,
        releaseBaseUrl: `${loopbackOrigin}/apps/hello-card-spfx/versions/1.0.0-20260804T120000000Z-browser01/`,
        assets: [
          {
            path: 'entry.js',
            url: `${loopbackOrigin}/apps/hello-card-spfx/versions/1.0.0-20260804T120000000Z-browser01/entry.js`
          }
        ]
      });

      expect(harness.loadedUrls).toEqual([]);
      expect(harness.messages.at(-1)).toEqual(
        expect.objectContaining({ status: 'error', message: expect.stringContaining('loopback HTTP or forwarded HTTPS') })
      );
    }
  );

  it.each([
    ['wrong origin URL', 'http://127.0.0.1:4199/apps/hello-card-spfx/versions/1.0.0/entry.js'],
    ['Lab-origin URL', `${origin}/apps/hello-card-spfx/versions/1.0.0/entry.js`],
    ['wrong release URL', `${mockOrigin}/apps/hello-card-spfx/versions/2.0.0/entry.js`],
    ['query-bearing URL', `${releaseBaseUrl}entry.js?untrusted=1`],
    ['encoded traversal URL', `${releaseBaseUrl}%2e%2e/secret.js`]
  ])('rejects a %s before importScripts runs', (_label, url) => {
    const harness = createWorkerHarness();

    harness.dispatch({
      requestId: 'request-1',
      deliveryOrigin: mockOrigin,
      releaseBaseUrl,
      assets: [{ path: 'entry.js', url }]
    });

    expect(harness.loadedUrls).toEqual([]);
    expect(harness.messages.at(-1)).toEqual(
      expect.objectContaining({
        requestId: 'request-1',
        status: 'error',
        message: expect.stringContaining('selected mock-CDN release')
      })
    );
  });

  it('fails when a dependency registers but the entry script does not', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
      }
    });

    harness.dispatch({
      requestId: 'request-1',
      deliveryOrigin: mockOrigin,
      releaseBaseUrl,
      assets: [
        { path: 'strings.js', url: `${releaseBaseUrl}strings.js` },
        { path: 'assets/hello-card.js', url: `${releaseBaseUrl}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toHaveLength(2);
    expect(harness.messages.at(-1)).toEqual(
      expect.objectContaining({
        requestId: 'request-1',
        status: 'error',
        message: 'The staged entry script loaded but did not register an AMD module.',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'assets/hello-card.js', status: 'failed', registrationCount: 0 }
        ]
      })
    );
  });

  it('reports the exact failed asset after preserving prior loaded evidence', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
        return;
      }
      throw new Error('The selected staged asset was blocked.');
    });

    harness.dispatch({
      requestId: 'request-1',
      deliveryOrigin: mockOrigin,
      releaseBaseUrl,
      assets: [
        { path: 'strings.js', url: `${releaseBaseUrl}strings.js` },
        { path: 'assets/hello-card.js', url: `${releaseBaseUrl}assets/hello-card.js` }
      ]
    });

    expect(harness.messages.at(-1)).toEqual(
      expect.objectContaining({
        requestId: 'request-1',
        status: 'error',
        message: 'The selected staged asset was blocked.',
        assetEvidence: [
          { path: 'strings.js', status: 'loaded', registrationCount: 1 },
          { path: 'assets/hello-card.js', status: 'failed', registrationCount: 0 }
        ]
      })
    );
  });

  it('uses captured native loading and messaging functions after a dependency tries to replace them', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
        worker.importScripts = () => {
          throw new Error('A staged dependency replaced importScripts.');
        };
        worker.postMessage = () => undefined;
      } else if (url.endsWith('/hello-card.js')) {
        worker.define?.('hello-card-web-part', ['WebPartStrings'], () => undefined);
      }
    });

    harness.dispatch({
      requestId: 'request-1',
      deliveryOrigin: mockOrigin,
      releaseBaseUrl,
      assets: [
        { path: 'strings.js', url: `${releaseBaseUrl}strings.js` },
        { path: 'assets/hello-card.js', url: `${releaseBaseUrl}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toEqual([`${releaseBaseUrl}strings.js`, `${releaseBaseUrl}assets/hello-card.js`]);
    expect(harness.messages.at(-1)).toEqual(expect.objectContaining({ requestId: 'request-1', status: 'ready' }));
  });
});

describe('staged CDN smoke-check parent protocol', () => {
  it('accepts internally consistent evidence with an entry registration', () => {
    expect(
      parseCdnSmokeMessage(
        {
          source: CDN_SMOKE_MESSAGE_SOURCE,
          requestId: 'request-1',
          status: 'ready',
          loadedAssetPaths: ['strings.js', 'assets/hello-card.js'],
          assetEvidence: [
            { path: 'strings.js', status: 'loaded', registrationCount: 1 },
            { path: 'assets/hello-card.js', status: 'loaded', registrationCount: 1 }
          ],
          registrations: [
            { moduleId: 'WebPartStrings', dependencyCount: 0 },
            { moduleId: 'hello-card-web-part', dependencyCount: 1 }
          ]
        },
        'request-1'
      )
    ).toMatchObject({ status: 'ready', loadedAssetPaths: ['strings.js', 'assets/hello-card.js'] });
  });

  it('ignores forged, stale, or entry-registration-free messages', () => {
    const baseMessage = {
      source: CDN_SMOKE_MESSAGE_SOURCE,
      requestId: 'request-1',
      status: 'ready',
      loadedAssetPaths: ['strings.js', 'assets/hello-card.js'],
      assetEvidence: [
        { path: 'strings.js', status: 'loaded', registrationCount: 1 },
        { path: 'assets/hello-card.js', status: 'loaded', registrationCount: 0 }
      ],
      registrations: [{ moduleId: 'WebPartStrings', dependencyCount: 0 }]
    };
    expect(parseCdnSmokeMessage({ ...baseMessage, requestId: 'another-request' }, 'request-1')).toBeUndefined();
    expect(parseCdnSmokeMessage(baseMessage, 'request-1')).toBeUndefined();
  });

  it('accepts ordered progress and terminal failure evidence but rejects duplicate paths', () => {
    expect(
      parseCdnSmokeMessage(
        {
          source: CDN_SMOKE_MESSAGE_SOURCE,
          requestId: 'request-1',
          status: 'progress',
          assetEvidence: [
            { path: 'strings.js', status: 'loaded', registrationCount: 1 },
            { path: 'entry.js', status: 'loading', registrationCount: 0 }
          ]
        },
        'request-1'
      )
    ).toMatchObject({ status: 'progress' });
    expect(
      parseCdnSmokeMessage(
        {
          source: CDN_SMOKE_MESSAGE_SOURCE,
          requestId: 'request-1',
          status: 'error',
          message: 'blocked',
          assetEvidence: [{ path: 'entry.js', status: 'failed', registrationCount: 0 }]
        },
        'request-1'
      )
    ).toMatchObject({ status: 'error' });
    expect(
      parseCdnSmokeMessage(
        {
          source: CDN_SMOKE_MESSAGE_SOURCE,
          requestId: 'request-1',
          status: 'progress',
          assetEvidence: [
            { path: 'entry.js', status: 'loaded', registrationCount: 1 },
            { path: 'entry.js', status: 'loading', registrationCount: 0 }
          ]
        },
        'request-1'
      )
    ).toBeUndefined();
  });
});

interface WorkerHarness {
  dispatch: (data: unknown) => void;
  loadedUrls: string[];
  messages: unknown[];
}

interface FakeWorkerScope {
  define?: (...args: unknown[]) => void;
  importScripts: (url: string) => void;
  postMessage: (message: unknown) => void;
}

function createWorkerHarness(onImport?: (url: string, worker: FakeWorkerScope) => void): WorkerHarness {
  let messageHandler: ((event: { data: unknown }) => void) | undefined;
  const loadedUrls: string[] = [];
  const messages: unknown[] = [];
  const worker: FakeWorkerScope & {
    location: { origin: string };
    addEventListener: (type: string, handler: (event: { data: unknown }) => void) => void;
  } = {
    location: { origin },
    addEventListener: (type, handler) => {
      if (type === 'message') {
        messageHandler = handler;
      }
    },
    importScripts: (url) => {
      loadedUrls.push(url);
      onImport?.(url, worker);
    },
    postMessage: (message) => messages.push(message)
  };
  runInNewContext(workerSource, { self: worker, URL, decodeURIComponent });
  if (!messageHandler) {
    throw new Error('The actual CDN smoke worker did not register its message handler.');
  }
  return {
    dispatch: (data) => messageHandler?.({ data }),
    loadedUrls,
    messages
  };
}
