import * as React from 'react';
import { Badge } from '@spfx-kit/ui-profile/badge';
import { Button } from '@spfx-kit/ui-profile/button';
import type { LabBreakpoint, LabThemeMode } from '@spfx-kit/spfx-lab-runtime';
import type { LabWorkspaceRoute } from '../lib/uiLibraryRoute';
import {
  isUiProfileCatalogComponentId,
  uiProfileCatalogApiSectionId,
  uiProfileCatalogDocumentation,
  uiProfileCatalogEntries,
  uiProfileCatalogImportPath,
  uiProfileCatalogPageSections,
  uiProfileCatalogSectionId,
  type UiProfileCatalogPageSection
} from './uiProfileCatalogEntries';
import { UiLibraryCodeBlock } from './UiLibraryCodeBlock';

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
  const activeExample = activeDocumentation.examples?.some((example) => example.id === route.example) ? route.example : undefined;
  const pageSections = uiProfileCatalogPageSections(activeComponent);
  const examplesSection = pageSections.find((section) => section.kind === 'examples')!;
  const usageSection = pageSections.find((section) => section.kind === 'usage')!;
  const compositionSection = pageSections.find((section) => section.kind === 'composition');
  const apiSection = pageSections.find((section) => section.kind === 'api');
  const compatibilitySection = pageSections.find((section) => section.kind === 'compatibility');
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
    <div
      aria-labelledby="ui-library-title"
      className="ui-library-workspace"
      data-ui-library-active-example={activeExample}
      data-ui-library-workspace="ready"
    >
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

            <section aria-labelledby={`${examplesSection.id}-title`} className="ui-library-docs__section" id={examplesSection.id}>
              <div className="ui-library-docs__section-heading">
                <h3 id={`${examplesSection.id}-title`}>{examplesSection.title}</h3>
                <p>
                  {activeDocumentation.examples
                    ? 'Supported Base UI compositions running inside the active Lab host and theme.'
                    : 'Default shared-profile presentation inside the active Lab host and theme.'}
                </p>
              </div>
              <div className="ui-library-docs__preview-frame">
                <React.Suspense fallback={<div role="status">Loading {activeEntry.title}…</div>}>
                  <UiProfileCatalogHarness activeComponent={activeComponent} activeExample={activeExample} />
                </React.Suspense>
              </div>
            </section>

            <section aria-labelledby={`${usageSection.id}-title`} className="ui-library-docs__section" id={usageSection.id}>
              <div className="ui-library-docs__section-heading">
                <h3 id={`${usageSection.id}-title`}>{usageSection.title}</h3>
                <p>Import the component family from its public package entry point.</p>
              </div>
              <UiLibraryCodeBlock code={publicImport} label={`Public import for ${activeEntry.title}`} />
              <p className="ui-library-docs__note">
                The live example above uses the package’s curated React 17 implementation and the Lab’s owned host, portal, and ID
                contracts.
              </p>
            </section>

            {activeDocumentation.composition && compositionSection ? (
              <section
                aria-labelledby={`${compositionSection.id}-title`}
                className="ui-library-docs__section"
                id={compositionSection.id}
              >
                <div className="ui-library-docs__section-heading">
                  <h3 id={`${compositionSection.id}-title`}>{compositionSection.title}</h3>
                  <p>Use the exported parts together to preserve the component’s semantic structure.</p>
                </div>
                <ul className="ui-library-docs__guidance-list">
                  {activeDocumentation.composition.map((guidance) => (
                    <li key={guidance}>{guidance}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {activeDocumentation.api && apiSection ? (
              <section aria-labelledby={`${apiSection.id}-title`} className="ui-library-docs__section" id={apiSection.id}>
                <div className="ui-library-docs__section-heading">
                  <h3 id={`${apiSection.id}-title`}>{apiSection.title}</h3>
                  <p>Public parts and component-specific props for the shared Base UI implementation.</p>
                </div>
                <div className="ui-library-docs__api-list">
                  {activeDocumentation.api.map((part) => {
                    const partSectionId = uiProfileCatalogApiSectionId(activeComponent, part.name);
                    return (
                      <section
                        aria-labelledby={`${partSectionId}-title`}
                        className="ui-library-docs__api"
                        id={partSectionId}
                        key={part.name}
                      >
                        <h4 id={`${partSectionId}-title`}>
                          <code>{part.name}</code> <span>{part.element}</span>
                        </h4>
                        <div className="ui-library-docs__table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th scope="col">Prop</th>
                                <th scope="col">Type</th>
                                <th scope="col">Default</th>
                                <th scope="col">Purpose</th>
                              </tr>
                            </thead>
                            <tbody>
                              {part.props.map((prop) => (
                                <tr key={prop.name}>
                                  <th scope="row">
                                    <code>{prop.name}</code>
                                  </th>
                                  <td>
                                    <code>{prop.type}</code>
                                  </td>
                                  <td>{prop.defaultValue ? <code>{prop.defaultValue}</code> : '—'}</td>
                                  <td>{prop.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {activeDocumentation.compatibilityNotes?.length && compatibilitySection ? (
              <section
                aria-labelledby={`${compatibilitySection.id}-title`}
                className="ui-library-docs__section"
                id={compatibilitySection.id}
              >
                <div className="ui-library-docs__section-heading">
                  <h3 id={`${compatibilitySection.id}-title`}>{compatibilitySection.title}</h3>
                </div>
                <ul className="ui-library-docs__guidance-list">
                  {activeDocumentation.compatibilityNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            ) : null}
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

interface UiLibraryOnThisPageProps {
  className?: string;
  sections: readonly UiProfileCatalogPageSection[];
  showTitle?: boolean;
}

function UiLibraryOnThisPage({ className = '', sections, showTitle = true }: UiLibraryOnThisPageProps): JSX.Element {
  return (
    <nav aria-label="On this page" className={`ui-library-outline ${className}`.trim()}>
      {showTitle ? <strong>On This Page</strong> : null}
      <ul>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
            {section.children?.length ? (
              <ul>
                {section.children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`}>{child.title}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
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

export function UiLibraryWorkspaceDetails({ route }: Omit<UiLibraryWorkspaceProps, 'onNavigate'>): JSX.Element {
  const activeComponent = isUiProfileCatalogComponentId(route.component) ? route.component : uiProfileCatalogEntries[0].id;
  const pageSections = uiProfileCatalogPageSections(activeComponent);

  return (
    <div className="ui-library-details">
      <div className="lab-toolbar lab-toolbar--panel ui-library-details__toolbar">
        <strong>On This Page</strong>
      </div>
      <div className="ui-library-details__content">
        <UiLibraryOnThisPage sections={pageSections} showTitle={false} />
      </div>
    </div>
  );
}
