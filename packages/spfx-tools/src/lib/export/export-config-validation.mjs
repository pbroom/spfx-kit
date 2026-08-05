import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

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
const localImageExtensions = new Set(['.png']);
const maximumImageFileBytes = 25 * 1024 * 1024;
const maximumImageDimension = 8192;
const maximumImagePixels = 40_000_000;
const maximumDecodedImageBytes = 128 * 1024 * 1024;

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
  normalized.longDescription = String(config.longDescription ?? sourceDefaults.longDescription ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  normalized.screenshotPaths = (config.screenshotPaths ?? sourceDefaults.screenshotPaths).map((item) => item.trim());
  normalized.categories = (config.categories ?? sourceDefaults.categories).map((item) => item.trim());

  if (!normalized.appName) {
    throw new Error('Export configuration appName is required.');
  }
  validateText(normalized.appName, 'appName', 256);
  validateText(normalized.fileName, 'fileName', 255);
  if (
    path.basename(normalized.fileName) !== normalized.fileName ||
    normalized.fileName.includes('/') ||
    normalized.fileName.includes('\\')
  ) {
    throw new Error('File name must not include a directory path.');
  }
  if (path.extname(normalized.fileName).toLowerCase() !== '.sppkg') {
    throw new Error('File name must end in .sppkg.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(normalized.version)) {
    throw new Error('Version must use x.y.z format.');
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
  validateHttpsUrl(normalized.cdnUrl, 'CDN URL');
  validateHttpsUrl(normalized.developerWebsiteUrl, 'Developer website URL');
  validateHttpsUrl(normalized.privacyUrl, 'Privacy URL');
  validateHttpsUrl(normalized.termsOfUseUrl, 'Terms of use URL');
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

  const packageRoot =
    normalized.catalogIconPath || normalized.screenshotPaths.some((item) => !isExternalUrl(item))
      ? await resolvePackageRoot(appDir)
      : undefined;
  if (normalized.catalogIconPath) {
    await validateLocalImage(packageRoot, normalized.catalogIconPath, 'Catalog icon', localImageExtensions);
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
      await validateLocalImage(packageRoot, screenshotPath, 'Screenshot', localImageExtensions);
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

function validateText(value, label, maximumLength) {
  if (value.length > maximumLength) {
    throw new Error(`Export configuration ${label} is too long.`);
  }
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error(`Export configuration ${label} contains unsupported control characters.`);
  }
}

function validateMultilineText(value, label, maximumLength) {
  if (value.length > maximumLength) {
    throw new Error(`Export configuration ${label} is too long.`);
  }
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code <= 31 && character !== '\n' && character !== '\t') || code === 127;
    })
  ) {
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
    throw new Error(`${label} package-local image must use PNG.`);
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
  if (info.size > maximumImageFileBytes) {
    throw new Error(`${label} file is too large: ${value}`);
  }
  const bytes = await readFile(current);
  try {
    inspectPng(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Image structure validation failed.';
    throw new Error(`${label} file is corrupt or undecodable: ${value}. ${detail}`);
  }
}

function inspectPng(bytes) {
  if (
    bytes.length < 8 ||
    !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    throw new Error('PNG signature is invalid or truncated.');
  }
  let offset = 8;
  let header;
  let sawImageData = false;
  let endedImageData = false;
  let sawPalette = false;
  const imageData = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error('PNG chunk is truncated.');
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      throw new Error('PNG chunk is truncated.');
    }
    if (crc32(bytes.subarray(offset + 4, dataEnd)) !== bytes.readUInt32BE(dataEnd)) {
      throw new Error(`PNG ${type} chunk checksum is invalid.`);
    }
    if (!header && type !== 'IHDR') {
      throw new Error('PNG must begin with an IHDR chunk.');
    }
    if (type === 'IHDR') {
      if (header || length !== 13) {
        throw new Error('PNG IHDR chunk is invalid.');
      }
      header = {
        width: bytes.readUInt32BE(dataStart),
        height: bytes.readUInt32BE(dataStart + 4),
        bitDepth: bytes[dataStart + 8],
        colorType: bytes[dataStart + 9],
        compression: bytes[dataStart + 10],
        filter: bytes[dataStart + 11],
        interlace: bytes[dataStart + 12]
      };
      validatePngHeader(header);
    } else if (type === 'PLTE') {
      if (sawPalette || sawImageData || length === 0 || length % 3 !== 0 || length > 768) {
        throw new Error('PNG PLTE chunk is invalid.');
      }
      sawPalette = true;
    } else if (type === 'IDAT') {
      if (endedImageData) {
        throw new Error('PNG IDAT chunks must be consecutive.');
      }
      sawImageData = true;
      imageData.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (length || !sawImageData || chunkEnd !== bytes.length) {
        throw new Error('PNG IEND chunk is invalid or not final.');
      }
      if (header.colorType === 3 && !sawPalette) {
        throw new Error('Indexed PNG is missing its palette.');
      }
      validatePngImageData(header, Buffer.concat(imageData));
      return;
    } else if (type[0] === type[0].toUpperCase()) {
      throw new Error(`PNG contains unsupported critical chunk ${type}.`);
    } else if (sawImageData) {
      endedImageData = true;
    }
    offset = chunkEnd;
  }
  throw new Error('PNG is missing its final IEND chunk.');
}

function validatePngHeader(header) {
  const allowedBitDepths = {
    0: new Set([1, 2, 4, 8, 16]),
    2: new Set([8, 16]),
    3: new Set([1, 2, 4, 8]),
    4: new Set([8, 16]),
    6: new Set([8, 16])
  };
  if (
    !allowedBitDepths[header.colorType]?.has(header.bitDepth) ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    (header.interlace !== 0 && header.interlace !== 1)
  ) {
    throw new Error('PNG IHDR encoding is unsupported or corrupt.');
  }
  validateImageDimensions(header.width, header.height, 'PNG', 'image');
}

function validatePngImageData(header, compressed) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  const bitsPerPixel = channels * header.bitDepth;
  const passes =
    header.interlace === 0
      ? [[0, 0, 1, 1]]
      : [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2]
        ];
  let expectedLength = 0;
  const rows = [];
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = header.width <= startX ? 0 : Math.ceil((header.width - startX) / stepX);
    const passHeight = header.height <= startY ? 0 : Math.ceil((header.height - startY) / stepY);
    if (!passWidth || !passHeight) {
      continue;
    }
    const rowLength = Math.ceil((passWidth * bitsPerPixel) / 8);
    rows.push({ count: passHeight, rowLength });
    expectedLength += passHeight * (rowLength + 1);
  }
  if (expectedLength > maximumDecodedImageBytes) {
    throw new Error('PNG decoded image data is too large.');
  }
  let decoded;
  try {
    decoded = inflateSync(compressed, { maxOutputLength: expectedLength + 1 });
  } catch {
    throw new Error('PNG image data cannot be decoded.');
  }
  if (decoded.length !== expectedLength) {
    throw new Error('PNG image data length is invalid.');
  }
  let offset = 0;
  for (const { count, rowLength } of rows) {
    for (let row = 0; row < count; row += 1) {
      if (decoded[offset] > 4) {
        throw new Error('PNG scanline uses an invalid filter.');
      }
      offset += rowLength + 1;
    }
  }
}

function validateImageDimensions(width, height, label, value) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maximumImageDimension ||
    height > maximumImageDimension ||
    width * height > maximumImagePixels
  ) {
    throw new Error(`${label} has invalid or excessive image dimensions: ${value}`);
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localizedDefault(value) {
  return stringValue(asObject(value)?.default);
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
