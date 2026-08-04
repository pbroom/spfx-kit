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
  const inspected = await readSppkgEntries(packagePath);
  assertRequiredPackageParts(inspected.entries);

  return {
    packagePath,
    bytes: inspected.bytes,
    entries: Object.keys(inspected.entries).length
  };
}

export async function readSppkgEntries(packagePath) {
  let packageStats;
  try {
    packageStats = await stat(packagePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Expected SPFx package was not produced: ${packagePath}`, { cause: error });
    }
    throw error;
  }
  if (!packageStats.isFile() || packageStats.size === 0) {
    throw new Error(`Expected SPFx package is not a non-empty file: ${packagePath}`);
  }

  const packageBytes = await readFile(packagePath);
  return {
    bytes: packageBytes.byteLength,
    entries: readSppkgEntriesFromBytes(packageBytes, packagePath)
  };
}

export async function readSppkgComponentManifests(packagePath) {
  const { entries } = await readSppkgEntries(packagePath);
  return extractSppkgComponentManifests(entries);
}

export function readSppkgComponentManifestsFromBytes(packageBytes, packageLabel = 'provided package bytes') {
  const entries = readSppkgEntriesFromBytes(packageBytes, packageLabel);
  return extractSppkgComponentManifests(entries);
}

function readSppkgEntriesFromBytes(packageBytes, packageLabel) {
  if (!(packageBytes instanceof Uint8Array) || packageBytes.byteLength === 0) {
    throw new Error(`Expected SPFx package is not a non-empty byte array: ${packageLabel}`);
  }
  let entries;
  try {
    entries = unzipSync(packageBytes);
  } catch (error) {
    throw new Error(`Expected SPFx package is not a readable ZIP archive: ${packageLabel}`, { cause: error });
  }

  const entryNames = Object.keys(entries);
  const unsafeEntry = entryNames.find((entry) => path.posix.isAbsolute(entry) || entry.split('/').includes('..'));
  if (unsafeEntry) {
    throw new Error(`SPFx package contains an unsafe archive path: ${unsafeEntry}`);
  }
  return entries;
}

function extractSppkgComponentManifests(entries) {
  assertRequiredPackageParts(entries);
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
        throw new Error(`SPFx package contains an invalid ComponentManifest in ${entryName}`, {
          cause: error
        });
      }
      if (manifest?.loaderConfig) {
        manifests.push({ manifest, source: entryName });
      }
    }
  }
  return manifests;
}

function assertRequiredPackageParts(entries) {
  const missingParts = REQUIRED_PACKAGE_PARTS.filter((entry) => !Object.hasOwn(entries, entry));
  if (missingParts.length) {
    throw new Error(`SPFx package is missing required parts: ${missingParts.join(', ')}`);
  }
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
