import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preparedParent = path.join(packageRoot, '.prepared');
const contract = JSON.parse(
  await readFile(path.join(packageRoot, 'compat', 'base-ui-1.6.0', 'popup-lifecycle', 'contract.json'), 'utf8')
);

function fragmentSource(bytes) {
  return bytes.toString('utf8').trimEnd();
}

export function transformPopupStoreUtils(source, originalFragment, transformedFragment) {
  const originalOccurrences = source.split(originalFragment).length - 1;
  const transformedOccurrences = source.split(transformedFragment).length - 1;
  if (originalOccurrences === 0 && transformedOccurrences === 1) return source;
  if (originalOccurrences !== 1 || transformedOccurrences !== 0) {
    throw new Error(
      `popupStoreUtils must contain exactly one recognized lifecycle implementation; found ` +
        `${originalOccurrences} original and ${transformedOccurrences} transformed`
    );
  }
  return source.replace(originalFragment, transformedFragment);
}

async function fixtureData(file) {
  const originalBytes = await readFile(path.join(packageRoot, file.originalPath));
  const transformedBytes = await readFile(path.join(packageRoot, file.transformedPath));
  if (sha256(originalBytes) !== file.originalSha256) throw new Error(`${file.originalPath}: original digest differs`);
  if (sha256(transformedBytes) !== file.transformedSha256) {
    throw new Error(`${file.transformedPath}: transformed digest differs`);
  }
  return {
    originalFragment: fragmentSource(originalBytes),
    transformedFragment: fragmentSource(transformedBytes)
  };
}

async function verifyFixtures() {
  for (const file of contract.files) {
    const { originalFragment, transformedFragment } = await fixtureData(file);
    const transformed = transformPopupStoreUtils(originalFragment, originalFragment, transformedFragment);
    if (transformed !== transformedFragment) throw new Error(`${file.installedPath}: transform output differs from fixture`);
    if (transformPopupStoreUtils(transformed, originalFragment, transformedFragment) !== transformed) {
      throw new Error(`${file.installedPath}: transform is not idempotent`);
    }
  }
}

export async function applyPopupLifecycle(baseUiRoot) {
  const [realParent, realTarget] = await Promise.all([realpath(preparedParent), realpath(baseUiRoot)]);
  const relativeTarget = path.relative(realParent, realTarget);
  if (
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget) ||
    !path.basename(realTarget).startsWith('.base-ui-staging-')
  ) {
    throw new Error('Popup lifecycle may only be applied to an isolated .prepared staging copy');
  }
  await verifyFixtures();
  const manifest = JSON.parse(await readFile(path.join(baseUiRoot, 'package.json'), 'utf8'));
  if (manifest.name !== contract.package || manifest.version !== contract.version) {
    throw new Error(`Expected ${contract.package}@${contract.version}; found ${manifest.name}@${manifest.version}`);
  }
  for (const file of contract.files) {
    const target = path.join(baseUiRoot, file.installedPath);
    const bytes = await readFile(target);
    const digest = sha256(bytes);
    if (digest === file.transformedFileSha256) continue;
    if (digest !== file.originalFileSha256) throw new Error(`${target}: installed runtime bytes are not recognized`);
    const { originalFragment, transformedFragment } = await fixtureData(file);
    const transformed = Buffer.from(transformPopupStoreUtils(bytes.toString('utf8'), originalFragment, transformedFragment));
    if (sha256(transformed) !== file.transformedFileSha256) throw new Error(`${target}: transformed file digest differs`);
    await writeFile(target, transformed);
  }
}

const mode = process.argv[2];
if (mode === '--verify-fixtures') {
  await verifyFixtures();
  console.log(`Verified ${contract.contractVersion}`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  throw new Error('Only --verify-fixtures is supported; use prepare-base-ui for isolated transforms');
}
