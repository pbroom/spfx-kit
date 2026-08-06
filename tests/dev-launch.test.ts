import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  assertPortAvailable,
  getShutdownSignals,
  getWindowsTaskkillArgs,
  resolveDevConfig,
  stopServices,
  waitForService
} from '../scripts/dev.mjs';

const servers: ReturnType<typeof createServer>[] = [];
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  );
});

describe('SPFx Kit development launcher', () => {
  it('coordinates SIGHUP shutdown on Unix without registering it on Windows', () => {
    expect(getShutdownSignals('linux')).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(getShutdownSignals('darwin')).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(getShutdownSignals('win32')).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('allows the launcher configuration through Turborepo strict task mode', () => {
    const turboConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'turbo.json'), 'utf8'));

    expect(turboConfig.tasks.dev.env).toEqual(
      expect.arrayContaining([
        'SPFX_LAB_HOST',
        'SPFX_LAB_ALLOWED_HOST',
        'SPFX_LAB_PORT',
        'SPFX_KIT_MOCK_CDN_LAB_ORIGIN',
        'SPFX_KIT_MOCK_CDN_ORIGIN',
        'SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN',
        'SPFX_KIT_MOCK_CDN_LISTEN_HOST',
        'SPFX_KIT_MOCK_CDN_LISTEN_PORT',
        'SPFX_KIT_MOCK_CDN_ROOT'
      ])
    );
  });

  it('uses distinct default Lab and local CDN origins', () => {
    expect(resolveDevConfig({})).toMatchObject({
      labHost: '127.0.0.1',
      labOrigin: 'http://127.0.0.1:5173',
      labPort: 5173,
      cdnOrigin: 'http://127.0.0.1:5174',
      publicCdnOrigin: 'http://127.0.0.1:5174',
      cdnListenHost: '127.0.0.1',
      cdnListenPort: 5174
    });
  });

  it('derives the mock CDN CORS origin from an alternate Lab port', () => {
    expect(resolveDevConfig({ SPFX_LAB_PORT: '5190' })).toMatchObject({
      labOrigin: 'http://127.0.0.1:5190',
      labPort: 5190,
      cdnOrigin: 'http://127.0.0.1:5174',
      cdnListenPort: 5174
    });
  });

  it('accepts an explicit externally visible HTTPS Lab origin for cloud previews', () => {
    expect(
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'https://preview.example.test',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: '0.0.0.0'
      })
    ).toMatchObject({
      labHost: '0.0.0.0',
      labOrigin: 'https://preview.example.test',
      labAllowedHost: 'preview.example.test',
      labPort: 5173,
      publicCdnOrigin: 'https://cdn-preview.example.test',
      cdnListenHost: '0.0.0.0',
      cdnListenPort: 5174
    });
  });

  it('fails closed instead of sending loopback CDN URLs to cloud browsers', () => {
    expect(() => resolveDevConfig({ SPFX_LAB_HOST: '0.0.0.0' })).toThrow('requires an HTTPS SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN');
  });

  it('requires both forwarded browser origins and a non-loopback CDN listener for cloud previews', () => {
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: '0.0.0.0'
      })
    ).toThrow('requires an HTTPS SPFX_KIT_MOCK_CDN_LAB_ORIGIN');
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'https://lab-preview.example.test',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test'
      })
    ).toThrow('requires a non-loopback SPFX_KIT_MOCK_CDN_LISTEN_HOST');
  });

  it('requires distinct forwarded Lab and CDN origins for cloud previews', () => {
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'https://preview.example.test',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: '0.0.0.0'
      })
    ).toThrow('requires different SPFX_KIT_MOCK_CDN_LAB_ORIGIN and SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN');
  });

  it.each([
    'https://localhost.',
    'https://preview.localhost',
    'https://127.0.0.2',
    'https://[::]',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]'
  ])('rejects loopback-form forwarded origins for cloud previews: %s', (loopbackOrigin) => {
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: loopbackOrigin,
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: '0.0.0.0'
      })
    ).toThrow('requires an HTTPS SPFX_KIT_MOCK_CDN_LAB_ORIGIN');
  });

  it('canonicalizes a bracketed numeric IPv6 CDN listener host for Node', () => {
    expect(
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'https://preview.example.test',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: '[::]'
      }).cdnListenHost
    ).toBe('::');
  });

  it.each(['127.1', '0x7f000001', '::ffff:127.0.0.1'])('rejects numeric loopback CDN listener aliases: %s', (listenHost) => {
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_HOST: '0.0.0.0',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'https://preview.example.test',
        SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN: 'https://cdn-preview.example.test',
        SPFX_KIT_MOCK_CDN_LISTEN_HOST: listenHost
      })
    ).toThrow('requires a non-loopback SPFX_KIT_MOCK_CDN_LISTEN_HOST');
  });

  it('uses taskkill tree termination arguments on Windows', () => {
    expect(getWindowsTaskkillArgs(1234, false)).toEqual(['/pid', '1234', '/t']);
    expect(getWindowsTaskkillArgs(1234, true)).toEqual(['/pid', '1234', '/t', '/f']);
  });

  it('rejects overlapping or inconsistent service configuration', () => {
    expect(() => resolveDevConfig({ SPFX_LAB_PORT: '5174' })).toThrow('must use different ports');
    expect(() =>
      resolveDevConfig({
        SPFX_LAB_PORT: '5190',
        SPFX_KIT_MOCK_CDN_LAB_ORIGIN: 'http://127.0.0.1:5173'
      })
    ).toThrow('must use the configured SPFX_LAB_PORT');
  });

  it('fails before launch when a configured service port is already in use', async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    await expect(assertPortAvailable('127.0.0.1', port, 'SPFx Lab')).rejects.toThrow(
      `SPFx Lab cannot start because 127.0.0.1:${port} is already in use.`
    );
  });

  it('preserves a spawn failure while stopping a sibling service', async () => {
    const running = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: process.platform !== 'win32',
      stdio: 'ignore'
    });
    const missing = spawn('spfx-kit-command-that-does-not-exist', [], {
      detached: process.platform !== 'win32',
      stdio: 'ignore'
    });
    Object.assign(running, { serviceName: 'running fixture' });
    Object.assign(missing, { serviceName: 'missing fixture' });

    const failure = await waitForService(missing);
    expect(failure.error).toBeInstanceOf(Error);
    await expect(stopServices([missing, running], 'SIGTERM')).resolves.toBeUndefined();
    expect(running.exitCode !== null || running.signalCode !== null).toBe(true);
  });
});
