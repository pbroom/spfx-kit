import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(serverDir, '../../..');

export function managedAppsDir(): string {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

export function managedAppSourceRoots(appsDir = managedAppsDir()): string[] {
  try {
    return fs
      .readdirSync(appsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .flatMap((entry) => {
        try {
          const sourceRoot = fs.realpathSync(path.join(appsDir, entry.name));
          return fs.statSync(sourceRoot).isDirectory() ? [sourceRoot] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export interface ManagedAppSourceRootRefresh {
  allowedRoots: string[];
  managedRoots: string[];
}

export function refreshManagedAppSourceRoots(
  allowedRoots: readonly string[],
  previousManagedRoots: readonly string[] = [],
  appsDir = managedAppsDir()
): ManagedAppSourceRootRefresh {
  const previousRoots = new Set(previousManagedRoots);
  const managedRoots = [...new Set(managedAppSourceRoots(appsDir).map((sourceRoot) => sourceRoot.replace(/\\/g, '/')))];
  return {
    allowedRoots: [...new Set([...allowedRoots.filter((allowedRoot) => !previousRoots.has(allowedRoot)), ...managedRoots])],
    managedRoots
  };
}

export function legacyAppsDir(): string {
  return path.join(rootDir, 'apps');
}

export function appPathForMessage(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}
