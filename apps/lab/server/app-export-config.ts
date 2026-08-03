import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const exportConfigFileName = 'export-config.json';
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
] as const;
const exportConfigArrayFields = ['screenshotPaths', 'categories'] as const;
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

export interface ManagedAppExportConfig {
  appName: string;
  fileName: string;
  description: string;
  longDescription: string;
  videoUrl: string;
  appIcon: string;
  catalogIconPath: string;
  screenshotPaths: string[];
  categories: string[];
  version: string;
  cdnUrl: string;
  developerName: string;
  developerWebsiteUrl: string;
  privacyUrl: string;
  termsOfUseUrl: string;
  partnerId: string;
}

type JsonObject = Record<string, unknown>;

interface PackageJson extends JsonObject {
  name?: unknown;
  version?: unknown;
  description?: unknown;
}

interface PackageSolutionJson extends JsonObject {
  solution?: unknown;
  paths?: unknown;
}

interface WebPartManifest extends JsonObject {
  componentType?: unknown;
  preconfiguredEntries?: unknown;
}

export async function describeManagedAppExportConfig(appDir: string): Promise<ManagedAppExportConfig> {
  const [packageJson, packageSolution, writeManifests, manifest, savedConfig] = await Promise.all([
    readJsonIfPresent<PackageJson>(path.join(appDir, 'package.json')),
    readJsonIfPresent<PackageSolutionJson>(path.join(appDir, 'config', 'package-solution.json')),
    readJsonIfPresent<JsonObject>(path.join(appDir, 'config', 'write-manifests.json')),
    readPrimaryWebPartManifest(appDir),
    readSavedExportConfig(appDir)
  ]);

  const solution = asObject(packageSolution?.solution);
  const metadata = asObject(solution?.metadata);
  const developer = asObject(solution?.developer);
  const paths = asObject(packageSolution?.paths);
  const entry = firstObject(manifest?.preconfiguredEntries);
  const manifestTitle = localizedDefault(entry?.title);
  const manifestDescription = localizedDefault(entry?.description);
  const configuredPackagePath = stringValue(paths?.zippedPackage);

  const defaults: ManagedAppExportConfig = {
    appName: stringValue(solution?.name) || manifestTitle || unscopedPackageName(stringValue(packageJson?.name)),
    fileName: configuredPackagePath ? path.basename(configuredPackagePath) : '',
    description: localizedDefault(metadata?.shortDescription) || stringValue(packageJson?.description) || manifestDescription,
    longDescription: localizedDefault(metadata?.longDescription),
    videoUrl: stringValue(metadata?.videoUrl),
    appIcon: stringValue(entry?.iconImageUrl) || stringValue(entry?.officeFabricIconFontName),
    catalogIconPath: stringValue(solution?.iconPath),
    screenshotPaths: stringArray(metadata?.screenshotPaths),
    categories: stringArray(metadata?.categories),
    version: stringValue(packageJson?.version) || packageVersionFromSolution(stringValue(solution?.version)),
    cdnUrl: stringValue(writeManifests?.cdnBasePath),
    developerName: stringValue(developer?.name),
    developerWebsiteUrl: stringValue(developer?.websiteUrl),
    privacyUrl: stringValue(developer?.privacyUrl),
    termsOfUseUrl: stringValue(developer?.termsOfUseUrl),
    partnerId: stringValue(developer?.mpnId)
  };

  return overlaySavedConfig(defaults, savedConfig);
}

export async function updateManagedAppExportConfig(appDir: string, value: unknown): Promise<ManagedAppExportConfig> {
  const exportConfig = await validateExportConfig(appDir, value);
  const configPath = await resolveExportConfigPath(appDir, true);
  const current = (await readJsonIfPresent<JsonObject>(configPath)) || {};
  const next = { ...current, ...exportConfig };
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return exportConfig;
}

