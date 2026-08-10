import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

const pinnedAppStorageKey = 'spfx-kit.lab.pinned-app.v1';
const syntheticMockCdnOrigin = 'http://127.0.0.1:4400';
const syntheticMockCdnPublicOrigin = 'https://cdn-preview.example.test';

function bucketInventory(selectedReleaseId: string, releaseIds: string[]) {
  return {
    schemaVersion: 1,
    origin: syntheticMockCdnOrigin,
    publicOrigin: syntheticMockCdnPublicOrigin,
    namespaces: {
      apps: {
        status: 'supported',
        releases: releaseIds.map((releaseId, index) => {
          const namespacePath = `apps/hello-card-spfx/versions/${releaseId}/`;
          const releaseBaseUrl = `${syntheticMockCdnOrigin}/${namespacePath}`;
          const integrityStatus = releaseId === selectedReleaseId ? 'verified' : 'anchored';
          return {
            namespace: 'app',
            appId: 'hello-card-spfx',
            releaseId,
            namespacePath,
            releaseBaseUrl,
            selected: releaseId === selectedReleaseId,
            status: integrityStatus,
            generatedAt: '2026-08-04T15:00:00.000Z',
            releaseLabel: index === 0 ? 'Release A' : 'Release B',
            manifestSha256: 'a'.repeat(64),
            manifestBytes: 2048,
            proof: { localArtifact: 'passed', remoteCdn: 'not-run', sharePointAppCatalog: 'not-run' },
            package: {
              path: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
              bytes: 4096,
              sha256: 'b'.repeat(64),
              status: integrityStatus
            },
            components: { package: ['component-a'], generated: ['component-a'] },
            ...(index === 0
              ? {
                  sourceProvenance: {
                    kind: 'github-directory',
                    visibility: 'private',
                    repository: 'acme-private/staging-assets',
                    commit: '0123456789abcdef0123456789abcdef01234567',
                    path: 'releases/hello-card',
                    descriptorSha256: 'd'.repeat(64),
                    sourceManifestSha256: 'b'.repeat(64),
                    releaseManifestSha256: 'a'.repeat(64),
                    files: 4,
                    status: 'staging-closure-verified'
                  }
                }
              : {}),
            assets: [
              {
                path: 'hello-card.js',
                url: `${releaseBaseUrl}hello-card.js`,
                bytes: 128,
                sha256: 'c'.repeat(64),
                referencedBy: ['SPFx package:component-a:entry'],
                status: integrityStatus
              }
            ]
          };
        })
      },
      shared: {
        status: 'reserved-unsupported',
        releases: [],
        message: 'Shared resource publication awaits a canonical verifier.'
      }
    },
    selectedPointers: [
      {
        appId: 'hello-card-spfx',
        releaseId: selectedReleaseId,
        manifestSha256: 'a'.repeat(64),
        status: 'selected-and-verified'
      }
    ],
    publishSources: []
  };
}

function cdnDescriptor(releaseId: string) {
  const namespacePath = `apps/hello-card-spfx/versions/${releaseId}/`;
  const releaseBaseUrl = `${syntheticMockCdnOrigin}/${namespacePath}`;
  return {
    mode: 'cdn',
    appId: 'hello-card-spfx',
    releaseId,
    generatedAt: '2026-08-04T15:00:00.000Z',
    cdnBasePath: releaseBaseUrl,
    delivery: {
      kind: 'local-mock-cdn',
      origin: syntheticMockCdnOrigin,
      bucketBaseUrl: `${syntheticMockCdnOrigin}/`,
      namespaceKind: 'app-release',
      namespacePath,
      releaseBaseUrl,
      releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
      status: 'published-and-verified'
    },
    packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
    assets: [
      {
        role: 'entry',
        moduleId: 'hello-card',
        assetPath: 'hello-card.js',
        assetUrl: `${releaseBaseUrl}hello-card.js`,
        bytes: 128,
        sha256: 'c'.repeat(64),
        stageStatus: 'allowed-and-verified'
      }
    ],
    deferredResources: []
  };
}

