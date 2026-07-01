import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(appDir, '../..');
const labApiIntentHeader = 'x-spfx-kit-lab-intent';

interface ManagedLabApp {
  id: string;
  packageName: string;
  relativeDir: string;
  status: 'connected' | 'disconnected' | 'missing';
  adapterPath?: string;
  disabledAdapterPath?: string;
}

interface WorkspaceApp {
  id: string;
  dir: string;
  packageName: string;
  relativeDir: string;
}

interface LabAdapterInfo {
  status: ManagedLabApp['status'];
  activePath?: string;
  disabledPath: string;
}

export default defineConfig({
  plugins: [react(), spfxAppApi(), spfxExportApi()],
  server: {
    strictPort: false,
    fs: {
      allow: [rootDir]
    }
  }
});

function spfxAppApi(): Plugin {
  return {
    name: 'spfx-kit-app-api',
    configureServer(server) {
      server.middlewares.use('/api/spfx-apps', async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1');
          if (req.method === 'GET' && url.pathname === '/') {
            sendJson(res, { apps: await listManagedLabApps() });
            return;
          }

          if (req.method === 'POST' && url.pathname === '/unlink') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const appId = sanitizeSlug(String(body.appId || ''));
            const result = await unlinkLabApp(appId);
            sendJson(res, {
              appId,
              message: result.message,
              syncedAdapters: result.syncedAdapters,
              apps: await listManagedLabApps()
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === '/sync') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const requestedAppId = String(body.appId || '').trim();
            const appId = requestedAppId ? sanitizeSlug(requestedAppId) : '';
            const reconnected = appId ? await reconnectLabApp(appId) : false;
            const sync = await syncLabRegistry();
            sendJson(res, {
              appId: appId || undefined,
              message: reconnected ? `Reconnected ${appPathForMessage(appId)} to the lab.` : 'Synced the lab app registry.',
              syncedAdapters: sync.syncedAdapters,
              apps: await listManagedLabApps()
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === '/import') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const name = sanitizeAppName(String(body.name || ''));
            const source = sanitizeRequiredText(body.source, 'Source is required.');
            const ref = sanitizeOptionalRef(body.ref);
            const force = body.force === true;
            const args = [
              'packages/spfx-tools/src/cli/import-spfx-app.mjs',
              '--source',
              source,
              '--name',
              name,
              ...(ref ? ['--ref', ref] : []),
              ...(force ? ['--force'] : [])
            ];
            const command = await runWorkspaceNodeCommand(args);
            const sync = await syncLabRegistry();
            const appId = normalizeSpfxSlug(name);
            sendJson(res, {
              appId,
              message: command.stdout.trim() || `Imported ${appPathForMessage(appId)}`,
              syncedAdapters: sync.syncedAdapters
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === '/create') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const name = sanitizeAppName(String(body.name || ''));
            const title = sanitizeRequiredText(body.title, 'Title is required.');
            const webpart = sanitizeWebPartName(body.webpart);
            const force = body.force === true;
            const args = [
              'packages/spfx-tools/src/cli/create-spfx-app.mjs',
              '--name',
              name,
              '--title',
              title,
              '--webpart',
              webpart,
              ...(force ? ['--force'] : [])
            ];
            const command = await runWorkspaceNodeCommand(args);
            const sync = await syncLabRegistry();
            const appId = normalizeSpfxSlug(name);
            sendJson(res, {
              appId,
              message: command.stdout.trim() || `Created ${appPathForMessage(appId)}`,
              syncedAdapters: sync.syncedAdapters
            });
            return;
          }

          next();
        } catch (error) {
          res.statusCode = 500;
          sendJson(res, { error: error instanceof Error ? error.message : 'SPFx app operation failed.' });
        }
      });
    }
  };
}

