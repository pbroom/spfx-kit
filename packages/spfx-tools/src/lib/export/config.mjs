import { lstat, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson } from '../fs.mjs';

const exportConfigStringFields = [
  'appName',
  'fileName',
  'description',
  'longDescription',
  'videoUrl',
  'appIcon',
  'catalogIconPath',
  'version',
  'cdnUrl',
  'developerName',
  'developerWebsiteUrl',
  'privacyUrl',
  'termsOfUseUrl',
  'partnerId'
];
const exportConfigArrayFields = ['screenshotPaths', 'categories'];
const legacyExportConfigFields = ['appName', 'fileName', 'description', 'appIcon', 'version', 'cdnUrl'];
const catalogCategories = new Set([
  'Accounting + Finance',
  'Collaboration',
  'Content management',
  'CRM',
  'Data + analytics',
  'File managers',
  'IT/admin',
  'Legal + HR',
  'News + weather',
  'Productivity',
  'Project management',
  'Reference',
  'Sales + marketing',
  'Site Design',
  'Social',
  'Workflow & Process Management'
]);
const screenshotExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png']);

/**
 * Applies the app-local export sidecar to the tracked SPFx source files for the
 * duration of one export. Target-specific mutations can be discarded by
 * calling restoreAppliedSource(), while the outer finally always restores the
 * original source bytes.
 */
export async function withAppliedExportConfig(appDir, callback) {
  const sidecarPath = path.join(appDir, '.spfx-kit', 'export-config.json');
  const exportConfig = (await exists(sidecarPath))
    ? await validateExportConfig(appDir, await readJsonObject(sidecarPath))
    : undefined;
  const sourcePaths = await exportSourcePaths(appDir, Boolean(exportConfig));
  const originals = await snapshotFiles(sourcePaths);
  let applied = originals;

  try {
    if (exportConfig) {
      await applyExportConfig(appDir, sourcePaths, exportConfig);
      applied = await snapshotFiles(sourcePaths);
    }

    return await callback({
      exportConfig,
      restoreAppliedSource: () => restoreFiles(applied)
    });
  } finally {
    await restoreFiles(originals);
  }
}

async function exportSourcePaths(appDir, includeSidecarTargets) {
  const sourcePaths = {
    packageSolution: path.join(appDir, 'config', 'package-solution.json'),
    writeManifests: path.join(appDir, 'config', 'write-manifests.json')
  };
  if (includeSidecarTargets) {
    sourcePaths.packageJson = path.join(appDir, 'package.json');
    const webPartManifest = await findPrimaryWebPartManifest(appDir);
    if (webPartManifest) {
      sourcePaths.webPartManifest = webPartManifest;
    }
  }
  return sourcePaths;
}

async function applyExportConfig(appDir, sourcePaths, exportConfig) {
  const [packageJson, packageSolution, writeManifests, webPartManifest] = await Promise.all([
    readJsonObject(sourcePaths.packageJson),
    readJsonObject(sourcePaths.packageSolution),
    readJsonObject(sourcePaths.writeManifests),
    sourcePaths.webPartManifest ? readJsonObject(sourcePaths.webPartManifest) : undefined
  ]);

  packageJson.version = exportConfig.version;
  packageJson.description = exportConfig.description;

  packageSolution.solution = asObject(packageSolution.solution) || {};
  packageSolution.solution.name = exportConfig.appName;
  packageSolution.solution.version = `${exportConfig.version}.0`;
  applyOptionalValue(packageSolution.solution, 'iconPath', exportConfig.catalogIconPath);
  applyCatalogMetadata(packageSolution.solution, exportConfig);
  applyDeveloperMetadata(packageSolution.solution, exportConfig);
  if (Array.isArray(packageSolution.solution.features)) {
    for (const feature of packageSolution.solution.features) {
      if (asObject(feature)) {
        feature.version = `${exportConfig.version}.0`;
        feature.description = exportConfig.description;
      }
    }
  }
  packageSolution.paths = asObject(packageSolution.paths) || {};
  const configuredPackage = stringValue(packageSolution.paths.zippedPackage);
  const packageDirectory = configuredPackage ? path.posix.dirname(configuredPackage.replace(/\\/g, '/')) : 'solution';
  packageSolution.paths.zippedPackage = packageDirectory === '.'
    ? exportConfig.fileName
    : path.posix.join(packageDirectory, exportConfig.fileName);

  writeManifests.cdnBasePath = exportConfig.cdnUrl;

  if (webPartManifest) {
    const entries = Array.isArray(webPartManifest.preconfiguredEntries) ? webPartManifest.preconfiguredEntries : [];
    if (!entries.length || !asObject(entries[0])) {
      throw new Error(`Primary web part manifest has no preconfigured entry: ${path.relative(appDir, sourcePaths.webPartManifest)}`);
    }
    const entry = entries[0];
    entry.title = localizedValue(entry.title, exportConfig.appName);
    entry.description = localizedValue(entry.description, exportConfig.description);
    applyAppIcon(entry, exportConfig.appIcon);
  }

  const writes = [
    writeJson(sourcePaths.packageJson, packageJson),
    writeJson(sourcePaths.packageSolution, packageSolution),
    writeJson(sourcePaths.writeManifests, writeManifests)
  ];
  if (webPartManifest) {
    writes.push(writeJson(sourcePaths.webPartManifest, webPartManifest));
  }
  await Promise.all(writes);
}

