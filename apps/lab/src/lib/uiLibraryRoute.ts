export type LabWorkspaceRoute =
  | { workspace: 'lab' }
  | { workspace: 'ui-library'; component?: string; example?: string };

const workspaceKey = 'workspace';
const componentKey = 'component';
const exampleKey = 'example';
const uiLibraryWorkspace = 'ui-library';
const routeTokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function parseLabWorkspaceRoute(search: string | URLSearchParams): LabWorkspaceRoute {
  const params = toSearchParams(search);
  if (params.get(workspaceKey) !== uiLibraryWorkspace) {
    return { workspace: 'lab' };
  }

  const component = parseRouteToken(params.get(componentKey));
  const example = component ? parseRouteToken(params.get(exampleKey)) : undefined;
  return {
    workspace: 'ui-library',
    ...(component ? { component } : {}),
    ...(example ? { example } : {})
  };
}

export function serializeLabWorkspaceRoute(search: string | URLSearchParams, route: LabWorkspaceRoute): string {
  const params = toSearchParams(search);
  params.delete(workspaceKey);
  params.delete(componentKey);
  params.delete(exampleKey);

  if (route.workspace === 'ui-library') {
    // The contract harness replaces the normal Lab root in main.tsx, so a
    // catalog navigation must never retain that private test-only switch.
    params.delete('ui-profile-contract');
    params.set(workspaceKey, uiLibraryWorkspace);
    if (route.component) {
      params.set(componentKey, route.component);
      if (route.example) {
        params.set(exampleKey, route.example);
      }
    }
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(search);
}

function parseRouteToken(value: string | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length <= 80 && routeTokenPattern.test(normalized) ? normalized : undefined;
}