function spfxExportApi(): Plugin {
  return {
    name: 'spfx-kit-export-api',
    configureServer(server) {
      server.middlewares.use('/api/export-spfx-app', async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1');
          if (req.method === 'GET' && url.pathname === '/estimate') {
            const app = sanitizeSlug(url.searchParams.get('app') || '');
            sendJson(res, await estimateAppExports(app));
            return;
          }
          if (req.method === 'GET' && url.pathname === '/archive') {
            const requestedPath = url.searchParams.get('path');
            if (!requestedPath) {
              throw new Error('Archive path is required.');
            }
            const file = await resolveWorkspaceFile(requestedPath);
            const info = await stat(file);
            if (!info.isFile()) {
              throw new Error('Archive path must point to a file.');
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Length', String(info.size));
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
            createReadStream(file)
              .on('error', (error) => {
                if (!res.headersSent) {
                  res.statusCode = 500;
                }
                res.end(error instanceof Error ? error.message : 'Could not read archive.');
              })
              .pipe(res);
            return;
          }
          if (req.method === 'POST' && url.pathname === '/') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const app = sanitizeSlug(String(body.app || ''));
            const targets = Array.isArray(body.targets) ? body.targets.map(String).filter(Boolean) : [];
            if (!targets.length) {
              throw new Error('At least one export target is required.');
            }
            const result = await runExport(app, targets);
            sendJson(res, result);
            return;
          }
          if (req.method === 'POST' && url.pathname === '/stream') {
            if (!verifyStateChangingLabRequest(req, res)) {
              return;
            }
            const body = await readJsonBody(req);
            const app = sanitizeSlug(String(body.app || ''));
            const targets = Array.isArray(body.targets) ? body.targets.map(String).filter(Boolean) : [];
            if (!targets.length) {
              throw new Error('At least one export target is required.');
            }
            streamExport(res, req, app, targets);
            return;
          }
          next();
        } catch (error) {
          res.statusCode = 500;
          sendJson(res, { error: error instanceof Error ? error.message : 'Export failed.' });
        }
      });
    }
  };
}

function verifyStateChangingLabRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isSameOriginRequest(req)) {
    res.statusCode = 403;
    sendJson(res, { error: 'Lab API writes require a same-origin request.' });
    return false;
  }

  if (req.headers[labApiIntentHeader] !== 'same-origin') {
    res.statusCode = 403;
    sendJson(res, { error: 'Lab API writes require an explicit lab request intent.' });
    return false;
  }

  if (!isJsonRequest(req)) {
    res.statusCode = 415;
    sendJson(res, { error: 'Lab API writes require application/json.' });
    return false;
  }

  return true;
}

function isSameOriginRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host) {
    return false;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite) {
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }

  return false;
}

function isJsonRequest(req: IncomingMessage): boolean {
  const contentType = req.headers['content-type'];
  return typeof contentType === 'string' && contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

async function resolveWorkspaceFile(requestedPath: string): Promise<string> {
  const [workspaceRoot, file] = await Promise.all([realpath(rootDir), realpath(path.resolve(requestedPath))]);
  const relative = path.relative(workspaceRoot, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Archive path is outside this workspace.');
  }
  return file;
}

async function syncLabRegistry() {
  const result = await runWorkspaceNodeCommand(['packages/spfx-tools/src/cli/sync-lab.mjs']);
  const match = result.stdout.match(/Synced (\d+) lab adapter/);
  return {
    stdout: result.stdout,
    syncedAdapters: match ? Number(match[1]) : undefined
  };
}

async function listManagedLabApps(): Promise<ManagedLabApp[]> {
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
      ...(await exists(adapter.disabledPath)
        ? { disabledAdapterPath: path.relative(rootDir, adapter.disabledPath).replace(/\\/g, '/') }
        : {})
    });
  }

  return apps.sort((a, b) => a.id.localeCompare(b.id));
}

