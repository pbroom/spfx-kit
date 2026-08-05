import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

const pinnedAppStorageKey = 'spfx-kit.lab.pinned-app.v1';

test('loads the committed web part and supports a core toolbar interaction', async ({ page }) => {
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveText('Hello Card');
  await expect(page.getByRole('radio', { name: 'Standalone' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'CDN' })).not.toBeChecked();
  const packageResources = page.getByRole('region', { name: 'Package resources' });
  await expect(packageResources).toContainText('No staged CDN session is selected');
  await expect(packageResources).toHaveAttribute('data-package-resource-state', 'standalone');

  await expect(page.getByRole('button', { name: 'Manage apps' })).toHaveCount(0);
  const appMenuButton = page.locator('button[aria-controls="app-management-sidebar"]');
  await appMenuButton.click();
  const sidebar = page.locator('#app-management-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('App settings')).toBeVisible();
  await expect(appMenuButton).toHaveAttribute('aria-expanded', 'true');
  await sidebar.getByRole('button', { name: 'Close app settings sidebar' }).click();

  await page.getByRole('button', { name: 'Theme: Light' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('main.lab-shell')).toHaveClass(/lab-shell--dark/);
});

test('places package mode before display mode and keeps the controls independent', async ({ page }) => {
  await page.goto('/');

  const packageModes = page.getByRole('radiogroup', { name: 'App package mode' });
  const displayModes = page.getByRole('tablist', { name: 'Lab display mode' });
  const packageModesBox = await packageModes.boundingBox();
  const displayModesBox = await displayModes.boundingBox();
  expect(packageModesBox).not.toBeNull();
  expect(displayModesBox).not.toBeNull();
  expect(packageModesBox!.x + packageModesBox!.width).toBeLessThanOrEqual(displayModesBox!.x);

  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('radio', { name: 'Standalone' })).toBeChecked();
  await expect(
    page.getByRole('region', { name: 'Web part preview area' }).getByRole('heading', { name: 'Hello Card' })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Edit' }).click();
  await expect(page.getByRole('radio', { name: 'Standalone' })).toBeChecked();

  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.locator('.package-mode-option .fui-Radio__label', { hasText: 'Standalone' })).toBeVisible();
  await expect(page.locator('.package-mode-option .fui-Radio__label', { hasText: 'CDN' })).toBeVisible();
});

test('checks the selected staged scripts without invoking the package or rendering the standalone adapter', async ({ page }) => {
  const assetRequests: string[] = [];
  let releaseEntryAsset!: () => void;
  const entryAssetGate = new Promise<void>((resolve) => {
    releaseEntryAsset = resolve;
  });
  await page.route('**/api/lab-packages/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/lab-packages/cdn') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'cdn',
          appId: 'hello-card-spfx',
          releaseId: '1.2.3-test.abc123',
          generatedAt: '2026-08-04T12:00:00.000Z',
          cdnBasePath: 'https://staging-cdn.example.com/spfx/hello-card-spfx/versions/1.2.3-test.abc123/',
          assetBaseUrl: '/api/lab-packages/cdn-assets/11111111-1111-4111-8111-111111111111/',
          packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
          assets: [
            {
              role: 'dependency',
              moduleId: 'WebPartStrings',
              assetPath: 'strings-panel-proof.js',
              assetUrl: '/api/lab-packages/cdn-assets/11111111-1111-4111-8111-111111111111/strings-panel-proof.js',
              bytes: 97,
              sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              stageStatus: 'allowed-and-verified'
            },
            {
              role: 'entry',
              moduleId: 'hello-card',
              assetPath: 'hello-card-web-part.js',
              assetUrl: '/api/lab-packages/cdn-assets/11111111-1111-4111-8111-111111111111/hello-card-web-part.js',
              bytes: 205,
              sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              stageStatus: 'allowed-and-verified'
            }
          ],
          deferredResources: [
            {
              moduleId: '@microsoft/sp-webpart-base',
              kind: 'spfx-component',
              componentId: '974a7777-0990-4136-8fa6-95d80114c2e0',
              version: '1.23.2',
              status: 'deferred',
              reason: 'sharepoint-loader-not-exercised'
            }
          ]
        })
      });
      return;
    }
    if (url.pathname.endsWith('/strings-panel-proof.js')) {
      assetRequests.push(url.pathname);
      await route.fulfill({
        contentType: 'text/javascript',
        body: `define('WebPartStrings', [], function () { return {}; });`
      });
      return;
    }
    if (url.pathname.endsWith('/hello-card-web-part.js')) {
      assetRequests.push(url.pathname);
      await entryAssetGate;
      await route.fulfill({
        contentType: 'text/javascript',
        body: `define('cdn-fixture', ['@microsoft/sp-webpart-base'], function () {
          throw new Error('The smoke check must not invoke this package factory.');
        });`
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/');
  const frame = page.locator('.preview-frame');
  const packageResources = page.getByRole('region', { name: 'Package resources' });
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await page.getByRole('radio', { name: 'CDN' }).click();

  await expect(frame.getByRole('status')).toContainText('Checking staged CDN bundle');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  await expect(packageResources).toContainText('1.2.3-test.abc123');
  await expect(packageResources.locator('[data-asset-path="strings-panel-proof.js"]')).toHaveAttribute(
    'data-asset-status',
    'loaded'
  );
  await expect(packageResources.locator('[data-asset-path="hello-card-web-part.js"]')).toHaveAttribute(
    'data-asset-status',
    'loading'
  );
  await expect(packageResources).toContainText('@microsoft/sp-webpart-base');
  await expect(packageResources).toContainText('Deferred — SharePoint loader required');
  await expect(packageResources).toContainText('do not imply that arbitrary npm packages are hosted on a CDN');
  releaseEntryAsset();
  const smokeCheck = frame.locator('[data-cdn-smoke-check="ready"]');
  await expect(smokeCheck.getByText('Staged CDN bundle smoke check passed', { exact: true })).toBeVisible();
  await expect(smokeCheck).toContainText('The Lab did not invoke registered AMD factories');
  await expect(smokeCheck).toContainText('not a SharePoint or deployment preview');
  await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-test.abc123');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  await expect(packageResources.locator('[data-asset-path="hello-card-web-part.js"]')).toHaveAttribute(
    'data-asset-status',
    'loaded'
  );
  await expect(packageResources).toContainText('2/2 loaded');
  expect(assetRequests).toHaveLength(2);

  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('radio', { name: 'CDN' })).toBeChecked();
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-test.abc123');
  await expect(frame.locator('[data-cdn-smoke-check="ready"]')).toBeVisible();
  await expect(packageResources).toContainText('2/2 loaded');
});

