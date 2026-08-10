import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(packageRoot, 'dist');
const relativeSpecifier = /((?:from\s+|import\s*)["'])(\.{1,2}\/[^"']+)(["'])/gu;
const baseUiDeclarationSpecifier = /(["'])(@base-ui\/react(?:\/[^"']*)?|(?:\.\.\/){4}\.prepared\/base-ui(?:\/[^"']*)?)\1/gu;
const classPropDeclarationSpecifier = /(["'])class-variance-authority\/dist\/types\1/gu;

for (const file of await javascriptFiles(distRoot)) {
  const source = await readFile(file, 'utf8');
  const rewritten = source.replace(relativeSpecifier, (match, prefix, specifier, suffix) => {
    if (path.extname(specifier)) return match;
    return `${prefix}${specifier}.js${suffix}`;
  });
  for (const match of rewritten.matchAll(relativeSpecifier)) {
    const specifier = match[2];
    if (!specifier.endsWith('.js')) continue;
    await access(path.resolve(path.dirname(file), specifier));
  }
  if (rewritten !== source) await writeFile(file, rewritten);
}

const compatibilitySource = path.join(packageRoot, 'scripts', 'lib', 'public-react17-jsx.d.ts');
const compatibilityTarget = path.join(distRoot, 'compat-consumers', 'react17-base-ui-jsx.d.ts');
await mkdir(path.dirname(compatibilityTarget), { recursive: true });
await copyFile(compatibilitySource, compatibilityTarget);

const typescript53GlobalsTarget = path.join(distRoot, 'compat-consumers', 'typescript53-globals.d.ts');
await copyFile(path.join(packageRoot, 'compat-consumers', 'typescript53-globals.d.ts'), typescript53GlobalsTarget);
const typescript53ChartTarget = path.join(distRoot, 'compat-consumers', 'typescript53', 'chart.d.ts');
await mkdir(path.dirname(typescript53ChartTarget), { recursive: true });
await writeFile(
  typescript53ChartTarget,
  ['/// <reference path="../typescript53-globals.d.ts" />', 'export * from "../../normalized/src/components/ui/chart"', ''].join(
    '\n'
  )
);

const componentDeclarationsRoot = path.join(distRoot, 'normalized', 'src', 'components', 'ui');
for (const file of await filesWithExtension(componentDeclarationsRoot, '.d.ts')) {
  const compatibilityReference = toModuleSpecifier(path.relative(path.dirname(file), compatibilityTarget));
  const preparedBaseUi = toModuleSpecifier(path.relative(path.dirname(file), path.join(packageRoot, '.prepared', 'base-ui')));
  const publicTypes = toModuleSpecifier(path.relative(path.dirname(file), path.join(distRoot, 'src', 'public-types')));
  const source = await readFile(file, 'utf8');
  const withPreparedTypes = source.replace(baseUiDeclarationSpecifier, (_match, quote, specifier) => {
    const suffix = specifier.startsWith('@base-ui/react')
      ? specifier.slice('@base-ui/react'.length)
      : specifier.slice(specifier.indexOf('.prepared/base-ui') + '.prepared/base-ui'.length);
    return `${quote}${preparedBaseUi}${suffix}${quote}`;
  });
  const withPortableClassProp = withPreparedTypes.replace(
    classPropDeclarationSpecifier,
    (_match, quote) => `${quote}${publicTypes}${quote}`
  );
  const reference = `/// <reference path=${JSON.stringify(compatibilityReference)} />\n`;
  await writeFile(
    file,
    withPortableClassProp.startsWith(reference) ? withPortableClassProp : `${reference}${withPortableClassProp}`
  );
}

async function javascriptFiles(root) {
  return filesWithExtension(root, '.js');
}

async function filesWithExtension(root, extension) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesWithExtension(target, extension)));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(target);
  }
  return files;
}

function toModuleSpecifier(value) {
  const normalized = value.split(path.sep).join('/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}