async function findPrimaryWebPartManifest(appDir) {
  const webPartsDir = path.join(appDir, 'src', 'webparts');
  if (!(await exists(webPartsDir))) {
    return undefined;
  }
  const manifests = await listManifestFiles(webPartsDir);
  for (const manifestPath of manifests.sort((left, right) => left.localeCompare(right))) {
    const manifest = await readJsonObject(manifestPath);
    if (manifest.componentType === 'WebPart' || Array.isArray(manifest.preconfiguredEntries)) {
      return manifestPath;
    }
  }
  return undefined;
}

async function listManifestFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listManifestFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.manifest.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function snapshotFiles(sourcePaths) {
  const entries = await Promise.all(
    Object.entries(sourcePaths).map(async ([key, filePath]) => [key, { filePath, contents: await readFile(filePath, 'utf8') }])
  );
  return Object.fromEntries(entries);
}

async function restoreFiles(snapshot) {
  const results = await Promise.allSettled(
    Object.values(snapshot).map(({ filePath, contents }) => writeFile(filePath, contents, 'utf8'))
  );
  const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (failures.length) {
    throw new AggregateError(failures, 'Could not restore all SPFx source files after export.');
  }
}

export async function validateExportConfig(appDir, value) {
  const config = asObject(value);
  if (!config) {
    throw new Error('Export configuration must be a JSON object.');
  }
  const packageSolution = await readJsonObject(path.join(appDir, 'config', 'package-solution.json'));
  const sourceDefaults = catalogDefaults(packageSolution);
  for (const field of legacyExportConfigFields) {
    if (typeof config[field] !== 'string') {
      throw new Error(`Export configuration field ${field} must be text.`);
    }
  }
  for (const field of exportConfigStringFields.filter((field) => !legacyExportConfigFields.includes(field))) {
    if (config[field] !== undefined && typeof config[field] !== 'string') {
      throw new Error(`Export configuration field ${field} must be text.`);
    }
  }
  for (const field of exportConfigArrayFields) {
    if (config[field] !== undefined && (!Array.isArray(config[field]) || config[field].some((item) => typeof item !== 'string'))) {
      throw new Error(`Export configuration field ${field} must be a list of text values.`);
    }
  }
  const normalized = Object.fromEntries(
    exportConfigStringFields.map((field) => [field, String(config[field] ?? sourceDefaults[field] ?? '').trim()])
  );
  normalized.longDescription = String(config.longDescription ?? sourceDefaults.longDescription ?? '').replace(/\r\n?/g, '\n').trim();
  normalized.screenshotPaths = (config.screenshotPaths ?? sourceDefaults.screenshotPaths).map((value) => value.trim());
  normalized.categories = (config.categories ?? sourceDefaults.categories).map((value) => value.trim());
  if (!normalized.appName) {
    throw new Error('Export configuration appName is required.');
  }
  validateText(normalized.appName, 'appName', 256);
  validateText(normalized.fileName, 'fileName', 255);
  if (path.basename(normalized.fileName) !== normalized.fileName || path.extname(normalized.fileName).toLowerCase() !== '.sppkg') {
    throw new Error('Export configuration fileName must be a .sppkg file name without a directory path.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(normalized.version)) {
    throw new Error('Export configuration version must use x.y.z format.');
  }
  validateText(normalized.version, 'version', 64);
  validateText(normalized.description, 'description', 2048);
  validateMultilineText(normalized.longDescription, 'longDescription', 10_000);
  for (const field of ['appIcon', 'catalogIconPath', 'developerName', 'partnerId']) {
    validateText(normalized[field], field, field === 'catalogIconPath' || field === 'appIcon' ? 2048 : 256);
  }
  for (const field of ['cdnUrl', 'videoUrl', 'developerWebsiteUrl', 'privacyUrl', 'termsOfUseUrl']) {
    validateText(normalized[field], field, 2048);
  }
  validateHttpsUrl(normalized.cdnUrl, 'cdnUrl');
  validateHttpsUrl(normalized.developerWebsiteUrl, 'developerWebsiteUrl');
  validateHttpsUrl(normalized.privacyUrl, 'privacyUrl');
  validateHttpsUrl(normalized.termsOfUseUrl, 'termsOfUseUrl');
  validateVideoUrl(normalized.videoUrl);

  if (normalized.screenshotPaths.length > 5) {
    throw new Error('Export configuration screenshotPaths may contain at most 5 items.');
  }
  if (normalized.categories.length > 3) {
    throw new Error('Export configuration categories may contain at most 3 items.');
  }
  if (new Set(normalized.categories).size !== normalized.categories.length) {
    throw new Error('Export configuration categories must not contain duplicates.');
  }
  for (const category of normalized.categories) {
    validateText(category, 'categories item', 128);
    if (!catalogCategories.has(category)) {
      throw new Error(`Unsupported app catalog category: ${category}`);
    }
  }

  const packageRoot = normalized.catalogIconPath || normalized.screenshotPaths.some((item) => !isExternalUrl(item))
    ? await resolvePackageRoot(appDir)
    : undefined;
  if (normalized.catalogIconPath) {
    await validateLocalImage(packageRoot, normalized.catalogIconPath, 'Catalog icon', new Set(['.png']));
  }
  const screenshotBasenames = new Set();
  for (const screenshotPath of normalized.screenshotPaths) {
    validateText(screenshotPath, 'screenshotPaths item', 2048);
    let basename;
    if (isExternalUrl(screenshotPath)) {
      const parsed = validateHttpsUrl(screenshotPath, 'Screenshot URL');
      basename = path.posix.basename(parsed.pathname);
      if (!basename) {
        throw new Error('Screenshot URL must identify an image file.');
      }
    } else {
      await validateLocalImage(packageRoot, screenshotPath, 'Screenshot', screenshotExtensions);
      basename = path.posix.basename(screenshotPath);
    }
    const normalizedBasename = basename.toLowerCase();
    if (screenshotBasenames.has(normalizedBasename)) {
      throw new Error(`Screenshot file names must be unique: ${basename}`);
    }
    screenshotBasenames.add(normalizedBasename);
  }
  return normalized;
}

function catalogDefaults(packageSolution) {
  const solution = asObject(packageSolution.solution) || {};
  const metadata = asObject(solution.metadata) || {};
  const developer = asObject(solution.developer) || {};
  return {
    longDescription: localizedDefault(metadata.longDescription),
    videoUrl: stringValue(metadata.videoUrl),
    catalogIconPath: stringValue(solution.iconPath),
    screenshotPaths: stringArray(metadata.screenshotPaths),
    categories: stringArray(metadata.categories),
    developerName: stringValue(developer.name),
    developerWebsiteUrl: stringValue(developer.websiteUrl),
    privacyUrl: stringValue(developer.privacyUrl),
    termsOfUseUrl: stringValue(developer.termsOfUseUrl),
    partnerId: stringValue(developer.mpnId)
  };
}

function applyCatalogMetadata(solution, exportConfig) {
  const metadata = asObject(solution.metadata) || {};
  applyLocalizedDefault(metadata, 'shortDescription', exportConfig.description);
  applyLocalizedDefault(metadata, 'longDescription', exportConfig.longDescription);
  applyOptionalValue(metadata, 'videoUrl', exportConfig.videoUrl);
  applyOptionalArray(metadata, 'screenshotPaths', exportConfig.screenshotPaths);
  applyOptionalArray(metadata, 'categories', exportConfig.categories);
  if (Object.keys(metadata).length) {
    solution.metadata = metadata;
  } else {
    delete solution.metadata;
  }
}

function applyDeveloperMetadata(solution, exportConfig) {
  const developer = { ...(asObject(solution.developer) || {}) };
  const values = {
    name: exportConfig.developerName,
    websiteUrl: exportConfig.developerWebsiteUrl,
    privacyUrl: exportConfig.privacyUrl,
    termsOfUseUrl: exportConfig.termsOfUseUrl,
    mpnId: exportConfig.partnerId
  };
  if (Object.values(values).some(Boolean)) {
    solution.developer = { ...developer, ...values };
  } else {
    for (const key of Object.keys(values)) {
      delete developer[key];
    }
    if (Object.keys(developer).length) {
      solution.developer = developer;
    } else {
      delete solution.developer;
    }
  }
}

function applyLocalizedDefault(container, key, value) {
  if (value) {
    container[key] = localizedValue(container[key], value);
  } else {
    delete container[key];
  }
}

function applyOptionalValue(container, key, value) {
  if (value) {
    container[key] = value;
  } else {
    delete container[key];
  }
}

function applyOptionalArray(container, key, value) {
  if (value.length) {
    container[key] = [...value];
  } else {
    delete container[key];
  }
}

function localizedValue(value, defaultValue) {
  return { ...(asObject(value) || {}), default: defaultValue };
}

function localizedDefault(value) {
  return stringValue(asObject(value)?.default);
}

function applyAppIcon(entry, appIcon) {
  if (!appIcon) {
    delete entry.iconImageUrl;
    delete entry.officeFabricIconFontName;
    return;
  }
  if (/^(?:https?:\/\/|\/\/|data:image\/|\/|\.\.?\/)/i.test(appIcon)) {
    entry.iconImageUrl = appIcon;
    delete entry.officeFabricIconFontName;
    return;
  }
  entry.officeFabricIconFontName = appIcon;
  delete entry.iconImageUrl;
}

function validateText(value, label, maximumLength) {
  if (value.length > maximumLength) {
    throw new Error(`Export configuration ${label} is too long.`);
  }
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) {
    throw new Error(`Export configuration ${label} contains unsupported control characters.`);
  }
}

