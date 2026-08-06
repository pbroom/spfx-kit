import { createServer } from 'node:http';
import {
  loadMockCdnAppRelease,
  normalizeMockCdnOrigin,
  readMockCdnReleaseAsset,
  readMockCdnReleaseManifest,
  readSelectedMockCdnAppReference
} from './mock-cdn-bucket.mjs';
import { assertPortableAssetPath, normalizeCdnReleaseId } from './cdn-stage-paths.mjs';

export function normalizeMockCdnLabOrigin(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Mock CDN Lab origin must be a valid HTTP(S) origin: ${value}`);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Mock CDN Lab origin must be a credential-free HTTP(S) origin with no path: ${value}`);
  }
  return url.origin;
}

export function createMockCdnRequestHandler({ bucketRoot, origin, labOrigin }) {
  const configuredOrigin = normalizeMockCdnOrigin(origin);
  const configuredLabOrigin = normalizeMockCdnLabOrigin(labOrigin);
  const configuredHost = new URL(configuredOrigin).host.toLowerCase();
  const releaseCache = new Map();

  return async (req, res) => {
    setCorsHeaders(res, configuredLabOrigin);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (String(req.headers.host || '').toLowerCase() !== configuredHost) {
        throw new MockCdnHttpError(421, 'Mock CDN request host does not match its configured origin.');
      }
      if (Array.isArray(req.headers.origin)) {
        throw new MockCdnHttpError(403, 'Mock CDN requests must contain at most one Origin header.');
      }
      const requestOrigin = req.headers.origin;
      if (requestOrigin && requestOrigin !== configuredLabOrigin) {
        throw new MockCdnHttpError(403, 'Mock CDN requests are allowed only from the configured Lab origin.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        throw new MockCdnHttpError(405, 'Method not allowed.');
      }
      const route = parseMockCdnAssetRoute(req.url);
      if (route.namespace !== 'app') {
        throw new MockCdnHttpError(404, 'Mock CDN shared resource release was not found.');
      }

      let selected;
      try {
        selected = await readSelectedMockCdnAppReference({ bucketRoot, appId: route.releaseName });
      } catch {
        throw new MockCdnHttpError(404, 'Mock CDN app release was not found.');
      }
      if (selected.releaseId !== route.releaseId) {
        throw new MockCdnHttpError(404, 'Mock CDN app release is not selected.');
      }
      const cacheKey = `${route.releaseName}\0${route.releaseId}\0${selected.deploymentManifestSha256}`;
      let release = releaseCache.get(cacheKey);
      if (!release) {
        try {
          release = await loadMockCdnAppRelease({
            bucketRoot,
            origin: configuredOrigin,
            appId: route.releaseName,
            releaseId: route.releaseId
          });
        } catch {
          throw new MockCdnHttpError(409, 'Selected mock CDN app release is invalid.');
        }
        if (release.manifestSha256 !== selected.deploymentManifestSha256) {
          throw new MockCdnHttpError(409, 'Selected mock CDN release checksum does not match its pointer.');
        }
        releaseCache.set(cacheKey, release);
        trimCache(releaseCache);
      }

      let asset;
      try {
        asset =
          route.assetPath === 'deployment-manifest.json'
            ? await readMockCdnReleaseManifest(release)
            : await readMockCdnReleaseAsset(release, route.assetPath);
      } catch {
        throw new MockCdnHttpError(404, 'Mock CDN asset is unavailable or failed its integrity check.');
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', asset.contentType);
      res.setHeader('Content-Length', String(asset.bytes.length));
      res.setHeader('ETag', asset.etag);
      if (singleHeader(req.headers['if-none-match']) === asset.etag) {
        res.statusCode = 304;
        res.removeHeader('Content-Length');
        res.end();
        return;
      }
      res.statusCode = 200;
      res.end(req.method === 'HEAD' ? undefined : asset.bytes);
    } catch (error) {
      const requestError = error instanceof MockCdnHttpError ? error : new MockCdnHttpError(404, 'Mock CDN asset was not found.');
      res.statusCode = requestError.statusCode;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : `${requestError.message}\n`);
    }
  };
}

export function createMockCdnServer(options) {
  return createServer(createMockCdnRequestHandler(options));
}

export async function listenMockCdnServer(options) {
  const origin = normalizeMockCdnOrigin(options.origin);
  const url = new URL(origin);
  const server = createMockCdnServer({ ...options, origin });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(Number(url.port || 80), url.hostname);
  });
  return {
    origin,
    server,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

export function parseMockCdnAssetRoute(requestUrl) {
  const url = new URL(String(requestUrl || '/'), 'http://mock-cdn.invalid');
  if (url.search || url.hash) {
    throw new MockCdnHttpError(404, 'Mock CDN asset URL must not contain a query or fragment.');
  }
  const rawSegments = url.pathname.split('/').slice(1);
  if (rawSegments.length < 5 || rawSegments[2] !== 'versions') {
    throw new MockCdnHttpError(404, 'Mock CDN asset route was not found.');
  }
  const namespace = rawSegments[0];
  if (namespace !== 'apps' && namespace !== 'shared') {
    throw new MockCdnHttpError(404, 'Mock CDN namespace was not found.');
  }
  const decoded = rawSegments.map(decodeSafeSegment);
  const releaseName = normalizeReleaseName(decoded[1]);
  const releaseId = normalizeCdnReleaseId(decoded[3]);
  const assetPath = decoded.slice(4).join('/');
  assertPortableAssetPath(assetPath, 'Mock CDN asset path');
  return {
    namespace: namespace === 'apps' ? 'app' : 'shared',
    releaseName,
    releaseId,
    assetPath
  };
}

function decodeSafeSegment(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new MockCdnHttpError(404, 'Mock CDN asset route has invalid encoding.');
  }
  if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
    throw new MockCdnHttpError(404, 'Mock CDN asset route has an unsafe segment.');
  }
  return decoded;
}

function normalizeReleaseName(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new MockCdnHttpError(404, 'Mock CDN release name is invalid.');
  }
  return value;
}

function setCorsHeaders(res, labOrigin) {
  res.setHeader('Access-Control-Allow-Origin', labOrigin);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Vary', 'Origin');
}

function singleHeader(value) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return value;
}

function trimCache(cache) {
  const maximumCachedReleases = 64;
  while (cache.size > maximumCachedReleases) {
    cache.delete(cache.keys().next().value);
  }
}

class MockCdnHttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