test('keeps completed evidence and marks a blocked staged asset failed without falling back', async ({ page }) => {
  await page.route('**/api/lab-packages/**', async (route) => {
    const url = new URL(route.request().url());
    const assetBaseUrl = '/api/lab-packages/cdn-assets/22222222-2222-4222-8222-222222222222/';
    if (url.pathname === '/api/lab-packages/cdn') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'cdn',
          appId: 'hello-card-spfx',
          releaseId: '1.2.3-blocked.1',
          generatedAt: '2026-08-04T12:00:00.000Z',
          cdnBasePath: 'https://staging-cdn.example.com/spfx/hello-card-spfx/versions/1.2.3-blocked.1/',
          assetBaseUrl,
          packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
          assets: [
            {
              role: 'dependency',
              moduleId: 'WebPartStrings',
              assetPath: 'loaded-before-failure.js',
              assetUrl: `${assetBaseUrl}loaded-before-failure.js`,
              bytes: 73,
              sha256: 'c'.repeat(64),
              stageStatus: 'allowed-and-verified'
            },
            {
              role: 'entry',
              moduleId: 'hello-card',
              assetPath: 'blocked-entry.js',
              assetUrl: `${assetBaseUrl}blocked-entry.js`,
              bytes: 205,
              sha256: 'd'.repeat(64),
              stageStatus: 'allowed-and-verified'
            }
          ],
          deferredResources: []
        })
      });
      return;
    }
    if (url.pathname.endsWith('/loaded-before-failure.js')) {
      await route.fulfill({
        contentType: 'text/javascript',
        body: `define('WebPartStrings', [], function () { return {}; });`
      });
      return;
    }
    if (url.pathname.endsWith('/blocked-entry.js')) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The pinned staged asset no longer matches its manifest.' })
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/');
  const frame = page.locator('.preview-frame');
  const packageResources = page.getByRole('region', { name: 'Package resources' });
  await page.getByRole('radio', { name: 'CDN' }).click();

  await expect(frame.getByRole('alert')).toContainText('Staged CDN bundle smoke check failed');
  await expect(packageResources.locator('[data-asset-path="loaded-before-failure.js"]')).toHaveAttribute(
    'data-asset-status',
    'loaded'
  );
  await expect(packageResources.locator('[data-asset-path="blocked-entry.js"]')).toHaveAttribute('data-asset-status', 'failed');
  await expect(packageResources).toHaveAttribute('data-package-resource-state', 'error');
  await expect(page.getByRole('radio', { name: 'CDN' })).toBeChecked();
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
});

