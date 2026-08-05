import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson } from '../fs.mjs';
import { validateExportConfig } from './export-config-validation.mjs';

export { validateExportConfig } from './export-config-validation.mjs';

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
