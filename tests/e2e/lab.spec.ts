import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pinnedAppStorageKey = 'spfx-kit.lab.pinned-app.v1';

test('loads the committed web part and supports a core toolbar interaction', async ({ page }) => {
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveText('Hello Card');

  await page.getByRole('button', { name: 'Theme: Light' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('main.lab-shell')).toHaveClass(/lab-shell--dark/);
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
