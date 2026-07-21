import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pinnedAppStorageKey = 'spfx-kit.lab.pinned-app.v1';

test('loads the committed web part and supports a core toolbar interaction', async ({ page }) => {
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveText('Hello Card');

  await page.getByRole('button', { name: 'Export package' }).click();
  await expect(page.getByRole('combobox', { name: 'Select app to export' })).toBeVisible();
  await page.getByRole('button', { name: 'Close export package drawer' }).click();

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
  const manageAppsButtonBox = await page.getByRole('button', { name: 'Manage apps' }).boundingBox();
  const collapsePanelButtonBox = await collapsePanelButton.boundingBox();
  expect(manageAppsButtonBox).not.toBeNull();
  expect(collapsePanelButtonBox).not.toBeNull();
  expect(manageAppsButtonBox!.width).toBe(32);
  expect(manageAppsButtonBox!.height).toBe(32);
  expect(collapsePanelButtonBox!.width).toBe(manageAppsButtonBox!.width);
  expect(collapsePanelButtonBox!.height).toBe(manageAppsButtonBox!.height);
  await expect(collapsePanelButton).toHaveAttribute('aria-pressed', 'false');
  await collapsePanelButton.click();

  await expect(shell).toHaveAttribute('data-display-mode', 'edit');
  await expect(optionsPanel).toHaveAttribute('data-panel-state', 'header-only');
  await expect(appPicker).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage apps' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Manage apps' })).toBeVisible();
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

  await page.getByRole('button', { name: 'Manage apps' }).click();
  await expect(page.getByRole('dialog')).toContainText('Manage Apps');
  await page.getByRole('button', { name: 'Close manage apps' }).click();

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

test('tracks app versions, defaults to Latest, and can pin a release', async ({ page }) => {
  let selectedVersion = 'latest';
  let latestVersion = '1.2.0';
  let updateAvailable = true;
  let releaseLatestUpdate!: () => void;
  const latestUpdateGate = new Promise<void>((resolve) => {
    releaseLatestUpdate = resolve;
  });
  const requests: Array<{ appId: string; versionId: string }> = [];
  await page.route('**/api/spfx-apps/**', async (route) => {
    const url = new URL(route.request().url());
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
  await page.getByRole('button', { name: 'Manage apps' }).click();
  const dialog = page.getByRole('dialog');
  const versionDropdown = dialog.getByRole('combobox', { name: 'Version for Fixture App' });
  await expect(versionDropdown).toBeDisabled();
  await expect(dialog.getByRole('switch', { name: 'Connected: Fixture App' })).toBeDisabled();
  releaseLatestUpdate();
  await expect(versionDropdown).toContainText('Latest · v1.3.0');
  await expect(versionDropdown).toBeEnabled();
  await expect.poll(() => requests).toEqual([{ appId: 'fixture-app-spfx', versionId: 'latest' }]);
  await expect(dialog.getByText('Update paused because this app has local changes.')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Version for Dirty App' })).toBeDisabled();

  const accessibility = await new AxeBuilder({ page })
    .include('.manage-apps-dialog')
    .exclude('.manage-apps-dialog__toolbar-primary .fui-Button')
    .exclude('.manage-apps-dialog__actions .fui-Button')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await versionDropdown.click();
  await page.getByRole('option', { name: 'v1.0.0' }).click();
  await expect
    .poll(() => requests)
    .toEqual([
      { appId: 'fixture-app-spfx', versionId: 'latest' },
      { appId: 'fixture-app-spfx', versionId: 'tag:v1.0.0' }
    ]);
  await expect(versionDropdown).toContainText('v1.0.0');
  await expect(dialog.getByText('Updated fixture app.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reload lab' })).toBeVisible();
});

test('keeps the version dropdown left of Connected on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/spfx-apps/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: managedAppFixtures('latest') }) });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage apps' }).click();

  const dialog = page.getByRole('dialog');
  const row = dialog.locator('[data-app-id="fixture-app-spfx"]');
  const dropdownBox = await row.getByRole('combobox', { name: 'Version for Fixture App' }).boundingBox();
  const switchBox = await row.getByRole('switch', { name: 'Connected: Fixture App' }).boundingBox();
  const mainBox = await row.locator('.manage-app-row__main').boundingBox();
  const actionsBox = await row.locator('.manage-app-row__actions').boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(dropdownBox).not.toBeNull();
  expect(switchBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(dropdownBox!.x).toBeLessThan(switchBox!.x);
  expect(actionsBox!.y).toBeGreaterThan(mainBox!.y);
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('pins one startup app and restores it after refresh', async ({ page }) => {
  await page.goto('/');

  const appPicker = page.getByRole('combobox', { name: 'Select web part' });
  await appPicker.click();

  const helloCardOption = page.getByRole('option', {
    name: 'Hello Card. Not pinned. Press Alt+P to pin.'
  });
  const helloCardRow = page.locator('.webpart-option-row').filter({ hasText: 'Hello Card' });
  const pinButton = helloCardRow.getByRole('button', { name: 'Pin Hello Card as startup app' });
  await expect(pinButton).toBeHidden();
  await helloCardOption.hover();
  await expect(pinButton).toBeVisible();
  await pinButton.click();

  await expect(
    page.getByRole('option', {
      name: 'Hello Card. Pinned. Press Alt+P to unpin.'
    })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');

  await page.reload();
  await expect(appPicker).toHaveText('Hello Card');

  await appPicker.click();
  const unpinButton = page.getByRole('button', { name: 'Unpin Hello Card as startup app' });
  await expect(unpinButton).toBeVisible();
  await unpinButton.click();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();

  await appPicker.press('Alt+p');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');
  await appPicker.press('Alt+p');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();
});

function managedAppFixtures(selectedVersion: string, latestVersion = '1.2.0', updateAvailable = false) {
  return [
    {
      id: 'fixture-app-spfx',
      packageName: 'fixture-app-spfx',
      relativeDir: '.spfx-kit/apps/fixture-app-spfx',
      status: 'connected',
      version: {
        autoUpdate: true,
        current: selectedVersion === 'tag:v1.0.0' ? '1.0.0' : latestVersion,
        selected: selectedVersion,
        options: [
          { id: 'latest', label: 'Latest' },
          { id: 'tag:v1.0.0', label: 'v1.0.0' }
        ],
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
      version: {
        autoUpdate: true,
        current: '2.0.0',
        selected: 'latest',
        options: [{ id: 'latest', label: 'Latest' }],
        canSelect: false,
        updateAvailable: true,
        source: 'clone',
        detail: 'Update paused because this app has local changes.'
      }
    }
  ];
}
