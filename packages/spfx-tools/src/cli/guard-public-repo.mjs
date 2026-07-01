#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const rootDir = process.cwd();
  const visibleFiles = gitListFiles(rootDir);
  const blockedFiles = visibleFiles.filter(isBlockedPublicPath);
  const lockIssues = await readLockfileIssues(rootDir);
  const issues = [...blockedFiles.map((file) => `public file should be ignored or moved: ${file}`), ...lockIssues];

  if (issues.length) {
    throw new Error(`Public repo guard failed:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
  }

  console.log('Public repo guard passed.');
}

function gitListFiles(rootDir) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Could not inspect git-visible files.');
  }
  return result.stdout.split('\0').filter(Boolean).sort();
}

function isBlockedPublicPath(file) {
  return (
    file === 'apps/lab/src/generated/lab-registry.ts' ||
    file.startsWith('apps/lab/src/generated/') ||
    file.startsWith('.spfx-kit/') ||
    /^apps\/[^/]+-spfx\//.test(file)
  );
}

async function readLockfileIssues(rootDir) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return [];
  }

  const issues = [];
  const workspaces = lock.packages?.['']?.workspaces || [];
  if (Array.isArray(workspaces) && workspaces.includes('apps/*')) {
    issues.push('package-lock.json root workspaces must not include apps/*');
  }

  for (const key of Object.keys(lock.packages || {})) {
    if (/^apps\/[^/]+-spfx(?:\/|$)/.test(key) || key.startsWith('.spfx-kit/')) {
      issues.push(`package-lock.json contains local app entry: ${key}`);
    }
  }

  return issues;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
