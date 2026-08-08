import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readSppkgClientSideAssets } from '../sppkg.mjs';

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/giu;

export async function createUiProfileExportClosure(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('UI profile export closure requires a resolved delivery artifact');
  }
  const packageRoot = await realpath(path.dirname(artifact.profilePath));
  const cssPath = await realpath(artifact.cssPath);
  const cssBytes = await readFile(cssPath);
  const assets = [];
  for (const reference of parseRelativeCssAssets(cssBytes.toString('utf8'))) {
    const assetPath = path.resolve(path.dirname(cssPath), reference);
    const relativePath = assertOwnedPath(packageRoot, assetPath, `CSS asset ${reference}`);
    const stats = await lstat(assetPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`UI profile CSS asset must be a regular file: ${reference}`);
    }
    const resolvedAsset = await realpath(assetPath);
    assertOwnedPath(packageRoot, resolvedAsset, `CSS asset ${reference}`);
    const bytes = await readFile(resolvedAsset);
    assets.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }

  const descriptor = {
    schemaVersion: 1,
    profileId: artifact.profileId,
    profileSha256: artifact.profileSha256,
    provenanceSha256: artifact.provenanceSha256,
    scopeValue: artifact.scopeValue,
    css: {
      path: toPortablePath(path.relative(packageRoot, cssPath)),
      deliveryPath: `spfx-ui-profile/${artifact.cssSha256}.css`,
      bytes: cssBytes.byteLength,
      sha256: artifact.cssSha256,
      assets: assets
        .map((asset) => ({
          ...asset,
          deliveryPath: deliveryAssetPath(artifact.cssSha256, path.relative(path.dirname(cssPath), path.join(packageRoot, asset.path)))
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
    }
  };
  return Object.freeze({
    descriptor: Object.freeze(descriptor),
    descriptorSha256: sha256(canonicalJson(descriptor)),
    profilePath: artifact.profilePath,
    sourceBinding: null
  });
}

export async function bindUiProfileExportClosureToApp(closure, appDir) {
  if (!closure) return null;
  const bindings = await findExactCssImports(path.join(appDir, 'src'), closure);
  if (!bindings.length) return null;
  return Object.freeze({ ...closure, sourceBinding: Object.freeze(bindings) });
}

export async function clearUiProfileBuildOutputs(appDir, clearGeneratedCdnOutputs, expectedSppkgPath) {
  await clearGeneratedCdnOutputs(appDir);
  await rm(await expectedSppkgPath(appDir), { force: true });
}

export async function verifyEmbeddedUiProfileClosure(packageFile, closure) {
  const assets = (await readSppkgClientSideAssets(packageFile)).map(({ path: filePath, contents }) => ({
    path: filePath,
    contents,
    bytes: contents.byteLength,
    sha256: sha256(contents)
  }));
  if (!assets.length) {
    throw new Error('Embedded SPFx package contains no ClientSideAssets');
  }
  assertExactCssArtifact(assets, closure, 'embedded ClientSideAssets');
  assertDeclaredAssets(assets, closure, 'embedded ClientSideAssets');
  return targetProof('embedded', closure, assets);
}

export async function verifyExternalUiProfileClosure(build, closure) {
  const assets = await reconcileExternalAssetTrees([build.releaseAssetsDir, build.deployAssetsDir]);
  if (!assets.length) {
    throw new Error('External SPFx asset trees are empty');
  }
  assertExactCssArtifact(assets, closure, 'external SPFx asset trees');
  assertDeclaredAssets(assets, closure, 'external SPFx asset trees');
  return targetProof('external', closure, assets);
}

export async function materializeUiProfileTargetAssets(targetRoot, closure) {
  const profileRoot = await realpath(path.dirname(closure.profilePath));
  const copies = [
    { source: path.join(profileRoot, closure.descriptor.css.path), target: closure.descriptor.css.deliveryPath },
    ...closure.descriptor.css.assets.map((asset) => ({ source: path.join(profileRoot, asset.path), target: asset.deliveryPath }))
  ];
  const assets = [];
  for (const copy of copies) {
    const target = safeTargetPath(targetRoot, copy.target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(copy.source, target);
    const contents = await readFile(target);
    assets.push({ path: copy.target, contents, bytes: contents.byteLength, sha256: sha256(contents) });
  }
  assertExactCssArtifact(assets, closure, 'materialized UI profile target assets');
  return assets;
}

export async function materializeStandaloneUiProfileClosure(sourceDir, targetDir, closure) {
  const profileRoot = await realpath(path.dirname(closure.profilePath));
  const materialRoot = safeTargetPath(targetDir, 'spfx-ui-profile');
  await rm(materialRoot, { recursive: true, force: true });
  const targetAssets = await materializeUiProfileTargetAssets(targetDir, closure);
  for (const [sourceName, targetName, expectedSha256] of [
    ['profile.json', 'spfx-ui-profile/profile.json', closure.descriptor.profileSha256],
    ['provenance.json', 'spfx-ui-profile/provenance.json', closure.descriptor.provenanceSha256]
  ]) {
    const target = safeTargetPath(targetDir, targetName);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(profileRoot, sourceName), target);
    if (sha256(await readFile(target)) !== expectedSha256) {
      throw new Error(`Standalone copied UI profile material differs: ${sourceName}`);
    }
  }
  for (const binding of closure.sourceBinding || []) {
    const targetSource = safeTargetPath(targetDir, binding.path);
    const source = await readFile(targetSource, 'utf8');
    const cssTarget = safeTargetPath(targetDir, closure.descriptor.css.deliveryPath);
    let rewrittenImport = toPortablePath(path.relative(path.dirname(targetSource), cssTarget));
    if (!rewrittenImport.startsWith('.')) rewrittenImport = `./${rewrittenImport}`;
    const rewritten = replaceExactCssImport(source, binding.importSpecifier, rewrittenImport);
    await writeFile(targetSource, rewritten);
  }
  return verifyStandaloneUiProfileClosure(sourceDir, targetDir, closure, { targetAssets });
}

export async function verifyStandaloneUiProfileClosure(sourceDir, targetDir, closure, options = {}) {
  if (!closure.sourceBinding?.length) {
    throw new Error('Standalone UI profile proof requires an exact source binding');
  }
  const bindings = [];
  for (const source of closure.sourceBinding) {
    const sourceFile = path.join(sourceDir, source.path);
    const targetFile = path.join(targetDir, source.path);
    const [sourceBytes, targetSource] = await Promise.all([readFile(sourceFile), readFile(targetFile, 'utf8')]);
    const sourceSha256 = sha256(sourceBytes);
    if (sourceSha256 !== source.sha256) {
      throw new Error(`Standalone source changed before UI profile export: ${source.path}`);
    }
    const cssTarget = safeTargetPath(targetDir, closure.descriptor.css.deliveryPath);
    const importSpecifier = findImportedCssSpecifier(targetSource, cssTarget, targetFile);
    bindings.push({ path: source.path, sourceSha256, exportedSha256: sha256(targetSource), importSpecifier });
  }
  const targetAssets = options.targetAssets || (await describeTargetMaterial(targetDir, closure));
  assertExactCssArtifact(targetAssets, closure, 'standalone export');
  return {
    schemaVersion: 1,
    mode: 'standalone-source',
    descriptorSha256: closure.descriptorSha256,
    status: 'passed',
    bindings
  };
}

export async function writeUiProfileDeliveryEvidence(outDir, closure, targets, writeJson) {
  if (!closure) return null;
  const proofs = targets.map((target) => ({ target: target.id, ...target.uiProfileDelivery }));
  if (proofs.some((proof) => proof.descriptorSha256 !== closure.descriptorSha256 || proof.status !== 'passed')) {
    throw new Error('UI profile delivery target proofs do not share the export descriptor');
  }
  const evidencePath = path.join(outDir, 'ui-profile-delivery.json');
  await writeJson(evidencePath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    descriptorSha256: closure.descriptorSha256,
    descriptor: closure.descriptor,
    targets: proofs
  });
  return evidencePath;
}

export function withUiProfileTargetProof(target, proof) {
  if (proof) target.uiProfileDelivery = proof;
  return target;
}

function parseRelativeCssAssets(css) {
  const assets = new Set();
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    const value = match[2].trim();
    if (!value || value.startsWith('#') || value.startsWith('data:')) continue;
    if (
      value.includes('\\') ||
      value.includes('\0') ||
      value.includes('?') ||
      value.includes('#') ||
      path.posix.isAbsolute(value) ||
      value.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/iu.test(value)
    ) {
      throw new Error(`UI profile CSS contains a non-local or ambiguous asset URL: ${value}`);
    }
    assets.add(value);
  }
  return [...assets];
}

