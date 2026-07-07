import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(serverDir, '../../..');

export function managedAppsDir(): string {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

export function legacyAppsDir(): string {
  return path.join(rootDir, 'apps');
}

export function appPathForMessage(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}
