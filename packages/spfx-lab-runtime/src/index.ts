import type * as React from 'react';

export type LabThemeMode = 'light' | 'dark' | 'custom';
export type LabDisplayMode = 'edit' | 'viewer';

export interface LabBreakpoint {
  id: 'one-column' | 'two-third' | 'one-half' | 'one-third' | 'mobile';
  label: string;
  width: number;
  description: string;
}

export const SHAREPOINT_BREAKPOINTS: LabBreakpoint[] = [
  { id: 'one-column', label: '1-col', width: 1160, description: 'Full SharePoint page column' },
  { id: 'two-third', label: '2/3', width: 757, description: 'Two-third SharePoint section column' },
  { id: 'one-half', label: '1/2', width: 568, description: 'Half SharePoint section column' },
  { id: 'one-third', label: '1/3', width: 371, description: 'One-third SharePoint section column' },
  { id: 'mobile', label: 'Mobile', width: 390, description: 'Mobile SharePoint viewport under 640px' }
];

export type LabBreakpointId = LabBreakpoint['id'];

export interface LabThemeContext {
  mode: LabThemeMode;
  background: string;
  foreground: string;
  mutedForeground: string;
  surface: string;
  border: string;
}

export interface LabRenderContext {
  breakpoint: LabBreakpoint;
  displayMode: LabDisplayMode;
  theme: LabThemeContext;
  spfxContext: MockSpfxContext;
  fixtures: Record<string, unknown>;
  boundsVisible: boolean;
}

export type LabPropertyPrimitive = string | number | boolean | undefined;
export type LabPropertyBag = Record<string, LabPropertyPrimitive>;

export interface LabPropertyControlBase {
  name: string;
  label: string;
  description?: string;
  inlineGroup?: string;
  getValue?: (values: LabPropertyBag) => LabPropertyPrimitive;
  getPatch?: (value: LabPropertyPrimitive, values: LabPropertyBag) => LabPropertyBag;
}

export interface LabCssEditorTarget {
  label: string;
  selector: string;
  snippet: string;
  editable?: boolean;
  renameLabel?: string;
}

export interface LabSourceEditorDiagnostic {
  level: 'warning' | 'error';
  message: string;
}

export interface LabSourceEditorSnippet {
  label: string;
  snippet: string;
  searchText?: string;
}

interface LabSourceEditorControlBase extends LabPropertyControlBase {
  type: 'sourceEditor';
  placeholder?: string;
  height?: number;
  /** @deprecated Use height for sourceEditor controls. */
  minHeight?: number;
  maxBytes?: number;
  commitMode?: 'immediate' | 'valid';
  snippets?: LabSourceEditorSnippet[];
  validate?: (value: string, values: LabPropertyBag) => LabSourceEditorDiagnostic[];
}

export type LabPropertyControlIcon = 'text-align-left' | 'text-align-center' | 'text-align-right';

export type LabSourceEditorControl =
  | (LabSourceEditorControlBase & {
      language: 'scss';
      targets?: LabCssEditorTarget[];
      targetComment?: string;
      getTargets?: (values: LabPropertyBag) => LabCssEditorTarget[];
      getTargetComment?: (values: LabPropertyBag) => string;
      getTargetRenamePatch?: (
        target: LabCssEditorTarget,
        nextSelector: string,
        nextValue: string,
        values: LabPropertyBag
      ) => LabPropertyBag;
    })
  | (LabSourceEditorControlBase & {
      language: 'html';
    });

export type LabPropertyControl =
  | (LabPropertyControlBase & {
      type: 'text' | 'textarea' | 'color';
      placeholder?: string;
    })
  | (LabPropertyControlBase & {
      type: 'number';
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    })
  | (LabPropertyControlBase & {
      type: 'toggle';
      onText?: string;
      offText?: string;
    })
  | (LabPropertyControlBase & {
      type: 'select';
      options: Array<{ label: string; value: string }>;
    })
  | (LabPropertyControlBase & {
      type: 'combobox';
      options: Array<{ label: string; value: string }>;
      placeholder?: string;
      /** Maximum options rendered while filtering. Defaults to 50. */
      maxVisibleOptions?: number;
    })
  | (LabPropertyControlBase & {
      type: 'radio';
      options: Array<{ label: string; value: string; icon?: LabPropertyControlIcon }>;
    })
  | (LabPropertyControlBase & {
      type: 'codeWorkspace';
    })
  | (LabPropertyControlBase & {
      /** @deprecated Use sourceEditor with language: 'scss'. */
      type: 'cssEditor';
      placeholder?: string;
      minHeight?: number;
      targets?: LabCssEditorTarget[];
      targetComment?: string;
      getTargets?: (values: LabPropertyBag) => LabCssEditorTarget[];
      getTargetComment?: (values: LabPropertyBag) => string;
      getTargetRenamePatch?: (
        target: LabCssEditorTarget,
        nextSelector: string,
        nextValue: string,
        values: LabPropertyBag
      ) => LabPropertyBag;
    })
  | LabSourceEditorControl
  | (LabPropertyControlBase & {
      type: 'sourceWorkspace';
      documents: LabSourceEditorControl[];
      defaultView?: 'first' | 'split';
    });

export interface LabPropertyPaneRenderProps<Props extends LabPropertyBag = LabPropertyBag> {
  title: string;
  values: Props;
  onChange: (patch: Partial<Props>) => void;
  renderControl: (control: LabPropertyControl) => React.ReactNode;
}

export interface LabRenderProps<Props extends LabPropertyBag = LabPropertyBag> {
  props: Props;
  lab: LabRenderContext;
  updateProps: (patch: Partial<Props>) => void;
}