async function unlinkLabApp(appId: string): Promise<{ message: string; syncedAdapters?: number }> {
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

async function reconnectLabApp(appId: string): Promise<boolean> {
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

async function readWorkspaceApp(appId: string): Promise<WorkspaceApp | undefined> {
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

async function requireWorkspaceApp(appId: string): Promise<WorkspaceApp> {
  const app = await readWorkspaceApp(appId);
  if (!app) {
    throw new Error(`No managed SPFx app found at ${appPathForMessage(appId)}.`);
  }
  return app;
}

async function describeLabAdapter(appDir: string): Promise<LabAdapterInfo> {
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

function preferredLabAdapterPath(appDir: string) {
  return path.join(appDir, '.spfx-kit', 'lab', 'register.tsx');
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function runWorkspaceNodeCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
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

function sanitizeAppName(value: string) {
  const trimmed = value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error('App slug must use lowercase letters, numbers, and hyphens.');
  }
  return trimmed;
}

function normalizeSpfxSlug(value: string) {
  return value.endsWith('-spfx') ? value : `${value}-spfx`;
}

function sanitizeRequiredText(value: unknown, message: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error(message);
  }
  if (trimmed.length > 2048) {
    throw new Error('Value is too long.');
  }
  return trimmed;
}

function sanitizeOptionalRef(value: unknown) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (!/^[A-Za-z0-9._/@-]+$/.test(trimmed)) {
    throw new Error('Git ref can only use letters, numbers, dot, slash, underscore, at, and hyphen.');
  }
  return trimmed;
}

function sanitizeWebPartName(value: unknown) {
  const trimmed = sanitizeRequiredText(value, 'Web part name is required.');
  if (!/^[A-Za-z][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error('Web part name must start with a letter and use letters, numbers, spaces, hyphens, or underscores.');
  }
  return trimmed;
}

function streamExport(res: ServerResponse, req: IncomingMessage, app: string, targets: string[]) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  let stdout = '';
  let stderr = '';
  let stderrBuffer = '';
  let closedByClient = false;
  let child: ReturnType<typeof spawn> | undefined;

  res.write(`${JSON.stringify({ type: 'start', targets })}\n`);

  void requireWorkspaceApp(app)
    .then((workspaceApp) => {
      child = spawn(
        process.execPath,
        [
          'packages/spfx-tools/src/cli/export-spfx-app.mjs',
          '--app',
          workspaceApp.relativeDir,
          '--target',
          targets.join(','),
          '--json',
          '--progress-json'
        ],
        { cwd: rootDir, env: process.env }
      );

      wireExportChild(child);
    })
    .catch((error) => {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Export failed.' })}\n`);
        res.end();
      }
    });

  req.on('close', () => {
    if (!res.writableEnded && child) {
      closedByClient = true;
      child.kill('SIGTERM');
    }
  });

  function wireExportChild(runningChild: ReturnType<typeof spawn>): void {
    runningChild.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    runningChild.stderr.on('data', (chunk) => {
      stderrBuffer += String(chunk);
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('SPFX_KIT_PROGRESS ')) {
          res.write(`${line.slice('SPFX_KIT_PROGRESS '.length)}\n`);
        } else if (line.trim()) {
          stderr += `${line}\n`;
        }
      }
    });
    runningChild.on('error', (error) => {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', message: error.message })}\n`);
        res.end();
      }
    });
    runningChild.on('close', (code) => {
      if (closedByClient || res.writableEnded) {
        return;
      }
      if (stderrBuffer.startsWith('SPFX_KIT_PROGRESS ')) {
        res.write(`${stderrBuffer.slice('SPFX_KIT_PROGRESS '.length)}\n`);
      } else if (stderrBuffer.trim()) {
        stderr += `${stderrBuffer}\n`;
      }
      if (code !== 0) {
        res.write(`${JSON.stringify({ type: 'error', message: stderr || stdout || `Export failed with status ${code}.` })}\n`);
        res.end();
        return;
      }
      try {
        res.write(`${JSON.stringify({ type: 'summary', summary: parseExportJson(stdout) })}\n`);
      } catch (error) {
        res.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Export failed.' })}\n`);
      }
      res.end();
    });
  }
}

