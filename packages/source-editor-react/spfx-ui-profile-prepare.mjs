import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_UI_PACKAGE = '@base-ui/react';
const BASE_UI_VERSION = '1.6.0';
const BASE_UI_RESOLVED = 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz';
const BASE_UI_INTEGRITY = 'sha512-/jzjTWJYXhRFO45Bev9lc3cHbmjzCMpUqbMZ2AgKy/z25mY9B6shGSNcXcjQar9n5doM0KYW1W8fcFv2jZBuMw==';
const BASE_UI_TREE_SHA256 = 'd0a77f132c4d1dd4a0f5e4e91d36cfc774ac9dcdde74c91bcbb44f56dca4161f';
const STAMP_FILE = '.spfx-ui-profile-prepared.json';
const EXPORT_PATH = './spfx-id-ownership';
const EXPORT_CONTRACT = {
  import: { types: './spfx-id-ownership.d.mts', default: './spfx-id-ownership.mjs' },
  require: { types: './spfx-id-ownership.d.ts', default: './spfx-id-ownership.js' },
  default: { types: './spfx-id-ownership.d.mts', default: './spfx-id-ownership.mjs' }
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function treeSha256(root, ignored = new Set()) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      if (ignored.has(relative)) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push([relative, sha256(await readFile(absolute))]);
      else throw new Error(`Base UI contains a non-file entry: ${relative}`);
    }
  }
  await visit(root);
  return sha256(JSON.stringify(files));
}

function contractRelativePath(sourcePath) {
  const marker = 'packages/ui-profile/';
  if (!sourcePath.startsWith(marker)) throw new Error(`Unsupported prepared Base UI contract path: ${sourcePath}`);
  return sourcePath.slice(marker.length);
}

async function readVerified(profileRoot, relativePath, expectedSha256, label) {
  const target = path.resolve(profileRoot, relativePath);
  const relative = path.relative(profileRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes the vendored UI profile`);
  }
  const bytes = await readFile(target);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${label} digest differs`);
  return bytes;
}

async function readContracts(profileRoot, profileManifest) {
  const contracts = {};
  for (const binding of profileManifest.preparedBaseUi.contracts) {
    const relativePath = contractRelativePath(binding.path);
    const bytes = await readVerified(profileRoot, relativePath, binding.sha256, `Prepared Base UI contract ${binding.path}`);
    const contract = JSON.parse(bytes.toString('utf8'));
    if (contract.package !== BASE_UI_PACKAGE || contract.version !== BASE_UI_VERSION) {
      throw new Error(`Prepared Base UI contract ${binding.path} has an unsupported package identity`);
    }
    contracts[path.basename(path.dirname(relativePath))] = { contract, sha256: binding.sha256 };
  }
  for (const required of ['id-ownership', 'popup-lifecycle', 'select-value']) {
    if (!contracts[required]) throw new Error(`Prepared Base UI contract is missing: ${required}`);
  }
  return contracts;
}

async function verifyContractFixtures(profileRoot, contracts) {
  for (const file of contracts['id-ownership'].contract.providerFiles) {
    await readVerified(profileRoot, file.sourcePath, file.sha256, file.sourcePath);
  }
  for (const file of contracts['popup-lifecycle'].contract.files) {
    await readVerified(profileRoot, file.originalPath, file.originalSha256, file.originalPath);
    await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
  }
  for (const file of contracts['select-value'].contract.files) {
    await readVerified(profileRoot, file.upstreamPath, file.upstreamSha256, file.upstreamPath);
    await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
  }
}

