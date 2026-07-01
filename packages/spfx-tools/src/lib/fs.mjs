import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'lib',
  'dist',
  'temp',
  'release',
  'build',
  '.turbo'
]);

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function copyManagedSpfxSource(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(sourceDir, source);
      if (!rel) {
        return true;
      }
      if (path.basename(source) === '.DS_Store') {
        return false;
      }
      const parts = rel.split(path.sep);
      if (parts.some((part) => EXCLUDED_DIRS.has(part))) {
        return false;
      }
      if (parts[0] === '.spfx-kit' && parts[1] === 'exports') {
        return false;
      }
      if (parts[0] === 'sharepoint' && parts[1] === 'solution' && parts.length > 2) {
        return false;
      }
      if (path.basename(source) === 'package-lock.json') {
        return false;
      }
      return true;
    }
  });
}

export async function copyPortableSpfxSource(sourceDir, targetDir, options = {}) {
  const excludeLabSource = options.excludeLabSource !== false;
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(sourceDir, source);
      if (!rel) {
        return true;
      }
      if (path.basename(source) === '.DS_Store') {
        return false;
      }
      const parts = rel.split(path.sep);
      if (parts.some((part) => EXCLUDED_DIRS.has(part))) {
        return false;
      }
      if (parts[0] === '.spfx-kit' && parts[1] === 'exports') {
        return false;
      }
      if (parts[0] === 'sharepoint' && parts[1] === 'solution' && parts.length > 2) {
        return false;
      }
      if (parts[0] === 'cdn-handoff') {
        return false;
      }
      if (excludeLabSource && parts[0] === 'src' && parts[1] === 'lab') {
        return false;
      }
      return true;
    }
  });
}

export async function preserveOriginalLock(sourceDir, targetDir) {
  const sourceLock = path.join(sourceDir, 'package-lock.json');
  if (!(await exists(sourceLock))) {
    return false;
  }
  const targetLock = path.join(targetDir, '.spfx-kit', 'original-package-lock.json');
  await mkdir(path.dirname(targetLock), { recursive: true });
  await cp(sourceLock, targetLock);
  return true;
}

export function managedAppsDir(rootDir) {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

export function legacyAppsDir(rootDir) {
  return path.join(rootDir, 'apps');
}

export function managedAppDir(rootDir, slug) {
  return path.join(managedAppsDir(rootDir), slug);
}

export async function listWorkspaceApps(rootDir) {
  const appsDir = legacyAppsDir(rootDir);
  if (!(await exists(appsDir))) {
    return [];
  }
  const names = await readdir(appsDir);
  const apps = [];
  for (const name of names) {
    const appDir = path.join(appsDir, name);
    const packagePath = path.join(appDir, 'package.json');
    if (await exists(packagePath)) {
      apps.push({ name, dir: appDir, packageJson: await readJson(packagePath) });
    }
  }
  return apps;
}

export async function listManagedSpfxApps(rootDir) {
  const apps = [
    ...(await listAppsInDir(managedAppsDir(rootDir))),
    ...(await listLegacySpfxApps(rootDir))
  ];
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readManagedSpfxApp(rootDir, slug) {
  const localDir = managedAppDir(rootDir, slug);
  const local = await readAppAt(slug, localDir);
  if (local) {
    return local;
  }
  return readAppAt(slug, path.join(legacyAppsDir(rootDir), slug));
}

export async function normalizeManagedSpfxTsconfig(_rootDir, appDir) {
  const rootDir = path.resolve(_rootDir);
  const tsconfigPath = path.join(appDir, 'tsconfig.json');
  if (!(await exists(tsconfigPath))) {
    return;
  }
  const tsconfig = await readJson(tsconfigPath);
  if (typeof tsconfig.extends === 'string' && tsconfig.extends.includes('node_modules/')) {
    const rootNodeModules = path.relative(appDir, path.join(rootDir, 'node_modules')).replace(/\\/g, '/') || '.';
    tsconfig.extends = `${rootNodeModules}/@microsoft/rush-stack-compiler-5.3/includes/tsconfig-web.json`;
  }
  if (Array.isArray(tsconfig.compilerOptions?.typeRoots)) {
    const rootNodeModules = path.relative(appDir, path.join(rootDir, 'node_modules')).replace(/\\/g, '/') || '.';
    tsconfig.compilerOptions.typeRoots = [
      `${rootNodeModules}/@types`,
      `${rootNodeModules}/@microsoft`,
      './node_modules/@types',
      './node_modules/@microsoft'
    ];
  }
  await writeJson(tsconfigPath, tsconfig);
}

async function listLegacySpfxApps(rootDir) {
  const apps = await listAppsInDir(legacyAppsDir(rootDir));
  return apps.filter((app) => app.name.endsWith('-spfx'));
}

async function listAppsInDir(appsDir) {
  if (!(await exists(appsDir))) {
    return [];
  }
  const names = await readdir(appsDir);
  const apps = [];
  for (const name of names) {
    const app = await readAppAt(name, path.join(appsDir, name));
    if (app) {
      apps.push(app);
    }
  }
  return apps;
}

async function readAppAt(name, appDir) {
  const packagePath = path.join(appDir, 'package.json');
  if (!(await exists(packagePath))) {
    return undefined;
  }
  return { name, dir: appDir, packageJson: await readJson(packagePath) };
}

export async function removeIfExists(filePath) {
  if (await exists(filePath)) {
    await rm(filePath, { recursive: true, force: true });
  }
}

export async function listFilesRecursive(dir) {
  if (!(await exists(dir))) {
    return [];
  }
  const output = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        output.push(full);
      }
    }
  }

  await visit(dir);
  return output;
}
