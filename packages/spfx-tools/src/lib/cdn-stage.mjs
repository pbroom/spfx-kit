import { createHash, randomBytes } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { readSppkgEntries } from './sppkg.mjs';

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

export async function clearGeneratedCdnOutputs(appDir) {
  await Promise.all(
    [
      path.join(appDir, 'release', 'assets'),
      path.join(appDir, 'release', 'manifests'),
      path.join(appDir, 'temp', 'deploy')
    ].map((outputDir) => rm(outputDir, { recursive: true, force: true }))
  );
}

export async function mergeCdnAssetTree(sourceDir, uploadDir) {
  try {
    const sourceStats = await lstat(sourceDir);
    if (!sourceStats.isDirectory()) {
      throw new Error(`CDN asset source is not a directory: ${sourceDir}`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const copied = [];
  await mkdir(uploadDir, { recursive: true });
  await visitAssetDirectory(sourceDir, '', async (source, relativePath) => {
    const target = safeLocalPath(uploadDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      const targetStats = await lstat(target);
      if (!targetStats.isFile()) {
        throw new Error(`CDN asset collision is not a regular file: ${relativePath}`);
      }
      const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
      if (!sourceBytes.equals(targetBytes)) {
        throw new Error(`CDN asset sources contain conflicting bytes for: ${relativePath}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
      await copyFile(source, target);
    }
    copied.push(relativePath);
  });
  return copied.sort();
}

export async function createCdnStageManifest({
  cdnBasePath,
  packageFile,
  releaseLabel,
  releaseId,
  releaseManifestDir,
  slug,
  stageDir,
  uploadDir
}) {
  const normalizedBasePath = normalizeExactCdnBasePath(cdnBasePath);
  const normalizedRelease = normalizeCdnReleaseId(releaseId);
  const packageManifests = await readPackageComponentManifests(packageFile);
  if (!packageManifests.length) {
    throw new Error('Staged SPFx package contains no client-side component manifests');
  }
  const releaseManifests = releaseManifestDir
    ? await readReleaseComponentManifests(releaseManifestDir)
    : [];
  const packageReferences = validateComponentManifests(packageManifests, normalizedBasePath, 'SPFx package');
  const releaseReferences = validateComponentManifests(
    releaseManifests,
    normalizedBasePath,
    'generated release manifests'
  );
  if (releaseManifests.length) {
    assertManifestAgreement(packageManifests, releaseManifests);
  }

  const uploadFiles = await describeUploadTree(uploadDir, normalizedBasePath);
  if (!uploadFiles.length) {
    throw new Error('Staging CDN upload tree is empty');
  }
  const uploadByPath = new Map(uploadFiles.map((file) => [file.path, file]));
  const allReferences = mergeReferences([...packageReferences, ...releaseReferences]);
  for (const reference of allReferences) {
    const localFile = uploadByPath.get(reference.path);
    if (!localFile) {
      throw new Error(`CDN manifest URL has no local upload file: ${reference.url}`);
    }
    localFile.referencedBy = reference.referencedBy;
  }

  const packageBytes = await readFile(packageFile);
  const packageStats = await stat(packageFile);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    slug,
    releaseLabel: releaseLabel || normalizedRelease,
    releaseId: normalizedRelease,
    cdnBasePath: normalizedBasePath,
    immutablePrefix: true,
    uploadRoot: relativePortablePath(stageDir, uploadDir),
    package: {
      path: relativePortablePath(stageDir, packageFile),
      bytes: packageStats.size,
      sha256: sha256(packageBytes)
    },
    manifests: {
      root: releaseManifestDir ? relativePortablePath(stageDir, releaseManifestDir) : null,
      packageComponents: packageManifests.map((manifest) => manifest.id).sort(),
      generatedComponents: releaseManifests.map((manifest) => manifest.id).sort(),
      referencedFiles: allReferences.length
    },
    files: uploadFiles,
    proof: {
      localArtifact: 'passed',
      remoteCdn: 'not-run',
      sharePointAppCatalog: 'not-run'
    }
  };
}

export async function verifyCdnStage(stageDir, manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error('Unsupported or missing CDN stage manifest schemaVersion');
  }
  const packageFile = safeLocalPath(stageDir, manifest.package?.path);
  await assertRealPathWithin(stageDir, packageFile, 'staged SPFx package');
  const packageStats = await lstat(packageFile);
  if (!packageStats.isFile() || packageStats.isSymbolicLink()) {
    throw new Error(`Staged SPFx package must be a real file: ${manifest.package?.path}`);
  }
  const uploadDir = safeLocalPath(stageDir, manifest.uploadRoot);
  await assertRealPathWithin(stageDir, uploadDir, 'CDN upload root');
  const releaseManifestDir = manifest.manifests?.root
    ? safeLocalPath(stageDir, manifest.manifests.root)
    : undefined;
  if (releaseManifestDir) {
    await assertRealPathWithin(stageDir, releaseManifestDir, 'generated manifest root');
  }
  const rebuilt = await createCdnStageManifest({
    cdnBasePath: manifest.cdnBasePath,
    packageFile,
    releaseLabel: manifest.releaseLabel,
    releaseId: manifest.releaseId,
    releaseManifestDir,
    slug: manifest.slug,
    stageDir,
    uploadDir
  });
  assertEqualJson('staged package', rebuilt.package, manifest.package);
  assertEqualJson('upload file inventory', rebuilt.files, manifest.files);
  assertEqualJson('package component manifests', rebuilt.manifests.packageComponents, manifest.manifests?.packageComponents);
  assertEqualJson(
    'generated component manifests',
    rebuilt.manifests.generatedComponents,
    manifest.manifests?.generatedComponents
  );
  return rebuilt;
}

export async function verifyRemoteCdnFiles(files, { authorization, expectedCdnBasePath } = {}) {
  const expectedBasePath = normalizeExactCdnBasePath(expectedCdnBasePath);
  for (const file of files) {
    assertExpectedRemoteUrl(file.url, expectedBasePath);
  }
  const headers = { 'Accept-Encoding': 'identity' };
  if (authorization) {
    headers.Authorization = authorization;
  }
  const results = new Array(files.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(6, files.length) }, async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      await verifyRemoteFile(file, headers);
      results[index] = { path: file.path, url: file.url, bytes: file.bytes, sha256: file.sha256 };
    }
  });
  await Promise.all(workers);
  return results;
}

function assertExpectedRemoteUrl(value, expectedCdnBasePath) {
  const url = new URL(value);
  const expected = new URL(expectedCdnBasePath);
  if (
    url.protocol !== 'https:' ||
    url.origin !== expected.origin ||
    !url.pathname.startsWith(expected.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Remote CDN URL is outside the trusted staging prefix: ${value}`);
  }
}

async function verifyRemoteFile(file, headers) {
  let response;
  try {
    response = await fetch(file.url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new Error(`Remote CDN request failed: ${file.url}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Remote CDN check failed with HTTP ${response.status}: ${file.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = sha256(bytes);
  if (bytes.length !== file.bytes || actualHash !== file.sha256) {
    throw new Error(`Remote CDN bytes do not match the staged artifact: ${file.url}`);
  }
}

async function visitAssetDirectory(rootDir, relativeDir, onFile) {
  const currentDir = safeLocalPath(rootDir, relativeDir);
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const absolutePath = safeLocalPath(rootDir, relativePath);
    const entryStats = await lstat(absolutePath);
    if (entryStats.isSymbolicLink()) {
      throw new Error(`CDN asset tree may not contain symbolic links: ${relativePath}`);
    }
    if (entryStats.isDirectory()) {
      await visitAssetDirectory(rootDir, relativePath, onFile);
    } else if (entryStats.isFile()) {
      if (entryStats.size === 0) {
        throw new Error(`CDN asset tree contains an empty file: ${relativePath}`);
      }
      await onFile(absolutePath, relativePath);
    } else {
      throw new Error(`CDN asset tree contains a non-regular entry: ${relativePath}`);
    }
  }
}

async function describeUploadTree(uploadDir, cdnBasePath) {
  const uploadStats = await lstat(uploadDir);
  if (!uploadStats.isDirectory() || uploadStats.isSymbolicLink()) {
    throw new Error(`Staging CDN upload root must be a real directory: ${uploadDir}`);
  }
  const files = [];
  const portablePaths = new Set();
  await visitAssetDirectory(uploadDir, '', async (absolutePath, relativePath) => {
    const portablePath = relativePath.normalize('NFC').toLowerCase();
    if (portablePaths.has(portablePath)) {
      throw new Error(`CDN asset paths collide on a portable filesystem: ${relativePath}`);
    }
    portablePaths.add(portablePath);
    const bytes = await readFile(absolutePath);
    files.push({
      path: relativePath,
      url: assetUrl(cdnBasePath, relativePath),
      bytes: bytes.length,
      sha256: sha256(bytes),
      referencedBy: []
    });
  });
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function readPackageComponentManifests(packageFile) {
  const { entries } = await readSppkgEntries(packageFile);
  const manifests = [];
  for (const [entryName, bytes] of Object.entries(entries)) {
    if (!entryName.toLowerCase().endsWith('.xml')) {
      continue;
    }
    const xml = Buffer.from(bytes).toString('utf8');
    for (const match of xml.matchAll(/\bComponentManifest\s*=\s*(["'])([\s\S]*?)\1/g)) {
      let manifest;
      try {
        manifest = JSON.parse(decodeXmlAttribute(match[2]));
      } catch (error) {
        throw new Error(`SPFx package contains an invalid ComponentManifest in ${entryName}`, { cause: error });
      }
      if (manifest?.loaderConfig) {
        manifests.push(normalizeComponentManifest(manifest, entryName));
      }
    }
  }
  return manifests;
}

async function readReleaseComponentManifests(manifestDir) {
  try {
    const manifestStats = await lstat(manifestDir);
    if (!manifestStats.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const manifests = [];
  await visitJsonDirectory(manifestDir, '', async (absolutePath, relativePath) => {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(absolutePath, 'utf8'));
    } catch (error) {
      throw new Error(`Generated release manifest is not valid JSON: ${relativePath}`, { cause: error });
    }
    if (manifest?.loaderConfig) {
      manifests.push(normalizeComponentManifest(manifest, relativePath));
    }
  });
  return manifests;
}

async function visitJsonDirectory(rootDir, relativeDir, onFile) {
  const entries = await readdir(safeLocalPath(rootDir, relativeDir), { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const absolutePath = safeLocalPath(rootDir, relativePath);
    const entryStats = await lstat(absolutePath);
    if (entryStats.isSymbolicLink()) {
      throw new Error(`Generated release manifests may not contain symbolic links: ${relativePath}`);
    }
    if (entryStats.isDirectory()) {
      await visitJsonDirectory(rootDir, relativePath, onFile);
    } else if (entryStats.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      await onFile(absolutePath, relativePath);
    }
  }
}

function normalizeComponentManifest(manifest, source) {
  const id = String(manifest.id || '').trim();
  if (!id) {
    throw new Error(`Client-side component manifest is missing an id: ${source}`);
  }
  return { ...manifest, id, source };
}

function validateComponentManifests(manifests, cdnBasePath, sourceLabel) {
  const references = [];
  for (const manifest of manifests) {
    const baseUrls = manifest.loaderConfig?.internalModuleBaseUrls;
    if (
      !Array.isArray(baseUrls) ||
      baseUrls.length !== 1 ||
      normalizeExactCdnBasePath(baseUrls[0]) !== cdnBasePath
    ) {
      throw new Error(
        `${sourceLabel} component ${manifest.id} must use exactly the staged CDN base path: ${cdnBasePath}`
      );
    }
    const scriptResources = manifest.loaderConfig?.scriptResources;
    if (!scriptResources || typeof scriptResources !== 'object' || Array.isArray(scriptResources)) {
      throw new Error(`${sourceLabel} component ${manifest.id} must declare scriptResources`);
    }
    const entryModuleId = manifest.loaderConfig?.entryModuleId;
    if (typeof entryModuleId !== 'string' || !Object.hasOwn(scriptResources, entryModuleId)) {
      throw new Error(`${sourceLabel} component ${manifest.id} entryModuleId must name a declared script resource`);
    }
    for (const resource of describePathResources(scriptResources, `${sourceLabel} component ${manifest.id}`)) {
      const resolved = resolveManifestResource(cdnBasePath, resource.path);
      references.push({
        ...resolved,
        referencedBy: [`${sourceLabel}:${manifest.id}:${resource.name}${resource.variant}`]
      });
    }
  }
  return references;
}

function describePathResources(scriptResources, sourceLabel = 'component manifest') {
  const resources = [];
  for (const [name, resource] of Object.entries(scriptResources || {})) {
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      throw new Error(`${sourceLabel} resource ${name} must be an object`);
    }
    if (resource.type === 'path') {
      if (typeof resource.path !== 'string' || !resource.path) {
        throw new Error(`${sourceLabel} path resource ${name} must declare a path`);
      }
      resources.push({ name, path: resource.path, variant: '' });
    } else if (resource.type === 'localizedPath') {
      if (typeof resource.defaultPath !== 'string' || !resource.defaultPath) {
        throw new Error(`${sourceLabel} localized resource ${name} must declare defaultPath`);
      }
      resources.push({ name, path: resource.defaultPath, variant: ':default' });
      if (!resource.paths || typeof resource.paths !== 'object' || Array.isArray(resource.paths)) {
        throw new Error(`${sourceLabel} localized resource ${name} must declare locale paths`);
      }
      for (const [locale, localizedPath] of Object.entries(resource.paths || {})) {
        if (typeof localizedPath !== 'string' || !localizedPath) {
          throw new Error(`${sourceLabel} localized resource ${name} has an invalid ${locale} path`);
        }
        resources.push({ name, path: localizedPath, variant: `:${locale}` });
      }
    } else if (resource.type === 'component') {
      if (typeof resource.id !== 'string' || !resource.id || typeof resource.version !== 'string' || !resource.version) {
        throw new Error(`${sourceLabel} component resource ${name} must declare id and version`);
      }
    } else {
      throw new Error(`${sourceLabel} resource ${name} has unsupported type: ${resource.type}`);
    }
  }
  return resources.sort((left, right) =>
    `${left.name}${left.variant}`.localeCompare(`${right.name}${right.variant}`)
  );
}

function resolveManifestResource(cdnBasePath, resourcePath) {
  if (
    !resourcePath ||
    resourcePath.startsWith('/') ||
    resourcePath.startsWith('//') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resourcePath)
  ) {
    throw new Error(`CDN manifest resource path must be relative: ${resourcePath}`);
  }
  const resourceUrl = new URL(resourcePath, cdnBasePath);
  const baseUrl = new URL(cdnBasePath);
  if (
    resourceUrl.origin !== baseUrl.origin ||
    !resourceUrl.pathname.startsWith(baseUrl.pathname) ||
    resourceUrl.search ||
    resourceUrl.hash
  ) {
    throw new Error(`CDN manifest resource escapes the staged base path: ${resourcePath}`);
  }
  const encodedPath = resourceUrl.pathname.slice(baseUrl.pathname.length);
  const segments = encodedPath.split('/').map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      throw new Error(`CDN manifest resource has an unsafe path: ${resourcePath}`);
    }
    return decoded;
  });
  const relativePath = segments.join('/');
  return { path: relativePath, url: assetUrl(cdnBasePath, relativePath) };
}

function assertManifestAgreement(packageManifests, releaseManifests) {
  const packageById = descriptorMap(packageManifests, 'SPFx package');
  const releaseById = descriptorMap(releaseManifests, 'generated release manifests');
  assertEqualJson('package and generated component manifest ids', [...packageById.keys()].sort(), [...releaseById.keys()].sort());
  for (const [id, descriptor] of packageById) {
    assertEqualJson(`package and generated loader config for ${id}`, descriptor, releaseById.get(id));
  }
}

function manifestDescriptor(manifest) {
  return canonicalize(manifest.loaderConfig);
}

function descriptorMap(manifests, sourceLabel) {
  const descriptors = new Map();
  for (const manifest of manifests) {
    if (descriptors.has(manifest.id)) {
      throw new Error(`${sourceLabel} contains duplicate component manifest id: ${manifest.id}`);
    }
    descriptors.set(manifest.id, manifestDescriptor(manifest));
  }
  return descriptors;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function mergeReferences(references) {
  const byPath = new Map();
  for (const reference of references) {
    const current = byPath.get(reference.path);
    if (current && current.url !== reference.url) {
      throw new Error(`CDN manifest references disagree for local path: ${reference.path}`);
    }
    if (current) {
      current.referencedBy.push(...reference.referencedBy);
    } else {
      byPath.set(reference.path, { ...reference, referencedBy: [...reference.referencedBy] });
    }
  }
  return [...byPath.values()]
    .map((reference) => ({
      ...reference,
      referencedBy: [...new Set(reference.referencedBy)].sort()
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function decodeXmlAttribute(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|quot|apos|lt|gt|amp);/gi, (_entity, body) => {
    const normalized = body.toLowerCase();
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'amp') return '&';
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return String.fromCodePoint(codePoint);
  });
}

function normalizeExactCdnBasePath(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`CDN base path must be a credential-free HTTPS URL: ${value}`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

function assetUrl(cdnBasePath, relativePath) {
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(encodedPath, cdnBasePath).href;
}

function safeLocalPath(rootDir, relativePath) {
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

function relativePortablePath(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, '/');
  safeLocalPath(rootDir, relative);
  return relative;
}

async function assertRealPathWithin(rootDir, filePath, label) {
  const [realRoot, realTarget] = await Promise.all([realpath(rootDir), realpath(filePath)]);
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the staging artifact`);
  }
}

function normalizePathSegment(value, label) {
  const segment = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return segment;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertEqualJson(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`CDN stage ${label} does not match deployment-manifest.json`);
  }
}