async function resolveInstalledBaseUi(appRoot) {
  const packageManifest = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
  const declared = packageManifest.dependencies?.[BASE_UI_PACKAGE] ?? packageManifest.devDependencies?.[BASE_UI_PACKAGE];
  if (declared !== BASE_UI_VERSION) throw new Error(`${BASE_UI_PACKAGE} must be pinned exactly to ${BASE_UI_VERSION}`);

  const lock = JSON.parse(await readFile(path.join(appRoot, 'package-lock.json'), 'utf8'));
  const locked = lock.packages?.[`node_modules/${BASE_UI_PACKAGE}`];
  if (locked?.version !== BASE_UI_VERSION || locked.resolved !== BASE_UI_RESOLVED || locked.integrity !== BASE_UI_INTEGRITY) {
    throw new Error(`Installed ${BASE_UI_PACKAGE} lock identity differs from the pinned preparation contract`);
  }

  const require = createRequire(path.join(appRoot, 'package.json'));
  const resolvedManifestPath = require.resolve(`${BASE_UI_PACKAGE}/package.json`);
  const resolvedRoot = await realpath(path.dirname(resolvedManifestPath));
  const expectedRoot = await realpath(path.join(appRoot, 'node_modules', '@base-ui', 'react'));
  if (resolvedRoot !== expectedRoot) throw new Error(`Resolved ${BASE_UI_PACKAGE} is not app-local`);
  const resolvedManifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  if (resolvedManifest.name !== BASE_UI_PACKAGE || resolvedManifest.version !== BASE_UI_VERSION) {
    throw new Error(`Resolved Base UI package identity differs from ${BASE_UI_PACKAGE}@${BASE_UI_VERSION}`);
  }
  if ((await treeSha256(resolvedRoot)) !== BASE_UI_TREE_SHA256) {
    throw new Error(`Installed ${BASE_UI_PACKAGE} package tree differs from the pinned preparation contract`);
  }
  return resolvedRoot;
}

async function applySelectValue(profileRoot, stagingRoot, contract) {
  const from = contract.replacement.from;
  const to = contract.replacement.to;
  for (const file of contract.files) {
    const upstream = await readVerified(profileRoot, file.upstreamPath, file.upstreamSha256, file.upstreamPath);
    const expected = await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
    const source = upstream.toString('utf8');
    if (source.split(from).length - 1 !== 1) throw new Error(`${file.upstreamPath}: unsupported declaration shape`);
    if (Buffer.from(source.replace(from, to)).compare(expected) !== 0) {
      throw new Error(`${file.installedPath}: transformed declaration differs from the exact fixture`);
    }
    const target = path.join(stagingRoot, file.installedPath);
    const installed = await readFile(target);
    if (sha256(installed) !== file.upstreamSha256) throw new Error(`${file.installedPath}: installed bytes differ`);
    await writeFile(target, expected);
  }
}

async function applyPopupLifecycle(profileRoot, stagingRoot, contract) {
  for (const file of contract.files) {
    const original = await readVerified(profileRoot, file.originalPath, file.originalSha256, file.originalPath);
    const transformed = await readVerified(profileRoot, file.transformedPath, file.transformedSha256, file.transformedPath);
    const target = path.join(stagingRoot, file.installedPath);
    const installed = await readFile(target);
    if (sha256(installed) !== file.originalFileSha256) throw new Error(`${file.installedPath}: installed bytes differ`);
    const originalFragment = original.toString('utf8').trimEnd();
    const transformedFragment = transformed.toString('utf8').trimEnd();
    const source = installed.toString('utf8');
    if (source.split(originalFragment).length - 1 !== 1 || source.includes(transformedFragment)) {
      throw new Error(`${file.installedPath}: unsupported popup lifecycle shape`);
    }
    const output = Buffer.from(source.replace(originalFragment, transformedFragment));
    if (sha256(output) !== file.transformedFileSha256) throw new Error(`${file.installedPath}: transformed digest differs`);
    await writeFile(target, output);
  }
}

async function applyIdOwnership(profileRoot, stagingRoot, contract) {
  const manifestPath = path.join(stagingRoot, contract.packageManifest.installedPath);
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== contract.packageManifest.originalFileSha256) {
    throw new Error('Base UI package manifest differs from the ID ownership contract');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest.exports || Array.isArray(manifest.exports) || typeof manifest.exports !== 'object') {
    throw new Error('Base UI package manifest must expose an object exports map');
  }
  if (manifest.exports[EXPORT_PATH] !== undefined) throw new Error(`${EXPORT_PATH}: an export already exists`);
  manifest.exports[EXPORT_PATH] = EXPORT_CONTRACT;
  const transformedManifest = Buffer.from(JSON.stringify(manifest, null, 2));
  if (sha256(transformedManifest) !== contract.packageManifest.transformedFileSha256) {
    throw new Error('Base UI transformed package manifest digest differs');
  }
  await writeFile(manifestPath, transformedManifest);
  for (const file of contract.providerFiles) {
    const source = await readVerified(profileRoot, file.sourcePath, file.sha256, file.sourcePath);
    await writeFile(path.join(stagingRoot, file.installedPath), source, { flag: 'wx' });
  }
}

