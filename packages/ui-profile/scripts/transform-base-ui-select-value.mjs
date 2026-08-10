import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const SELECT_VALUE_FROM = "Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'>";
export const SELECT_VALUE_TO = "Omit<BaseUIComponentProps<'span', SelectValueState>, 'children' | 'placeholder'>";

export function transformSelectValueDeclaration(source) {
  const occurrences = source.split(SELECT_VALUE_FROM).length - 1;
  if (occurrences === 0 && source.includes(SELECT_VALUE_TO)) return source;
  if (occurrences !== 1) {
    throw new Error(`SelectValue declaration must contain exactly one recognized upstream signature; found ${occurrences}`);
  }
  return source.replace(SELECT_VALUE_FROM, SELECT_VALUE_TO);
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preparedParent = path.join(packageRoot, '.prepared');
const contract = JSON.parse(
  await readFile(path.join(packageRoot, 'compat', 'base-ui-1.6.0', 'select-value', 'contract.json'), 'utf8')
);

async function verifyFixtures() {
  for (const file of contract.files) {
    const upstream = await readFile(path.join(packageRoot, file.upstreamPath));
    const expected = await readFile(path.join(packageRoot, file.transformedPath));
    if (sha256(upstream) !== file.upstreamSha256) throw new Error(`${file.upstreamPath}: upstream digest differs`);
    if (sha256(expected) !== file.transformedSha256) throw new Error(`${file.transformedPath}: transformed digest differs`);
    const transformed = Buffer.from(transformSelectValueDeclaration(upstream.toString('utf8')));
    if (!transformed.equals(expected)) throw new Error(`${file.installedPath}: transform output differs from fixture`);
    if (transformSelectValueDeclaration(transformed.toString('utf8')) !== transformed.toString('utf8')) {
      throw new Error(`${file.installedPath}: transform is not idempotent`);
    }
  }
}

export async function applySelectValueDeclarations(baseUiRoot) {
  const [realParent, realTarget] = await Promise.all([realpath(preparedParent), realpath(baseUiRoot)]);
  const relativeTarget = path.relative(realParent, realTarget);
  if (
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget) ||
    !path.basename(realTarget).startsWith('.base-ui-staging-')
  ) {
    throw new Error('SelectValue declarations may only be applied to an isolated .prepared staging copy');
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
    if (digest === file.transformedSha256) continue;
    if (digest !== file.upstreamSha256) throw new Error(`${target}: installed declaration bytes are not recognized`);
    const transformed = Buffer.from(transformSelectValueDeclaration(bytes.toString('utf8')));
    if (sha256(transformed) !== file.transformedSha256) throw new Error(`${target}: transformed digest differs`);
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
