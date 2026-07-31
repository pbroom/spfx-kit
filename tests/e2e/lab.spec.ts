import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

const pinnedAppStorageKey = 'spfx-kit.lab.pinned-app.v1';

test('loads the committed web part and supports a core toolbar interaction', async ({ page }) => {
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveText('Hello Card');

  await expect(page.getByRole('button', { name: 'Manage apps' })).toHaveCount(0);
  const appMenuButton = page.getByRole('button', { name: 'Open app menu' });
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
  await expect(sidebar.getByRole('textbox', { name: 'Export description' })).toHaveValue('A friendly card web part.');
  await expect(sidebar.getByRole('textbox', { name: 'Export app icon' })).toHaveValue('Page');
  await expect(sidebar.getByRole('textbox', { name: 'Export version' })).toHaveValue('1.3.0');
  await expect(sidebar.getByRole('textbox', { name: 'Export CDN URL' })).toHaveValue('https://cdn.example.com/spfx/hello-card/');

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
    appIcon: 'AppGeneric',
    version: '2.0.0',
    cdnUrl: 'https://cdn.example.com/spfx/hello-card-enterprise/'
  };
  await sidebar.getByRole('textbox', { name: 'Export app name' }).fill(savedConfig.appName);
  await fileNameInput.fill(savedConfig.fileName);
  await expect(fileNameInput).toHaveValue('hello-card-enterprise');
  await expect(fileNameMirror).toHaveText('hello-card-enterprise');
  await expectFileNameSuffixToTrail(fileNameControl, fileNameMirror, fileNameSuffix);
  await sidebar.getByRole('textbox', { name: 'Export description' }).fill(savedConfig.description);
  await sidebar.getByRole('textbox', { name: 'Export app icon' }).fill(savedConfig.appIcon);
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
  await expect(page.getByRole('checkbox', { name: 'Include hello-card.sppkg' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include SPFx + CDN JS package' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card-spfx-repo' })).not.toBeChecked();
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
    appIcon: string;
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
    appIcon: 'Page',
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
        appIcon: 'Page',
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