test('shows a clear CDN error without falling back to the standalone package', async ({ page }) => {
  await page.route('**/api/lab-packages/cdn?*', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No validated staging CDN export exists for hello-card-spfx.' })
    });
  });

  await page.goto('/');
  await page.getByRole('radio', { name: 'CDN' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Staged CDN resources unavailable');
  await expect(alert).toContainText('No validated staging CDN export exists for hello-card-spfx.');
  await expect(page.getByRole('radio', { name: 'CDN' })).toBeChecked();
  await expect(page.locator('.preview-frame')).toHaveAttribute('data-package-mode', 'cdn');
  await expect(page.locator('.preview-frame').getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Package resources' })).toHaveAttribute('data-package-resource-state', 'error');

  const accessibility = await new AxeBuilder({ page })
    .include('main')
    .exclude('[data-tabster-dummy]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('keeps viewer controls anchored while collapsing the options content', async ({ page }) => {
  await page.goto('/');

  const shell = page.locator('main.lab-shell');
  const preview = page.getByRole('region', { name: 'Web part preview area' });
  const modeTabs = page.getByRole('tablist', { name: 'Lab display mode' });
  const appPicker = page.getByRole('combobox', { name: 'Select web part' });
  const optionsPanel = page.getByRole('complementary', { name: 'Options panel' });
  const modeTabsBefore = await modeTabs.boundingBox();
  const previewBefore = await preview.boundingBox();

  expect(modeTabsBefore).not.toBeNull();
  expect(previewBefore).not.toBeNull();

  const collapsePanelButton = page.getByRole('button', { name: 'Collapse options panel' });
  const collapsePanelButtonBox = await collapsePanelButton.boundingBox();
  expect(collapsePanelButtonBox).not.toBeNull();
  expect(collapsePanelButtonBox!.width).toBe(32);
  expect(collapsePanelButtonBox!.height).toBe(32);
  await expect(collapsePanelButton).toHaveAttribute('aria-pressed', 'false');
  await collapsePanelButton.click();

  await expect(shell).toHaveAttribute('data-display-mode', 'edit');
  await expect(optionsPanel).toHaveAttribute('data-panel-state', 'header-only');
  await expect(appPicker).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage apps' })).toHaveCount(0);
  const expandPanelButton = page.getByRole('button', { name: 'Expand options panel' });
  await expect(expandPanelButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.property-pane')).toHaveCount(0);

  await expandPanelButton.click();
  await expect(optionsPanel).toHaveAttribute('data-panel-state', 'expanded');
  await expect(page.locator('.property-pane')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse options panel' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('tab', { name: 'Viewer' }).click();

  await expect(shell).toHaveAttribute('data-display-mode', 'viewer');
  await expect(page.getByRole('tab', { name: 'Viewer' })).toHaveAttribute('aria-selected', 'true');
  await expect(optionsPanel).toHaveAttribute('data-panel-state', 'header-only');
  await expect(appPicker).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage apps' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand options panel and switch to edit mode' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.locator('.property-pane')).toHaveCount(0);

  const modeTabsAfter = await modeTabs.boundingBox();
  const previewAfter = await preview.boundingBox();
  expect(modeTabsAfter).not.toBeNull();
  expect(previewAfter).not.toBeNull();
  expect(Math.abs(modeTabsAfter!.x - modeTabsBefore!.x)).toBeLessThanOrEqual(1);
  expect(previewAfter!.width - previewBefore!.width).toBeGreaterThan(300);

  await page.getByRole('button', { name: 'Expand options panel and switch to edit mode' }).click();
  await expect(shell).toHaveAttribute('data-display-mode', 'edit');
  await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
  await expect(optionsPanel).toHaveAttribute('data-panel-state', 'expanded');
  await expect(page.locator('.property-pane')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse options panel' })).toHaveAttribute('aria-pressed', 'false');
});

test('has no automatically detectable WCAG A or AA violations', async ({ page }) => {
  await page.goto('/');
  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('main')
    .exclude('.monaco-editor')
    .exclude('[data-tabster-dummy]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('shows selected app state, saves export config, and can pin a source release', async ({ page }) => {
  let selectedVersion = 'latest';
  let latestVersion = '1.2.0';
  let updateAvailable = true;
  let releaseLatestUpdate!: () => void;
  const latestUpdateGate = new Promise<void>((resolve) => {
    releaseLatestUpdate = resolve;
  });
  const requests: Array<{ appId: string; versionId: string }> = [];
  const exportConfigRequests: Array<{ appId: string; exportConfig: ManagedAppFixture['exportConfig'] }> = [];
  await page.route('**/api/spfx-apps/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/export-config')) {
      const body = route.request().postDataJSON() as {
        appId: string;
        exportConfig: ManagedAppFixture['exportConfig'];
      };
      exportConfigRequests.push(body);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          appId: body.appId,
          message: 'Saved fixture export config.',
          exportConfig: body.exportConfig,
          apps: managedAppFixtures(selectedVersion, latestVersion, updateAvailable, body.exportConfig)
        })
      });
      return;
    }
    if (route.request().method() === 'POST' && url.pathname.endsWith('/version')) {
      const body = route.request().postDataJSON() as { appId: string; versionId: string };
      requests.push(body);
      selectedVersion = body.versionId;
      if (body.versionId === 'latest') {
        await latestUpdateGate;
        latestVersion = '1.3.0';
        updateAvailable = false;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          appId: body.appId,
          message: 'Updated fixture app.',
          syncedAdapters: 1,
          apps: managedAppFixtures(selectedVersion, latestVersion, updateAvailable)
        })
      });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ apps: managedAppFixtures(selectedVersion, latestVersion, updateAvailable) })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open app menu' }).click();
  const sidebar = page.locator('#app-management-sidebar');
  await expect(sidebar.getByRole('combobox', { name: 'Selected app' })).toHaveText('Hello Card');
  await expect(sidebar.getByRole('switch', { name: 'Active: Hello Card' })).toBeChecked();
  await expect(sidebar.getByRole('switch', { name: 'Not pinned: Hello Card' })).not.toBeChecked();

  const versionDropdown = sidebar.getByRole('combobox', { name: 'Source version for Hello Card' });
  await expect(versionDropdown).toBeDisabled();
  await expect(sidebar.getByRole('switch', { name: 'Active: Hello Card' })).toBeDisabled();
  releaseLatestUpdate();
  await expect(versionDropdown).toContainText('Latest · v1.3.0');
  await expect(versionDropdown).toBeEnabled();
  await expect.poll(() => requests).toEqual([{ appId: 'hello-card-spfx', versionId: 'latest' }]);

  await expect(sidebar.getByRole('textbox', { name: 'Export app name' })).toHaveValue('Hello Card');
  const fileNameInput = sidebar.getByRole('textbox', { name: 'Export file name' });
  const fileNameControl = sidebar.locator('.app-management-sidebar__file-name-control');
  const fileNameOverlay = sidebar.locator('.app-management-sidebar__file-name-overlay');
  const fileNameMirror = sidebar.locator('.app-management-sidebar__file-name-mirror');
  const fileNameSuffix = sidebar.locator('.app-management-sidebar__file-name-suffix');
  await expect(fileNameInput).toHaveValue('hello-card');
  await expect(fileNameInput).toHaveAttribute('aria-describedby', 'export-file-name-description');
  await expect(fileNameMirror).toHaveText('hello-card');
  await expect(fileNameSuffix).toHaveText('.sppkg');
  await expect(fileNameOverlay).toHaveCSS('pointer-events', 'none');
  await expect(fileNameSuffix).not.toHaveAttribute('tabindex', /.+/);
  await expectFileNameSuffixToTrail(fileNameControl, fileNameMirror, fileNameSuffix);
  await expect(sidebar.getByRole('textbox', { name: 'Export version' })).toHaveValue('1.3.0');
  await expect(sidebar.getByRole('textbox', { name: 'Export CDN URL' })).toHaveValue('https://cdn.example.com/spfx/hello-card/');

  const listingGroup = sidebar.getByText('Listing & About', { exact: true });
  const visualsGroup = sidebar.getByText('Visuals', { exact: true });
  const supportGroup = sidebar.getByText('Details & Support', { exact: true });
  await listingGroup.click();
  await visualsGroup.click();
  await supportGroup.click();
  await expect(sidebar.getByRole('textbox', { name: 'App catalog short description' })).toHaveValue('A friendly card web part.');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog long description' })).toHaveValue(
    'A longer introduction to Hello Card.'
  );
  await expect(sidebar.getByRole('textbox', { name: 'App catalog video URL' })).toHaveValue(
    'https://www.youtube.com/watch?v=fixture'
  );
  await expect(sidebar.getByRole('textbox', { name: 'Web part toolbox icon' })).toHaveValue('Page');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog icon path' })).toHaveValue('assets/catalog-icon.png');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog screenshot paths' })).toHaveValue(
    'assets/screenshot-one.png\nhttps://cdn.example.com/screenshot-two.png'
  );
  await expect(sidebar.getByRole('combobox', { name: 'App catalog categories' })).toContainText('2 categories selected');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog developer name' })).toHaveValue('Contoso');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog developer website URL' })).toHaveValue(
    'https://contoso.example/'
  );
  await expect(sidebar.getByRole('textbox', { name: 'App catalog privacy URL' })).toHaveValue('https://contoso.example/privacy');
  await expect(sidebar.getByRole('textbox', { name: 'App catalog terms of use URL' })).toHaveValue(
    'https://contoso.example/terms'
  );
  await expect(sidebar.getByRole('textbox', { name: 'App catalog partner ID' })).toHaveValue('Partner-123');
  await expect(sidebar.getByText('localized listing text remains managed in the app’s source files.')).toBeVisible();
  await expect(sidebar.getByText(/Publisher, support URL, and featured status/)).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('#app-management-sidebar')
    .exclude('[aria-label="Save app export config"]')
    .exclude('.app-management-sidebar__footer .fui-Button')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  const savedConfig: ManagedAppFixture['exportConfig'] = {
    appName: 'Hello Card Enterprise',
    fileName: 'hello-card-enterprise.sppkg',
    description: 'Enterprise-ready card web part.',
    longDescription: 'A detailed enterprise listing for Hello Card.',
    videoUrl: 'https://vimeo.com/123456789',
    appIcon: 'AppGeneric',
    catalogIconPath: 'assets/enterprise-catalog-icon.png',
    screenshotPaths: ['assets/enterprise-one.png', 'https://cdn.example.com/enterprise-two.png'],
    categories: ['Collaboration', 'Productivity', 'Workflow & Process Management'],
    developerName: 'Contoso Engineering',
    developerWebsiteUrl: 'https://engineering.contoso.example/',
    privacyUrl: 'https://engineering.contoso.example/privacy',
    termsOfUseUrl: 'https://engineering.contoso.example/terms',
    partnerId: 'Partner-456',
    version: '2.0.0',
    cdnUrl: 'https://cdn.example.com/spfx/hello-card-enterprise/'
  };
  await sidebar.getByRole('textbox', { name: 'Export app name' }).fill(savedConfig.appName);
  await fileNameInput.fill(savedConfig.fileName);
  await expect(fileNameInput).toHaveValue('hello-card-enterprise');
  await expect(fileNameMirror).toHaveText('hello-card-enterprise');
  await expectFileNameSuffixToTrail(fileNameControl, fileNameMirror, fileNameSuffix);
  await sidebar.getByRole('textbox', { name: 'App catalog short description' }).fill(savedConfig.description);
  await sidebar.getByRole('textbox', { name: 'App catalog long description' }).fill(savedConfig.longDescription);
  await sidebar.getByRole('textbox', { name: 'App catalog video URL' }).fill(savedConfig.videoUrl);
  await sidebar.getByRole('textbox', { name: 'Web part toolbox icon' }).fill(savedConfig.appIcon);
  await sidebar.getByRole('textbox', { name: 'App catalog icon path' }).fill(savedConfig.catalogIconPath);
  await sidebar.getByRole('textbox', { name: 'App catalog screenshot paths' }).fill(savedConfig.screenshotPaths.join('\n'));
  const categoryDropdown = sidebar.getByRole('combobox', { name: 'App catalog categories' });
  await categoryDropdown.click();
  await page.getByRole('menuitemcheckbox', { name: 'Workflow & Process Management' }).click();
  await categoryDropdown.press('Escape');
  await sidebar.getByRole('textbox', { name: 'App catalog developer name' }).fill(savedConfig.developerName);
  await sidebar.getByRole('textbox', { name: 'App catalog developer website URL' }).fill(savedConfig.developerWebsiteUrl);
  await sidebar.getByRole('textbox', { name: 'App catalog privacy URL' }).fill(savedConfig.privacyUrl);
  await sidebar.getByRole('textbox', { name: 'App catalog terms of use URL' }).fill(savedConfig.termsOfUseUrl);
  await sidebar.getByRole('textbox', { name: 'App catalog partner ID' }).fill(savedConfig.partnerId);
  await sidebar.getByRole('textbox', { name: 'Export version' }).fill(savedConfig.version);
  await sidebar.getByRole('textbox', { name: 'Export CDN URL' }).fill(savedConfig.cdnUrl);
  await sidebar.getByRole('button', { name: 'Save app export config' }).click();
  await expect.poll(() => exportConfigRequests).toEqual([{ appId: 'hello-card-spfx', exportConfig: savedConfig }]);
  await expect(sidebar.getByText('Saved fixture export config.')).toBeVisible();

  await sidebar.getByRole('combobox', { name: 'Source version for Hello Card Enterprise' }).click();
  await page.getByRole('option', { name: 'v1.0.0' }).click();
  await expect
    .poll(() => requests)
    .toEqual([
      { appId: 'hello-card-spfx', versionId: 'latest' },
      { appId: 'hello-card-spfx', versionId: 'tag:v1.0.0' }
    ]);
  await expect(versionDropdown).toContainText('v1.0.0');
  await expect(sidebar.getByText('Updated fixture app.')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Reload lab' })).toBeVisible();
});

