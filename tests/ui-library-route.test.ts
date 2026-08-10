import { describe, expect, it } from 'vitest';
import { parseLabWorkspaceRoute, serializeLabWorkspaceRoute, type LabWorkspaceRoute } from '../apps/lab/src/lib/uiLibraryRoute';

describe('Lab UI Library query route', () => {
  it('defaults to the normal Lab workspace when no workspace is selected', () => {
    expect(parseLabWorkspaceRoute('')).toEqual({ workspace: 'lab' });
    expect(parseLabWorkspaceRoute('?theme=dark')).toEqual({ workspace: 'lab' });
  });

  it('parses the first-party UI Library workspace', () => {
    expect(parseLabWorkspaceRoute('?workspace=ui-library')).toEqual({ workspace: 'ui-library' });
  });

  it('parses optional catalog component and example selections', () => {
    expect(parseLabWorkspaceRoute('?workspace=ui-library&component=button&example=loading-state')).toEqual({
      workspace: 'ui-library',
      component: 'button',
      example: 'loading-state'
    });
  });

  it('normalizes unknown and malformed selections to a safe route', () => {
    expect(parseLabWorkspaceRoute('?workspace=managed-app&component=button&example=default')).toEqual({
      workspace: 'lab'
    });
    expect(parseLabWorkspaceRoute('?workspace=ui-library&component=%2Fbutton&example=default')).toEqual({
      workspace: 'ui-library'
    });
    expect(parseLabWorkspaceRoute('?workspace=ui-library&example=default')).toEqual({
      workspace: 'ui-library'
    });
    expect(parseLabWorkspaceRoute('?workspace=ui-library&component=button&example=%E0%A4%A')).toEqual({
      workspace: 'ui-library',
      component: 'button'
    });
  });

  it('serializes a catalog route without discarding unrelated Lab query state', () => {
    const search = serializeLabWorkspaceRoute('?theme=dark&feature-flag=1', {
      workspace: 'ui-library',
      component: 'dropdown-menu',
      example: 'controlled-open'
    });
    const params = new URLSearchParams(search);

    expect(params.get('theme')).toBe('dark');
    expect(params.get('feature-flag')).toBe('1');
    expect(params.get('workspace')).toBe('ui-library');
    expect(params.get('component')).toBe('dropdown-menu');
    expect(params.get('example')).toBe('controlled-open');
  });

  it('removes the standalone UI profile contract route when entering the catalog', () => {
    const search = serializeLabWorkspaceRoute('?ui-profile-contract=1&trace=enabled', {
      workspace: 'ui-library'
    });
    const params = new URLSearchParams(search);

    expect(params.has('ui-profile-contract')).toBe(false);
    expect(params.get('trace')).toBe('enabled');
    expect(params.get('workspace')).toBe('ui-library');
  });

  it('serializes the normal Lab route by removing only catalog-owned state', () => {
    const search = serializeLabWorkspaceRoute('?workspace=ui-library&component=button&example=default&theme=custom', {
      workspace: 'lab'
    });
    const params = new URLSearchParams(search);

    expect(params.has('workspace')).toBe(false);
    expect(params.has('component')).toBe(false);
    expect(params.has('example')).toBe(false);
    expect(params.get('theme')).toBe('custom');
  });

  it('accepts URLSearchParams snapshots so popstate parsing does not depend on cached state', () => {
    const snapshots = [
      new URLSearchParams('workspace=ui-library&component=button'),
      new URLSearchParams('theme=light'),
      new URLSearchParams('workspace=ui-library&component=tabs&example=vertical')
    ];
    const routes: LabWorkspaceRoute[] = snapshots.map((snapshot) => parseLabWorkspaceRoute(snapshot));

    expect(routes).toEqual([
      { workspace: 'ui-library', component: 'button' },
      { workspace: 'lab' },
      { workspace: 'ui-library', component: 'tabs', example: 'vertical' }
    ]);
  });
});
