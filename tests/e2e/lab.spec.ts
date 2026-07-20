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