function validateMultilineText(value, label, maximumLength) {
  if (value.length > maximumLength) {
    throw new Error(`Export configuration ${label} is too long.`);
  }
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code <= 31 && character !== '\n' && character !== '\t') || code === 127;
  })) {
    throw new Error(`Export configuration ${label} contains unsupported control characters.`);
  }
}

function isExternalUrl(value) {
  return value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value);
}

function validateHttpsUrl(value, label) {
  if (!value) {
    return undefined;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Export configuration ${label} must be an absolute non-localhost HTTPS URL.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]'
  ) {
    throw new Error(`Export configuration ${label} must be an absolute non-localhost HTTPS URL.`);
  }
  return parsed;
}

function validateVideoUrl(value) {
  const parsed = validateHttpsUrl(value, 'videoUrl');
  if (!parsed) {
    return;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host !== 'youtu.be' &&
    host !== 'youtube.com' &&
    !host.endsWith('.youtube.com') &&
    host !== 'youtube-nocookie.com' &&
    !host.endsWith('.youtube-nocookie.com') &&
    host !== 'vimeo.com' &&
    !host.endsWith('.vimeo.com')
  ) {
    throw new Error('Export configuration videoUrl must use YouTube or Vimeo.');
  }
}

async function resolvePackageRoot(appDir) {
  const appRoot = await realpath(appDir);
  const packageSolution = await readJsonObject(path.join(appRoot, 'config', 'package-solution.json'));
  const paths = asObject(packageSolution.paths);
  const configuredPackageDir = paths?.packageDir === undefined ? 'sharepoint' : stringValue(paths.packageDir);
  if (
    !configuredPackageDir ||
    configuredPackageDir.includes('\\') ||
    path.isAbsolute(configuredPackageDir) ||
    path.win32.isAbsolute(configuredPackageDir)
  ) {
    throw new Error('Export configuration package directory must be an app-local relative path.');
  }
  const packageRoot = path.resolve(appRoot, configuredPackageDir);
  const relative = path.relative(appRoot, packageRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Export configuration package directory must stay inside the app.');
  }
  const info = await lstat(packageRoot).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new Error(`Export configuration package directory does not exist: ${configuredPackageDir}`);
    }
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Export configuration package directory must be a regular app-local directory.');
  }
  const resolved = await realpath(packageRoot);
  const resolvedRelative = path.relative(appRoot, resolved);
  if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
    throw new Error('Export configuration package directory must stay inside the app.');
  }
  return resolved;
}

