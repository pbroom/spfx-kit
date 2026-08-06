import { access, cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
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
const preparedParent = path.join(packageRoot, '.prepared');
const preparedRoot = path.join(preparedParent, 'base-ui');
const backupRoot = path.join(preparedParent, '.base-ui-backup');
const lockRoot = path.join(preparedParent, '.base-ui-prepare-lock');

function installedBaseUiRoot() {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve('@base-ui/react/package.json'));
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
    await cp(installedBaseUiRoot(), stagingRoot, { recursive: true });
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
