import type { Plugin } from 'vite';
import { readJsonBody, sendJson, verifyStateChangingLabRequest } from './http';
import { appPathForMessage, refreshManagedAppSourceRoots } from './paths';
import {
  normalizeSpfxSlug,
  sanitizeAppName,
  sanitizeOptionalRef,
  sanitizeRequiredText,
  sanitizeSlug,
  sanitizeWebPartName
} from './sanitize';
import { listManagedLabApps, reconnectLabApp, runWorkspaceNodeCommand, syncLabRegistry, unlinkLabApp } from './workspace';

export function spfxAppApi(): Plugin {
  return {
    name: 'spfx-kit-app-api',
    configureServer(server) {
      let managedSourceRoots: string[] = [];
      const refreshServerSourceRoots = (): void => {
        const refreshed = refreshManagedAppSourceRoots(server.config.server.fs.allow, managedSourceRoots);
        server.config.server.fs.allow = refreshed.allowedRoots;
        managedSourceRoots = refreshed.managedRoots;
      };
      refreshServerSourceRoots();

      const syncLabRegistryAndRefreshSourceRoots = async () => {
        refreshServerSourceRoots();
        const sync = await syncLabRegistry();
        refreshServerSourceRoots();
        return sync;
      };

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
            refreshServerSourceRoots();
            const result = await unlinkLabApp(appId);
            refreshServerSourceRoots();
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
            const sync = await syncLabRegistryAndRefreshSourceRoots();
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
            const sync = await syncLabRegistryAndRefreshSourceRoots();
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
            const sync = await syncLabRegistryAndRefreshSourceRoots();
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
