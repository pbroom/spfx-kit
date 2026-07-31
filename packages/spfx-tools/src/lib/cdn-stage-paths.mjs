import { randomBytes } from 'node:crypto';
import path from 'node:path';

const MUTABLE_RELEASE_IDS = new Set(['current', 'development', 'latest', 'production', 'staging']);
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeStagingCdnRoot(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Staging CDN root must be a valid HTTPS URL: ${value}`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') {
    throw new Error('Staging CDN root must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Staging CDN root may not contain credentials');
  }
  if (url.search || url.hash) {
    throw new Error('Staging CDN root may not contain a query string or fragment');
  }
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === 'example.com' ||
    hostname.endsWith('.example.com') ||
    hostname.endsWith('.invalid')
  ) {
    throw new Error(`Staging CDN root must name a configured non-placeholder HTTPS host: ${value}`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

export function normalizeCdnReleaseId(value) {
  const releaseId = String(value || '').trim();
  if (!RELEASE_ID_PATTERN.test(releaseId) || !/\d/.test(releaseId)) {
    throw new Error(
      'CDN release id must contain a digit and use only letters, digits, dots, underscores, and hyphens'
    );
  }
  if (MUTABLE_RELEASE_IDS.has(releaseId.toLowerCase())) {
    throw new Error(`CDN release id must be immutable, not "${releaseId}"`);
  }
  return releaseId;
}

export function createImmutableCdnReleaseId(releaseLabel, options = {}) {
  const normalizedLabel = normalizeCdnReleaseId(releaseLabel);
  const now = options.now || new Date();
  const nonce = String(options.nonce || randomBytes(6).toString('hex'));
  if (!/^[A-Za-z0-9]+$/.test(nonce)) {
    throw new Error('CDN release nonce must use only letters and digits');
  }
  const timestamp = now.toISOString().replace(/[-:.]/g, '');
  return normalizeCdnReleaseId(`${normalizedLabel}-${timestamp}-${nonce}`);
}

export function stagingCdnBasePath(root, slug, releaseId) {
  const normalizedRoot = normalizeStagingCdnRoot(root);
  const normalizedSlug = normalizePathSegment(slug, 'app slug');
  const normalizedRelease = normalizeCdnReleaseId(releaseId);
  return new URL(
    `${encodeURIComponent(normalizedSlug)}/versions/${encodeURIComponent(normalizedRelease)}/`,
    normalizedRoot
  ).href;
}

export function normalizeExactCdnBasePath(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`CDN base path must be a credential-free HTTPS URL: ${value}`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

export function assetUrl(cdnBasePath, relativePath) {
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(encodedPath, cdnBasePath).href;
}

export function assertPortableAssetPath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`${label} must be a safe relative path: ${value}`);
  }
}

export function safeLocalPath(rootDir, relativePath) {
  if (typeof relativePath !== 'string') {
    throw new Error('CDN stage path must be a string');
  }
  const portablePath = relativePath.replace(/\\/g, '/');
  if (
    portablePath.startsWith('/') ||
    portablePath.split('/').some((segment) => segment === '..') ||
    /^[A-Za-z]:/.test(portablePath)
  ) {
    throw new Error(`CDN stage path escapes its root: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, portablePath || '.');
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`CDN stage path escapes its root: ${relativePath}`);
  }
  return resolvedPath;
}

function normalizePathSegment(value, label) {
  const segment = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return segment;
}
