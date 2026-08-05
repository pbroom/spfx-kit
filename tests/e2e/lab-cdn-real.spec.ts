import { readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const realCdnE2eEnabled = process.env.SPFX_KIT_E2E_REAL_CDN === '1';
const exportsRoot = process.env.SPFX_KIT_LAB_EXPORTS_DIR || '';
const bucketRoot = process.env.SPFX_KIT_MOCK_CDN_ROOT || '';
const mockCdnOrigin = process.env.SPFX_KIT_MOCK_CDN_ORIGIN || '';
const labOrigin = `http://127.0.0.1:${process.env.SPFX_KIT_E2E_LAB_PORT || '4173'}`;
const stageDir = path.join(exportsRoot, 'hello-card-spfx', 'browser-e2e', 'staging-cdn');
const selectedPointer = path.join(bucketRoot, 'apps', 'hello-card-spfx', 'selected.json');

interface DeploymentManifest {
  releaseId: string;
  cdnBasePath: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

interface CdnDescriptor {
  releaseId: string;
  delivery: { origin: string; releaseBaseUrl: string; releaseManifestUrl: string };
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

test.describe('real local mock-CDN artifact', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!realCdnE2eEnabled, 'Run through npm run test:e2e:cdn to produce and publish a real staging export.');

  test('loads the freshly exported scripts from the separate mock-CDN origin with no Lab fallback', async ({ page }) => {
    const manifest = JSON.parse(await readFile(path.join(stageDir, 'deployment-manifest.json'), 'utf8')) as DeploymentManifest;
    const mockResponses = new Map<string, { status: number; headers: Record<string, string> }>();
    let labAssetRequests = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/lab-packages/cdn-assets/')) {
        labAssetRequests += 1;
      }
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === mockCdnOrigin) {
        mockResponses.set(url.pathname, { status: response.status(), headers: response.headers() });
      }
    });

    await page.goto('/');
    const preview = page.getByRole('region', { name: 'Web part preview area' });
    const frame = page.locator('.preview-frame');
    await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();

    await page.getByRole('button', { name: 'Local CDN bucket' }).click();
    const bucketDialog = page.getByRole('dialog', { name: 'Local CDN bucket' });
    await expect(bucketDialog).toBeVisible();
    const approvedSource = bucketDialog.getByRole('combobox', { name: 'Approved staged release' });
    await approvedSource.click();
    await page.getByRole('option').filter({ hasText: 'browser-e2e' }).click();
    await expect(approvedSource).toHaveAttribute('aria-expanded', 'false');
    const publishButton = bucketDialog.getByRole('button', { name: 'Publish immutable release' });
    await expect(publishButton).toBeEnabled();
    const publishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/local-cdn/publish' && response.request().method() === 'POST';
    });
    await publishButton.click();
    expect((await publishResponse).status()).toBe(201);
    await expect(bucketDialog.getByRole('status')).toContainText('Immutable release published');
    const inventory = bucketDialog.getByRole('region', { name: 'Local CDN bucket inventory' });
    await expect(inventory.locator(`[data-release-id="${manifest.releaseId}"]`)).toContainText(
      'Manifest verified · not selected'
    );
    await bucketDialog.getByRole('button', { name: 'Close Local CDN bucket' }).click();

    const unavailableDescriptor = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/lab-packages/cdn' && response.status() === 409;
    });
    await page.getByRole('radio', { name: 'CDN' }).click();
    await unavailableDescriptor;
    await expect(preview.getByRole('alert')).toContainText('selected local mock CDN release is missing');
    expect(mockResponses.size).toBe(0);

    await page.getByRole('button', { name: 'Local CDN bucket' }).click();
    await bucketDialog.getByRole('combobox', { name: 'Release used by Lab CDN mode' }).click();
    await page.getByRole('option').filter({ hasText: 'hello-card-spfx' }).click();

    const descriptorResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/lab-packages/cdn' && response.request().method() === 'GET' && response.status() === 200;
    });
    await bucketDialog.getByRole('button', { name: 'Select for Lab' }).click();
    await expect(bucketDialog.getByRole('status')).toContainText('Selected release updated');
    const response = await descriptorResponse;
    expect(response.status()).toBe(200);
    const descriptor = (await response.json()) as CdnDescriptor;
    await bucketDialog.getByRole('button', { name: 'Close Local CDN bucket' }).click();

    const packageResources = page.getByRole('region', { name: 'Package resources' });
    await expect(packageResources).toHaveAttribute('data-package-resource-state', 'ready');
    await expect(packageResources).toHaveClass(/package-dependency-panel--workspace/);
    await expect(page.getByText('Local mock-CDN smoke check passed', { exact: true })).toHaveCount(0);
    await expect(page.locator('.preview-canvas')).toBeHidden();
    await expect(packageResources).toContainText('Published and verified');
    await expect(packageResources).toContainText(mockCdnOrigin);
    await expect(packageResources).toContainText(descriptor.releaseId);
    await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
    await expect(frame).toHaveAttribute('data-package-artifact', manifest.releaseId);
    await expect(frame.locator('.hello-card')).toHaveCount(0);

    expect(descriptor.releaseId).toBe(manifest.releaseId);
    expect(descriptor.delivery.origin).toBe(mockCdnOrigin);
    expect(descriptor.delivery.releaseBaseUrl).toBe(manifest.cdnBasePath);
    expect(descriptor.assets.length).toBeGreaterThan(0);
    for (const asset of descriptor.assets) {
      const file = manifest.files.find((candidate) => candidate.path === asset.assetPath);
      expect(file, `${asset.assetPath} is recorded in the emitted deployment manifest`).toBeDefined();
      expect(asset.sha256).toBe(file!.sha256);
      expect(asset.bytes).toBe(file!.bytes);
      expect(new URL(asset.assetUrl).origin).toBe(mockCdnOrigin);
      const row = packageResources.locator(`[data-asset-path="${asset.assetPath}"]`);
      await expect(row).toContainText(asset.moduleId);
      await expect(row).toContainText(asset.sha256);
      await expect(row).toHaveAttribute('data-asset-status', 'loaded');
      const served = mockResponses.get(new URL(asset.assetUrl).pathname);
      expect(served?.status).toBe(200);
      expect(served?.headers.etag).toBe(`"sha256-${file!.sha256}"`);
      expect(served?.headers['cache-control']).toContain('immutable');
      expect(served?.headers['access-control-allow-origin']).toBe(labOrigin);
      expect(served?.headers['x-content-type-options']).toBe('nosniff');
    }
    expect(labAssetRequests).toBe(0);
  });

  test('reports a missing selected release and never falls back to the standalone adapter', async ({ page }) => {
    const hiddenPointer = `${selectedPointer}.hidden`;
    await rm(hiddenPointer, { force: true });
    await rename(selectedPointer, hiddenPointer);
    try {
      let mockAssetRequests = 0;
      let labAssetRequests = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin === mockCdnOrigin) mockAssetRequests += 1;
        if (url.pathname.startsWith('/api/lab-packages/cdn-assets/')) labAssetRequests += 1;
      });

      await page.goto('/');
      const preview = page.getByRole('region', { name: 'Web part preview area' });
      const frame = page.locator('.preview-frame');
      await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
      const descriptorResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/lab-packages/cdn');
      await page.getByRole('radio', { name: 'CDN' }).click();

      expect((await descriptorResponse).status()).toBe(409);
      const alert = preview.getByRole('alert');
      await expect(alert.getByText('CDN resources unavailable', { exact: true })).toBeVisible();
      await expect(alert).toContainText('selected local mock CDN release is missing, invalid, or incomplete');
      await expect(page.getByRole('radio', { name: 'CDN' })).toBeChecked();
      await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
      await expect(frame.locator('.hello-card')).toHaveCount(0);
      expect(mockAssetRequests).toBe(0);
      expect(labAssetRequests).toBe(0);
    } finally {
      await rename(hiddenPointer, selectedPointer);
    }
  });
});