test('opens export downloads with the requested package target selected', async ({ page }) => {
  await page.route('**/api/spfx-apps/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: managedAppFixtures('latest') }) });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/export-spfx-app/estimate?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ single: { packageFileName: 'hello-card.sppkg' }, cdn: {}, standalone: {} })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open app menu' }).click();
  let sidebar = page.locator('#app-management-sidebar');
  await sidebar.getByRole('button', { name: 'Download standalone' }).click();

  await expect(page.getByRole('combobox', { name: 'Select app to export' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card.sppkg' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include SPFx + CDN JS package' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card-spfx-repo' })).toBeChecked();
  await page.getByRole('button', { name: 'Close export package drawer' }).click();

  await page.getByRole('button', { name: 'Open app menu' }).click();
  sidebar = page.locator('#app-management-sidebar');
  await sidebar.getByRole('button', { name: 'Download CDN-ready' }).click();

  await expect(page.getByRole('checkbox', { name: 'Include hello-card.sppkg' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include SPFx + CDN JS package' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card-spfx-repo' })).not.toBeChecked();
});

test('shows compact feedback after re-syncing the app registry', async ({ page }) => {
  let syncAttempts = 0;
  await page.route('**/api/spfx-apps/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/sync')) {
      syncAttempts += 1;
      if (syncAttempts > 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Sync failed.' }) });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Synced the lab app registry.',
          syncedAdapters: 1,
          apps: managedAppFixtures('latest')
        })
      });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: managedAppFixtures('latest') }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open app menu' }).click();
  const sidebar = page.locator('#app-management-sidebar');
  await sidebar.getByRole('button', { name: 'Re-sync apps' }).click();

  await expect(sidebar.getByText('Synced the lab app registry.')).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'Reload lab' })).toHaveCount(0);
  const timestamp = sidebar.getByText(/^Last synced /);
  await expect(timestamp).toBeVisible({ timeout: 3_000 });

  const timestampText = await timestamp.textContent();
  const timestampBox = await timestamp.boundingBox();
  const syncButtonBox = await sidebar.getByRole('button', { name: 'Re-sync apps' }).boundingBox();
  expect(timestampBox).not.toBeNull();
  expect(syncButtonBox).not.toBeNull();
  expect(timestampBox!.x + timestampBox!.width).toBeLessThanOrEqual(syncButtonBox!.x);

  await sidebar.getByRole('button', { name: 'Re-sync apps' }).click();
  await expect(sidebar.getByRole('alert')).toContainText('Apps were not re-synced');
  await expect(sidebar.getByRole('alert')).toContainText('Sync failed.');
  await expect(timestamp).toHaveText(timestampText || '');
});