async function preparedTreeIsCurrent(preparedRoot, contractDigests) {
  if (!(await exists(path.join(preparedRoot, STAMP_FILE)))) return false;
  try {
    const stamp = JSON.parse(await readFile(path.join(preparedRoot, STAMP_FILE), 'utf8'));
    return (
      stamp.schemaVersion === 1 &&
      stamp.package === `${BASE_UI_PACKAGE}@${BASE_UI_VERSION}` &&
      stamp.sourceTreeSha256 === BASE_UI_TREE_SHA256 &&
      JSON.stringify(stamp.contracts) === JSON.stringify(contractDigests) &&
      stamp.preparedTreeSha256 === (await treeSha256(preparedRoot, new Set([STAMP_FILE])))
    );
  } catch {
    return false;
  }
}

export async function prepareSpfxUiProfileBaseUi({ appRoot, profileRoot }) {
  if (!appRoot || !profileRoot) throw new Error('Base UI preparation requires appRoot and profileRoot');
  const resolvedAppRoot = await realpath(appRoot);
  const resolvedProfileRoot = await realpath(profileRoot);
  const profileManifest = JSON.parse(await readFile(path.join(resolvedProfileRoot, 'manifest.json'), 'utf8'));
  if (profileManifest.preparedBaseUi.package !== BASE_UI_PACKAGE || profileManifest.preparedBaseUi.version !== BASE_UI_VERSION) {
    throw new Error('Vendored UI profile prepared Base UI identity differs');
  }
  const contracts = await readContracts(resolvedProfileRoot, profileManifest);
  await verifyContractFixtures(resolvedProfileRoot, contracts);
  const contractDigests = Object.fromEntries(
    Object.entries(contracts)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([name, value]) => [name, value.sha256])
  );

  const preparedParent = path.join(resolvedAppRoot, 'temp', 'spfx-ui-profile');
  const preparedRoot = path.join(preparedParent, 'base-ui');
  const backupRoot = path.join(preparedParent, '.base-ui-backup');
  const lockRoot = path.join(preparedParent, '.base-ui-prepare-lock');
  await mkdir(preparedParent, { recursive: true });
  try {
    await mkdir(lockRoot);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error('Another Base UI preparation is already in progress', { cause: error });
    }
    throw error;
  }

  let stagingRoot;
  let movedPreparedToBackup = false;
  try {
    const installedRoot = await resolveInstalledBaseUi(resolvedAppRoot);
    if (await preparedTreeIsCurrent(preparedRoot, contractDigests)) return preparedRoot;
    if (await exists(backupRoot)) throw new Error('A retained Base UI backup requires manual inspection');
    stagingRoot = await mkdtemp(path.join(preparedParent, '.base-ui-staging-'));
    await cp(installedRoot, stagingRoot, { recursive: true });
    if ((await treeSha256(stagingRoot)) !== BASE_UI_TREE_SHA256) throw new Error('Staged Base UI tree differs');
    await applySelectValue(resolvedProfileRoot, stagingRoot, contracts['select-value'].contract);
    await applyPopupLifecycle(resolvedProfileRoot, stagingRoot, contracts['popup-lifecycle'].contract);
    await applyIdOwnership(resolvedProfileRoot, stagingRoot, contracts['id-ownership'].contract);
    const preparedTreeSha256 = await treeSha256(stagingRoot);
    await writeFile(
      path.join(stagingRoot, STAMP_FILE),
      `${JSON.stringify({
        schemaVersion: 1,
        package: `${BASE_UI_PACKAGE}@${BASE_UI_VERSION}`,
        sourceTreeSha256: BASE_UI_TREE_SHA256,
        preparedTreeSha256,
        contracts: contractDigests
      })}\n`
    );
    if (await exists(preparedRoot)) {
      await rename(preparedRoot, backupRoot);
      movedPreparedToBackup = true;
    }
    await rename(stagingRoot, preparedRoot);
    stagingRoot = undefined;
    await rm(backupRoot, { recursive: true, force: true });
    movedPreparedToBackup = false;
    return preparedRoot;
  } catch (error) {
    if (movedPreparedToBackup && !(await exists(preparedRoot)) && (await exists(backupRoot))) {
      await rename(backupRoot, preparedRoot);
    }
    throw error;
  } finally {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    await rm(lockRoot, { recursive: true, force: true });
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prepared = await prepareSpfxUiProfileBaseUi({
    appRoot: readOption('--app-root'),
    profileRoot: readOption('--profile-root')
  });
  console.log(prepared);
}