test('loads the committed web part and supports a core toolbar interaction', async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toContainText('Hello Card');
  await expect(page.getByRole('tab', { name: 'Standalone', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('region', { name: 'Package resources' })).toHaveCount(0);

  const themeTrigger = page.getByRole('button', { name: 'Theme: Light' });
  const webPartTrigger = page.getByRole('combobox', { name: 'Select web part' });
  await expect(themeTrigger).toHaveAttribute('data-slot', 'dropdown-menu-trigger');
  await expect(themeTrigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(webPartTrigger).toHaveAttribute('data-slot', 'select-trigger');
  await expect(webPartTrigger).toHaveAttribute('data-size', 'sm');
  await expect(webPartTrigger).toHaveAttribute('aria-haspopup', 'listbox');
  const themeTriggerBox = await themeTrigger.boundingBox();
  expect(themeTriggerBox).not.toBeNull();
  expect(themeTriggerBox!.width).toBe(themeTriggerBox!.height);
  expect(themeTriggerBox!.width).toBe(28);

  await expect(page.getByRole('button', { name: 'Manage apps' })).toHaveCount(0);
  const appMenuButton = page.getByRole('button', { name: 'Open app menu' });
  await appMenuButton.click();
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-slot', 'sheet-content');
  await expect(sidebar.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  const sidebarId = await sidebar.getAttribute('id');
  expect(sidebarId).toBeTruthy();
  const controlledAppMenuButton = page.locator(`button[aria-controls="${sidebarId}"]`);
  await expect(controlledAppMenuButton).toHaveAttribute('aria-controls', sidebarId!);
  await expect(sidebar.getByText('App settings')).toBeVisible();
  await expect(controlledAppMenuButton).toHaveAttribute('aria-expanded', 'true');
  const selectedAppTrigger = sidebar.getByRole('combobox', { name: 'Selected app' });
  await selectedAppTrigger.click();
  await page.getByRole('listbox').press('Escape');
  await expect(sidebar).toBeVisible();
  await expect(selectedAppTrigger).toHaveAttribute('aria-expanded', 'false');
  await sidebar.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(appMenuButton).toBeFocused();

  await themeTrigger.click();
  const themeContent = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(themeContent).toHaveAttribute('id', /spfx-ui-/);
  await expect(themeContent).toHaveAttribute('data-slot', 'dropdown-menu-content');
  await expect(themeContent.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('main.lab-shell')).toHaveClass(/lab-shell--dark/);
  await expect(themeContent).toBeHidden();
  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await expect(themeContent).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(themeContent).toBeHidden();

  await webPartTrigger.click();
  const webPartContent = page.locator('[data-slot="select-content"]');
  await expect(webPartContent).toHaveAttribute('id', /spfx-ui-/);
  await expect(webPartContent).toHaveAttribute('data-slot', 'select-content');
  await expect(webPartContent.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
});

test('navigates to the first-party UI Library without exposing app, export, or CDN behavior', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  await page.goto('/');

  const webPartSelector = page.getByRole('combobox', { name: 'Select web part' });
  await webPartSelector.click();
  await expect(page.getByRole('listbox').getByRole('option', { name: /^UI Library/u })).toHaveCount(0);
  await page.getByRole('listbox').press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();

  await page.getByRole('button', { name: 'Open UI Library' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe('ui-library');
  const catalog = page.getByRole('region', { name: 'UI Library' });
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('heading', { name: 'UI Library' })).toBeVisible();
  const gallery = page.locator('[data-ui-profile-catalog="base-nova"]');
  await expect(gallery).toBeVisible();
  await expect(gallery).toHaveAttribute('aria-label', 'Shared UI component catalog');
  await expect(gallery).toHaveAttribute('data-catalog-mode', 'single');
  const galleryItems = gallery.locator(':scope > [data-catalog-component]');
  await expect(galleryItems).toHaveCount(1);
  await expect(galleryItems).toHaveAttribute('data-catalog-component', 'accordion');
  const componentDocs = page.getByRole('article', { name: 'Accordion' });
  await expect(componentDocs).toBeVisible();
  await expect(componentDocs).toContainText('Organizes related content into disclosure sections');
  await expect(componentDocs.getByRole('heading', { name: 'Examples' })).toBeVisible();
  await expect(componentDocs.getByRole('heading', { name: 'Usage' })).toBeVisible();
  await expect(componentDocs.getByLabel('Public import for Accordion')).toContainText(
    "import { Accordion } from '@spfx-kit/ui-profile/accordion';"
  );
  await expect(componentDocs.getByRole('heading', { name: /Installation/iu })).toHaveCount(0);
  await expect(componentDocs.getByText(/React Aria|Radix/iu)).toHaveCount(0);
  const componentNavigation = page.getByRole('navigation', { name: 'UI Library components' });
  const componentNavigationList = componentNavigation.locator('.ui-library-navigation__list');
  const componentNavigationLinks = componentNavigation.locator('[data-ui-library-navigation-link]');
  await expect(componentNavigation).toBeVisible();
  await expect(componentNavigationLinks).toHaveCount(57);
  await expect(componentNavigationLinks.first()).toHaveText('Accordion');
  await expect(componentNavigationLinks.last()).toHaveText('Tooltip');
  await expect(componentNavigation).toHaveCSS('border-top-width', '0px');
  await expect(componentNavigation).toHaveCSS('padding-left', '0px');
  await expect(componentNavigation).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(componentNavigation).toHaveCSS('box-shadow', 'none');
  const [workspaceBox, componentNavigationBox, galleryBox, componentDocsBox] = await Promise.all([
    page.locator('.ui-library-workspace').boundingBox(),
    componentNavigation.boundingBox(),
    gallery.boundingBox(),
    componentDocs.boundingBox()
  ]);
  expect(workspaceBox).not.toBeNull();
  expect(componentNavigationBox).not.toBeNull();
  expect(galleryBox).not.toBeNull();
  expect(componentDocsBox).not.toBeNull();
  expect(componentNavigationBox!.x + componentNavigationBox!.width).toBeLessThanOrEqual(galleryBox!.x);
  expect(componentDocsBox!.width).toBeLessThanOrEqual(760);
  expect(workspaceBox!.width).toBeGreaterThan(componentDocsBox!.width + componentNavigationBox!.width);

  const accordionExamples = componentDocs.locator('[data-catalog-documentation-examples="accordion"] [data-catalog-example]');
  await expect(accordionExamples).toHaveCount(7);
  await expect(componentDocs.getByRole('heading', { name: 'Composition' })).toBeVisible();
  await expect(componentDocs.getByRole('heading', { name: 'API reference' })).toBeVisible();
  await expect(componentDocs.locator('.ui-library-docs__api')).toHaveCount(4);
  await expect(componentDocs.locator('[data-catalog-documentation-examples="accordion"] [data-slot="tabs-list"]')).toHaveCount(7);
  const accordionOutline = page.getByRole('navigation', { name: 'On this page' });
  await expect(accordionOutline.getByRole('link', { name: 'Multiple', exact: true })).toHaveAttribute(
    'href',
    '#ui-library-accordion-example-multiple'
  );
  await expect(accordionOutline.getByRole('link', { name: 'AccordionContent', exact: true })).toHaveAttribute(
    'href',
    '#ui-library-accordion-api-accordion-content'
  );
  const primaryAccordion = accordionExamples.filter({ has: page.getByRole('heading', { name: 'Primary demo' }) });
  await expect(primaryAccordion.getByText('Standard delivery takes three to five business days')).toBeVisible();
  await primaryAccordion.getByRole('tab', { name: 'Code' }).click();
  await expect(primaryAccordion.getByLabel('Primary demo code for Accordion')).toContainText(
    "from '@spfx-kit/ui-profile/accordion'"
  );
  await primaryAccordion.getByRole('tab', { name: 'Preview' }).click();
  const disabledAccordion = accordionExamples.filter({ has: page.getByRole('heading', { name: 'Disabled item' }) });
  await expect(disabledAccordion.getByRole('button', { name: 'Premium feature details' })).toBeDisabled();

  const centerScroll = page.locator('.ui-library-catalog-shell');
  const initialIndependentScroll = await Promise.all([
    centerScroll.evaluate((element) => element.scrollTop),
    componentNavigationList.evaluate((element) => element.scrollTop),
    componentNavigation.evaluate((element) => element.getBoundingClientRect().top)
  ]);
  await centerScroll.evaluate((element) => {
    element.scrollTop = Math.min(900, element.scrollHeight - element.clientHeight);
  });
  await expect.poll(() => centerScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const centerScrollTop = await centerScroll.evaluate((element) => element.scrollTop);
  expect(await componentNavigationList.evaluate((element) => element.scrollTop)).toBe(initialIndependentScroll[1]);
  expect(await componentNavigation.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(
    initialIndependentScroll[2],
    0
  );
  await componentNavigationList.evaluate((element) => {
    element.scrollTop = Math.min(320, element.scrollHeight - element.clientHeight);
  });
  await expect.poll(() => componentNavigationList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await centerScroll.evaluate((element) => element.scrollTop)).toBe(centerScrollTop);
  await centerScroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  await componentNavigationList.evaluate((element) => {
    element.scrollTop = 0;
  });

  const accordionNavigationLink = componentNavigation.getByRole('link', { name: 'Accordion', exact: true });
  const buttonNavigationLink = componentNavigation.getByRole('link', { name: 'Button', exact: true });
  const buttonGroupNavigationLink = componentNavigation.getByRole('link', { name: 'Button Group', exact: true });
  await expect(accordionNavigationLink).toHaveAttribute('aria-current', 'location');
  await buttonNavigationLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('button');
  await expect(buttonNavigationLink).toHaveAttribute('aria-current', 'location');
  await expect(galleryItems).toHaveCount(1);
  await expect(gallery.locator('[data-catalog-component="button"]')).toHaveAttribute('data-catalog-active', 'true');
  await expect(page.getByRole('article', { name: 'Button' })).toContainText(
    "import { Button } from '@spfx-kit/ui-profile/button';"
  );
  await buttonNavigationLink.press('ArrowRight');
  await expect(buttonGroupNavigationLink).toBeFocused();
  await buttonGroupNavigationLink.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('button-group');
  await expect(buttonGroupNavigationLink).toHaveAttribute('aria-current', 'location');
  await expect(gallery.locator('[data-catalog-component="button-group"]')).toHaveAttribute('data-catalog-active', 'true');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('button');
  await expect(buttonNavigationLink).toHaveAttribute('aria-current', 'location');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBeNull();
  await expect(accordionNavigationLink).toHaveAttribute('aria-current', 'location');
  await expect(galleryItems).toHaveAttribute('data-catalog-component', 'accordion');

  const breadcrumbNavigationLink = componentNavigation.getByRole('link', { name: 'Breadcrumb', exact: true });
  await breadcrumbNavigationLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('breadcrumb');
  const breadcrumbDocs = page.getByRole('article', { name: 'Breadcrumb' });
  await expect(breadcrumbDocs.getByRole('heading', { name: 'Examples' })).toBeVisible();
  const breadcrumbLiveExamples = breadcrumbDocs.getByRole('region', { name: 'Examples' });
  await expect(gallery.locator('[data-catalog-documentation-examples="breadcrumb"] [data-catalog-example]')).toHaveCount(7);
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Custom separator' })).toBeVisible();
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Dropdown' })).toBeVisible();
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Collapsed' })).toBeVisible();
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Custom link' })).toBeVisible();
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Responsive hierarchy' })).toBeVisible();
  await expect(breadcrumbLiveExamples.getByRole('heading', { name: 'Right-to-left' })).toBeVisible();
  await expect(breadcrumbDocs.getByRole('heading', { name: 'Composition' })).toBeVisible();
  await expect(breadcrumbDocs.getByRole('heading', { name: 'API reference' })).toBeVisible();
  const breadcrumbOutline = page.getByRole('navigation', { name: 'On this page' });
  await expect(breadcrumbOutline).toBeVisible();
  await expect(breadcrumbOutline.getByRole('link', { name: 'Dropdown', exact: true })).toHaveAttribute(
    'href',
    '#ui-library-breadcrumb-example-dropdown'
  );
  await expect(breadcrumbOutline.getByRole('link', { name: 'BreadcrumbLink', exact: true })).toHaveAttribute(
    'href',
    '#ui-library-breadcrumb-api-breadcrumb-link'
  );
  const [breadcrumbArticleBox, breadcrumbOutlineBox] = await Promise.all([
    breadcrumbDocs.boundingBox(),
    breadcrumbOutline.boundingBox()
  ]);
  expect(breadcrumbArticleBox).not.toBeNull();
  expect(breadcrumbOutlineBox).not.toBeNull();
  expect(breadcrumbArticleBox!.x + breadcrumbArticleBox!.width).toBeLessThanOrEqual(breadcrumbOutlineBox!.x);
  const dropdownExample = gallery.locator('[data-catalog-example="dropdown"]');
  await dropdownExample.getByRole('tab', { name: 'Code' }).click();
  const dropdownCode = dropdownExample.getByLabel('Dropdown code for Breadcrumb');
  await expect(dropdownCode).toBeVisible();
  await expect(dropdownCode).toContainText("from '@spfx-kit/ui-profile/dropdown-menu'");
  await expect(dropdownCode.locator('.ui-library-docs__syntax-token')).not.toHaveCount(0);
  await dropdownExample.getByRole('tab', { name: 'Preview' }).click();
  await expect(breadcrumbDocs.getByRole('heading', { name: /Installation/iu })).toHaveCount(0);
  await gallery.getByRole('button', { name: 'Open intermediate pages' }).click();
  const breadcrumbDropdown = page.getByRole('menu');
  await expect(breadcrumbDropdown).toBeVisible();
  await expect(breadcrumbDropdown.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(breadcrumbDropdown).toBeHidden();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBeNull();
  await expect(accordionNavigationLink).toHaveAttribute('aria-current', 'location');

  const previewFrame = page.locator('.ui-library-docs__preview-frame');
  await expect(previewFrame).toHaveCSS('box-shadow', 'none');
  await expect(page.getByRole('button', { name: 'Return to Lab workspace' })).toBeVisible();
  await expect(catalog.getByRole('button', { name: 'Return to Lab', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'SharePoint breakpoint' })).toBeVisible();
  const detailsPanel = page.getByRole('complementary', { name: 'UI Library details' });
  await expect(detailsPanel).toBeVisible();
  await expect(detailsPanel.getByText('Not an SPFx app', { exact: true })).toHaveCount(0);
  await expect(detailsPanel.getByText(/^This first-party workspace is delivered with the Lab/u)).toHaveCount(0);
  await expect(detailsPanel).toContainText('On This Page');
  await expect(detailsPanel.getByRole('navigation', { name: 'On this page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open app menu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export package' })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'App package mode' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Local CDN bucket' })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Lab display mode' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Options panel' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Web part preview area' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Theme: Light' })).toBeVisible();

  for (const breakpoint of ['2/3', '1/2', '1/3', 'Mobile', '1-col']) {
    await page.getByRole('tab', { name: breakpoint }).click();
    await expect(componentDocs).toBeVisible();
    await expect(galleryItems).toHaveCount(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  expect(pageErrors.map((error) => error.stack)).toEqual([]);
  const narrowCatalogState = {
    catalogCount: await page.locator('[data-catalog-component]').count(),
    consoleErrors
  };
  expect(narrowCatalogState).toEqual({ catalogCount: 1, consoleErrors: [] });
  await expect(previewFrame).toHaveCSS('box-shadow', 'none');
  await expect(componentNavigation).toBeVisible();
  await expect(componentNavigationLinks).toHaveCount(57);
  await expect(componentNavigationList).toHaveCSS('flex-direction', 'row');
  await expect.poll(() => componentNavigationList.evaluate((list) => list.scrollWidth > list.clientWidth)).toBe(true);
  const breadcrumbNarrowLink = componentNavigation.getByRole('link', { name: 'Breadcrumb', exact: true });
  await breadcrumbNarrowLink.click();
  const narrowBreadcrumbDocs = page.getByRole('article', { name: 'Breadcrumb' });
  const narrowDropdownExample = narrowBreadcrumbDocs.locator('[data-catalog-example="dropdown"]');
  await narrowDropdownExample.getByRole('tab', { name: 'Code' }).click();
  await expect(narrowDropdownExample.getByLabel('Dropdown code for Breadcrumb')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
  await expect
    .poll(() => page.locator('.ui-library-workspace').evaluate((workspace) => workspace.scrollWidth <= workspace.clientWidth))
    .toBe(true);
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBeNull();
  const tooltipNavigationLink = componentNavigation.getByRole('link', { name: 'Tooltip', exact: true });
  await tooltipNavigationLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('tooltip');
  await expect(tooltipNavigationLink).toHaveAttribute('aria-current', 'location');
  await expect(gallery.locator('[data-catalog-component="tooltip"]')).toHaveAttribute('data-catalog-active', 'true');
  await expect(galleryItems).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Tooltip' })).toBeVisible();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBeNull();
  await expect(page.getByRole('complementary', { name: 'UI Library details' })).toBeHidden();
  await expect(gallery.locator('[data-catalog-component="accordion"]')).toBeVisible();

  const dialogNavigationLink = componentNavigation.getByRole('link', { name: 'Dialog', exact: true });
  await dialogNavigationLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('dialog');
  await gallery.locator('[data-catalog-component="dialog"]').getByRole('button', { name: 'Open dialog' }).click();
  const catalogDialog = page.getByRole('dialog', { name: 'Catalog dialog' });
  await expect(catalogDialog).toBeVisible();
  await expect(catalogDialog.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await catalogDialog.press('Escape');
  await expect(catalogDialog).toBeHidden();
  await expect(galleryItems).toHaveCount(1);
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBeNull();

  for (const shortcut of ['Control+e', 'Control+o', 'Control+n']) {
    await page.keyboard.press(shortcut);
  }
  await expect(page.getByRole('combobox', { name: 'Select app to export' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close add SPFx app drawer' })).toHaveCount(0);

  await page.goBack();
  const restoredPreview = page.getByRole('region', { name: 'Web part preview area' });
  await expect(restoredPreview).toBeVisible();
  await expect(restoredPreview.getByRole('heading', { name: 'Hello Card' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select web part' })).toContainText('Hello Card');

  await page.goForward();
  await expect(page.getByRole('region', { name: 'UI Library' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe('ui-library');

  await page.getByRole('button', { name: 'Return to Lab workspace' }).click();
  await expect(page.getByRole('region', { name: 'Web part preview area' })).toBeVisible();
  await expect(page.locator('.preview-toolbar__primary')).toHaveCSS('overflow-x', 'auto');
  await page.getByRole('button', { name: 'Export package' }).click();
  expect(pageErrors.map((error) => error.stack)).toEqual([]);
  const exportSelector = page.getByRole('combobox', { name: 'Select app to export' });
  await exportSelector.click();
  const exportOptions = page.getByRole('listbox');
  await expect(exportOptions.getByRole('option', { name: 'Hello Card' })).toBeVisible();
  await expect(exportOptions.getByRole('option', { name: /^UI Library$/u })).toHaveCount(0);
});

test('documents the complete Button, Button Group, and Spinner action family in the owned Lab host', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/?workspace=ui-library&component=button');
  const catalog = page.locator('[data-ui-profile-catalog="base-nova"]');
  const buttonDocs = page.getByRole('article', { name: 'Button' });
  await expect(buttonDocs).toBeVisible();
  await expect(catalog.locator('[data-catalog-documentation-examples="button"] [data-catalog-example]')).toHaveCount(14);
  await expect(buttonDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(14);
  const defaultButtonExample = buttonDocs.locator('[data-catalog-example="default"]');
  await defaultButtonExample.getByRole('tab', { name: 'Code' }).click();
  await expect(defaultButtonExample.getByLabel('Default code for Button')).toBeVisible();
  await defaultButtonExample.getByRole('tab', { name: 'Preview' }).click();
  await expect(buttonDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(1);
  await expect(buttonDocs.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '#catalog-login');
  await expect(buttonDocs.getByRole('button', { name: 'Generating' }).locator('svg')).toHaveAttribute('aria-hidden', 'true');

  const componentNavigation = page.getByRole('navigation', { name: 'UI Library components' });
  await componentNavigation.getByRole('link', { name: 'Button Group', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('button-group');
  const buttonGroupDocs = page.getByRole('article', { name: 'Button Group' });
  await expect(catalog.locator('[data-catalog-documentation-examples="button-group"] [data-catalog-example]')).toHaveCount(12);
  await expect(buttonGroupDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(12);
  await expect(buttonGroupDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(3);

  await buttonGroupDocs.getByRole('button', { name: 'More follow options' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await menu.press('Escape');

  await buttonGroupDocs.getByRole('combobox', { name: 'Currency' }).click();
  const selectContent = page.locator('[data-slot="select-content"]');
  await expect(selectContent).toBeVisible();
  await expect(selectContent.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await page.getByRole('option', { name: 'EUR' }).click();

  await buttonGroupDocs.getByRole('button', { name: 'Open assistant options' }).click();
  const popoverContent = page.locator('[data-slot="popover-content"]');
  await expect(popoverContent).toBeVisible();
  await expect(popoverContent.locator('xpath=ancestor::*[@data-spfx-ui-portal-host]')).toHaveCount(1);
  await buttonGroupDocs.getByRole('button', { name: 'Open assistant options' }).click();

  await componentNavigation.getByRole('link', { name: 'Spinner', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('spinner');
  const spinnerDocs = page.getByRole('article', { name: 'Spinner' });
  await expect(catalog.locator('[data-catalog-documentation-examples="spinner"] [data-catalog-example]')).toHaveCount(7);
  await expect(spinnerDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(7);
  await expect(spinnerDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(1);

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('button-group');
  await expect(page.getByRole('article', { name: 'Button Group' })).toBeVisible();
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('spinner');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('article', { name: 'Spinner' })).toBeVisible();
  await expect(componentNavigation.locator('[data-ui-library-navigation-link]')).toHaveCount(57);
  await expect(page.getByRole('button', { name: 'Open app menu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export package' })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'App package mode' })).toHaveCount(0);
  expect(pageErrors.map((error) => error.stack)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('documents the complete Alert, Badge, and Progress feedback family in the owned Lab host', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/?workspace=ui-library&component=alert');
  const catalog = page.locator('[data-ui-profile-catalog="base-nova"]');
  const componentNavigation = page.getByRole('navigation', { name: 'UI Library components' });
  const alertDocs = page.getByRole('article', { name: 'Alert' });
  await expect(alertDocs).toBeVisible();
  await expect(catalog.locator('[data-catalog-documentation-examples="alert"] [data-catalog-example]')).toHaveCount(4);
  await expect(alertDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(4);
  await expect(alertDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(4);
  await expect(alertDocs.getByRole('alert')).toHaveCount(4);
  await expect(alertDocs.getByRole('button', { name: 'Enable' })).toBeVisible();

  await componentNavigation.getByRole('link', { name: 'Badge', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('badge');
  const badgeDocs = page.getByRole('article', { name: 'Badge' });
  await expect(catalog.locator('[data-catalog-documentation-examples="badge"] [data-catalog-example]')).toHaveCount(5);
  await expect(badgeDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(5);
  await expect(badgeDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(1);
  await expect(badgeDocs.getByRole('link', { name: 'Open release' })).toHaveAttribute('href', '#catalog-release');
  await expect(badgeDocs.getByText('Generating').locator('svg')).toHaveAttribute('aria-hidden', 'true');

  await componentNavigation.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('progress');
  const progressDocs = page.getByRole('article', { name: 'Progress' });
  await expect(catalog.locator('[data-catalog-documentation-examples="progress"] [data-catalog-example]')).toHaveCount(4);
  await expect(progressDocs.getByRole('tablist', { name: /example view$/u })).toHaveCount(4);
  await expect(progressDocs.getByRole('region', { name: 'API reference' }).locator('table')).toHaveCount(5);
  await expect(progressDocs.getByRole('progressbar')).toHaveCount(4);

  const controlledExample = progressDocs.locator('[data-catalog-example="controlled"]');
  const controlledProgress = controlledExample.getByRole('progressbar');
  const controlledSlider = controlledExample.getByRole('group', { name: 'Set export progress' }).getByRole('slider');
  await expect(controlledProgress).toHaveAttribute('aria-valuenow', '42');
  await controlledSlider.focus();
  await controlledSlider.press('ArrowRight');
  await expect(controlledProgress).toHaveAttribute('aria-valuenow', '43');

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('badge');
  await expect(page.getByRole('article', { name: 'Badge' })).toBeVisible();
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get('component')).toBe('progress');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('article', { name: 'Progress' })).toBeVisible();
  await expect(componentNavigation.locator('[data-ui-library-navigation-link]')).toHaveCount(57);
  await expect(page.getByRole('button', { name: 'Open app menu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export package' })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'App package mode' })).toHaveCount(0);
  expect(pageErrors.map((error) => error.stack)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('orders the segmented package mode and bucket controls after export while keeping display mode independent', async ({
  page
}) => {
  await page.goto('/');

  const exportButton = page.getByRole('button', { name: 'Export package' });
  const packageModes = page.getByRole('tablist', { name: 'App package mode' });
  const bucketButton = page.getByRole('button', { name: 'Local CDN bucket' });
  const displayModes = page.getByRole('tablist', { name: 'Lab display mode' });
  const workspaceButton = page.getByRole('button', { name: 'Open UI Library' });
  const [exportBox, packageBox, bucketBox, displayModesBox, workspaceButtonBox] = await Promise.all([
    exportButton.boundingBox(),
    packageModes.boundingBox(),
    bucketButton.boundingBox(),
    displayModes.boundingBox(),
    workspaceButton.boundingBox()
  ]);
  expect(exportBox).not.toBeNull();
  expect(packageBox).not.toBeNull();
  expect(bucketBox).not.toBeNull();
  expect(displayModesBox).not.toBeNull();
  expect(workspaceButtonBox).not.toBeNull();
  expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(packageBox!.x);
  expect(packageBox!.x + packageBox!.width).toBeLessThanOrEqual(bucketBox!.x);
  expect(displayModesBox!.x + displayModesBox!.width).toBeLessThanOrEqual(workspaceButtonBox!.x);
  await expect(packageModes).toHaveClass(/lab-mode-tabs/);
  await expect(displayModes).toHaveClass(/lab-mode-tabs/);

  await page.setViewportSize({ width: 390, height: 844 });
  const [narrowDisplayModesBox, narrowWorkspaceButtonBox] = await Promise.all([
    displayModes.boundingBox(),
    workspaceButton.boundingBox()
  ]);
  expect(narrowDisplayModesBox).not.toBeNull();
  expect(narrowWorkspaceButtonBox).not.toBeNull();
  expect(narrowDisplayModesBox!.x + narrowDisplayModesBox!.width).toBeLessThanOrEqual(narrowWorkspaceButtonBox!.x);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('tab', { name: 'CDN', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  const standalonePackageTab = page.getByRole('tab', { name: 'Standalone', exact: true });
  await expect(standalonePackageTab).toHaveAttribute('aria-selected', 'true');
  await standalonePackageTab.press('ArrowRight');
  const cdnPackageTab = page.getByRole('tab', { name: 'CDN', exact: true });
  await expect(cdnPackageTab).toBeFocused();
  await cdnPackageTab.press('Space');
  await expect(cdnPackageTab).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('region', { name: 'Web part preview area' }).getByRole('heading', { name: 'Hello Card' })
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Standalone', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Standalone', exact: true })).toHaveAttribute('aria-selected', 'true');

  await bucketButton.click();
  await expect(page.getByRole('dialog', { name: 'Local CDN bucket' })).toBeVisible();
});

test('opens a distinct accessible Local CDN inventory table with a truthful empty and reserved state', async ({ page }) => {
  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        origin: syntheticMockCdnOrigin,
        publicOrigin: syntheticMockCdnPublicOrigin,
        namespaces: {
          apps: { status: 'supported', releases: [] },
          shared: {
            status: 'reserved-unsupported',
            releases: [],
            message: 'Shared resource publication awaits a canonical verifier.'
          }
        },
        selectedPointers: [],
        publishSources: []
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Local CDN bucket' }).click();

  const dialog = page.getByRole('dialog', { name: 'Local CDN bucket' });
  await expect(dialog).toBeVisible();
  const inventory = dialog.getByRole('region', { name: 'Local CDN bucket inventory' });
  const desktopViewport = page.viewportSize();
  expect(desktopViewport).not.toBeNull();
  await expect.poll(async () => (await dialog.boundingBox())?.width || 0).toBeGreaterThanOrEqual(desktopViewport!.width - 32);
  await expect.poll(async () => (await dialog.boundingBox())?.height || 0).toBeGreaterThanOrEqual(desktopViewport!.height - 32);
  expect((await inventory.boundingBox())?.height).toBeGreaterThan(220);
  await expect(dialog.getByRole('button', { name: 'Refresh Local CDN bucket inventory' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close Local CDN bucket' })).toBeVisible();
  await expect(
    inventory.getByRole('table', { name: 'Immutable app releases, selected pointers, packages, and assets' })
  ).toBeVisible();
  await expect(inventory.getByRole('columnheader')).toHaveText([
    'Resource / path',
    'Kind / role',
    'Version / release',
    'Integrity / delivery',
    'Size',
    'Origin'
  ]);
  await expect(inventory).toContainText('The local CDN bucket is empty.');
  await expect(inventory).toContainText('Shared resources — reserved namespace');
  await expect(inventory).toContainText('Shared resource publication awaits a canonical verifier.');
  await expect(dialog).toContainText('cannot browse arbitrary files or overwrite a release');
  await expect(inventory.getByRole('button')).toHaveCount(0);

  const desktopAccessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .exclude('[data-tabster-dummy]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(desktopAccessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 480, height: 720 });
  const narrowDialogBox = await dialog.boundingBox();
  expect(narrowDialogBox).not.toBeNull();
  expect(narrowDialogBox!.width).toBeGreaterThanOrEqual(479);
  expect(narrowDialogBox!.height).toBeGreaterThanOrEqual(719);
  expect((await inventory.boundingBox())?.height).toBeGreaterThan(100);
  await expect(dialog.getByRole('combobox', { name: 'Approved staged release' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Release used by Lab CDN mode' })).toBeVisible();
  await expect(dialog.getByText('Bucket inventory is the local control plane')).toHaveCount(0);
  expect(
    await inventory.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))
  ).toMatchObject({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) });
  expect(await inventory.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .exclude('[data-tabster-dummy]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 720, height: 320 });
  await expect.poll(() => dialog.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  const shortViewportScroll = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(shortViewportScroll.scrollHeight).toBeGreaterThan(shortViewportScroll.clientHeight);
  await dialog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(dialog.getByRole('button', { name: 'Close Local CDN bucket' })).toBeVisible();
});

test('keeps controls fixed while a populated bucket inventory scrolls independently', async ({ page }) => {
  const releases = Array.from({ length: 12 }, (_value, index) => `1.2.3-workspace-${index + 1}`);
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  await page.route('**/api/spfx-apps/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/source')) {
      expect(url.searchParams.get('appId')).toBe('hello-card-spfx');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          appId: 'hello-card-spfx',
          repositoryUrl: 'https://github.com/acme/hello-card-spfx'
        })
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: managedAppFixtures('latest') }) });
  });
  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(bucketInventory(releases[0], releases)) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Local CDN bucket' }).click();

  const dialog = page.getByRole('dialog', { name: 'Local CDN bucket' });
  const controls = dialog.locator('.local-cdn-admin__controls');
  const inventory = dialog.getByRole('region', { name: 'Local CDN bucket inventory' });
  await expect(controls).toBeVisible();
  await expect(inventory).toBeVisible();
  const activeManifestUrl = `${syntheticMockCdnPublicOrigin}/apps/hello-card-spfx/versions/${releases[0]}/deployment-manifest.json`;
  const sourceRepositoryLink = dialog.getByRole('link', { name: 'Open GitHub source repository for hello-card-spfx' });
  await expect(sourceRepositoryLink).toHaveText('https://github.com/acme/hello-card-spfx');
  await expect(sourceRepositoryLink).toHaveAttribute('href', 'https://github.com/acme/hello-card-spfx');
  const activeCdnLink = dialog.getByRole('link', {
    name: 'Open active local CDN runtime manifest for hello-card-spfx'
  });
  await expect(activeCdnLink).toHaveText(activeManifestUrl);
  await expect(activeCdnLink).toHaveAttribute('href', activeManifestUrl);
  await expect(activeCdnLink).toHaveAttribute('target', '_blank');
  await expect(activeCdnLink).toHaveAttribute('rel', 'noopener noreferrer');
  const activeCdnPopupPromise = page.waitForEvent('popup');
  await activeCdnLink.click();
  const activeCdnPopup = await activeCdnPopupPromise;
  expect(activeCdnPopup).toBeTruthy();
  await activeCdnPopup.close();
  const sourceRelease = inventory.locator(`[data-release-id="${releases[0]}"]`);
  await expect(sourceRelease).toContainText(
    'Source: GitHub staging (declared private) · acme-private/staging-assets@0123456789ab…'
  );
  await expect(sourceRelease).toContainText('releases/hello-card · source closure verified at publish');
  await expect(sourceRelease.getByRole('link')).toHaveCount(0);
  await expect.poll(() => inventory.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

  const scroll = await inventory.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
  });
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  expect(scroll.scrollTop).toBeGreaterThan(0);
  await expect(controls).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close Local CDN bucket' })).toBeVisible();
});

test('distinguishes a legacy recorded release from anchored and deeply verified releases', async ({ page }) => {
  const selectedReleaseId = '1.2.3-selected.1';
  const legacyReleaseId = '1.2.3-legacy.1';
  const inventory = bucketInventory(selectedReleaseId, [selectedReleaseId, legacyReleaseId]);
  const legacy = inventory.namespaces.apps.releases[1];
  legacy.status = 'recorded';
  legacy.package.status = 'recorded';
  legacy.assets[0].status = 'recorded';
  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(inventory) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Local CDN bucket' }).click();

  const legacyRelease = page.getByRole('dialog', { name: 'Local CDN bucket' }).locator(`[data-release-id="${legacyReleaseId}"]`);
  await expect(legacyRelease).toContainText('Legacy manifest recorded · verify on selection');
  await expect(legacyRelease.locator('xpath=following-sibling::tr[1]')).toContainText('Package metadata recorded');
  await expect(legacyRelease.locator('xpath=following-sibling::tr[2]')).toContainText('Legacy hash and size recorded');
});

test('identifies the exact release behind an invalid selected pointer', async ({ page }) => {
  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        origin: syntheticMockCdnOrigin,
        publicOrigin: syntheticMockCdnPublicOrigin,
        namespaces: {
          apps: { status: 'supported', releases: [] },
          shared: {
            status: 'reserved-unsupported',
            releases: [],
            message: 'Shared resource publication awaits a canonical verifier.'
          }
        },
        selectedPointers: [{ appId: 'hello-card-spfx', releaseId: 'missing-release.1', status: 'invalid' }],
        publishSources: []
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Local CDN bucket' }).click();

  const pointer = page.getByRole('dialog', { name: 'Local CDN bucket' }).locator('[data-pointer-app="hello-card-spfx"]');
  await expect(pointer).toContainText('missing-release.1');
  await expect(pointer).toContainText('Invalid pointer — delivery blocked');
});

test('explicit bucket selection reloads the active CDN descriptor without standalone fallback', async ({ page }) => {
  let selectedReleaseId = '1.2.3-admin-a';
  let descriptorRequests = 0;
  const selectedBodies: unknown[] = [];
  const releases = ['1.2.3-admin-a', '1.2.3-admin-b'];

  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(bucketInventory(selectedReleaseId, releases)) });
  });
  await page.route('**/api/local-cdn/select', async (route) => {
    const body = route.request().postDataJSON();
    selectedBodies.push(body);
    selectedReleaseId = body.releaseId;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        appId: 'hello-card-spfx',
        releaseId: selectedReleaseId,
        manifestSha256: 'a'.repeat(64),
        status: 'selected-and-verified'
      })
    });
  });
  await page.route('**/api/lab-packages/cdn?*', async (route) => {
    descriptorRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(cdnDescriptor(selectedReleaseId))
    });
  });
  await page.route(`${syntheticMockCdnOrigin}/**`, async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `define('hello-card-admin', [], function () { return {}; });`
    });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'CDN', exact: true }).click();
  const frame = page.locator('.preview-frame');
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-admin-a');

  await page.getByRole('button', { name: 'Local CDN bucket' }).click();
  const dialog = page.getByRole('dialog', { name: 'Local CDN bucket' });
  await dialog.getByRole('combobox', { name: 'Release used by Lab CDN mode' }).click();
  await page.getByRole('option', { name: /hello-card-spfx · Release B/ }).click();
  await dialog.getByRole('button', { name: 'Select for Lab' }).click();

  await expect(dialog.getByRole('status')).toContainText('Selected release updated');
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-admin-b');
  await dialog.getByRole('button', { name: 'Close Local CDN bucket' }).click();
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  expect(selectedBodies).toEqual([{ appId: 'hello-card-spfx', releaseId: '1.2.3-admin-b' }]);
  expect(descriptorRequests).toBeGreaterThanOrEqual(2);
});

test('checks the selected staged scripts without invoking the package or rendering the standalone adapter', async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  const releaseId = '1.2.3-test.abc123';
  const namespacePath = `apps/hello-card-spfx/versions/${releaseId}/`;
  const releaseBaseUrl = `${syntheticMockCdnOrigin}/${namespacePath}`;
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
          releaseId,
          generatedAt: '2026-08-04T12:00:00.000Z',
          cdnBasePath: releaseBaseUrl,
          delivery: {
            kind: 'local-mock-cdn',
            origin: syntheticMockCdnOrigin,
            bucketBaseUrl: `${syntheticMockCdnOrigin}/`,
            namespaceKind: 'app-release',
            namespacePath,
            releaseBaseUrl,
            releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
            status: 'published-and-verified'
          },
          packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
          assets: [
            {
              role: 'dependency',
              moduleId: 'WebPartStrings',
              assetPath: 'strings-panel-proof.js',
              assetUrl: `${releaseBaseUrl}strings-panel-proof.js`,
              bytes: 97,
              sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              stageStatus: 'allowed-and-verified'
            },
            {
              role: 'entry',
              moduleId: 'hello-card',
              assetPath: 'hello-card-web-part.js',
              assetUrl: `${releaseBaseUrl}hello-card-web-part.js`,
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
    await route.abort();
  });
  await page.route(`${syntheticMockCdnOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    assetRequests.push(url.href);
    if (url.pathname.endsWith('/strings-panel-proof.js')) {
      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `define('WebPartStrings', [], function () { return {}; });`
      });
      return;
    }
    if (url.pathname.endsWith('/hello-card-web-part.js')) {
      await entryAssetGate;
      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
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
  await page.getByRole('tab', { name: 'CDN', exact: true }).click();

  await expect(frame.locator('[data-cdn-smoke-check="loading"]')).toContainText('Checking mock-CDN delivery');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  await expect(packageResources).toContainText('1.2.3-test.abc123');
  await expect(packageResources).toContainText(syntheticMockCdnOrigin);
  await expect(packageResources).toContainText(namespacePath);
  await expect(packageResources).toContainText('Hash and size verified');
  await expect(packageResources).toContainText('Published and verified');
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
  await expectPlainTextResourceStatuses(packageResources);
  releaseEntryAsset();
  await expect(packageResources).toHaveAttribute('data-package-resource-state', 'ready');
  await expect(page.getByText('Local mock-CDN smoke check passed', { exact: true })).toHaveCount(0);
  await expect(page.locator('.preview-canvas')).toBeHidden();
  await expect(packageResources).toHaveClass(/package-dependency-panel--workspace/);
  await expect(packageResources.locator('[role="status"].visually-hidden')).toContainText(
    '2 of 2 staged scripts delivered by the local mock CDN.'
  );
  await expect(frame).toHaveAttribute('data-package-mode', 'cdn');
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-test.abc123');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  await expect(packageResources.locator('[data-asset-path="hello-card-web-part.js"]')).toHaveAttribute(
    'data-asset-status',
    'loaded'
  );
  const deliveredRow = packageResources.locator('[data-asset-path="hello-card-web-part.js"]');
  const deliveredStatus = deliveredRow.locator('.package-resource-status--loaded');
  const deliveredPath = deliveredRow.locator('.package-resource-table__path');
  await expect(deliveredStatus).toContainText('Delivered — top-level code executed');
  await expectPlainTextResourceStatuses(packageResources);
  await expect(deliveredRow).not.toContainText('SHA-256');
  await expect(deliveredRow).not.toContainText('a'.repeat(64));
  await expect
    .poll(() => deliveredPath.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(11);
  await expect(packageResources).toContainText('2/2 delivered');
  const stagedResources = packageResources.locator('.package-resource-group--primary .package-resource-table-frame');
  await expect(stagedResources).toBeVisible();
  const editLayout = await Promise.all([packageResources.boundingBox(), stagedResources.boundingBox()]);
  expect(editLayout[0]?.height).toBeGreaterThan(500);
  expect(editLayout[1]?.height).toBeGreaterThan(180);
  await expect.poll(() => stagedResources.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  await expect
    .poll(() =>
      packageResources.locator('.package-dependency-panel__body').evaluate((element) => getComputedStyle(element).overflowY)
    )
    .toBe('auto');
  expect(assetRequests).toHaveLength(2);
  expect(assetRequests.every((requestUrl) => new URL(requestUrl).origin === syntheticMockCdnOrigin)).toBe(true);

  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(frame).toHaveAttribute('data-package-artifact', '1.2.3-test.abc123');
  await expect(packageResources).toContainText('2/2 delivered');
  await expect(page.locator('.preview-canvas')).toBeHidden();

  await page.setViewportSize({ width: 520, height: 720 });
  await expect(packageResources).toBeVisible();
  await expectPlainTextResourceStatuses(packageResources);
  const previewToolbar = page.locator('.lab-toolbar--preview');
  const optionsPanel = page.getByRole('complementary', { name: 'Options panel' });
  const [toolbarBox, optionsBox] = await Promise.all([previewToolbar.boundingBox(), optionsPanel.boundingBox()]);
  expect(toolbarBox).not.toBeNull();
  expect(optionsBox).not.toBeNull();
  expect(toolbarBox!.height).toBe(40);
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(optionsBox!.y);
  await expect.poll(() => previewToolbar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByRole('tablist', { name: 'App package mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Local CDN bucket' })).toBeVisible();
  await page.getByRole('tab', { name: 'Viewer' }).focus();
  await expect(page.getByRole('tab', { name: 'Viewer' })).toBeFocused();
  await expect.poll(() => stagedResources.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const stagedScroll = await stagedResources.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
  });
  expect(stagedScroll.scrollHeight).toBeGreaterThan(stagedScroll.clientHeight);
  expect(stagedScroll.scrollTop).toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page }).include('.package-dependency-panel').analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.getByRole('button', { name: 'Local CDN bucket' })).toBeVisible();
  await page.getByRole('tab', { name: 'Edit' }).click();
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(packageResources).toHaveClass(/package-dependency-panel--workspace/);
});

test('keeps completed evidence and marks a blocked staged asset failed without falling back', async ({ page }) => {
  const releaseId = '1.2.3-blocked.1';
  const namespacePath = `apps/hello-card-spfx/versions/${releaseId}/`;
  const releaseBaseUrl = `${syntheticMockCdnOrigin}/${namespacePath}`;
  await page.route('**/api/lab-packages/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/lab-packages/cdn') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'cdn',
          appId: 'hello-card-spfx',
          releaseId,
          generatedAt: '2026-08-04T12:00:00.000Z',
          cdnBasePath: releaseBaseUrl,
          delivery: {
            kind: 'local-mock-cdn',
            origin: syntheticMockCdnOrigin,
            bucketBaseUrl: `${syntheticMockCdnOrigin}/`,
            namespaceKind: 'app-release',
            namespacePath,
            releaseBaseUrl,
            releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
            status: 'published-and-verified'
          },
          packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
          assets: [
            {
              role: 'dependency',
              moduleId: 'WebPartStrings',
              assetPath: 'loaded-before-failure.js',
              assetUrl: `${releaseBaseUrl}loaded-before-failure.js`,
              bytes: 73,
              sha256: 'c'.repeat(64),
              stageStatus: 'allowed-and-verified'
            },
            {
              role: 'entry',
              moduleId: 'hello-card',
              assetPath: 'blocked-entry.js',
              assetUrl: `${releaseBaseUrl}blocked-entry.js`,
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
    await route.abort();
  });
  await page.route(`${syntheticMockCdnOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/loaded-before-failure.js')) {
      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
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
  await page.getByRole('tab', { name: 'CDN', exact: true }).click();

  await expect(frame.getByRole('alert')).toContainText('Mock-CDN delivery or staged-script execution failed');
  await expect(packageResources.locator('[data-asset-path="loaded-before-failure.js"]')).toHaveAttribute(
    'data-asset-status',
    'loaded'
  );
  await expect(packageResources.locator('[data-asset-path="blocked-entry.js"]')).toHaveAttribute('data-asset-status', 'failed');
  await expectPlainTextResourceStatuses(packageResources);
  await expect(packageResources).toHaveAttribute('data-package-resource-state', 'error');
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(frame.getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
});

test('shows a clear CDN error without falling back to the standalone package', async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  await page.route('**/api/lab-packages/cdn?*', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No validated staging CDN export exists for hello-card-spfx.' })
    });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'CDN', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('CDN resources unavailable');
  await expect(alert).toContainText('No validated staging CDN export exists for hello-card-spfx.');
  await expect(page.locator('.preview-frame > .package-runtime-state--error > span')).toHaveCSS('text-align', 'left');
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
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

test('rejects a same-origin mock CDN descriptor without requesting assets or falling back', async ({ page }) => {
  await page.goto('/');
  const labOrigin = new URL(page.url()).origin;
  const releaseId = '1.2.3-invalid-origin.1';
  const namespacePath = `apps/hello-card-spfx/versions/${releaseId}/`;
  const releaseBaseUrl = `${labOrigin}/${namespacePath}`;
  let assetRequestCount = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith(`/${namespacePath}`)) {
      assetRequestCount += 1;
    }
  });
  await page.route('**/api/lab-packages/cdn?*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'cdn',
        appId: 'hello-card-spfx',
        releaseId,
        generatedAt: '2026-08-04T12:00:00.000Z',
        cdnBasePath: releaseBaseUrl,
        delivery: {
          kind: 'local-mock-cdn',
          origin: labOrigin,
          bucketBaseUrl: `${labOrigin}/`,
          namespaceKind: 'app-release',
          namespacePath,
          releaseBaseUrl,
          releaseManifestUrl: `${releaseBaseUrl}deployment-manifest.json`,
          status: 'published-and-verified'
        },
        packagePath: 'sharepoint/solution/hello-card-spfx.staging.cdn.sppkg',
        assets: [
          {
            role: 'entry',
            moduleId: 'hello-card',
            assetPath: 'hello-card.js',
            assetUrl: `${releaseBaseUrl}hello-card.js`,
            bytes: 205,
            sha256: 'a'.repeat(64),
            stageStatus: 'allowed-and-verified'
          }
        ],
        deferredResources: []
      })
    });
  });

  await page.getByRole('tab', { name: 'CDN', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('CDN resources unavailable');
  await expect(alert).toContainText('separate credential-free loopback HTTP or forwarded HTTPS origin');
  await expect(page.getByRole('tab', { name: 'CDN', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.preview-frame').getByRole('heading', { name: 'Hello Card' })).toHaveCount(0);
  expect(assetRequestCount).toBe(0);
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

test('shows selected app state, saves export config, and can select a source release', async ({ page }) => {
  const versionDetail = 'Choose which source release is active for this managed app.';
  let selectedVersion = 'latest';
  let latestVersion = '1.2.0';
  let updateAvailable = true;
  let releaseLatestUpdate!: () => void;
  const latestUpdateGate = new Promise<void>((resolve) => {
    releaseLatestUpdate = resolve;
  });
  const requests: Array<{ appId: string; versionId: string }> = [];
  const exportConfigRequests: Array<{ appId: string; exportConfig: ManagedAppFixture['exportConfig'] }> = [];
  const selectedLocalReleaseId = '1.3.0-local.1';
  await page.addInitScript((key) => window.localStorage.setItem(key, 'hello-card-spfx'), pinnedAppStorageKey);
  await page.route('**/api/local-cdn', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(bucketInventory(selectedLocalReleaseId, [selectedLocalReleaseId]))
    });
  });
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
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar.getByRole('combobox', { name: 'Selected app' })).toContainText('Hello Card');
  await expect(sidebar.getByRole('switch', { name: 'Active', exact: true })).toBeChecked();
  await expect(sidebar.getByRole('switch', { name: /pinned/i })).toHaveCount(0);

  const versionDropdown = sidebar.getByRole('combobox', { name: 'Source version for Hello Card' });
  await expect(versionDropdown).toHaveAttribute('aria-describedby', /spfx-ui-/u);
  const versionDescriptionId = await versionDropdown.getAttribute('aria-describedby');
  await expect(sidebar.locator(`[id="${versionDescriptionId}"]`)).toHaveText(versionDetail);
  await expect(versionDropdown).toBeDisabled();
  await expect(sidebar.getByRole('switch', { name: 'Active', exact: true })).toBeDisabled();
  releaseLatestUpdate();
  await expect(versionDropdown).toContainText('Latest · v1.3.0');
  await expect(versionDropdown).toBeEnabled();
  await expect.poll(() => requests).toEqual([{ appId: 'hello-card-spfx', versionId: 'latest' }]);

  await expect(sidebar.getByRole('textbox', { name: 'Export app name' })).toHaveValue('Hello Card');
  const fileNameInput = sidebar.getByRole('textbox', { name: 'Export file name' });
  const fileNameControl = sidebar.locator('.app-management-sidebar__file-name-control');
  const fileNameSuffix = fileNameControl.locator('[data-slot="input-group-addon"]');
  await expect(fileNameInput).toHaveValue('hello-card');
  await expect(fileNameInput).toHaveAttribute('aria-describedby', /spfx-ui-/u);
  await expect(fileNameControl).toHaveAttribute('data-slot', 'input-group');
  await expect(fileNameInput).toHaveAttribute('data-slot', 'input-group-control');
  await expect(fileNameSuffix).toHaveText('.sppkg');
  await expect(fileNameSuffix).not.toHaveAttribute('tabindex', /.+/);
  await expect(sidebar.getByRole('textbox', { name: 'Export version' })).toHaveValue('1.3.0');
  const activeLocalCdnManifestUrl = `${syntheticMockCdnPublicOrigin}/apps/hello-card-spfx/versions/${selectedLocalReleaseId}/deployment-manifest.json`;
  const sourceRepositoryLink = sidebar.getByRole('link', { name: 'Open GitHub source repository for Hello Card' });
  await expect(sourceRepositoryLink).toHaveText('https://github.com/acme/hello-card-spfx');
  await expect(sourceRepositoryLink).toHaveAttribute('href', 'https://github.com/acme/hello-card-spfx');
  const activeLocalCdnLink = sidebar.getByRole('link', { name: 'Open active local CDN runtime manifest for Hello Card' });
  await expect(activeLocalCdnLink).toHaveText(activeLocalCdnManifestUrl);
  await expect(activeLocalCdnLink).toHaveAttribute('href', activeLocalCdnManifestUrl);
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
    .include('[data-sidebar="sidebar"]')
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
  await sidebar.getByRole('textbox', { name: 'App catalog short description' }).fill(savedConfig.description);
  await sidebar.getByRole('textbox', { name: 'App catalog long description' }).fill(savedConfig.longDescription);
  await sidebar.getByRole('textbox', { name: 'App catalog video URL' }).fill(savedConfig.videoUrl);
  await sidebar.getByRole('textbox', { name: 'Web part toolbox icon' }).fill(savedConfig.appIcon);
  await sidebar.getByRole('textbox', { name: 'App catalog icon path' }).fill(savedConfig.catalogIconPath);
  await sidebar.getByRole('textbox', { name: 'App catalog screenshot paths' }).fill(savedConfig.screenshotPaths.join('\n'));
  const categoryDropdown = sidebar.getByRole('combobox', { name: 'App catalog categories' });
  await categoryDropdown.click();
  await page.getByRole('option', { name: 'Workflow & Process Management' }).click();
  await page.getByRole('listbox').press('Escape');
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

test('reselects Latest to resume automatic updates', async ({ page }) => {
  let autoUpdate = false;
  const versionRequests: Array<{ appId: string; versionId: string }> = [];
  const fixtures = (): ManagedAppFixture[] => {
    const apps = managedAppFixtures('latest');
    apps[0].version.autoUpdate = autoUpdate;
    apps[0].version.updateAvailable = false;
    apps[0].version.detail = autoUpdate
      ? 'Choose which source release is active for this managed app.'
      : 'Select Latest to enable automatic updates.';
    return apps;
  };

  await page.route('**/api/spfx-apps/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/version')) {
      const body = route.request().postDataJSON() as { appId: string; versionId: string };
      versionRequests.push(body);
      autoUpdate = body.versionId === 'latest';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          appId: body.appId,
          message: 'Updated fixture app.',
          syncedAdapters: 1,
          apps: fixtures()
        })
      });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: fixtures() }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open app menu' }).click();
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  const versionDropdown = sidebar.getByRole('combobox', { name: 'Source version for Hello Card' });
  await expect(sidebar.getByText('Select Latest to enable automatic updates.')).toBeVisible();

  await versionDropdown.click();
  await page.getByRole('option', { name: 'Latest', exact: true }).click();

  await expect.poll(() => versionRequests).toEqual([{ appId: 'hello-card-spfx', versionId: 'latest' }]);
  await expect(sidebar.getByText('Updated fixture app.')).toBeVisible();
  await expect(sidebar.getByText('Select Latest to enable automatic updates.')).toHaveCount(0);
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
  let sidebar = page.locator('[data-sidebar="sidebar"]');
  await sidebar.getByRole('button', { name: 'Download standalone' }).click();

  await expect(page.getByRole('combobox', { name: 'Select app to export' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card.sppkg' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include SPFx + CDN JS package' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include hello-card-spfx-repo' })).toBeChecked();
  await page.getByRole('button', { name: 'Close export package drawer' }).click();

  await page.getByRole('button', { name: 'Open app menu' }).click();
  sidebar = page.locator('[data-sidebar="sidebar"]');
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
  const sidebar = page.locator('[data-sidebar="sidebar"]');
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

  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => (await sidebar.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.x).toBeGreaterThanOrEqual(0);
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(390);
  expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('pins one startup app and restores it after refresh', async ({ page }) => {
  await page.goto('/');

  const optionsPanel = page.getByRole('complementary', { name: 'Options panel' });
  const appSelector = optionsPanel.getByRole('combobox', { name: 'Select web part' });
  await appSelector.click();
  const helloOption = page.getByRole('option', { name: /Hello Card\. Not pinned\./ });
  await helloOption.hover();
  const pinButton = page.getByRole('button', { name: 'Pin Hello Card as startup app' });
  await expect(pinButton).toHaveAttribute('aria-pressed', 'false');
  await pinButton.click();
  await expect(page.getByRole('button', { name: 'Unpin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');

  await page.reload();
  const restoredSelector = page
    .getByRole('complementary', { name: 'Options panel' })
    .getByRole('combobox', { name: 'Select web part' });
  await expect(restoredSelector).toContainText('Hello Card');

  await page.getByRole('button', { name: 'Open app menu' }).click();
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar.getByRole('switch', { name: /pinned/i })).toHaveCount(0);
  const selectedAppSelector = sidebar.getByRole('combobox', { name: 'Selected app' });
  await selectedAppSelector.click();
  const pinnedAppOption = page.getByRole('option', { name: /Hello Card\. Pinned\./ });
  await pinnedAppOption.hover();
  const leftUnpinButton = page.getByRole('button', { name: 'Unpin Hello Card as startup app' });
  await expect(leftUnpinButton).toHaveAttribute('aria-pressed', 'true');
  const sidebarListbox = page.getByRole('listbox');
  await expect(sidebarListbox).toBeVisible();
  await expect(sidebarListbox.getByRole('button')).toHaveCount(0);
  await leftUnpinButton.click();
  await expect(page.getByRole('button', { name: 'Pin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();
  await page.getByRole('button', { name: 'Pin Hello Card as startup app' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+o');
  await expect(sidebar).toBeHidden();
  await page.getByRole('button', { name: 'Close add SPFx app drawer' }).click();
  await page.getByRole('button', { name: 'Open app menu' }).click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('listbox')).toBeHidden();
  await selectedAppSelector.click();
  await expect(leftUnpinButton).toBeVisible();
  await pinnedAppOption.dispatchEvent('keydown', { altKey: true, code: 'KeyP', key: 'p' });
  await expect(page.getByRole('button', { name: 'Pin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();
  await expect(sidebar.getByRole('status')).toContainText('Hello Card is no longer pinned.');

  await selectedAppSelector.dispatchEvent('keydown', { altKey: true, code: 'KeyP', repeat: true });
  await selectedAppSelector.dispatchEvent('keydown', { altKey: true, code: 'KeyP', ctrlKey: true });
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBeNull();

  await page.getByRole('listbox').press('Escape');
  await sidebar.press('Escape');
  await expect(sidebar).toBeHidden();
  await restoredSelector.click();
  const unpinnedRightOption = page.getByRole('option', { name: /Hello Card\. Not pinned\./ });
  await unpinnedRightOption.hover();
  await expect(page.getByRole('button', { name: 'Pin Hello Card as startup app' })).toHaveAttribute('aria-pressed', 'false');
  await restoredSelector.focus();
  await restoredSelector.dispatchEvent('keydown', { altKey: true, code: 'KeyP' });
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');
  await restoredSelector.dispatchEvent('keydown', { altKey: true, code: 'KeyP', repeat: true });
  await restoredSelector.dispatchEvent('keydown', { altKey: true, code: 'KeyP', ctrlKey: true });
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedAppStorageKey)).toBe('hello-card-spfx');
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
    repositoryUrl: string;
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
        source: 'clone',
        repositoryUrl: 'https://github.com/acme/hello-card-spfx',
        detail: 'Choose which source release is active for this managed app.'
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
        repositoryUrl: 'https://github.com/acme/dirty-app-spfx',
        detail:
          'Automatic updates are paused because this app has local changes. Manual version changes save them to a Git stash.'
      }
    }
  ];
}

async function expectPlainTextResourceStatuses(container: Locator): Promise<void> {
  const statuses = container.locator('.package-resource-status');
  expect(await statuses.count()).toBeGreaterThan(0);
  const styles = await statuses.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        borderRightWidth: style.borderRightWidth,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        display: style.display,
        fontWeight: style.fontWeight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        paddingTop: style.paddingTop
      };
    })
  );
  for (const style of styles) {
    expect(style).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
      borderRadius: '0px',
      borderRightWidth: '0px',
      borderTopWidth: '0px',
      boxShadow: 'none',
      display: 'inline',
      fontWeight: '400',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      paddingTop: '0px'
    });
  }
}
