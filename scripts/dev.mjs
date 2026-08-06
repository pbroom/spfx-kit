#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MOCK_CDN_ORIGIN,
  normalizeMockCdnOrigin,
  normalizeMockCdnPublicOrigin
} from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';
import { normalizeMockCdnLabOrigin } from '../packages/spfx-tools/src/lib/mock-cdn-server.mjs';

const DEFAULT_LAB_HOST = '127.0.0.1';
const DEFAULT_LAB_PORT = 5173;
const STOP_GRACE_MS = 5_000;
const STOP_FORCE_MS = 1_000;

export function getShutdownSignals(platform = process.platform) {
  return platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
}

export function resolveDevConfig(environment = process.env) {
  const labHost = String(environment.SPFX_LAB_HOST || DEFAULT_LAB_HOST).trim();
  if (!labHost) {
    throw new Error('SPFX_LAB_HOST must not be empty.');
  }

  const labPort = normalizePort(environment.SPFX_LAB_PORT || DEFAULT_LAB_PORT, 'SPFX_LAB_PORT');
  const normalizedLabHost = normalizeListenHost(labHost);
  const labOrigin = normalizeMockCdnLabOrigin(
    environment.SPFX_KIT_MOCK_CDN_LAB_ORIGIN || `http://${formatHostForUrl(normalizedLabHost)}:${labPort}`
  );
  const labOriginUrl = new URL(labOrigin);
  if (normalizeListenHost(labOriginUrl.hostname) === normalizedLabHost && getEffectiveOriginPort(labOriginUrl) !== labPort) {
    throw new Error('SPFX_KIT_MOCK_CDN_LAB_ORIGIN must use the configured SPFX_LAB_PORT.');
  }

  const cdnOrigin = normalizeMockCdnOrigin(environment.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN);
  const cdnUrl = new URL(cdnOrigin);
  const publicCdnOrigin = normalizeMockCdnPublicOrigin(environment.SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN || cdnOrigin);
  const cdnListenHost = normalizeListenHost(environment.SPFX_KIT_MOCK_CDN_LISTEN_HOST || cdnUrl.hostname);
  const cdnListenPort = normalizePort(environment.SPFX_KIT_MOCK_CDN_LISTEN_PORT || cdnUrl.port, 'SPFX_KIT_MOCK_CDN_LISTEN_PORT');
  if (!cdnListenHost) {
    throw new Error('SPFX_KIT_MOCK_CDN_LISTEN_HOST must not be empty.');
  }
  if (cdnListenPort === labPort) {
    throw new Error('The SPFx Lab and local CDN must use different ports.');
  }
  if (publicCdnOrigin === cdnOrigin && cdnListenPort !== getEffectiveOriginPort(cdnUrl)) {
    throw new Error('SPFX_KIT_MOCK_CDN_LISTEN_PORT must match SPFX_KIT_MOCK_CDN_ORIGIN without a public CDN origin.');
  }
  if (!isLoopbackHostname(normalizedLabHost)) {
    if (publicCdnOrigin === cdnOrigin) {
      throw new Error('An externally bound SPFX_LAB_HOST requires an HTTPS SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN.');
    }
    if (!isForwardedHttpsOrigin(labOrigin)) {
      throw new Error('An externally bound SPFX_LAB_HOST requires an HTTPS SPFX_KIT_MOCK_CDN_LAB_ORIGIN.');
    }
    if (labOrigin === publicCdnOrigin) {
      throw new Error(
        'SPFX_LAB_HOST=0.0.0.0 requires different SPFX_KIT_MOCK_CDN_LAB_ORIGIN and SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN values.'
      );
    }
    if (isLoopbackListenHost(cdnListenHost)) {
      throw new Error('SPFX_LAB_HOST=0.0.0.0 requires a non-loopback SPFX_KIT_MOCK_CDN_LISTEN_HOST.');
    }
  }

  return {
    labHost,
    labOrigin,
    labAllowedHost: new URL(labOrigin).hostname,
    labPort,
    cdnOrigin,
    publicCdnOrigin,
    cdnListenHost,
    cdnListenPort
  };
}

function isForwardedHttpsOrigin(value) {
  const url = new URL(value);
  return url.protocol === 'https:' && isRoutableForwardedHostname(url.hostname);
}

function isRoutableForwardedHostname(value) {
  const host = String(value).trim().toLowerCase().replace(/^\[|\]$/g, '');
  return !isUnspecifiedHostname(host) && !isLoopbackHostname(host) && !/^25[0-5](?:\.25[0-5]){3}$/.test(host) && !/^(?:22[4-9]|23\d)\./.test(host) && !/^ff[0-9a-f]{2}:/i.test(host);
}

