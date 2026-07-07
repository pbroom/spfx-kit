import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { readJsonBody, sendJson, verifyStateChangingLabRequest } from './http';
import { rootDir } from './paths';
import { sanitizeSlug } from './sanitize';
import { requireWorkspaceApp, resolveWorkspaceFile } from './workspace';

export function spfxExportApi(): Plugin {
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
            streamExport(res, app, targets);
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

function streamExport(res: ServerResponse, app: string, targets: string[]) {
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
      if (closedByClient) {
        return;
      }
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

  // Watch the response, not the request: the request body is fully consumed
  // before streaming starts, so its 'close' fires immediately. The response
  // 'close' fires when the client actually drops the connection.
  res.on('close', () => {
    if (!res.writableEnded) {
      closedByClient = true;
      child?.kill('SIGTERM');
    }
  });

  function wireExportChild(runningChild: ReturnType<typeof spawn>): void {
    runningChild.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    runningChild.stderr?.on('data', (chunk) => {
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
    child.on('error', (error) => {
      reject(error);
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

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}
