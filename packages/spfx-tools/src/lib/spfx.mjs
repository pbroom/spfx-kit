import path from 'node:path';
import { exists, readJson, writeJson } from './fs.mjs';

export async function readSpfxSummary(appDir) {
  const packagePath = path.join(appDir, 'package.json');
  const yoPath = path.join(appDir, '.yo-rc.json');
  const solutionPath = path.join(appDir, 'config', 'package-solution.json');

  const packageJson = await readJson(packagePath);
  const yo = (await exists(yoPath)) ? await readJson(yoPath) : {};
  const solution = (await exists(solutionPath)) ? await readJson(solutionPath) : {};
  const generator = yo['@microsoft/generator-sharepoint'] || {};
  const components = await findComponentIds(appDir);

  return {
    originalPackageName: packageJson.name,
    spfxVersion:
      generator.version ||
      packageJson.dependencies?.['@microsoft/sp-core-library'] ||
      packageJson.devDependencies?.['@microsoft/sp-build-web'],
    nodeRange: packageJson.engines?.node,
    toolchain: packageJson.devDependencies?.['@microsoft/sp-build-web'] ? 'gulp' : 'unknown',
    solutionId: solution.solution?.id,
    componentIds: components
  };
}

export function appSlugFromDir(appDir) {
  return path.basename(path.resolve(appDir));
}

export function standalonePackageName(appDir) {
  const slug = appSlugFromDir(appDir);
  return slug.endsWith('-spfx') ? slug : `${slug}-spfx`;
}

export function cdnBasePathForSlug(slug, baseUrl = 'https://cdn.example.com/spfx') {
  return `${String(baseUrl).replace(/\/+$/, '')}/${slug}/`;
}

export async function setIncludeClientSideAssets(appDir, value) {
  const packageSolutionPath = path.join(appDir, 'config', 'package-solution.json');
  const packageSolution = await readJson(packageSolutionPath);
  packageSolution.solution = packageSolution.solution || {};
  packageSolution.solution.includeClientSideAssets = value;
  await writeJson(packageSolutionPath, packageSolution);
  return packageSolution;
}

export async function setCdnBasePath(appDir, cdnBasePath) {
  const writeManifestPath = path.join(appDir, 'config', 'write-manifests.json');
  const writeManifest = await readJson(writeManifestPath);
  writeManifest.cdnBasePath = cdnBasePath;
  await writeJson(writeManifestPath, writeManifest);
  return writeManifest;
}

async function findComponentIds(appDir) {
  const srcDir = path.join(appDir, 'src');
  if (!(await exists(srcDir))) {
    return [];
  }
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const found = [];

  async function visit(dir) {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const info = await stat(full);
      if (info.isDirectory()) {
        await visit(full);
      } else if (entry.endsWith('.manifest.json')) {
        const manifest = JSON.parse(await readFile(full, 'utf8'));
        if (manifest.id) {
          found.push(manifest.id);
        }
      }
    }
  }

  await visit(srcDir);
  return found;
}
