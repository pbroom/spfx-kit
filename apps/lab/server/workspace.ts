import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { appPathForMessage, legacyAppsDir, managedAppsDir, rootDir } from './paths';

export interface ManagedLabApp {
  id: string;
  packageName: string;
  relativeDir: string;
  status: 'connected' | 'disconnected' | 'missing';
  adapterPath?: string;
  disabledAdapterPath?: string;
}

export interface WorkspaceApp {
  id: string;
  dir: string;
  packageName: string;
  relativeDir: string;
}

export interface LabAdapterInfo {
  status: ManagedLabApp['status'];
  activePath?: string;
  disabledPath: string;
}

export async function resolveWorkspaceFile(requestedPath: string): Promise<string> {
  const [workspaceRoot, file] = await Promise.all([realpath(rootDir), realpath(path.resolve(requestedPath))]);
  const relative = path.relative(workspaceRoot, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Archive path is outside this workspace.');
  }
  return file;
}

export async function syncLabRegistry() {
  const result = await runWorkspaceNodeCommand(['packages/spfx-tools/src/cli/sync-lab.mjs', '--json']);
  let syncedAdapters: number | undefined;
  try {
    const parsed = JSON.parse(result.stdout) as { syncedAdapters?: unknown };
    syncedAdapters = typeof parsed.syncedAdapters === 'number' ? parsed.syncedAdapters : undefined;
  } catch {
    throw new Error(`sync-lab --json did not return JSON:\n${result.stdout.slice(0, 500)}`);
  }
  return {
    stdout: result.stdout,
    syncedAdapters
  };
}

export async function listManagedLabApps(): Promise<ManagedLabApp[]> {
  const apps: ManagedLabApp[] = [];

  for (const entry of await listManagedAppEntries()) {
    const app = await readWorkspaceApp(entry.id);
    if (!app || app.packageName === '@spfx-kit/lab') {
      continue;
    }

    const adapter = await describeLabAdapter(app.dir);
    apps.push({
      id: app.id,
      packageName: app.packageName,
      relativeDir: app.relativeDir,
      status: adapter.status,
      ...(adapter.activePath ? { adapterPath: path.relative(rootDir, adapter.activePath).replace(/\\/g, '/') } : {}),
      ...((await exists(adapter.disabledPath))
        ? { disabledAdapterPath: path.relative(rootDir, adapter.disabledPath).replace(/\\/g, '/') }
        : {})
    });
  }

  return apps.sort((a, b) => a.id.localeCompare(b.id));
}

export async function unlinkLabApp(appId: string): Promise<{ message: string; syncedAdapters?: number }> {
  const app = await requireWorkspaceApp(appId);
  if (app.packageName === '@spfx-kit/lab') {
    throw new Error('The lab app cannot be unlinked from itself.');
  }

  const adapter = await describeLabAdapter(app.dir);
  if (adapter.status === 'disconnected') {
    const sync = await syncLabRegistry();
    return {
      message: `${app.relativeDir} is already disconnected from the lab.`,
      syncedAdapters: sync.syncedAdapters
    };
  }
  if (!adapter.activePath) {
    throw new Error(`No lab adapter found for ${app.relativeDir}.`);
  }
  if (await exists(adapter.disabledPath)) {
    throw new Error(`A disabled lab adapter already exists for ${app.relativeDir}. Re-sync it before unlinking again.`);
  }

  await mkdir(path.dirname(adapter.disabledPath), { recursive: true });
  await rename(adapter.activePath, adapter.disabledPath);
  const sync = await syncLabRegistry();
  return {
    message: `Unlinked ${app.relativeDir} from the lab. App files were left in place.`,
    syncedAdapters: sync.syncedAdapters
  };
}

export async function reconnectLabApp(appId: string): Promise<boolean> {
  const app = await requireWorkspaceApp(appId);
  if (app.packageName === '@spfx-kit/lab') {
    throw new Error('The lab app is already connected.');
  }

  const adapter = await describeLabAdapter(app.dir);
  if (adapter.activePath) {
    return false;
  }
  if (!(await exists(adapter.disabledPath))) {
    throw new Error(`No disconnected lab adapter found for ${app.relativeDir}.`);
  }

  const preferredPath = preferredLabAdapterPath(app.dir);
  await mkdir(path.dirname(preferredPath), { recursive: true });
  await rename(adapter.disabledPath, preferredPath);
  return true;
}

export async function readWorkspaceApp(appId: string): Promise<WorkspaceApp | undefined> {
  const appDir = await resolveManagedAppDir(appId);
  if (!appDir) {
    return undefined;
  }
  const packagePath = path.join(appDir, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: unknown };
  return {
    id: appId,
    dir: appDir,
    packageName: typeof packageJson.name === 'string' ? packageJson.name : appId,
    relativeDir: path.relative(rootDir, appDir).replace(/\\/g, '/')
  };
}

export async function requireWorkspaceApp(appId: string): Promise<WorkspaceApp> {
  const app = await readWorkspaceApp(appId);
  if (!app) {
    throw new Error(`No managed SPFx app found at ${appPathForMessage(appId)}.`);
  }
  return app;
}

export async function describeLabAdapter(appDir: string): Promise<LabAdapterInfo> {
  const preferred = preferredLabAdapterPath(appDir);
  const legacy = path.join(appDir, 'src', 'lab', 'register.tsx');
  const disabled = path.join(appDir, '.spfx-kit', 'lab', 'register.disabled.tsx');

  if (await exists(preferred)) {
    return { status: 'connected', activePath: preferred, disabledPath: disabled };
  }
  if (await exists(legacy)) {
    return { status: 'connected', activePath: legacy, disabledPath: disabled };
  }
  if (await exists(disabled)) {
    return { status: 'disconnected', disabledPath: disabled };
  }
  return { status: 'missing', disabledPath: disabled };
}

export function preferredLabAdapterPath(appDir: string) {
  return path.join(appDir, '.spfx-kit', 'lab', 'register.tsx');
}

export async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function runWorkspaceNodeCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: rootDir, env: process.env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Command failed with status ${code}.`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function listManagedAppEntries(): Promise<Array<{ id: string; dir: string }>> {
  const seen = new Set<string>();
  const entries: Array<{ id: string; dir: string }> = [];
  for (const dir of [managedAppsDir(), legacyAppsDir()]) {
    if (!(await exists(dir))) {
      continue;
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'lab') {
        continue;
      }
      if (dir === legacyAppsDir() && !entry.name.endsWith('-spfx')) {
        continue;
      }
      if (seen.has(entry.name)) {
        continue;
      }
      seen.add(entry.name);
      entries.push({ id: entry.name, dir: path.join(dir, entry.name) });
    }
  }
  return entries;
}

async function resolveManagedAppDir(appId: string): Promise<string | undefined> {
  for (const dir of [path.join(managedAppsDir(), appId), path.join(legacyAppsDir(), appId)]) {
    const packagePath = path.join(dir, 'package.json');
    if (await exists(packagePath)) {
      return dir;
    }
  }
  return undefined;
}
