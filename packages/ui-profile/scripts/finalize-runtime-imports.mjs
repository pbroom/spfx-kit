import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(packageRoot, 'dist');
const relativeSpecifier = /((?:from\s+|import\s*)["'])(\.{1,2}\/[^"']+)(["'])/gu;

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

async function javascriptFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
  return files;
}