function getEffectiveOriginPort(url) {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

function normalizeListenHost(value) {
  const host = String(value).trim();
  if (!host) {
    return host;
  }
  const authority = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  try {
    // URL normalizes numeric hosts (including bracketed IPv6), while leaving
    // ordinary DNS names unchanged. Node's listener API expects IPv6 without
    // URL brackets.
    return new URL(`http://${authority}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return host;
  }
}

function formatHostForUrl(host) {
  return host.includes(':') ? `[${host}]` : host;
}

function isUnspecifiedHostname(value) {
  const hostname = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '::ffff:0:0' || hostname === '::ffff:0.0.0.0';
}

function isUnspecifiedListenHost(value) {
  return isUnspecifiedHostname(normalizeListenHost(value));
}

function isLoopbackHostname(value) {
  const hostname = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === '::1' ||
    /^::(?:ffff:)?7f[\da-f]{2}:[\da-f]{1,4}$/.test(hostname)
  );
}

function isLoopbackListenHost(value) {
  const host = String(value).toLowerCase();
  return isLoopbackHostname(host);
}

export async function assertPortAvailable(host, port, serviceName) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
      throw new Error(`${serviceName} cannot start because ${host}:${port} is already in use.`, { cause: error });
    }
    throw error;
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
}

async function main() {
  const config = resolveDevConfig();
  await Promise.all([
    assertPortAvailable(config.labHost, config.labPort, 'SPFx Lab'),
    assertPortAvailable(config.cdnListenHost, config.cdnListenPort, 'Local CDN')
  ]);

  console.log('Starting SPFx Kit development services:');
  console.log(`  Lab:       ${config.labOrigin}`);
  console.log(`  Local CDN: ${config.cdnListenHost}:${config.cdnListenPort} (advertised as ${config.publicCdnOrigin})`);

  const childEnvironment = {
    ...process.env,
    SPFX_LAB_HOST: config.labHost,
    SPFX_LAB_PORT: String(config.labPort),
    SPFX_KIT_MOCK_CDN_LAB_ORIGIN: config.labOrigin,
    SPFX_LAB_ALLOWED_HOST: config.labAllowedHost,
    SPFX_KIT_MOCK_CDN_ORIGIN: config.cdnOrigin,
    SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: config.publicCdnOrigin,
    SPFX_KIT_MOCK_CDN_LISTEN_HOST: config.cdnListenHost,
    SPFX_KIT_MOCK_CDN_LISTEN_PORT: String(config.cdnListenPort)
  };
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const services = [];
  let requestedSignal;
  const signalPromise = new Promise((resolve) => {
    for (const signal of getShutdownSignals()) {
      process.once(signal, () => {
        requestedSignal = signal;
        resolve({ serviceName: 'development launcher', code: 0, signal });
      });
    }
  });
  services.push(
    startService('SPFx Lab', npmCommand, ['run', 'dev:lab'], childEnvironment),
    startService('Local CDN', npmCommand, ['run', 'dev:cdn'], childEnvironment)
  );
  const exit = await Promise.race([signalPromise, ...services.map(waitForService)]);
  let cleanupError;
  try {
    await stopServices(services, requestedSignal || 'SIGTERM');
  } catch (error) {
    cleanupError = error;
  }

  if (exit.error) {
    if (cleanupError) {
      throw new AggregateError([exit.error, cleanupError], 'A development service failed and cleanup was incomplete.', {
        cause: exit.error
      });
    }
    throw exit.error;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!requestedSignal) {
    throw new Error(
      `${exit.serviceName} exited unexpectedly${exit.signal ? ` from ${exit.signal}` : ` with code ${exit.code}`}.`
    );
  }
}

function startService(serviceName, command, args, environment) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: environment,
    stdio: 'inherit'
  });
  child.serviceName = serviceName;
  return child;
}

export function waitForService(child) {
  return new Promise((resolve) => {
    child.once('error', (error) => resolve({ serviceName: child.serviceName, error }));
    child.once('exit', (code, signal) => resolve({ serviceName: child.serviceName, code, signal }));
  });
}

export async function stopServices(children, signal) {
  const cleanupErrors = [];
  for (const child of children) {
    try {
      await signalService(child, signal);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ESRCH') {
        cleanupErrors.push(error);
      }
    }
  }

  const stopped = await Promise.all(children.map((child) => waitForStoppedService(child, STOP_GRACE_MS)));
  const stalled = children.filter((_child, index) => !stopped[index]);
  for (const child of stalled) {
    try {
      await signalService(child, 'SIGKILL');
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ESRCH') {
        cleanupErrors.push(error);
      }
    }
  }

  const forceStopped = await Promise.all(stalled.map((child) => waitForStoppedService(child, STOP_FORCE_MS)));
  for (const [index, didStop] of forceStopped.entries()) {
    if (!didStop) {
      cleanupErrors.push(new Error(`${stalled[index].serviceName || 'Development service'} did not stop.`));
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'One or more development services could not be stopped.');
  }
}

async function signalService(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || !Number.isInteger(child.pid)) {
    return;
  }
  if (process.platform === 'win32') {
    await terminateWindowsProcessTree(child.pid, signal === 'SIGKILL');
  } else {
    process.kill(-child.pid, signal);
  }
}

export function getWindowsTaskkillArgs(pid, force) {
  return ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])];
}

async function terminateWindowsProcessTree(pid, force) {
  await new Promise((resolve, reject) => {
    const taskkill = spawn('taskkill', getWindowsTaskkillArgs(pid, force), { stdio: 'ignore', windowsHide: true });
    taskkill.once('error', reject);
    taskkill.once('exit', (code) => {
      if (code === 0 || code === 128) {
        resolve();
        return;
      }
      reject(new Error(`taskkill failed while stopping development service tree (exit ${code ?? 'unknown'}).`));
    });
  });
}

function waitForStoppedService(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null || !Number.isInteger(child.pid)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

function normalizePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
