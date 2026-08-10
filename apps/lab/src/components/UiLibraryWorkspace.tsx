import * as React from 'react';
import { Badge } from '@spfx-kit/ui-profile/badge';
import { Button } from '@spfx-kit/ui-profile/button';
import type { LabBreakpoint, LabThemeMode } from '@spfx-kit/spfx-lab-runtime';
import type { LabWorkspaceRoute } from '../lib/uiLibraryRoute';
import {
  isUiProfileCatalogComponentId,
  uiProfileCatalogDocumentation,
  uiProfileCatalogEntries,
  uiProfileCatalogImportPath,
  uiProfileCatalogSectionId
} from './uiProfileCatalogEntries';

const UiProfileCatalogHarness = React.lazy(() =>
  import('./UiProfileCatalogHarness').then((module) => ({ default: module.UiProfileCatalogHarness }))
);

interface UiLibraryWorkspaceProps {
  breakpoint: LabBreakpoint;
  route: Extract<LabWorkspaceRoute, { workspace: 'ui-library' }>;
  themeMode: LabThemeMode;
  onNavigate: (route: LabWorkspaceRoute) => void;
}

const includedComponentCount = uiProfileCatalogEntries.length;

export function UiLibraryWorkspace({ breakpoint, route, themeMode, onNavigate }: UiLibraryWorkspaceProps): JSX.Element {
  const navigationListRef = React.useRef<HTMLUListElement>(null);
  const activeComponent = isUiProfileCatalogComponentId(route.component) ? route.component : uiProfileCatalogEntries[0].id;
  const activeEntry = uiProfileCatalogEntries.find((entry) => entry.id === activeComponent) ?? uiProfileCatalogEntries[0];
  const activeDocumentation = uiProfileCatalogDocumentation[activeComponent];
  const publicImport = `import { ${activeDocumentation.primaryExport} } from '${uiProfileCatalogImportPath(activeComponent)}';`;

  React.useEffect(() => {
    const list = navigationListRef.current;
    const activeLink = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !activeLink) return;
    const listBounds = list.getBoundingClientRect();
    const linkBounds = activeLink.getBoundingClientRect();
    if (linkBounds.left < listBounds.left || linkBounds.right > listBounds.right) {
      list.scrollLeft += linkBounds.left - listBounds.left - (listBounds.width - linkBounds.width) / 2;
    }
    if (linkBounds.top < listBounds.top || linkBounds.bottom > listBounds.bottom) {
      list.scrollTop += linkBounds.top - listBounds.top - (listBounds.height - linkBounds.height) / 2;
    }
  }, [activeComponent]);

  return (
    <div aria-labelledby="ui-library-title" className="ui-library-workspace" data-ui-library-workspace="ready">
      <header className="ui-library-workspace__header">
        <div>
          <Badge variant="secondary">First-party Lab workspace</Badge>
          <h1 id="ui-library-title">UI Library</h1>
          <p>
            Browse all {includedComponentCount} React 17-compatible shared components inside the real SPFx Kit Lab host, theme,
            and scoped stylesheet.
          </p>
        </div>
        <Button variant="outline" onClick={() => onNavigate({ workspace: 'lab' })}>
          Return to Lab
        </Button>
      </header>

      <div className="ui-library-workspace__body">
        <nav aria-label="UI Library components" className="ui-library-navigation">
          <h2 className="ui-library-navigation__title">Components</h2>
          <ul className="ui-library-navigation__list" ref={navigationListRef} onKeyDown={moveCatalogNavigationFocus}>
            {uiProfileCatalogEntries.map((entry) => (
              <li key={entry.id}>
                <a
                  aria-current={entry.id === activeComponent ? 'location' : undefined}
                  data-ui-library-navigation-link={entry.id}
                  href={`#${uiProfileCatalogSectionId(entry.id)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate({ workspace: 'ui-library', component: entry.id });
                  }}
                >
                  {entry.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ui-library-catalog-shell" style={{ width: `min(${breakpoint.width}px, 100%)` }}>
          <article aria-labelledby="ui-library-component-title" className="ui-library-docs">
            <header className="ui-library-docs__header">
              <h2 id="ui-library-component-title">{activeEntry.title}</h2>
              <p>{activeDocumentation.summary}</p>
            </header>

            <section aria-labelledby="ui-library-preview-title" className="ui-library-docs__section">
              <div className="ui-library-docs__section-heading">
                <h3 id="ui-library-preview-title">Preview</h3>
                <p>Default shared-profile presentation inside the active Lab host and theme.</p>
              </div>
              <div className="ui-library-docs__preview-frame">
                <React.Suspense fallback={<div role="status">Loading {activeEntry.title}…</div>}>
                  <UiProfileCatalogHarness activeComponent={activeComponent} />
                </React.Suspense>
              </div>
            </section>

            <section aria-labelledby="ui-library-usage-title" className="ui-library-docs__section">
              <div className="ui-library-docs__section-heading">
                <h3 id="ui-library-usage-title">Usage</h3>
                <p>Import the component family from its public package entry point.</p>
              </div>
              <pre aria-label={`Public import for ${activeEntry.title}`} className="ui-library-docs__code">
                <code>{publicImport}</code>
              </pre>
              <p className="ui-library-docs__note">
                The live example above uses the package’s curated React 17 implementation and the Lab’s owned host, portal, and ID
                contracts.
              </p>
            </section>
          </article>
        </div>
      </div>

      <span className="visually-hidden" role="status">
        UI Library showing {includedComponentCount} components using the {themeMode} theme at the {breakpoint.label}
        breakpoint.
      </span>
    </div>
  );
}

function moveCatalogNavigationFocus(event: React.KeyboardEvent<HTMLUListElement>): void {
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('[data-ui-library-navigation-link]'));
  const currentIndex = links.findIndex((link) => link === event.target || link.contains(event.target as Node));
  if (currentIndex < 0) return;

  let nextIndex: number | undefined;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % links.length;
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + links.length) % links.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = links.length - 1;
  if (nextIndex === undefined) return;

  event.preventDefault();
  links[nextIndex]?.focus();
}

export function UiLibraryWorkspaceDetails({
  breakpoint,
  route,
  themeMode
}: Omit<UiLibraryWorkspaceProps, 'onNavigate'>): JSX.Element {
  const activeComponent = isUiProfileCatalogComponentId(route.component) ? route.component : uiProfileCatalogEntries[0].id;
  const activeEntry = uiProfileCatalogEntries.find((entry) => entry.id === activeComponent) ?? uiProfileCatalogEntries[0];

  return (
    <div className="ui-library-details">
      <div className="lab-toolbar lab-toolbar--panel ui-library-details__toolbar">
        <strong>UI Library</strong>
      </div>
      <div className="ui-library-details__content">
        <dl>
          <div>
            <dt>Selected</dt>
            <dd>{activeEntry.title}</dd>
          </div>
          <div>
            <dt>Public import</dt>
            <dd>
              <code>{uiProfileCatalogImportPath(activeComponent)}</code>
            </dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{includedComponentCount} public components</dd>
          </div>
          <div>
            <dt>Theme</dt>
            <dd>{titleFromRouteToken(themeMode)}</dd>
          </div>
          <div>
            <dt>Breakpoint</dt>
            <dd>{breakpoint.label}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Lab Vite bundle</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function titleFromRouteToken(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