test('keeps the app settings sidebar within a narrow viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/spfx-apps/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: managedAppFixtures('latest') }) });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open app menu' }).click();

  const sidebar = page.locator('#app-management-sidebar');
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => (await sidebar.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.x).toBeGreaterThanOrEqual(0);
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(390);
  expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function expectFileNameSuffixToTrail(control: Locator, mirror: Locator, suffix: Locator): Promise<void> {
  const textMetrics = await control.evaluate((element) => {
    const input = element.querySelector('input');
    const overlay = element.querySelector('.app-management-sidebar__file-name-overlay');
    const inputStyle = window.getComputedStyle(input!);
    const overlayStyle = window.getComputedStyle(overlay!);
    const inputBox = input!.getBoundingClientRect();
    const overlayBox = overlay!.getBoundingClientRect();
    return {
      inputFont: inputStyle.font,
      overlayFont: overlayStyle.font,
      textStartDelta: overlayBox.left - (inputBox.left + Number.parseFloat(inputStyle.paddingLeft))
    };
  });
  const [controlBox, mirrorBox, suffixBox] = await Promise.all([
    control.boundingBox(),
    mirror.boundingBox(),
    suffix.boundingBox()
  ]);
  expect(textMetrics.overlayFont).toBe(textMetrics.inputFont);
  expect(Math.abs(textMetrics.textStartDelta)).toBeLessThanOrEqual(0.5);
  expect(controlBox).not.toBeNull();
  expect(mirrorBox).not.toBeNull();
  expect(suffixBox).not.toBeNull();
  expect(Math.abs(suffixBox!.x - (mirrorBox!.x + mirrorBox!.width))).toBeLessThanOrEqual(1);
  expect(suffixBox!.x + suffixBox!.width).toBeLessThanOrEqual(controlBox!.x + controlBox!.width);
}

