import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { exists } from '../fs.mjs';
import { childStdio } from './output.mjs';

export async function createArchive(outDir, targets, archivePath) {
  const targetEntries = targets.map((target) => path.relative(outDir, target.dir).split(path.sep)[0]);
  const entries = [...targetEntries, 'README.md', 'manifest.json'].filter((entry, index, arr) => arr.indexOf(entry) === index);
  const result = spawnSync('tar', ['-czf', archivePath, '-C', outDir, ...entries], { stdio: childStdio() });
  if (result.status !== 0) {
    throw new Error(`Could not create export archive: ${archivePath}`);
  }
}

export function exportDirNameForTarget(target, slug) {
  if (target === 'single') {
    return `${slug}-standalone`;
  }
  if (target === 'standalone') {
    return `${slug}-repo`;
  }
  return target;
}

export function archiveSegmentForTarget(target) {
  if (target === 'single') {
    return 'standalone';
  }
  if (target === 'standalone') {
    return 'repo';
  }
  return target;
}

export async function describeTarget(id, label, dir, files) {
  const uniqueFiles = Array.from(new Set(files));
  const items = [];
  let total = 0;
  for (const file of uniqueFiles) {
    if (!(await exists(file))) {
      continue;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      continue;
    }
    total += info.size;
    items.push({
      relativePath: path.relative(dir, file).replace(/\\/g, '/'),
      size: formatBytes(info.size)
    });
  }
  return {
    id,
    label,
    dir,
    totalBytes: total,
    totalSize: formatBytes(total),
    files: items.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  };
}

export function formatBytes(value) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}
