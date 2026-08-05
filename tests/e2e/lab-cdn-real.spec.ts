import { readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const realCdnE2eEnabled = process.env.SPFX_KIT_E2E_REAL_CDN === '1';
const exportsRoot = process.env.SPFX_KIT_LAB_EXPORTS_DIR || '';
const stageDir = path.join(exportsRoot, 'hello-card-spfx', 'browser-e2e', 'staging-cdn');

interface DeploymentManifest {
  releaseId: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

interface CdnDescriptor {
  releaseId: string;
  assets: Array<{
    role: 'dependency' | 'entry';
    moduleId: string;
    assetPath: string;
    assetUrl: string;
    bytes: number;
    sha256: string;
  }>;
  deferredResources: Array<{ moduleId: string; componentId: string; version: string }>;
}

test.describe('real staging CDN artifact', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!realCdnE2eEnabled, 'Run through npm run test:e2e:cdn to produce and exercise a real staging export.');

  test('loads the freshly exported scripts through the browser without rendering the standalone adapter', async ({ page }) => {
    const manifest = JSON.parse(await readFile(path.join(stageDir, 'deployment-manifest.json'), 'utf8')) as DeploymentManifest;
    const assetResponses = new Map<string, { status: number; etag: string | undefined }>();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/lab-packages/cdn-assets/')) {
        assetResponses.set(url.pathname, {
          status: response.status(),
          etag: response.headers().etag
        });
      }
    });

    await page.goto('/');
    const preview = page.getByRole('region', { name: 'Web part preview area' });
    const frame = page.locator('.preview-frame');
    await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();

    const descriptorResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/lab-packages/cdn' && response.request().method() === 'GET';
    });
    await page.getByRole('radio', { name: 'CDN' }).click();
    const response = await descriptorResponse;
    expect(response.status()).toBe(200);
    const descriptor = (await response.json()) as CdnDescriptor;

    const ready = preview.locator('[data-cdn-smoke-check="ready"]');
    const packageResources = page.getByRole('region', { name: 'Package resources' });
    await expect(ready.getByText('Staged CDN bundle smoke check passed', { exact: true })).toBeVisible();
    await expect(ready).toContainText('The Lab did not invoke registered AMD factories');
    await expect(ready).toContainText('not a SharePoint or deployment preview');
    await expect(packageResources).toContainText(descriptor.releaseId);
    await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
    await expect(frame).toHaveAttribute('data-package-artifact', manifest.releaseId);
    await expect(frame.locator('.hello-card')).toHaveCount(0);

    expect(descriptor.releaseId).toBe(manifest.releaseId);
    expect(descriptor.assets.length).toBeGreaterThan(0);
    for (const asset of descriptor.assets) {
      const file = manifest.files.find((candidate) => candidate.path === asset.assetPath);
      expect(file, `${asset.assetPath} is recorded in the emitted deployment manifest`).toBeDefined();
      expect(asset.sha256).toBe(file!.sha256);
      expect(asset.bytes).toBe(file!.bytes);
      const row = packageResources.locator(`[data-asset-path="${asset.assetPath}"]`);
      await expect(row).toContainText(asset.moduleId);
      await expect(row).toContainText(asset.sha256);
      await expect(row).toHaveAttribute('data-asset-status', 'loaded');
      const served = assetResponses.get(new URL(asset.assetUrl, 'http://127.0.0.1:4173').pathname);
      expect(served).toEqual({ status: 200, etag: `"sha256-${file!.sha256}"` });
    }
    await expect(packageResources).toContainText(`${descriptor.assets.length}/${descriptor.assets.length} loaded`);
    for (const resource of descriptor.deferredResources) {
      await expect(packageResources).toContainText(resource.moduleId);
      await expect(packageResources).toContainText(resource.componentId);
      await expect(packageResources).toContainText(resource.version);
    }
  });

  test('reports a missing selected stage and never falls back to the standalone adapter', async ({ page }) => {
    const hiddenExportsRoot = `${exportsRoot}-hidden`;
    await rm(hiddenExportsRoot, { recursive: true, force: true });
    await rename(exportsRoot, hiddenExportsRoot);
    try {
      let assetRequestCount = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/lab-packages/cdn-assets/')) {
          assetRequestCount += 1;
        }
      });

      await page.goto('/');
      const preview = page.getByRole('region', { name: 'Web part preview area' });
      const frame = page.locator('.preview-frame');
      await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
      const descriptorResponse = page.waitForResponse((response) => {
        return new URL(response.url()).pathname === '/api/lab-packages/cdn';
      });
      await page.getByRole('radio', { name: 'CDN' }).click();

      expect((await descriptorResponse).status()).toBe(409);
      const alert = preview.getByRole('alert');
      await expect(alert.getByText('Staged CDN resources unavailable', { exact: true })).toBeVisible();
      await expect(alert).toContainText('missing, invalid, or incomplete');
      await expect(page.getByRole('radio', { name: 'CDN' })).toBeChecked();
      await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
      await expect(frame.locator('.hello-card')).toHaveCount(0);
      expect(assetRequestCount).toBe(0);
    } finally {
      await rename(hiddenExportsRoot, exportsRoot);
    }
  });
});
