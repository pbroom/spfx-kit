import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(serverDir, '../../..');

export function managedAppsDir(): string {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

export function managedAppSourceRoots(appsDir = managedAppsDir()): string[] {
  return [...scanManagedAppSourceRoots(appsDir).entries.values()];
}

interface ManagedAppSourceRootScan {
  entries: Map<string, string>;
  failedEntries: Set<string>;
  successful: boolean;
}

function scanManagedAppSourceRoots(appsDir: string): ManagedAppSourceRootScan {
  try {
    const entries = new Map<string, string>();
    const failedEntries = new Set<string>();
    for (const entry of fs
      .readdirSync(appsDir, { withFileTypes: true })
      .filter((candidate) => candidate.isDirectory() || candidate.isSymbolicLink())) {
      try {
        const sourceRoot = fs.realpathSync(path.join(appsDir, entry.name));
        if (fs.statSync(sourceRoot).isDirectory()) {
          entries.set(entry.name, sourceRoot);
        }
      } catch {
        failedEntries.add(entry.name);
      }
    }
    return { entries, failedEntries, successful: true };
  } catch {
    return { entries: new Map(), failedEntries: new Set(), successful: false };
  }
}

export interface ManagedAppSourceRootRefresh {
  allowedRoots: string[];
  managedEntries: Map<string, string>;
  managedRoots: string[];
}

export function refreshManagedAppSourceRoots(
  allowedRoots: readonly string[],
  previousManagedEntries: ReadonlyMap<string, string> = new Map(),
  appsDir = managedAppsDir()
): ManagedAppSourceRootRefresh {
  const scan = scanManagedAppSourceRoots(appsDir);
  if (!scan.successful) {
    const managedEntries = new Map(previousManagedEntries);
    return {
      allowedRoots: [...allowedRoots],
      managedEntries,
      managedRoots: [...new Set(managedEntries.values())]
    };
  }

  for (const entryName of scan.failedEntries) {
    const previousRoot = previousManagedEntries.get(entryName);
    if (previousRoot) {
      scan.entries.set(entryName, previousRoot);
    }
  }

  const previousManagedRoots = [...new Set(previousManagedEntries.values())];
  const previousRoots = new Set(previousManagedRoots);
  const managedEntries = new Map(
    [...scan.entries]
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([entryName, sourceRoot]) => [entryName, sourceRoot.replace(/\\/g, '/')])
  );
  const managedRoots = [...new Set(managedEntries.values())];
  return {
    allowedRoots: [...new Set([...allowedRoots.filter((allowedRoot) => !previousRoots.has(allowedRoot)), ...managedRoots])],
    managedEntries,
    managedRoots
  };
}

export function legacyAppsDir(): string {
  return path.join(rootDir, 'apps');
}

export function appPathForMessage(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}
