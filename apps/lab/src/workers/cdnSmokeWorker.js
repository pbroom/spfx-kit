(() => {
  'use strict';

  const MESSAGE_SOURCE = 'spfx-kit-cdn-smoke-check';
  const ASSET_API_PREFIX = '/api/lab-packages/cdn-assets/';

  self.addEventListener('message', (event) => {
    const loadScript = self.importScripts.bind(self);
    const postEvidence = self.postMessage.bind(self);
    let requestId = '';
    try {
      if (isRecord(event.data) && typeof event.data.requestId === 'string') {
        requestId = event.data.requestId;
      }
      const request = validateRequest(event.data);
      requestId = request.requestId;
      const loadedAssetPaths = [];
      const registrations = [];
      const assetEvidence = [];
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
        loadScript(asset.url);
        loadedAssetPaths.push(asset.path);
        assetEvidence.push({
          path: asset.path,
          registrationCount: registrations.length - registrationsBeforeLoad
        });
      }
      const entryEvidence = assetEvidence[assetEvidence.length - 1];
      if (!entryEvidence || entryEvidence.registrationCount === 0) {
        throw new Error('The staged entry script loaded but did not register an AMD module.');
      }
      postEvidence({
        source: MESSAGE_SOURCE,
        requestId,
        status: 'ready',
        loadedAssetPaths,
        assetEvidence,
        registrations
      });
    } catch (error) {
      postEvidence({
        source: MESSAGE_SOURCE,
        requestId,
        status: 'error',
        message: error instanceof Error ? error.message : 'The staged CDN smoke check failed.'
      });
    }
  });

  function validateRequest(value) {
    if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId || value.requestId.length > 200) {
      throw new Error('The staged CDN smoke-check request id is invalid.');
    }
    if (!Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > 100) {
      throw new Error('The staged CDN smoke-check asset list is invalid.');
    }
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
      if (
        !url ||
        url.origin !== self.location.origin ||
        !url.pathname.startsWith(ASSET_API_PREFIX) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        hasUnsafeRawUrlPath(asset.url) ||
        hasUnsafeEncodedPath(url.pathname)
      ) {
        throw new Error(`Staged CDN smoke-check asset ${index} must stay within the Lab CDN asset API.`);
      }
      return { path: asset.path, url: url.href };
    });
    return { requestId: value.requestId, assets };
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
