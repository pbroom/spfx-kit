import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(serverDir, '../../..');

export function managedAppsDir(): string {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

export function managedAppSourceRoots(): string[] {
  const appsDir = managedAppsDir();

  if (!fs.existsSync(appsDir)) return [];

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
}

export function legacyAppsDir(): string {
  return path.join(rootDir, 'apps');
}

export function appPathForMessage(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}
