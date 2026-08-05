#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MOCK_CDN_ORIGIN, normalizeMockCdnOrigin } from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';
import { normalizeMockCdnLabOrigin } from '../packages/spfx-tools/src/lib/mock-cdn-server.mjs';

const DEFAULT_LAB_HOST = '127.0.0.1';
const DEFAULT_LAB_PORT = 5173;
const STOP_GRACE_MS = 5_000;
const STOP_FORCE_MS = 1_000;

export function resolveDevConfig(environment = process.env) {
  const labHost = String(environment.SPFX_LAB_HOST || DEFAULT_LAB_HOST).trim();
  if (!labHost) {
    throw new Error('SPFX_LAB_HOST must not be empty.');
  }

  const labPort = normalizePort(environment.SPFX_LAB_PORT || DEFAULT_LAB_PORT, 'SPFX_LAB_PORT');
  const labOrigin = normalizeMockCdnLabOrigin(environment.SPFX_KIT_MOCK_CDN_LAB_ORIGIN || `http://127.0.0.1:${labPort}`);
  if (Number(new URL(labOrigin).port) !== labPort) {
    throw new Error('SPFX_KIT_MOCK_CDN_LAB_ORIGIN must use the configured SPFX_LAB_PORT.');
  }

  const cdnOrigin = normalizeMockCdnOrigin(environment.SPFX_KIT_MOCK_CDN_ORIGIN || DEFAULT_MOCK_CDN_ORIGIN);
  const cdnUrl = new URL(cdnOrigin);
  const cdnPort = Number(cdnUrl.port);
  if (cdnPort === labPort) {
    throw new Error('The SPFx Lab and local CDN must use different ports.');
  }

  return {
    labHost,
    labOrigin,
    labPort,
    cdnHost: cdnUrl.hostname,
    cdnOrigin,
    cdnPort
  };
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
    assertPortAvailable(config.cdnHost, config.cdnPort, 'Local CDN')
  ]);

  console.log('Starting SPFx Kit development services:');
  console.log(`  Lab:       ${config.labOrigin}`);
  console.log(`  Local CDN: ${config.cdnOrigin}`);

  const childEnvironment = {
    ...process.env,
    SPFX_LAB_HOST: config.labHost,
    SPFX_LAB_PORT: String(config.labPort),
    SPFX_KIT_MOCK_CDN_LAB_ORIGIN: config.labOrigin,
    SPFX_KIT_MOCK_CDN_ORIGIN: config.cdnOrigin
  };
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const services = [
    startService('SPFx Lab', npmCommand, ['run', 'dev:lab'], childEnvironment),
    startService('Local CDN', npmCommand, ['run', 'dev:cdn'], childEnvironment)
  ];

  let requestedSignal;
  const signalPromise = new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        requestedSignal = signal;
        resolve({ serviceName: 'development launcher', code: 0, signal });
      });
    }
  });
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
      signalService(child, signal);
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
      signalService(child, 'SIGKILL');
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

function signalService(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || !Number.isInteger(child.pid)) {
    return;
  }
  if (process.platform === 'win32') {
    child.kill(signal);
  } else {
    process.kill(-child.pid, signal);
  }
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
