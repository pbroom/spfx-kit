#!/usr/bin/env node
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { exists, listManagedSpfxApps } from '../lib/fs.mjs';

async function main() {
  const rootDir = process.cwd();
  const apps = await listManagedSpfxApps(rootDir);
  const registrations = [];

  for (const app of apps) {
    const adapter = await findLabAdapter(app.dir);
    if (adapter) {
      registrations.push({
        packageName: app.packageJson.name,
        localName: localName(app.name),
        importPath: relativeImportPath(generatedDirFor(rootDir), adapter)
      });
    }
  }

  const generatedDir = path.join(rootDir, 'apps', 'lab', 'src', 'generated');
  await mkdir(generatedDir, { recursive: true });
  const source = [
    'import type { LabWebPartRegistry } from "@spfx-kit/spfx-lab-runtime";',
    ...registrations.map((item) => `import { register as ${item.localName} } from "${item.importPath}";`),
    '',
    'export function registerGeneratedWebParts(registry: LabWebPartRegistry): void {',
    registrations.length
      ? registrations.map((item) => `  ${item.localName}(registry);`).join('\n')
      : '  void registry;',
    '}',
    ''
  ].join('\n');

  await writeFile(path.join(generatedDir, 'lab-registry.ts'), source);
  console.log(`Synced ${registrations.length} lab adapter${registrations.length === 1 ? '' : 's'}.`);
}

async function findLabAdapter(appDir) {
  const preferred = path.join(appDir, '.spfx-kit', 'lab', 'register.tsx');
  if (await exists(preferred)) {
    return preferred;
  }
  const legacy = path.join(appDir, 'src', 'lab', 'register.tsx');
  if (await exists(legacy)) {
    return legacy;
  }
  return undefined;
}

function localName(value) {
  return `${value.replace(/[^A-Za-z0-9]+(.)/g, (_, char) => char.toUpperCase()).replace(/[^A-Za-z0-9]/g, '')}Register`;
}

function generatedDirFor(rootDir) {
  return path.join(rootDir, 'apps', 'lab', 'src', 'generated');
}

function relativeImportPath(fromDir, toFile) {
  const rel = path.relative(fromDir, toFile).replace(/\\/g, '/').replace(/\.tsx$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