export async function validateExportConfig(appDir: string, value: unknown): Promise<ManagedAppExportConfig> {
  const input = asObject(value);
  if (!input) {
    throw new Error('Export configuration is required.');
  }
  const defaults = await describeManagedAppExportConfig(appDir);

  const appName = requiredText(input.appName, 'App name is required.', 256);
  const fileName = requiredText(input.fileName, 'File name is required.', 255);
  if (path.basename(fileName) !== fileName || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('File name must not include a directory path.');
  }
  if (path.extname(fileName).toLowerCase() !== '.sppkg') {
    throw new Error('File name must end in .sppkg.');
  }

  const version = requiredText(input.version, 'Version is required.', 64);
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Version must use x.y.z format.');
  }

  const cdnUrl = optionalText(input.cdnUrl, 'CDN URL', 2048);
  validateHttpsUrl(cdnUrl, 'CDN URL');
  const videoUrl = optionalText(input.videoUrl ?? defaults.videoUrl, 'Video URL', 2048);
  validateVideoUrl(videoUrl);
  const developerWebsiteUrl = optionalText(
    input.developerWebsiteUrl ?? defaults.developerWebsiteUrl,
    'Developer website URL',
    2048
  );
  const privacyUrl = optionalText(input.privacyUrl ?? defaults.privacyUrl, 'Privacy URL', 2048);
  const termsOfUseUrl = optionalText(input.termsOfUseUrl ?? defaults.termsOfUseUrl, 'Terms of use URL', 2048);
  validateHttpsUrl(developerWebsiteUrl, 'Developer website URL');
  validateHttpsUrl(privacyUrl, 'Privacy URL');
  validateHttpsUrl(termsOfUseUrl, 'Terms of use URL');

  const screenshotPaths = textArray(input.screenshotPaths ?? defaults.screenshotPaths, 'Screenshot paths', 5, 2048);
  const categories = textArray(input.categories ?? defaults.categories, 'Categories', 3, 128);
  if (new Set(categories).size !== categories.length) {
    throw new Error('Categories must not contain duplicates.');
  }
  for (const category of categories) {
    if (!catalogCategories.has(category)) {
      throw new Error(`Unsupported app catalog category: ${category}`);
    }
  }

  const catalogIconPath = optionalText(input.catalogIconPath ?? defaults.catalogIconPath, 'Catalog icon path', 2048);
  const packageRoot =
    catalogIconPath || screenshotPaths.some((value) => !isExternalUrl(value)) ? await resolvePackageRoot(appDir) : undefined;
  if (catalogIconPath) {
    await validateLocalImage(packageRoot!, catalogIconPath, 'Catalog icon', new Set(['.png']));
  }
  const screenshotBasenames = new Set<string>();
  for (const screenshotPath of screenshotPaths) {
    let basename: string;
    if (isExternalUrl(screenshotPath)) {
      const parsed = validateHttpsUrl(screenshotPath, 'Screenshot URL');
      basename = path.posix.basename(parsed!.pathname);
      if (!basename) {
        throw new Error('Screenshot URL must identify an image file.');
      }
    } else {
      await validateLocalImage(packageRoot!, screenshotPath, 'Screenshot', screenshotExtensions);
      basename = path.posix.basename(screenshotPath);
    }
    const normalizedBasename = basename.toLowerCase();
    if (screenshotBasenames.has(normalizedBasename)) {
      throw new Error(`Screenshot file names must be unique: ${basename}`);
    }
    screenshotBasenames.add(normalizedBasename);
  }

  return {
    appName,
    fileName,
    description: optionalText(input.description, 'Description', 2048),
    longDescription: optionalMultilineText(input.longDescription ?? defaults.longDescription, 'Long description', 10_000),
    videoUrl,
    appIcon: optionalText(input.appIcon, 'App icon', 2048),
    catalogIconPath,
    screenshotPaths,
    categories,
    version,
    cdnUrl,
    developerName: optionalText(input.developerName ?? defaults.developerName, 'Developer name', 256),
    developerWebsiteUrl,
    privacyUrl,
    termsOfUseUrl,
    partnerId: optionalText(input.partnerId ?? defaults.partnerId, 'Partner ID', 256)
  };
}

async function readSavedExportConfig(appDir: string): Promise<JsonObject | undefined> {
  const configPath = await resolveExportConfigPath(appDir, false);
  return configPath ? readJsonIfPresent<JsonObject>(configPath) : undefined;
}

async function resolveExportConfigPath(appDir: string, create: true): Promise<string>;
async function resolveExportConfigPath(appDir: string, create: false): Promise<string | undefined>;
async function resolveExportConfigPath(appDir: string, create: boolean): Promise<string | undefined> {
  const appRoot = await realpath(appDir);
  const configDir = path.join(appRoot, '.spfx-kit');
  if (create) {
    await mkdir(configDir, { recursive: true });
  } else if (!(await exists(configDir))) {
    return undefined;
  }

  const configDirInfo = await lstat(configDir);
  if (!configDirInfo.isDirectory() || configDirInfo.isSymbolicLink()) {
    throw new Error('Export configuration directory must be a regular app-local directory.');
  }

  const resolvedConfigDir = await realpath(configDir);
  const relative = path.relative(appRoot, resolvedConfigDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Export configuration directory must stay inside the managed app.');
  }
  return path.join(resolvedConfigDir, exportConfigFileName);
}

async function readPrimaryWebPartManifest(appDir: string): Promise<WebPartManifest | undefined> {
  const webPartsDir = path.join(appDir, 'src', 'webparts');
  if (!(await exists(webPartsDir))) {
    return undefined;
  }

  const manifests = await listManifestFiles(webPartsDir);
  for (const manifestPath of manifests.sort((left, right) => left.localeCompare(right))) {
    const manifest = await readJsonIfPresent<WebPartManifest>(manifestPath);
    if (manifest?.componentType === 'WebPart' || Array.isArray(manifest?.preconfiguredEntries)) {
      return manifest;
    }
  }
  return undefined;
}

