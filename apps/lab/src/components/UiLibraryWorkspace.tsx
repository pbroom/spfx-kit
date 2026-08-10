import * as React from 'react';
import { Badge } from '@spfx-kit/ui-profile/badge';
import { Button } from '@spfx-kit/ui-profile/button';
import { Input } from '@spfx-kit/ui-profile/input';
import { Separator } from '@spfx-kit/ui-profile/separator';
import { useSpfxUiId } from '@spfx-kit/ui-profile';
import type { LabBreakpoint, LabThemeMode } from '@spfx-kit/spfx-lab-runtime';
import type { LabWorkspaceRoute } from '../lib/uiLibraryRoute';

interface UiLibraryWorkspaceProps {
  breakpoint: LabBreakpoint;
  route: Extract<LabWorkspaceRoute, { workspace: 'ui-library' }>;
  themeMode: LabThemeMode;
  onNavigate: (route: LabWorkspaceRoute) => void;
}

interface FoundationPreview {
  id: 'button' | 'input' | 'badge';
  title: string;
  description: string;
}

const foundationPreviews: FoundationPreview[] = [
  {
    id: 'button',
    title: 'Button',
    description: 'Actions, variants, sizes, and disabled states.'
  },
  {
    id: 'input',
    title: 'Input',
    description: 'Text entry using the shared scoped component styles.'
  },
  {
    id: 'badge',
    title: 'Badge',
    description: 'Compact status and metadata treatments.'
  }
];

export function UiLibraryWorkspace({ breakpoint, route, themeMode, onNavigate }: UiLibraryWorkspaceProps): JSX.Element {
  const inputId = useSpfxUiId('ui-library:foundation-input');
  const selected = foundationPreviews.find((preview) => preview.id === route.component);
  const unknownComponent = Boolean(route.component && !selected);

  return (
    <div aria-labelledby="ui-library-title" className="ui-library-workspace" data-ui-library-workspace="ready">
      <header className="ui-library-workspace__header">
        <div>
          <Badge variant="secondary">First-party Lab workspace</Badge>
          <h1 id="ui-library-title">UI Library</h1>
          <p>Preview shared React 17 components inside the real SPFx Kit Lab host, theme, and scoped stylesheet.</p>
        </div>
        <Button variant="outline" onClick={() => onNavigate({ workspace: 'lab' })}>
          Return to Lab
        </Button>
      </header>

      <div className="ui-library-workspace__body">
        <nav aria-label="UI Library components" className="ui-library-navigation">
          <Button
            aria-current={!route.component ? 'page' : undefined}
            size="sm"
            variant={!route.component ? 'secondary' : 'ghost'}
            onClick={() => onNavigate({ workspace: 'ui-library' })}
          >
            Overview
          </Button>
          {foundationPreviews.map((preview) => (
            <Button
              aria-current={route.component === preview.id ? 'page' : undefined}
              key={preview.id}
              size="sm"
              variant={route.component === preview.id ? 'secondary' : 'ghost'}
              onClick={() => onNavigate({ workspace: 'ui-library', component: preview.id })}
            >
              {preview.title}
            </Button>
          ))}
        </nav>

        <div className="ui-library-preview-canvas">
          <article
            aria-label={selected ? `${selected.title} component preview` : 'UI Library overview'}
            className="ui-library-preview-frame"
            data-catalog-example={selected?.id || 'overview'}
            style={{ width: `min(${breakpoint.width}px, 100%)` }}
          >
            {unknownComponent ? (
              <div className="ui-library-preview-frame__empty">
                <Badge variant="outline">Preview not added yet</Badge>
                <h2>{titleFromRouteToken(route.component || '')}</h2>
                <p>The navigation contract is ready; this component can be added without entering the SPFx app registry.</p>
                <Button variant="outline" onClick={() => onNavigate({ workspace: 'ui-library' })}>
                  View available previews
                </Button>
              </div>
            ) : selected ? (
              <SelectedFoundationPreview inputId={inputId} preview={selected} />
            ) : (
              <Overview inputId={inputId} onNavigate={onNavigate} />
            )}
          </article>
        </div>
      </div>

      <span className="visually-hidden" role="status">
        UI Library using the {themeMode} theme at the {breakpoint.label} breakpoint.
      </span>
    </div>
  );
}

export function UiLibraryWorkspaceDetails({
  breakpoint,
  route,
  themeMode
}: Omit<UiLibraryWorkspaceProps, 'onNavigate'>): JSX.Element {
  return (
    <div className="ui-library-details">
      <div className="lab-toolbar lab-toolbar--panel ui-library-details__toolbar">
        <strong>UI Library</strong>
      </div>
      <div className="ui-library-details__content">
        <Badge variant="outline">Not an SPFx app</Badge>
        <p>This first-party workspace is delivered with the Lab and is excluded from app selection, export, and CDN delivery.</p>
        <Separator />
        <dl>
          <div>
            <dt>Component</dt>
            <dd>{route.component ? titleFromRouteToken(route.component) : 'Overview'}</dd>
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

function Overview({ inputId, onNavigate }: Pick<UiLibraryWorkspaceProps, 'onNavigate'> & { inputId: string }): JSX.Element {
  return (
    <div className="ui-library-overview">
      <div>
        <Badge>Foundation preview</Badge>
        <h2>Shared components, one Lab host</h2>
        <p>The catalog framework is ready for complete component examples, interactive props, snippets, and custom CSS.</p>
      </div>
      <div className="ui-library-foundation-grid">
        {foundationPreviews.map((preview) => (
          <section className="ui-library-foundation-card" key={preview.id}>
            <div className="ui-library-foundation-card__sample">
              <FoundationSample inputId={inputId} previewId={preview.id} />
            </div>
            <h3>{preview.title}</h3>
            <p>{preview.description}</p>
            <Button
              aria-label={`Open ${preview.title} component preview`}
              size="sm"
              variant="outline"
              onClick={() => onNavigate({ workspace: 'ui-library', component: preview.id })}
            >
              Open preview
            </Button>
          </section>
        ))}
      </div>
    </div>
  );
}

function SelectedFoundationPreview({ inputId, preview }: { inputId: string; preview: FoundationPreview }): JSX.Element {
  return (
    <div className="ui-library-selected-preview">
      <div>
        <Badge variant="outline">@spfx-kit/ui-profile/{preview.id}</Badge>
        <h2>{preview.title}</h2>
        <p>{preview.description}</p>
      </div>
      <Separator />
      <div aria-label={`${preview.title} examples`} className="ui-library-selected-preview__examples">
        <FoundationSample inputId={inputId} previewId={preview.id} />
      </div>
    </div>
  );
}

function FoundationSample({ inputId, previewId }: { inputId: string; previewId: FoundationPreview['id'] }): JSX.Element {
  if (previewId === 'button') {
    return (
      <div className="ui-library-sample-row" data-slot="button-examples">
        <Button>Primary action</Button>
        <Button variant="outline">Secondary action</Button>
        <Button disabled>Disabled</Button>
      </div>
    );
  }
  if (previewId === 'input') {
    return (
      <label className="ui-library-input-sample" htmlFor={inputId}>
        <span>Example label</span>
        <Input id={inputId} placeholder="Type a value" />
      </label>
    );
  }
  return (
    <div className="ui-library-sample-row" data-slot="badge-examples">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
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