async function findExactCssImports(sourceRoot, closure) {
  const result = [];
  for (const file of await walkFiles(sourceRoot, { optional: true })) {
    if (!/\.[cm]?[jt]sx?$/u.test(file.relativePath)) continue;
    const source = (await readFile(file.absolutePath)).toString('utf8');
    const importSpecifiers = [];
    for (const match of source.matchAll(/(?:import|require\()\s*(?:[^'";]+?\s+from\s*)?['"]([^'"]+\.css)['"]/gu)) {
      const candidate = path.resolve(path.dirname(file.absolutePath), match[1]);
      try {
        if ((await realpath(candidate)) === (await realpathFromDescriptor(closure))) importSpecifiers.push(match[1]);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    for (const importSpecifier of importSpecifiers) {
      const bytes = await readFile(file.absolutePath);
      result.push({
        path: toPortablePath(path.relative(path.dirname(sourceRoot), file.absolutePath)),
        sha256: sha256(bytes),
        importSpecifier
      });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function realpathFromDescriptor(closure) {
  const profilePath = closure.profilePath;
  if (!profilePath) throw new Error('UI profile export closure is missing its source path');
  return realpath(path.join(path.dirname(profilePath), closure.descriptor.css.path));
}

async function reconcileExternalAssetTrees(roots) {
  const byPath = new Map();
  for (const root of roots) {
    for (const file of await walkFiles(root, { optional: true })) {
      const bytes = await readFile(file.absolutePath);
      const descriptor = { path: file.relativePath, bytes: bytes.byteLength, sha256: sha256(bytes), contents: bytes };
      const prior = byPath.get(file.relativePath);
      if (prior && prior.sha256 !== descriptor.sha256) {
        throw new Error(`External SPFx asset trees contain conflicting bytes for: ${file.relativePath}`);
      }
      byPath.set(file.relativePath, prior || descriptor);
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function walkFiles(root, { optional = false } = {}) {
  const files = [];
  async function visit(directory, relativeDirectory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (optional && error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) throw new Error(`UI profile delivery tree may not contain symlinks: ${relativePath}`);
      if (stats.isDirectory()) await visit(absolutePath, relativePath);
      else if (stats.isFile()) files.push({ absolutePath, relativePath });
      else throw new Error(`UI profile delivery tree contains a non-regular entry: ${relativePath}`);
    }
  }
  await visit(root, '');
  return files;
}

function assertDeclaredAssets(assets, closure, label) {
  for (const asset of closure.descriptor.css.assets) {
    const exact = assets.some(
      (candidate) => deliveryPathMatches(candidate.path, asset.deliveryPath) && candidate.sha256 === asset.sha256
    );
    if (!exact) throw new Error(`${label} are missing CSS asset ${asset.path}`);
  }
}

function assertExactCssArtifact(assets, closure, label) {
  const exact = assets.find(
    (asset) =>
      deliveryPathMatches(asset.path, closure.descriptor.css.deliveryPath) &&
      asset.sha256 === closure.descriptor.css.sha256
  );
  if (!exact) throw new Error(`${label} is missing the exact manifest CSS artifact`);
}

function deliveryPathMatches(candidatePath, deliveryPath) {
  const candidate = toPortablePath(candidatePath);
  return candidate === deliveryPath || candidate.endsWith(`/${deliveryPath}`);
}

async function describeTargetMaterial(targetDir, closure) {
  const paths = [closure.descriptor.css.deliveryPath, ...closure.descriptor.css.assets.map((asset) => asset.deliveryPath)];
  return Promise.all(
    paths.map(async (relativePath) => {
      const contents = await readFile(safeTargetPath(targetDir, relativePath));
      return { path: relativePath, contents, bytes: contents.byteLength, sha256: sha256(contents) };
    })
  );
}

function replaceExactCssImport(source, priorSpecifier, nextSpecifier) {
  const quoted = [`'${priorSpecifier}'`, `"${priorSpecifier}"`];
  const match = quoted.find((candidate) => source.includes(candidate));
  if (!match) throw new Error(`Standalone UI profile import was not preserved: ${priorSpecifier}`);
  const quote = match[0];
  return source.replace(match, `${quote}${nextSpecifier}${quote}`);
}

function findImportedCssSpecifier(source, expectedCssPath, sourceFile) {
  for (const match of source.matchAll(/(?:import|require\()\s*(?:[^'";]+?\s+from\s*)?['"]([^'"]+\.css)['"]/gu)) {
    const candidate = path.resolve(path.dirname(sourceFile), match[1]);
    if (candidate === expectedCssPath) return match[1];
  }
  throw new Error('Standalone UI profile import does not resolve inside the export');
}

function deliveryAssetPath(cssSha256, relativeAssetPath) {
  const candidate = path.posix.normalize(path.posix.join(`spfx-ui-profile/${cssSha256}.css`, '..', toPortablePath(relativeAssetPath)));
  if (candidate.startsWith('../') || path.posix.isAbsolute(candidate)) {
    throw new Error(`UI profile CSS asset delivery path escapes the export: ${relativeAssetPath}`);
  }
  return candidate;
}

function safeTargetPath(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`UI profile target path escapes the export: ${relativePath}`);
  }
  return target;
}

function targetProof(mode, closure, assets) {
  const files = assets.map(({ path: filePath, bytes, sha256: digest }) => ({ path: filePath, bytes, sha256: digest }));
  return {
    schemaVersion: 1,
    mode,
    descriptorSha256: closure.descriptorSha256,
    status: 'passed',
    files: files.length,
    treeSha256: sha256(canonicalJson(files))
  };
}

function assertOwnedPath(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the UI profile`);
  }
  return toPortablePath(relative);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function toPortablePath(value) {
  return value.split(path.sep).join('/');
}