test('pins one startup app and restores it after refresh', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open app menu' }).click();
  let sidebar = page.locator('#app-management-sidebar');
  const pinSwitch = sidebar.getByRole('switch', { name: 'Not pinned: Hello Card' });
  await expect(pinSwitch).not.toBeChecked();
  await pinSwitch.click();
  await expect(sidebar.getByRole('switch', { name: 'Pinned: Hello Card' })).toBeChecked();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveText('Hello Card');
  await page.getByRole('button', { name: 'Open app menu' }).click();
  sidebar = page.locator('#app-management-sidebar');
  const unpinSwitch = sidebar.getByRole('switch', { name: 'Pinned: Hello Card' });
  await expect(unpinSwitch).toBeChecked();
  await unpinSwitch.click();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();
});

interface ManagedAppFixture {
  id: string;
  packageName: string;
  relativeDir: string;
  status: 'connected';
  exportConfig: {
    appName: string;
    fileName: string;
    description: string;
    longDescription: string;
    videoUrl: string;
    appIcon: string;
    catalogIconPath: string;
    screenshotPaths: string[];
    categories: string[];
    developerName: string;
    developerWebsiteUrl: string;
    privacyUrl: string;
    termsOfUseUrl: string;
    partnerId: string;
    version: string;
    cdnUrl: string;
  };
  version: {
    autoUpdate: boolean;
    current: string;
    selected: string;
    options: Array<{ id: string; label: string }>;
    canAutoUpdate: boolean;
    canSelect: boolean;
    updateAvailable: boolean;
    source: 'clone';
    detail?: string;
  };
}