async function runExport(app: string, targets: string[]) {
  const workspaceApp = await requireWorkspaceApp(app);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['packages/spfx-tools/src/cli/export-spfx-app.mjs', '--app', workspaceApp.relativeDir, '--target', targets.join(','), '--json'],
      { cwd: rootDir, env: process.env }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Export failed with status ${code}.`));
        return;
      }
      try {
        resolve(parseExportJson(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseExportJson(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Export did not return JSON.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {}

  const matches = [...trimmed.matchAll(/\{\s*"app"\s*:/g)].map((match) => match.index ?? -1);
  for (const start of matches.reverse()) {
    if (start < 0) {
      continue;
    }
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {}
  }

  throw new Error(`Export completed but did not return a readable summary.\n${trimmed.slice(-2000)}`);
}

async function estimateAppExports(app: string) {
  const workspaceApp = await requireWorkspaceApp(app);
  const appRoot = workspaceApp.dir;
  const solutionDir = path.join(appRoot, 'sharepoint', 'solution');
  const releaseAssetsDir = path.join(appRoot, 'release', 'assets');
  const releaseManifestsDir = path.join(appRoot, 'release', 'manifests');
  return {
    single: {
      files: [
        ...(await describeExportPackageFile(solutionDir, `${app}-standalone/${app}-standalone.sppkg`)),
        { name: `${app}-standalone/README.md`, size: 'generated' }
      ],
      totalSize: await describeDirSize(solutionDir)
    },
    cdn: {
      files: [
        { name: 'cdn/README.md', size: 'generated' },
        ...(await describeExportPackageFile(solutionDir, `cdn/sharepoint/solution/${app}.cdn.sppkg`)),
        ...prefixFileNames(await describeFiles(releaseAssetsDir), 'cdn/release/assets'),
        ...prefixFileNames(await describeFiles(releaseManifestsDir), 'cdn/release/manifests')
      ],
      totalSize: await describeDirSize(path.join(appRoot, 'sharepoint', 'solution'), path.join(appRoot, 'release'))
    },
    standalone: {
      files: [
        ...prefixFileNames(await describeFiles(appRoot, ['package.json', 'CLAUDE.md', 'config/package-solution.json']), `${app}-repo`),
        { name: `${app}-repo/SPFX-KIT-EXPORT-README.md`, size: 'generated' }
      ],
      totalSize: 'Calculated on export'
    }
  };
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

function appPathForMessage(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}

function managedAppsDir(): string {
  return path.join(rootDir, '.spfx-kit', 'apps');
}

function legacyAppsDir(): string {
  return path.join(rootDir, 'apps');
}

async function describeExportPackageFile(base: string, targetName: string) {
  try {
    const files = await listFiles(base);
    const source = files.find((file) => file.endsWith('.sppkg'));
    if (source) {
      return [{ name: targetName, size: formatBytes((await stat(source)).size) }];
    }
  } catch {}
  return [{ name: targetName, size: 'from latest build' }];
}

function prefixFileNames(files: Array<{ name: string; size: string }>, prefix: string) {
  return files.map((file) => ({ ...file, name: `${prefix}/${file.name}` }));
}

async function describeFiles(base: string, preferred?: string[]) {
  try {
    if (preferred) {
      const files = [];
      for (const rel of preferred) {
        const file = path.join(base, rel);
        try {
          const info = await stat(file);
          files.push({ name: rel, size: formatBytes(info.size) });
        } catch {}
      }
      return files;
    }
    const entries = await listFiles(base);
    const files = [];
    for (const file of entries.slice(0, 8)) {
      files.push({
        name: path.relative(base, file).replace(/\\/g, '/'),
        size: formatBytes((await stat(file)).size)
      });
    }
    return files;
  } catch {
    return [];
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const output: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      output.push(full);
    }
  }
  return output;
}

async function describeDirSize(...dirs: string[]) {
  let total = 0;
  for (const dir of dirs) {
    try {
      const files = await listFiles(dir);
      for (const file of files) {
        total += (await stat(file)).size;
      }
    } catch {}
  }
  return total ? formatBytes(total) : 'Not built yet';
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res: ServerResponse, value: unknown) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

function sanitizeSlug(value: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error('Invalid app slug.');
  }
  return value;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}
