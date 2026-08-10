import * as React from 'react';
import { Badge } from '@spfx-kit/ui-profile/badge';
import { Button } from '@spfx-kit/ui-profile/button';
import { Separator } from '@spfx-kit/ui-profile/separator';
import type { LabBreakpoint, LabThemeMode } from '@spfx-kit/spfx-lab-runtime';
import type { LabWorkspaceRoute } from '../lib/uiLibraryRoute';

const UiProfileCatalogHarness = React.lazy(() =>
  import('./UiProfileCatalogHarness').then((module) => ({ default: module.UiProfileCatalogHarness }))
);

interface UiLibraryWorkspaceProps {
  breakpoint: LabBreakpoint;
  route: Extract<LabWorkspaceRoute, { workspace: 'ui-library' }>;
  themeMode: LabThemeMode;
  onNavigate: (route: LabWorkspaceRoute) => void;
}

const includedComponentCount = 57;

export function UiLibraryWorkspace({ breakpoint, themeMode, onNavigate }: UiLibraryWorkspaceProps): JSX.Element {
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

      <div className="ui-library-catalog-shell" style={{ width: `min(${breakpoint.width}px, 100%)` }}>
        <React.Suspense fallback={<div role="status">Loading UI Library…</div>}>
          <UiProfileCatalogHarness />
        </React.Suspense>
      </div>

      <span className="visually-hidden" role="status">
        UI Library showing {includedComponentCount} components using the {themeMode} theme at the {breakpoint.label}
        breakpoint.
      </span>
    </div>
  );
}

export function UiLibraryWorkspaceDetails({ breakpoint, themeMode }: Omit<UiLibraryWorkspaceProps, 'onNavigate'>): JSX.Element {
  return (
    <div className="ui-library-details">
      <div className="lab-toolbar lab-toolbar--panel ui-library-details__toolbar">
        <strong>UI Library</strong>
      </div>
      <div className="ui-library-details__content">
        <p>This first-party workspace is delivered with the Lab and is excluded from app selection, export, and CDN delivery.</p>
        <Separator />
        <dl>
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