export interface LabWebPart<Props extends LabPropertyBag = LabPropertyBag> {
  id: string;
  appId: string;
  title: string;
  description: string;
  group?: string;
  defaultProps: Props;
  controls: LabPropertyControl[];
  propertyPane?: React.ComponentType<LabPropertyPaneRenderProps<Props>>;
  supportedBreakpoints?: LabBreakpointId[];
  fixtures?: Record<string, unknown>;
  render: React.ComponentType<LabRenderProps<Props>>;
}

export type RegisteredLabWebPart = LabWebPart<any>;

export class LabWebPartRegistry {
  private readonly webParts = new Map<string, RegisteredLabWebPart>();

  public register<Props extends LabPropertyBag>(webPart: LabWebPart<Props>): void {
    if (this.webParts.has(webPart.id)) {
      throw new Error(`Duplicate lab web part id: ${webPart.id}`);
    }
    this.webParts.set(webPart.id, webPart);
  }

  public list(): RegisteredLabWebPart[] {
    return [...this.webParts.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  public get(id: string): RegisteredLabWebPart | undefined {
    return this.webParts.get(id);
  }
}

export interface MockSpfxContext {
  manifest: { id: string; alias: string };
  pageContext: {
    web: { absoluteUrl: string; title: string };
    site: { absoluteUrl: string };
    user: { displayName: string; email: string; loginName: string };
  };
  spHttpClient: MockSpHttpClient;
  msGraphClientFactory: { getClient: (version: string) => Promise<MockGraphClient> };
  serviceScope: Record<string, unknown>;
}

export interface MockSpHttpClient {
  get: (url: string, configuration?: unknown, options?: unknown) => Promise<MockHttpResponse>;
  post: (url: string, bodyOrConfiguration?: unknown, options?: unknown) => Promise<MockHttpResponse>;
}

export interface MockGraphClient {
  api: (path: string) => MockGraphRequest;
}

export interface MockGraphRequest {
  header: (...args: unknown[]) => MockGraphRequest;
  responseType: (...args: unknown[]) => MockGraphRequest;
  get: () => Promise<unknown>;
  post: (body?: unknown) => Promise<unknown>;
}

export class MockHttpResponse {
  public readonly ok: boolean;
  public readonly status: number;

  public constructor(
    private readonly payload: unknown,
    options: { status?: number; ok?: boolean } = {}
  ) {
    this.status = options.status ?? 200;
    this.ok = options.ok ?? (this.status >= 200 && this.status < 300);
  }

  public async json(): Promise<unknown> {
    return this.payload;
  }

  public async text(): Promise<string> {
    return typeof this.payload === 'string' ? this.payload : JSON.stringify(this.payload);
  }
}

export function createMockSpfxContext(overrides: Partial<MockSpfxContext> = {}): MockSpfxContext {
  const graphClient = createMemoryGraphClient({});
  return {
    manifest: { id: 'lab-web-part', alias: 'LabWebPart' },
    pageContext: {
      web: { absoluteUrl: 'https://contoso.sharepoint.com/sites/lab', title: 'SPFx Lab' },
      site: { absoluteUrl: 'https://contoso.sharepoint.com/sites/lab' },
      user: {
        displayName: 'Alex Johnson',
        email: 'alex.johnson@contoso.com',
        loginName: 'i:0#.f|membership|alex.johnson@contoso.com'
      }
    },
    spHttpClient: createMemorySpHttpClient({}),
    msGraphClientFactory: { getClient: async () => graphClient },
    serviceScope: {},
    ...overrides
  };
}

export function createMemorySpHttpClient(routes: Record<string, unknown>): MockSpHttpClient {
  return {
    get: async (url: string) => new MockHttpResponse(resolveRoute(routes, url)),
    post: async (url: string, bodyOrConfiguration?: unknown, options?: unknown) =>
      new MockHttpResponse(resolveRoute(routes, url, getMockPostBody(bodyOrConfiguration, options)))
  };
}

export function createMemoryGraphClient(routes: Record<string, unknown>): MockGraphClient {
  return {
    api(path: string): MockGraphRequest {
      const request: MockGraphRequest = {
        header: () => request,
        responseType: () => request,
        get: async () => resolveRoute(routes, path),
        post: async (body?: unknown) => resolveRoute(routes, path, body)
      };
      return request;
    }
  };
}

export function createLabTheme(mode: LabThemeMode, customBackground = '#eef6ff'): LabThemeContext {
  if (mode === 'dark') {
    return {
      mode,
      background: '#1f1f1f',
      foreground: '#f5f5f5',
      mutedForeground: '#c7c7c7',
      surface: '#2b2b2b',
      border: '#484848'
    };
  }
  if (mode === 'custom') {
    return {
      mode,
      background: customBackground,
      foreground: '#242424',
      mutedForeground: '#616161',
      surface: '#ffffff',
      border: '#d1d1d1'
    };
  }
  return {
    mode,
    background: '#ffffff',
    foreground: '#242424',
    mutedForeground: '#616161',
    surface: '#ffffff',
    border: '#e5e5e5'
  };
}

function resolveRoute(routes: Record<string, unknown>, key: string, body?: unknown): unknown {
  const route = routes[key] ?? routes['*'];
  if (typeof route === 'function') {
    return (route as (key: string, body?: unknown) => unknown)(key, body);
  }
  return route ?? { value: [] };
}

function getMockPostBody(bodyOrConfiguration?: unknown, options?: unknown): unknown {
  if (options && typeof options === 'object' && 'body' in options) {
    const body = (options as { body?: unknown }).body;
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }
  return bodyOrConfiguration;
}
