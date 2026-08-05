import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateExportConfig as validateCanonicalExportConfig } from '../../../packages/spfx-tools/src/lib/export/export-config-validation.mjs';

const exportConfigFileName = 'export-config.json';
const spfxCdnPlaceholder = '<!-- PATH TO CDN -->';
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
    cdnUrl: deploymentCdnUrl(stringValue(writeManifests?.cdnBasePath)),
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
  return validateCanonicalExportConfig(appDir, value);
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

function deploymentCdnUrl(value: string): string {
  return value === spfxCdnPlaceholder ? '' : value;
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
