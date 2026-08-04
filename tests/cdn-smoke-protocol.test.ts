import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CDN_SMOKE_MESSAGE_SOURCE, parseCdnSmokeMessage } from '../apps/lab/src/lib/cdnSmokeProtocol';

const origin = 'http://lab.local';
const sessionBase = `${origin}/api/lab-packages/cdn-assets/session-id/`;
const workerSource = readFileSync(new URL('../apps/lab/src/workers/cdnSmokeWorker.js', import.meta.url), 'utf8');

describe('actual staged CDN smoke-check worker', () => {
  it('loads only safe, same-origin Lab assets and reports registration evidence per asset', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
      } else if (url.endsWith('/hello-card.js')) {
        worker.define?.('hello-card-web-part', ['WebPartStrings'], () => undefined);
      }
    });

    harness.dispatch({
      requestId: 'request-1',
      assets: [
        { path: 'strings.js', url: `${sessionBase}strings.js` },
        { path: 'assets/hello-card.js', url: `${sessionBase}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toEqual([`${sessionBase}strings.js`, `${sessionBase}assets/hello-card.js`]);
    expect(harness.messages).toEqual([
      expect.objectContaining({
        source: CDN_SMOKE_MESSAGE_SOURCE,
        requestId: 'request-1',
        status: 'ready',
        loadedAssetPaths: ['strings.js', 'assets/hello-card.js'],
        assetEvidence: [
          { path: 'strings.js', registrationCount: 1 },
          { path: 'assets/hello-card.js', registrationCount: 1 }
        ]
      })
    ]);
  });

  it.each([
    ['cross-origin URL', 'https://evil.example/api/lab-packages/cdn-assets/session-id/entry.js'],
    ['non-API URL', `${origin}/entry.js`],
    ['query-bearing URL', `${sessionBase}entry.js?untrusted=1`],
    ['encoded traversal URL', `${sessionBase}%2e%2e/secret.js`]
  ])('rejects a %s before importScripts runs', (_label, url) => {
    const harness = createWorkerHarness();

    harness.dispatch({ requestId: 'request-1', assets: [{ path: 'assets/hello-card.js', url }] });

    expect(harness.loadedUrls).toEqual([]);
    expect(harness.messages).toEqual([
      expect.objectContaining({
        requestId: 'request-1',
        status: 'error',
        message: expect.stringContaining('Lab CDN asset API')
      })
    ]);
  });

  it('fails when a dependency registers but the entry script does not', () => {
    const harness = createWorkerHarness((url, worker) => {
      if (url.endsWith('/strings.js')) {
        worker.define?.('WebPartStrings', [], () => undefined);
      }
    });

    harness.dispatch({
      requestId: 'request-1',
      assets: [
        { path: 'strings.js', url: `${sessionBase}strings.js` },
        { path: 'assets/hello-card.js', url: `${sessionBase}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toHaveLength(2);
    expect(harness.messages).toEqual([
      expect.objectContaining({
        requestId: 'request-1',
        status: 'error',
        message: 'The staged entry script loaded but did not register an AMD module.'
      })
    ]);
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
      assets: [
        { path: 'strings.js', url: `${sessionBase}strings.js` },
        { path: 'assets/hello-card.js', url: `${sessionBase}assets/hello-card.js` }
      ]
    });

    expect(harness.loadedUrls).toEqual([`${sessionBase}strings.js`, `${sessionBase}assets/hello-card.js`]);
    expect(harness.messages).toEqual([expect.objectContaining({ requestId: 'request-1', status: 'ready' })]);
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
            { path: 'strings.js', registrationCount: 1 },
            { path: 'assets/hello-card.js', registrationCount: 1 }
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
        { path: 'strings.js', registrationCount: 1 },
        { path: 'assets/hello-card.js', registrationCount: 0 }
      ],
      registrations: [{ moduleId: 'WebPartStrings', dependencyCount: 0 }]
    };
    expect(parseCdnSmokeMessage({ ...baseMessage, requestId: 'another-request' }, 'request-1')).toBeUndefined();
    expect(parseCdnSmokeMessage(baseMessage, 'request-1')).toBeUndefined();
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