function managedAppFixtures(
  selectedVersion: string,
  latestVersion = '1.2.0',
  updateAvailable = false,
  exportConfig: ManagedAppFixture['exportConfig'] = {
    appName: 'Hello Card',
    fileName: 'hello-card.sppkg',
    description: 'A friendly card web part.',
    longDescription: 'A longer introduction to Hello Card.',
    videoUrl: 'https://www.youtube.com/watch?v=fixture',
    appIcon: 'Page',
    catalogIconPath: 'assets/catalog-icon.png',
    screenshotPaths: ['assets/screenshot-one.png', 'https://cdn.example.com/screenshot-two.png'],
    categories: ['Collaboration', 'Productivity'],
    developerName: 'Contoso',
    developerWebsiteUrl: 'https://contoso.example/',
    privacyUrl: 'https://contoso.example/privacy',
    termsOfUseUrl: 'https://contoso.example/terms',
    partnerId: 'Partner-123',
    version: latestVersion,
    cdnUrl: 'https://cdn.example.com/spfx/hello-card/'
  }
): ManagedAppFixture[] {
  return [
    {
      id: 'hello-card-spfx',
      packageName: 'hello-card-spfx',
      relativeDir: 'examples/hello-card-spfx',
      status: 'connected',
      exportConfig,
      version: {
        autoUpdate: true,
        current: selectedVersion === 'tag:v1.0.0' ? '1.0.0' : latestVersion,
        selected: selectedVersion,
        options: [
          { id: 'latest', label: 'Latest' },
          { id: 'tag:v1.0.0', label: 'v1.0.0' }
        ],
        canAutoUpdate: true,
        canSelect: true,
        updateAvailable,
        source: 'clone'
      }
    },
    {
      id: 'dirty-app-spfx',
      packageName: 'dirty-app-spfx',
      relativeDir: '.spfx-kit/apps/dirty-app-spfx',
      status: 'connected',
      exportConfig: {
        appName: 'Dirty App',
        fileName: 'dirty-app.sppkg',
        description: 'A dirty fixture app.',
        longDescription: '',
        videoUrl: '',
        appIcon: 'Page',
        catalogIconPath: '',
        screenshotPaths: [],
        categories: [],
        developerName: '',
        developerWebsiteUrl: '',
        privacyUrl: '',
        termsOfUseUrl: '',
        partnerId: '',
        version: '2.0.0',
        cdnUrl: 'https://cdn.example.com/spfx/dirty-app/'
      },
      version: {
        autoUpdate: true,
        current: '2.0.0',
        selected: 'latest',
        options: [{ id: 'latest', label: 'Latest' }],
        canAutoUpdate: false,
        canSelect: true,
        updateAvailable: true,
        source: 'clone',
        detail:
          'Automatic updates are paused because this app has local changes. Manual version changes save them to a Git stash.'
      }
    }
  ];
}
