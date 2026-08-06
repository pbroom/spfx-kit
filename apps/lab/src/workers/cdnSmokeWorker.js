(() => {
  'use strict';

  const MESSAGE_SOURCE = 'spfx-kit-cdn-smoke-check';

  self.addEventListener('message', (event) => {
    const loadScript = self.importScripts.bind(self);
    const postEvidence = self.postMessage.bind(self);
    let requestId = '';
    const loadedAssetPaths = [];
    const registrations = [];
    const assetEvidence = [];
    try {
      if (isRecord(event.data) && typeof event.data.requestId === 'string') {
        requestId = event.data.requestId;
      }
      const request = validateRequest(event.data);
      requestId = request.requestId;
      const define = (...args) => {
        const named = typeof args[0] === 'string';
        const dependencies = args[named ? 1 : 0];
        if (!Array.isArray(dependencies) || !dependencies.every((item) => typeof item === 'string')) {
          throw new Error('A staged script used an unsupported AMD registration shape.');
        }
        registrations.push({
          moduleId: named ? args[0] : '(anonymous)',
          dependencyCount: dependencies.length
        });
      };
      Object.assign(define, { amd: Object.freeze({}) });
      Object.defineProperty(self, 'define', { value: define, configurable: false, writable: false });

      for (const asset of request.assets) {
        const registrationsBeforeLoad = registrations.length;
        const evidence = { path: asset.path, status: 'loading', registrationCount: 0 };
        assetEvidence.push(evidence);
        postEvidence({
          source: MESSAGE_SOURCE,
          requestId,
          status: 'progress',
          assetEvidence: assetEvidence.map(copyAssetEvidence)
        });
        try {
          loadScript(asset.url);
        } catch (error) {
          evidence.status = 'failed';
          evidence.registrationCount = registrations.length - registrationsBeforeLoad;
          throw error;
        }
        loadedAssetPaths.push(asset.path);
        evidence.status = 'loaded';
        evidence.registrationCount = registrations.length - registrationsBeforeLoad;
        postEvidence({
          source: MESSAGE_SOURCE,
          requestId,
          status: 'progress',
          assetEvidence: assetEvidence.map(copyAssetEvidence)
        });
      }
      const entryEvidence = assetEvidence[assetEvidence.length - 1];
      if (!entryEvidence || entryEvidence.registrationCount === 0) {
        if (entryEvidence) {
          entryEvidence.status = 'failed';
        }
        throw new Error('The staged entry script loaded but did not register an AMD module.');
      }
      postEvidence({
        source: MESSAGE_SOURCE,
        requestId,
        status: 'ready',
        loadedAssetPaths,
        assetEvidence: assetEvidence.map(copyAssetEvidence),
        registrations
      });
    } catch (error) {
      postEvidence({
        source: MESSAGE_SOURCE,
        requestId,
        status: 'error',
        message:
          error && typeof error === 'object' && typeof error.message === 'string'
            ? error.message
            : 'The staged CDN smoke check failed.',
        assetEvidence: assetEvidence.map(copyAssetEvidence)
      });
    }
  });

  function copyAssetEvidence(evidence) {
    return {
      path: evidence.path,
      status: evidence.status,
      registrationCount: evidence.registrationCount
    };
  }

  function validateRequest(value) {
    if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId || value.requestId.length > 200) {
      throw new Error('The staged CDN smoke-check request id is invalid.');
    }
    if (!Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > 100) {
      throw new Error('The staged CDN smoke-check asset list is invalid.');
    }
    const deliveryOrigin = validateDeliveryOrigin(value.deliveryOrigin);
    const releaseBaseUrl = validateReleaseBaseUrl(value.releaseBaseUrl, deliveryOrigin);
    const seenPaths = new Set();
    const assets = value.assets.map((asset, index) => {
      if (!isRecord(asset) || typeof asset.path !== 'string' || !isPortablePath(asset.path)) {
        throw new Error(`Staged CDN smoke-check asset ${index} has an invalid path.`);
      }
      if (seenPaths.has(asset.path)) {
        throw new Error('The staged CDN smoke-check contains duplicate asset paths.');
      }
      seenPaths.add(asset.path);
      if (typeof asset.url !== 'string') {
        throw new Error(`Staged CDN smoke-check asset ${index} has an invalid URL.`);
      }
      const url = tryParseUrl(asset.url);
      const expectedUrl = new URL(encodePortablePath(asset.path), releaseBaseUrl);
      if (
        !url ||
        url.href !== expectedUrl.href ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        hasUnsafeRawUrlPath(asset.url) ||
        hasUnsafeEncodedPath(url.pathname)
      ) {
        throw new Error(`Staged CDN smoke-check asset ${index} must stay within the selected mock-CDN release.`);
      }
      return { path: asset.path, url: url.href };
    });
    return { requestId: value.requestId, assets };
  }

  function validateDeliveryOrigin(value) {
    if (typeof value !== 'string') {
      throw new Error('The staged CDN smoke-check delivery origin is invalid.');
    }
    const url = tryParseUrl(value);
    const loopback = url?.protocol === 'http:' && isCanonicalLoopbackHostname(url.hostname) && Boolean(url.port);
    const forwarded =
      url?.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !isUnspecifiedHostname(url.hostname) &&
      !isLoopbackHostname(url.hostname);
    if (
      !url ||
      (!loopback && !forwarded) ||
      url.origin === self.location.origin ||
      url.href !== `${url.origin}/` ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('The staged CDN smoke-check requires a separate loopback HTTP or forwarded HTTPS mock-CDN origin.');
    }
    return url.origin;
  }

  function isCanonicalLoopbackHostname(value) {
    return String(value).trim().toLowerCase() === '127.0.0.1';
  }

  function isLoopbackHostname(value) {
    const hostname = String(value)
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/, '');
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname === '::1' ||
      /^::(?:ffff:)?7f[\da-f]{2}:[\da-f]{1,4}$/.test(hostname)
    );
  }

  function isUnspecifiedHostname(value) {
    const hostname = String(value)
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '');
    return hostname === '0.0.0.0' || hostname === '::' || hostname === '::ffff:0:0' || hostname === '::ffff:0.0.0.0';
  }

  function validateReleaseBaseUrl(value, deliveryOrigin) {
    if (typeof value !== 'string') {
      throw new Error('The staged CDN smoke-check release base URL is invalid.');
    }
    const url = tryParseUrl(value);
    const segments = url ? url.pathname.split('/').filter(Boolean) : [];
    if (
      !url ||
      url.origin !== deliveryOrigin ||
      !url.pathname.endsWith('/') ||
      segments.length !== 4 ||
      segments[0] !== 'apps' ||
      segments[2] !== 'versions' ||
      !isSafeNamespaceSegment(segments[1]) ||
      !isSafeNamespaceSegment(segments[3]) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      hasUnsafeRawUrlPath(value) ||
      hasUnsafeEncodedPath(url.pathname)
    ) {
      throw new Error('The staged CDN smoke-check release base URL is outside the selected immutable app release.');
    }
    return url;
  }

  function isSafeNamespaceSegment(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) && encodeURIComponent(value) === value;
  }

  function encodePortablePath(value) {
    return value
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  function isPortablePath(value) {
    return (
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#') &&
      !/^[A-Za-z]:/.test(value) &&
      !hasControlCharacter(value) &&
      value.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..')
    );
  }

  function hasUnsafeRawUrlPath(value) {
    const authorityStart = value.indexOf('://');
    const pathnameStart = authorityStart < 0 ? -1 : value.indexOf('/', authorityStart + 3);
    if (pathnameStart < 0) {
      return false;
    }
    const queryStart = value.search(/[?#]/);
    const pathname = value.slice(pathnameStart, queryStart >= pathnameStart ? queryStart : undefined);
    return hasUnsafeEncodedPath(pathname);
  }

  function hasUnsafeEncodedPath(pathname) {
    try {
      return pathname.split('/').some((segment) => {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
      });
    } catch {
      return true;
    }
  }

  function hasControlCharacter(value) {
    return [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  }

  function tryParseUrl(value) {
    try {
      return new URL(value);
    } catch {
      return undefined;
    }
  }

  function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
})();
