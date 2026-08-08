import { expect, test, type Locator, type Page } from '@playwright/test';

const contractUrl = '/?ui-profile-contract=1';
const scopeAttribute = 'data-spfx-ui-scope';
const themeAttribute = 'data-spfx-ui-theme';

function root(page: Page, instanceId: 'contract-a' | 'contract-b'): Locator {
  return page.locator(`[data-spfx-ui-root="${instanceId}"]`);
}

function portalHost(page: Page, instanceId: 'contract-a' | 'contract-b'): Locator {
  return page.locator(`[data-spfx-ui-portal-host="${instanceId}"]`);
}

async function expectSurfaceParity(page: Page, instanceId: 'contract-a' | 'contract-b'): Promise<void> {
  const appRoot = root(page, instanceId);
  const portal = portalHost(page, instanceId);
  const [rootContract, portalContract] = await Promise.all([
    appRoot.evaluate((element) => ({
      profile: element.getAttribute('data-spfx-ui-profile'),
      scope: element.getAttribute('data-spfx-ui-scope'),
      theme: element.getAttribute('data-spfx-ui-theme'),
      background: element.style.getPropertyValue('--spfx-ui-color-background'),
      foreground: element.style.getPropertyValue('--spfx-ui-color-foreground'),
      ownerDocument: element.ownerDocument === document
    })),
    portal.evaluate((element) => ({
      profile: element.getAttribute('data-spfx-ui-profile'),
      scope: element.getAttribute('data-spfx-ui-scope'),
      theme: element.getAttribute('data-spfx-ui-theme'),
      background: element.style.getPropertyValue('--spfx-ui-color-background'),
      foreground: element.style.getPropertyValue('--spfx-ui-color-foreground'),
      ownerDocument: element.ownerDocument === document
    }))
  ]);

  expect(rootContract).toEqual(portalContract);
  expect(rootContract.profile).toBeTruthy();
  expect(rootContract.scope).toMatch(/^skui-[a-f0-9]{16}$/);
  expect(rootContract.background).toBeTruthy();
  expect(rootContract.foreground).toBeTruthy();
  expect(rootContract.ownerDocument).toBe(true);
}

async function ownedSurfaceIds(page: Page, instanceId?: 'contract-a' | 'contract-b'): Promise<string[]> {
  return page.evaluate((selectedInstance) => {
    const selector = selectedInstance
      ? `[data-spfx-ui-root="${selectedInstance}"], [data-spfx-ui-portal-host="${selectedInstance}"]`
      : '[data-spfx-ui-root], [data-spfx-ui-portal-host]';
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((surface) => [
      surface.id,
      ...Array.from(surface.querySelectorAll<HTMLElement>('[id]'), (element) => element.id)
    ]);
  }, instanceId);
}

async function expectEveryOwnedSurfaceIdDeterministic(page: Page): Promise<void> {
  const ids = await ownedSurfaceIds(page);
  expect(ids.length).toBeGreaterThan(4);
  expect(ids.every((id) => id.startsWith('spfx-ui-'))).toBe(true);
  expect(ids.some((id) => /^mui-/u.test(id))).toBe(false);
  expect(new Set(ids).size).toBe(ids.length);
}

async function expectOverlayOwnedBy(
  page: Page,
  instanceId: 'contract-a' | 'contract-b',
  kind: 'dialog' | 'select' | 'tooltip' | 'menu'
): Promise<Locator> {
  const overlay = page.locator(`[data-contract-overlay="${instanceId}-${kind}"]`);
  await expect(overlay).toBeVisible();
  await expect(portalHost(page, instanceId).locator(`[data-contract-overlay="${instanceId}-${kind}"]`)).toHaveCount(1);
  await expect(
    portalHost(page, instanceId === 'contract-a' ? 'contract-b' : 'contract-a').locator(
      `[data-contract-overlay="${instanceId}-${kind}"]`
    )
  ).toHaveCount(0);
  expect(
    await overlay.evaluate(
      (element) => element.ownerDocument === document && Boolean(element.closest('[data-spfx-ui-portal-host]'))
    )
  ).toBe(true);
  return overlay;
}

