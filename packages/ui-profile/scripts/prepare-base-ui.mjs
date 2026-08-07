import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyPopupLifecycle } from './transform-base-ui-popup-lifecycle.mjs';
import { applySelectValueDeclarations } from './transform-base-ui-select-value.mjs';
import {
  acquirePreparationLock,
  beginBaseUiPreparationTransaction,
  finalizeBaseUiPreparation,
  recoverRetainedBaseUiPreparation
} from './lib/preparation-lock.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const preparedParent = path.join(packageRoot, '.prepared');
const preparedRoot = path.join(preparedParent, 'base-ui');
const backupRoot = path.join(preparedParent, '.base-ui-backup');
const lockRoot = path.join(preparedParent, '.base-ui-prepare-lock');
const BASE_UI_VERSION = '1.6.0';
const BASE_UI_RESOLVED = 'https://registry.npmjs.org/@base-ui/react/-/react-1.6.0.tgz';
const BASE_UI_INTEGRITY = 'sha512-/jzjTWJYXhRFO45Bev9lc3cHbmjzCMpUqbMZ2AgKy/z25mY9B6shGSNcXcjQar9n5doM0KYW1W8fcFv2jZBuMw==';
// Derived independently from the npm-verified tarball named by BASE_UI_RESOLVED/BASE_UI_INTEGRITY.
const BASE_UI_TREE_SHA256 = 'd0a77f132c4d1dd4a0f5e4e91d36cfc774ac9dcdde74c91bcbb44f56dca4161f';

export async function baseUiTreeSha256(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        files.push([
          path.relative(root, absolute).replaceAll(path.sep, '/'),
          createHash('sha256')
            .update(await readFile(absolute))
            .digest('hex')
        ]);
      } else {
        throw new Error(`Installed Base UI contains a non-file entry: ${path.relative(root, absolute)}`);
      }
    }
  }
  await visit(root);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

async function installedBaseUiRoot() {
  const require = createRequire(import.meta.url);
  const packageManifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  if (packageManifest.devDependencies?.['@base-ui/react'] !== BASE_UI_VERSION) {
    throw new Error('Base UI package dependency differs from the pinned preparation contract');
  }
  if (lock.packages?.['packages/ui-profile']?.devDependencies?.['@base-ui/react'] !== BASE_UI_VERSION) {
    throw new Error('Base UI workspace lock dependency differs from the pinned preparation contract');
  }
  const locked = lock.packages?.['node_modules/@base-ui/react'];
  if (locked?.version !== BASE_UI_VERSION || locked.resolved !== BASE_UI_RESOLVED || locked.integrity !== BASE_UI_INTEGRITY) {
    throw new Error('Base UI lockfile identity differs from the pinned preparation contract');
  }
  const resolvedManifestPath = require.resolve('@base-ui/react/package.json');
  const resolvedManifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  if (resolvedManifest.name !== '@base-ui/react' || resolvedManifest.version !== BASE_UI_VERSION) {
    throw new Error(
      `Resolved Base UI package ${resolvedManifest.name ?? 'unknown'}@${resolvedManifest.version ?? 'unknown'} instead of pinned @base-ui/react@${BASE_UI_VERSION}`
    );
  }
  const resolvedRoot = await realpath(path.dirname(resolvedManifestPath));
  const lockedRoot = await realpath(path.join(repositoryRoot, 'node_modules/@base-ui/react'));
  if (resolvedRoot !== lockedRoot) throw new Error('Resolved Base UI root differs from the lockfile package root');
  if ((await baseUiTreeSha256(resolvedRoot)) !== BASE_UI_TREE_SHA256) {
    throw new Error('Installed Base UI package tree differs from the pinned preparation contract');
  }
  return resolvedRoot;
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function prepareBaseUi() {
  const installedRoot = await installedBaseUiRoot();
  await mkdir(preparedParent, { recursive: true });
  await recoverRetainedBaseUiPreparation({ lockRoot, preparedRoot, backupRoot });
  const lockOwner = await acquirePreparationLock(lockRoot);
  let stagingRoot;
  let transactionStarted = false;
  let failure;
  try {
    if (await pathExists(backupRoot)) {
      throw new Error(`Unjournaled Base UI backup exists at ${backupRoot}; refusing to delete or stage over it`);
    }
    stagingRoot = await mkdtemp(path.join(preparedParent, '.base-ui-staging-'));
    await cp(installedRoot, stagingRoot, { recursive: true });
    if ((await baseUiTreeSha256(stagingRoot)) !== BASE_UI_TREE_SHA256) {
      throw new Error('Staged Base UI package tree differs from the pinned installation');
    }
    await applySelectValueDeclarations(stagingRoot);
    await applyPopupLifecycle(stagingRoot);

    const hadPrepared = await pathExists(preparedRoot);
    const journaled = await beginBaseUiPreparationTransaction(lockRoot, lockOwner.token, {
      preparedRoot,
      backupRoot,
      stagingRoot,
      hadPrepared
    });
    if (!journaled) throw new Error('Base UI preparation lost lock ownership before journaling');
    transactionStarted = true;

    if (hadPrepared) {
      await rename(preparedRoot, backupRoot);
    }
    await rename(stagingRoot, preparedRoot);
    await rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    failure = error;
  }

  await finalizeBaseUiPreparation({
    operationFailure: failure,
    stagingRoot,
    preparedRoot,
    backupRoot,
    transactionStarted,
    lockRoot,
    token: lockOwner.token
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareBaseUi();
  console.log('Prepared isolated @base-ui/react@1.6.0 compatibility copy');
}
