import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { readJson } from './fs.mjs';

const REQUIRED_PACKAGE_PARTS = ['[Content_Types].xml', '_rels/.rels', 'AppManifest.xml'];

export async function expectedSppkgPath(appDir) {
  const appRoot = path.resolve(appDir);
  const sharepointRoot = path.join(appRoot, 'sharepoint');
  const packageSolution = await readJson(path.join(appRoot, 'config', 'package-solution.json'));
  const configuredPath = packageSolution.paths?.zippedPackage;
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) {
    throw new Error('config/package-solution.json paths.zippedPackage must name the output package');
  }

  const packagePath = path.resolve(sharepointRoot, configuredPath);
  const relativePath = path.relative(sharepointRoot, packagePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('config/package-solution.json paths.zippedPackage must stay within the sharepoint directory');
  }
  if (path.extname(packagePath).toLowerCase() !== '.sppkg') {
    throw new Error('config/package-solution.json paths.zippedPackage must end in .sppkg');
  }
  return packagePath;
}

export async function verifySppkg(appDir) {
  const packagePath = await expectedSppkgPath(appDir);
  let packageStats;
  try {
    packageStats = await stat(packagePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Expected SPFx package was not produced: ${packagePath}`);
    }
    throw error;
  }
  if (!packageStats.isFile() || packageStats.size === 0) {
    throw new Error(`Expected SPFx package is not a non-empty file: ${packagePath}`);
  }

  let entries;
  try {
    entries = unzipSync(new Uint8Array(await readFile(packagePath)));
  } catch (error) {
    throw new Error(`Expected SPFx package is not a readable ZIP archive: ${packagePath}`, { cause: error });
  }

  const entryNames = Object.keys(entries);
  const unsafeEntry = entryNames.find((entry) => path.posix.isAbsolute(entry) || entry.split('/').includes('..'));
  if (unsafeEntry) {
    throw new Error(`SPFx package contains an unsafe archive path: ${unsafeEntry}`);
  }
  const missingParts = REQUIRED_PACKAGE_PARTS.filter((entry) => !Object.hasOwn(entries, entry));
  if (missingParts.length) {
    throw new Error(`SPFx package is missing required parts: ${missingParts.join(', ')}`);
  }

  return {
    packagePath,
    bytes: packageStats.size,
    entries: entryNames.length
  };
}