async function relationshipLedger(page: Page, label: 'A' | 'B') {
  const hostRoot = root(page, label === 'A' ? 'contract-a' : 'contract-b');
  return {
    dialog: await hostRoot.getByRole('button', { name: `Open ${label} dialog` }).getAttribute('aria-controls'),
    select: await hostRoot.getByRole('combobox', { name: `${label} selection` }).getAttribute('aria-controls'),
    tooltip: await hostRoot.getByRole('button', { name: `Show ${label} tooltip` }).getAttribute('aria-describedby'),
    menu: await hostRoot.getByRole('button', { name: `Open ${label} menu` }).getAttribute('aria-controls')
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto(contractUrl);
  await expect(page.locator('[data-ui-profile-contract-harness="ready"]')).toBeVisible();
});

test('replaces the Lab route and keeps two root contracts isolated, themed, and stable across remount', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'SPFx UI profile root contract' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Web part preview area' })).toHaveCount(0);
  await expect(page.locator('[data-spfx-ui-root]')).toHaveCount(2);
  await expect(page.locator('[data-spfx-ui-portal-host]')).toHaveCount(2);

  await expectSurfaceParity(page, 'contract-a');
  await expectSurfaceParity(page, 'contract-b');
  await expect(root(page, 'contract-a')).toHaveAttribute(themeAttribute, 'light');
  await expect(root(page, 'contract-b')).toHaveAttribute(themeAttribute, 'dark');
  await expect(root(page, 'contract-a')).toHaveAttribute(
    scopeAttribute,
    (await root(page, 'contract-b').getAttribute(scopeAttribute)) as string
  );
  await expectEveryOwnedSurfaceIdDeterministic(page);

  const aTriggers = await root(page, 'contract-a')
    .locator('[id^="spfx-ui-"]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  const bTriggers = await root(page, 'contract-b')
    .locator('[id^="spfx-ui-"]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(aTriggers.length).toBeGreaterThanOrEqual(5);
  expect(new Set([...aTriggers, ...bTriggers]).size).toBe(aTriggers.length + bTriggers.length);
  const aRelationships = await relationshipLedger(page, 'A');
  const bRelationships = await relationshipLedger(page, 'B');
  expect(Object.values(aRelationships).every(Boolean)).toBe(true);
  expect(new Set([...Object.values(aRelationships), ...Object.values(bRelationships)]).size).toBe(8);

  const dialogTrigger = page.getByRole('button', { name: 'Open A dialog' });
  const expectedDialogId = aRelationships.dialog;
  await dialogTrigger.click();
  const dialog = await expectOverlayOwnedBy(page, 'contract-a', 'dialog');
  expect(await dialog.getAttribute('id')).toBe(expectedDialogId);
  const titleId = await dialog.getAttribute('aria-labelledby');
  const descriptionId = await dialog.getAttribute('aria-describedby');
  expect(titleId).toBeTruthy();
  expect(descriptionId).toBeTruthy();
  await expect(dialog.locator(`#${titleId}`)).toHaveCount(1);
  await expect(dialog.locator(`#${descriptionId}`)).toHaveCount(1);
  const firstOpenIds = await ownedSurfaceIds(page, 'contract-a');
  await expectEveryOwnedSurfaceIdDeterministic(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(dialogTrigger).toBeFocused();

  await page.getByRole('button', { name: 'Toggle A theme' }).click();
  await expect(root(page, 'contract-a')).toHaveAttribute(themeAttribute, 'dark');
  await expect(portalHost(page, 'contract-a')).toHaveAttribute(themeAttribute, 'dark');
  await expect(root(page, 'contract-b')).toHaveAttribute(themeAttribute, 'dark');
  await expectSurfaceParity(page, 'contract-a');

  const rootId = await root(page, 'contract-a').getAttribute('id');
  await page.getByRole('button', { name: 'Teardown A' }).click();
  await expect(root(page, 'contract-a')).toHaveCount(0);
  await expect(portalHost(page, 'contract-a')).toHaveCount(0);
  await expect(page.locator('[data-host-mount="contract-a"]')).toHaveCount(1);
  await expect(page.locator('[data-host-portal-parent="contract-a"]')).toHaveCount(1);
  await expect(page.locator('[data-host-sentinel="contract-a"]')).toHaveCSS('border-top-width', '3px');

  await page.getByRole('button', { name: 'Remount A' }).click();
  await expect(root(page, 'contract-a')).toHaveAttribute('id', rootId as string);
  const remountedTriggers = await root(page, 'contract-a')
    .locator('[id^="spfx-ui-"]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(remountedTriggers).toEqual(aTriggers);
  const remountedDialogTrigger = page.getByRole('button', { name: 'Open A dialog' });
  expect(await remountedDialogTrigger.getAttribute('aria-controls')).toBe(expectedDialogId);
  expect(await relationshipLedger(page, 'A')).toEqual(aRelationships);
  await remountedDialogTrigger.click();
  const remountedDialog = await expectOverlayOwnedBy(page, 'contract-a', 'dialog');
  expect(await remountedDialog.getAttribute('aria-labelledby')).toBe(titleId);
  expect(await remountedDialog.getAttribute('aria-describedby')).toBe(descriptionId);
  expect(await ownedSurfaceIds(page, 'contract-a')).toEqual(firstOpenIds);
  await expectEveryOwnedSurfaceIdDeterministic(page);
});

test('keeps Dialog, Select, Tooltip, and menu portals in their owning root and returns focus on Escape', async ({ page }) => {
  const renderedContentIds = new Set<string>();
  for (const [instanceId, label] of [
    ['contract-a', 'A'],
    ['contract-b', 'B']
  ] as const) {
    const cases = [
      { kind: 'dialog' as const, trigger: page.getByRole('button', { name: `Open ${label} dialog` }) },
      { kind: 'select' as const, trigger: page.getByRole('combobox', { name: `${label} selection` }) },
      { kind: 'menu' as const, trigger: page.getByRole('button', { name: `Open ${label} menu` }) }
    ];

    for (const entry of cases) {
      const expectedContentId = await entry.trigger.getAttribute('aria-controls');
      await entry.trigger.click();
      const overlay = await expectOverlayOwnedBy(page, instanceId, entry.kind);
      expect(await overlay.getAttribute('id')).toBe(expectedContentId);
      renderedContentIds.add(expectedContentId as string);
      await expectEveryOwnedSurfaceIdDeterministic(page);
      await page.keyboard.press('Escape');
      await expect(overlay).toBeHidden();
      await expect(entry.trigger).toBeFocused();
    }

    const tooltipTrigger = page.getByRole('button', { name: `Show ${label} tooltip` });
    const expectedTooltipId = await tooltipTrigger.getAttribute('aria-describedby');
    await tooltipTrigger.hover();
    const tooltip = await expectOverlayOwnedBy(page, instanceId, 'tooltip');
    expect(await tooltip.getAttribute('id')).toBe(expectedTooltipId);
    renderedContentIds.add(expectedTooltipId as string);
    await expectEveryOwnedSurfaceIdDeterministic(page);
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
  }
  expect(renderedContentIds.size).toBe(8);
});

test('teardown removes owned nodes and open overlays without mutating SharePoint host nodes', async ({ page }) => {
  const sentinel = page.locator('[data-host-sentinel="contract-a"]');
  const mountPoint = page.locator('[data-host-mount="contract-a"]');
  const portalParent = page.locator('[data-host-portal-parent="contract-a"]');
  await sentinel.evaluate((element) => element.setAttribute('data-sharepoint-owned', 'preserve'));
  await page.locator('html').evaluate((element) => element.setAttribute('data-sharepoint-document', 'preserve'));

  await page.getByRole('button', { name: 'Open A dialog' }).click();
  await expectOverlayOwnedBy(page, 'contract-a', 'dialog');
  await page.locator('[data-action="teardown-contract-a"]').evaluate((button: HTMLButtonElement) => button.click());

  await expect(root(page, 'contract-a')).toHaveCount(0);
  await expect(portalHost(page, 'contract-a')).toHaveCount(0);
  await expect(page.locator('[data-contract-overlay^="contract-a-"]')).toHaveCount(0);
  await expect(mountPoint).toHaveCount(1);
  await expect(portalParent).toHaveCount(1);
  await expect(sentinel).toHaveAttribute('data-sharepoint-owned', 'preserve');
  await expect(sentinel).toHaveCSS('border-top-color', 'rgb(163, 44, 44)');
  await expect(page.locator('html')).toHaveAttribute('data-sharepoint-document', 'preserve');
  await expect(page.locator('html')).not.toHaveAttribute('data-base-ui-scroll-locked', /.*/);
  await expect(page.locator('[data-base-ui-inert]')).toHaveCount(0);
  await expect(root(page, 'contract-b')).toHaveCount(1);
  await expect(portalHost(page, 'contract-b')).toHaveCount(1);
});