async function validateLocalImage(packageRoot, value, label, allowedExtensions) {
  if (
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`${label} path must be a safe package-relative path using forward slashes.`);
  }
  const extension = path.posix.extname(value).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error(`${label} must use a supported image type.`);
  }
  let current = packageRoot;
  for (const segment of value.split('/')) {
    current = path.join(current, segment);
    const info = await lstat(current).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new Error(`${label} file does not exist: ${value}`);
      }
      throw error;
    });
    if (info.isSymbolicLink()) {
      throw new Error(`${label} path may not contain symbolic links: ${value}`);
    }
  }
  const info = await stat(current);
  if (!info.isFile()) {
    throw new Error(`${label} path must name a regular file: ${value}`);
  }
  const bytes = await readFile(current);
  const detected = detectImageType(bytes);
  const expected = path.posix.extname(value).toLowerCase() === '.jpg' ? 'jpeg' : path.posix.extname(value).slice(1).toLowerCase();
  if (detected !== expected) {
    throw new Error(`${label} file contents do not match its image type: ${value}`);
  }
}

function detectImageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return 'gif';
  }
  return undefined;
}

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.trim()) : [];
}

async function readJsonObject(filePath) {
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  if (!asObject(value)) {
    throw new Error(`Expected a JSON object in ${filePath}`);
  }
  return value;
}
