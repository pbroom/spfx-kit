import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { runGeneratedReplacementTransaction } from './generation-transaction.mjs';

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function replaceGeneratedPaths({
  packageRoot,
  stagingRoot,
  generatedPaths,
  fileSystem = {},
  generationSession,
  onBoundary,
  legacyTestOnly = false
}) {
  if (!Array.isArray(generatedPaths) || generatedPaths.length === 0) {
    throw new Error('Generated replacement requires at least one path');
  }
  if (new Set(generatedPaths).size !== generatedPaths.length) {
    throw new Error('Generated replacement paths must be unique');
  }
  if (!generationSession && !legacyTestOnly) {
    throw new Error('Generated profile replacement requires a full-command generation session');
  }
  for (const relativePath of generatedPaths) {
    if (
      typeof relativePath !== 'string' ||
      relativePath.length === 0 ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/u).includes('..')
    ) {
      throw new Error(`Unsafe generated replacement path: ${String(relativePath)}`);
    }
    await access(path.join(stagingRoot, relativePath));
  }

  if (generationSession) {
    if (Object.keys(fileSystem).length > 0) {
      throw new Error('Generated profile transactions do not accept injected filesystem operations');
    }
    return runGeneratedReplacementTransaction({
      session: generationSession,
      stagingRoot,
      generatedPaths,
      onBoundary: onBoundary ?? generationSession.onBoundary
    });
  }

  // Kept only for isolated fault-injection tests. Production update and
  // regeneration callers must provide a full-command generation session.
  const move = fileSystem.rename ?? rename;
  const remove = fileSystem.rm ?? rm;
  const backupRoot = await mkdtemp(path.join(packageRoot, '.profile-backup-'));
  const backedUp = [];
  const installed = [];
  let preserveBackup = false;
  try {
    for (const relativePath of generatedPaths) {
      const current = path.join(packageRoot, relativePath);
      const staged = path.join(stagingRoot, relativePath);
      const backup = path.join(backupRoot, relativePath);
      if (await pathExists(current)) {
        await mkdir(path.dirname(backup), { recursive: true });
        await move(current, backup);
        backedUp.push(relativePath);
      }
      await mkdir(path.dirname(current), { recursive: true });
      await move(staged, current);
      installed.push(relativePath);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const relativePath of [...installed].reverse()) {
      try {
        await remove(path.join(packageRoot, relativePath), { recursive: true, force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const relativePath of [...backedUp].reverse()) {
      try {
        const current = path.join(packageRoot, relativePath);
        await mkdir(path.dirname(current), { recursive: true });
        await move(path.join(backupRoot, relativePath), current);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      preserveBackup = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Generated replacement and rollback both failed; backup preserved at ${backupRoot}`
      );
    }
    throw error;
  } finally {
    if (!preserveBackup) await remove(backupRoot, { recursive: true, force: true });
  }
}