async function listManifestFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listManifestFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.manifest.json')) {
      output.push(entryPath);
    }
  }
  return output;
}

function overlaySavedConfig(defaults: ManagedAppExportConfig, savedConfig: JsonObject | undefined): ManagedAppExportConfig {
  if (!savedConfig) {
    return defaults;
  }
  const result = { ...defaults };
  for (const field of exportConfigStringFields) {
    const value = savedConfig[field];
    if (typeof value === 'string') {
      result[field] = value;
    }
  }
  for (const field of exportConfigArrayFields) {
    const value = savedConfig[field];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[field] = [...value];
    }
  }
  return result;
}

function localizedDefault(value: unknown): string {
  return stringValue(asObject(value)?.default);
}

function firstObject(value: unknown): JsonObject | undefined {
  return Array.isArray(value) ? asObject(value[0]) : undefined;
}

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()) : [];
}

function unscopedPackageName(packageName: string): string {
  return packageName.includes('/') ? packageName.slice(packageName.lastIndexOf('/') + 1) : packageName;
}

function packageVersionFromSolution(solutionVersion: string): string {
  return /^\d+\.\d+\.\d+\.0$/.test(solutionVersion) ? solutionVersion.slice(0, -2) : solutionVersion;
}

function requiredText(value: unknown, message: string, maximumLength: number): string {
  const normalized = optionalText(value, message.replace(/ is required\.$/, ''), maximumLength);
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new Error(`${label} is too long.`);
  }
  if (
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return normalized;
}

function optionalMultilineText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length > maximumLength) {
    throw new Error(`${label} is too long.`);
  }
  if (
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return (code <= 31 && character !== '\n' && character !== '\t') || code === 127;
    })
  ) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return normalized;
}

function textArray(value: unknown, label: string, maximumItems: number, maximumItemLength: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list.`);
  }
  if (value.length > maximumItems) {
    throw new Error(`${label} may contain at most ${maximumItems} items.`);
  }
  return value.map((item, index) => optionalText(item, `${label} item ${index + 1}`, maximumItemLength));
}

function isExternalUrl(value: string): boolean {
  return value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value);
}

function validateHttpsUrl(value: string, label: string): URL | undefined {
  if (!value) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute non-localhost HTTPS URL.`);
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
    throw new Error(`${label} must be an absolute non-localhost HTTPS URL.`);
  }
  return parsed;
}

function validateVideoUrl(value: string): void {
  const parsed = validateHttpsUrl(value, 'Video URL');
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
    throw new Error('Video URL must use YouTube or Vimeo.');
  }
}

async function resolvePackageRoot(appDir: string): Promise<string> {
  const appRoot = await realpath(appDir);
  const packageSolution = await readJsonIfPresent<PackageSolutionJson>(path.join(appRoot, 'config', 'package-solution.json'));
  const paths = asObject(packageSolution?.paths);
  const configuredPackageDir = paths?.packageDir === undefined ? 'sharepoint' : stringValue(paths.packageDir);
  if (
    !configuredPackageDir ||
    configuredPackageDir.includes('\\') ||
    path.isAbsolute(configuredPackageDir) ||
    path.win32.isAbsolute(configuredPackageDir)
  ) {
    throw new Error('Package directory must be an app-local relative path.');
  }
  const packageRoot = path.resolve(appRoot, configuredPackageDir);
  const relative = path.relative(appRoot, packageRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Package directory must stay inside the managed app.');
  }
  const info = await lstat(packageRoot).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      throw new Error(`Package directory does not exist: ${configuredPackageDir}`);
    }
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Package directory must be a regular app-local directory.');
  }
  const resolved = await realpath(packageRoot);
  const resolvedRelative = path.relative(appRoot, resolved);
  if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
    throw new Error('Package directory must stay inside the managed app.');
  }
  return resolved;
}

async function validateLocalImage(
  packageRoot: string,
  value: string,
  label: string,
  allowedExtensions: Set<string>
): Promise<void> {
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
  const segments = value.split('/');
  let current = packageRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
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
  const expected = extension === '.jpg' ? 'jpeg' : extension.slice(1);
  if (detected !== expected) {
    throw new Error(`${label} file contents do not match its image type: ${value}`);
  }
}

function detectImageType(bytes: Buffer): 'png' | 'jpeg' | 'gif' | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'gif';
  }
  return undefined;
}

async function readJsonIfPresent<T extends JsonObject>(filePath: string): Promise<T | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    if (!asObject(value)) {
      throw new Error(`Expected a JSON object in ${filePath}.`);
    }
    return value as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
