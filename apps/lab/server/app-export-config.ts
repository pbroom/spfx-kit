import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const exportConfigFileName = 'export-config.json';
const exportConfigFields = ['appName', 'fileName', 'description', 'appIcon', 'version', 'cdnUrl'] as const;

export interface ManagedAppExportConfig {
  appName: string;
  fileName: string;
  description: string;
  appIcon: string;
  version: string;
  cdnUrl: string;
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
  const paths = asObject(packageSolution?.paths);
  const entry = firstObject(manifest?.preconfiguredEntries);
  const manifestTitle = localizedDefault(entry?.title);
  const manifestDescription = localizedDefault(entry?.description);
  const configuredPackagePath = stringValue(paths?.zippedPackage);

  const defaults: ManagedAppExportConfig = {
    appName: stringValue(solution?.name) || manifestTitle || unscopedPackageName(stringValue(packageJson?.name)),
    fileName: configuredPackagePath ? path.basename(configuredPackagePath) : '',
    description: stringValue(packageJson?.description) || manifestDescription,
    appIcon: stringValue(entry?.iconImageUrl) || stringValue(entry?.officeFabricIconFontName),
    version: stringValue(packageJson?.version) || packageVersionFromSolution(stringValue(solution?.version)),
    cdnUrl: stringValue(writeManifests?.cdnBasePath)
  };

  return overlaySavedConfig(defaults, savedConfig);
}

export async function updateManagedAppExportConfig(appDir: string, value: unknown): Promise<ManagedAppExportConfig> {
  const exportConfig = validateExportConfig(value);
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

export function validateExportConfig(value: unknown): ManagedAppExportConfig {
  const input = asObject(value);
  if (!input) {
    throw new Error('Export configuration is required.');
  }

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
  if (cdnUrl) {
    let parsed: URL;
    try {
      parsed = new URL(cdnUrl);
    } catch {
      throw new Error('CDN URL must be an absolute HTTP or HTTPS URL.');
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      throw new Error('CDN URL must be an absolute non-localhost HTTPS URL.');
    }
  }

  return {
    appName,
    fileName,
    description: optionalText(input.description, 'Description', 2048),
    appIcon: optionalText(input.appIcon, 'App icon', 2048),
    version,
    cdnUrl
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
  for (const field of exportConfigFields) {
    const value = savedConfig[field];
    if (typeof value === 'string') {
      result[field] = value;
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
