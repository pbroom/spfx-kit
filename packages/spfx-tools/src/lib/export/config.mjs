import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson } from '../fs.mjs';

const exportConfigFields = ['appName', 'fileName', 'description', 'appIcon', 'version', 'cdnUrl'];

/**
 * Applies the app-local export sidecar to the tracked SPFx source files for the
 * duration of one export. Target-specific mutations can be discarded by
 * calling restoreAppliedSource(), while the outer finally always restores the
 * original source bytes.
 */
export async function withAppliedExportConfig(appDir, callback) {
  const sidecarPath = path.join(appDir, '.spfx-kit', 'export-config.json');
  const exportConfig = (await exists(sidecarPath)) ? validateExportConfig(await readJsonObject(sidecarPath)) : undefined;
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

function validateExportConfig(value) {
  const config = asObject(value);
  if (!config) {
    throw new Error('Export configuration must be a JSON object.');
  }
  for (const field of exportConfigFields) {
    if (typeof config[field] !== 'string') {
      throw new Error(`Export configuration field ${field} must be text.`);
    }
  }
  const normalized = Object.fromEntries(exportConfigFields.map((field) => [field, config[field].trim()]));
  if (!normalized.appName) {
    throw new Error('Export configuration appName is required.');
  }
  if (path.basename(normalized.fileName) !== normalized.fileName || path.extname(normalized.fileName).toLowerCase() !== '.sppkg') {
    throw new Error('Export configuration fileName must be a .sppkg file name without a directory path.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(normalized.version)) {
    throw new Error('Export configuration version must use x.y.z format.');
  }
  if (normalized.cdnUrl) {
    let parsed;
    try {
      parsed = new URL(normalized.cdnUrl);
    } catch {
      throw new Error('Export configuration cdnUrl must be an absolute HTTP or HTTPS URL.');
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      throw new Error('Export configuration cdnUrl must be an absolute non-localhost HTTPS URL.');
    }
  }
  return normalized;
}

function localizedValue(value, defaultValue) {
  return { ...(asObject(value) || {}), default: defaultValue };
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

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJsonObject(filePath) {
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  if (!asObject(value)) {
    throw new Error(`Expected a JSON object in ${filePath}`);
  }
  return value;
}
