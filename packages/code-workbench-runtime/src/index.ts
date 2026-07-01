import * as Babel from '@babel/standalone';
import * as LZString from 'lz-string';

export type CodeWorkbenchMode = 'auto' | 'react' | 'html';

export interface CodeWorkbenchSourceV1 {
  version: 1;
  mode: CodeWorkbenchMode;
  tsx: string;
  html: string;
  css: string;
  scss: string;
  ts: string;
  js: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CodeWorkbenchDiagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  source?: 'tsx' | 'html' | 'css' | 'scss' | 'ts' | 'js' | 'runtime' | 'serialization';
}

export interface CodeWorkbenchSerializationResult {
  value: string;
  rawBytes: number;
  compressedBytes: number;
  blocked: boolean;
  diagnostics: CodeWorkbenchDiagnostic[];
}

export interface CodeWorkbenchModules {
  react: unknown;
  'react-dom': unknown;
  [moduleName: string]: unknown;
}

export interface CodeWorkbenchCompileOptions {
  source: CodeWorkbenchSourceV1;
  modules: CodeWorkbenchModules;
  spfx?: unknown;
}

export interface CodeWorkbenchCompileResult {
  kind: 'react' | 'html';
  source: CodeWorkbenchSourceV1;
  css: string;
  html: string;
  component?: unknown;
  moduleExports?: Record<string, unknown>;
  diagnostics: CodeWorkbenchDiagnostic[];
}

export interface CodeWorkbenchRenderOptions extends CodeWorkbenchCompileOptions {
  host: HTMLElement;
  props?: Record<string, unknown>;
}

export interface CodeWorkbenchRenderHandle {
  diagnostics: CodeWorkbenchDiagnostic[];
  dispose: () => void;
}

export interface SpfxBridgeOptions {
  spHttpClientConfiguration?: unknown;
}

export const CODE_WORKBENCH_SOURCE_PREFIX = 'spfx-code-workbench:v1:';
export const CODE_WORKBENCH_RAW_WARN_BYTES = 150 * 1024;
export const CODE_WORKBENCH_RAW_BLOCK_BYTES = 350 * 1024;

const DEFAULT_TSX = `export default function WorkbenchApp({ spfx }) {
  const React = require('react');
  return (
    <section className="workbench-card">
      <h2>SPFx Code Workbench</h2>
      <p>Hello {spfx.currentUser.displayName}. Edit the TSX, HTML, CSS, Sass, TS, or JS tabs to build this web part.</p>
    </section>
  );
}`;

const DEFAULT_CSS = `.workbench-card {
  border: 1px solid #d1d1d1;
  border-radius: 8px;
  padding: 20px;
  background: #ffffff;
  color: #242424;
  font-family: "Segoe UI", sans-serif;
}

.workbench-card h2 {
  margin: 0 0 8px;
  font-size: 24px;
}`;

export function createDefaultCodeWorkbenchSource(partial: Partial<CodeWorkbenchSourceV1> = {}): CodeWorkbenchSourceV1 {
  return normalizeCodeWorkbenchSource({
    version: 1,
    mode: 'react',
    tsx: DEFAULT_TSX,
    html: '',
    css: DEFAULT_CSS,
    scss: '',
    ts: '',
    js: '',
    ...partial
  });
}

export function normalizeCodeWorkbenchSource(value: Partial<CodeWorkbenchSourceV1> = {}): CodeWorkbenchSourceV1 {
  return {
    version: 1,
    mode: value.mode === 'html' || value.mode === 'react' || value.mode === 'auto' ? value.mode : 'react',
    tsx: value.tsx || '',
    html: value.html || '',
    css: value.css || '',
    scss: value.scss || '',
    ts: value.ts || '',
    js: value.js || '',
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy
  };
}

export function measureCodeWorkbenchSource(source: CodeWorkbenchSourceV1): number {
  return byteLength(JSON.stringify(normalizeCodeWorkbenchSource(source)));
}

export function serializeCodeWorkbenchSource(source: CodeWorkbenchSourceV1): CodeWorkbenchSerializationResult {
  const normalized = normalizeCodeWorkbenchSource(source);
  const raw = JSON.stringify(normalized);
  const rawBytes = byteLength(raw);
  const compressed = LZString.compressToEncodedURIComponent(raw);
  const value = `${CODE_WORKBENCH_SOURCE_PREFIX}${compressed}`;
  const diagnostics = sizeDiagnostics(rawBytes);
  return {
    value,
    rawBytes,
    compressedBytes: byteLength(value),
    blocked: rawBytes > CODE_WORKBENCH_RAW_BLOCK_BYTES,
    diagnostics
  };
}

export function deserializeCodeWorkbenchSource(value: string | undefined, fallback: Partial<CodeWorkbenchSourceV1> = {}): CodeWorkbenchSourceV1 {
  if (!value) {
    return createDefaultCodeWorkbenchSource(fallback);
  }

  try {
    if (value.startsWith(CODE_WORKBENCH_SOURCE_PREFIX)) {
      const encoded = value.slice(CODE_WORKBENCH_SOURCE_PREFIX.length);
      const raw = LZString.decompressFromEncodedURIComponent(encoded);
      if (!raw) {
        throw new Error('Compressed source could not be decoded.');
      }
      return normalizeCodeWorkbenchSource({ ...fallback, ...JSON.parse(raw) });
    }
    return normalizeCodeWorkbenchSource({ ...fallback, ...JSON.parse(value) });
  } catch {
    return createDefaultCodeWorkbenchSource({
      ...fallback,
      tsx: '',
      html: '<div class="workbench-card"><h2>Unable to load saved source</h2><p>The stored web part source is invalid.</p></div>',
      mode: 'html'
    });
  }
}

export function getCodeWorkbenchSourceDiagnostics(source: CodeWorkbenchSourceV1): CodeWorkbenchDiagnostic[] {
  return sizeDiagnostics(measureCodeWorkbenchSource(source));
}

export function compileCodeWorkbenchSource(options: CodeWorkbenchCompileOptions): CodeWorkbenchCompileResult {
  const diagnostics: CodeWorkbenchDiagnostic[] = [...getCodeWorkbenchSourceDiagnostics(options.source)];
  const source = normalizeCodeWorkbenchSource(options.source);
  const css = [source.css, compileScss(source.scss)].filter(Boolean).join('\n\n');
  const shouldTryReact = source.mode !== 'html' && Boolean([source.ts, source.js, source.tsx].join('').trim());

  if (shouldTryReact) {
    try {
      const code = [source.ts, source.js, source.tsx].filter(Boolean).join('\n\n');
      const moduleExports = executeAuthoredModule(code, options.modules, options.spfx);
      const component = moduleExports.default || moduleExports.WorkbenchApp || moduleExports.App;
      if (component) {
        return { kind: 'react', source, css, html: source.html, component, moduleExports, diagnostics };
      }
      diagnostics.push({
        level: source.mode === 'react' ? 'error' : 'warning',
        source: 'tsx',
        message: 'No default React component export was found. Falling back to the HTML tab.'
      });
    } catch (error) {
      diagnostics.push({
        level: 'error',
        source: 'runtime',
        message: toMessage(error, 'Unable to compile authored code.')
      });
      if (source.mode === 'react') {
        return { kind: 'html', source, css, html: renderDiagnosticsHtml(diagnostics), diagnostics };
      }
    }
  }

  return { kind: 'html', source, css, html: source.html || renderDiagnosticsHtml(diagnostics), diagnostics };
}

export function renderCodeWorkbench(options: CodeWorkbenchRenderOptions): CodeWorkbenchRenderHandle {
  const compiled = compileCodeWorkbenchSource(options);
  const host = options.host;
  const reactDom = options.modules['react-dom'] as { render?: (...args: unknown[]) => void; unmountComponentAtNode?: (node: Element) => void };
  const react = options.modules.react as { createElement?: (...args: unknown[]) => unknown };
  let mountedNode: HTMLElement | undefined;
  let styleNode: HTMLStyleElement | undefined;
  let reactMounted = false;
  let disposed = false;

  clearElement(host);

  if (compiled.diagnostics.some((item) => item.level === 'error') && compiled.kind !== 'react') {
    renderErrorDom(host, compiled.diagnostics);
    return { diagnostics: compiled.diagnostics, dispose: () => clearElement(host) };
  }

  if (compiled.kind === 'react' && compiled.component && react.createElement && reactDom.render) {
    const scopeClass = `spfx-code-workbench-scope-${hashSource(compiled.css)}`;
    styleNode = document.createElement('style');
    styleNode.setAttribute('data-spfx-code-workbench', scopeClass);
    styleNode.textContent = scopeCss(compiled.css, `.${scopeClass}`);
    document.head.appendChild(styleNode);

    mountedNode = document.createElement('div');
    mountedNode.className = scopeClass;
    host.appendChild(mountedNode);
    reactMounted = true;
    reactDom.render(
      react.createElement(compiled.component as never, {
        spfx: options.spfx,
        source: compiled.source,
        diagnostics: compiled.diagnostics,
        ...(options.props || {})
      }),
      mountedNode
    );
  } else {
    mountedNode = document.createElement('div');
    host.appendChild(mountedNode);
    const shadow = mountedNode.attachShadow ? mountedNode.attachShadow({ mode: 'open' }) : undefined;
    const root = shadow || host;
    const style = document.createElement('style');
    style.textContent = compiled.css;
    const body = document.createElement('div');
    body.innerHTML = compiled.html || '';
    root.appendChild(style);
    root.appendChild(body);
  }

  return {
    diagnostics: compiled.diagnostics,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (reactMounted && mountedNode && reactDom.unmountComponentAtNode) {
        reactDom.unmountComponentAtNode(mountedNode);
      }
      if (styleNode && styleNode.parentNode) {
        styleNode.parentNode.removeChild(styleNode);
      }
      clearElement(host);
    }
  };
}

export function createApprovedModuleResolver(modules: CodeWorkbenchModules): (moduleName: string) => unknown {
  return (moduleName: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(modules, moduleName)) {
      return modules[moduleName];
    }
    throw new Error(`Import "${moduleName}" is not approved for this SPFx Code Workbench environment.`);
  };
}

export function createSpfxBridge(context: any, options: SpfxBridgeOptions = {}): any {
  const webUrl = context?.pageContext?.web?.absoluteUrl || '';
  const siteUrl = context?.pageContext?.site?.absoluteUrl || webUrl;
  const currentUser = {
    displayName: context?.pageContext?.user?.displayName || 'Current user',
    email: context?.pageContext?.user?.email || '',
    loginName: context?.pageContext?.user?.loginName || ''
  };

  const spGet = async (url: string): Promise<unknown> => {
    const response = await callSpHttp(context?.spHttpClient, 'get', url, undefined, options.spHttpClientConfiguration);
    return responseToJson(response);
  };
  const spPost = async (url: string, body?: unknown): Promise<unknown> => {
    const response = await callSpHttp(context?.spHttpClient, 'post', url, body, options.spHttpClientConfiguration);
    return responseToJson(response);
  };

  return {
    context,
    spHttpClient: context?.spHttpClient,
    msGraphClientFactory: context?.msGraphClientFactory,
    webUrl,
    siteUrl,
    currentUser,
    lists: {
      getItems: (listTitle: string, query = '') => spGet(`${webUrl}/_api/web/lists/getbytitle('${escapeOData(listTitle)}')/items${query}`),
      addItem: (listTitle: string, fields: Record<string, unknown>) =>
        spPost(`${webUrl}/_api/web/lists/getbytitle('${escapeOData(listTitle)}')/items`, fields),
      updateItem: (listTitle: string, itemId: number, fields: Record<string, unknown>) =>
        spPost(`${webUrl}/_api/web/lists/getbytitle('${escapeOData(listTitle)}')/items(${itemId})`, fields)
    },
    files: {
      getByServerRelativeUrl: (serverRelativeUrl: string) =>
        spGet(`${webUrl}/_api/web/getfilebyserverrelativeurl('${escapeOData(serverRelativeUrl)}')`),
      listFolderFiles: (serverRelativeUrl: string) =>
        spGet(`${webUrl}/_api/web/getfolderbyserverrelativeurl('${escapeOData(serverRelativeUrl)}')/files`)
    },
    assets: {
      siteAssets: () => spGet(`${webUrl}/_api/web/lists/getbytitle('Site Assets')/items`)
    },
    directory: {
      users: async (search = ''): Promise<unknown> => graphGet(context, `/users${search ? `?$search="${escapeGraphSearch(search)}"` : ''}`),
      groups: async (search = ''): Promise<unknown> => graphGet(context, `/groups${search ? `?$search="${escapeGraphSearch(search)}"` : ''}`),
      groupMembers: async (groupId: string): Promise<unknown> => graphGet(context, `/groups/${groupId}/members`)
    }
  };
}

function executeAuthoredModule(source: string, modules: CodeWorkbenchModules, spfx: unknown): Record<string, unknown> {
  const transformed = Babel.transform(source, {
    filename: 'spfx-code-workbench.tsx',
    presets: [
      ['typescript', { ignoreExtensions: true }],
      ['react', { runtime: 'classic' }]
    ],
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module'
  }).code;

  if (!transformed) {
    throw new Error('Babel did not return compiled JavaScript.');
  }

  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;
  const require = createApprovedModuleResolver(modules);
  const fn = new Function('require', 'exports', 'module', 'React', 'spfx', transformed);
  fn(require, exports, module, modules.react, spfx);
  return module.exports;
}

function compileScss(source: string): string {
  if (!source.trim()) {
    return '';
  }
  const variables: Record<string, string> = {};
  const withoutVariables = source.replace(/\$([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g, (_match, name: string, value: string) => {
    variables[name] = value.trim();
    return '';
  });
  const substituted = withoutVariables.replace(/\$([A-Za-z0-9_-]+)/g, (_match, name: string) => variables[name] || '');
  return flattenNestedCss(substituted);
}

function flattenNestedCss(css: string): string {
  const trimmed = css.trim();
  if (!trimmed.includes('{')) {
    return trimmed;
  }
  const output: string[] = [];

  function parseBlock(selector: string, body: string): void {
    const nestedRegex = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    let direct = body;
    while ((match = nestedRegex.exec(body))) {
      const childSelector = match[1].trim();
      const childBody = match[2].trim();
      const resolved = childSelector
        .split(',')
        .map((item) => {
          const value = item.trim();
          return value.includes('&') ? value.replace(/&/g, selector) : `${selector} ${value}`;
        })
        .join(', ');
      output.push(`${resolved} { ${childBody} }`);
      direct = direct.replace(match[0], '');
    }
    if (direct.trim()) {
      output.unshift(`${selector} { ${direct.trim()} }`);
    }
  }

  const topRegex = /([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = topRegex.exec(trimmed))) {
    parseBlock(match[1].trim(), match[2]);
  }
  return output.length ? output.join('\n') : trimmed;
}

function scopeCss(css: string, scopeSelector: string): string {
  if (!css.trim()) {
    return '';
  }
  return css.replace(/(^|})\s*([^@{}][^{}]*)\{/g, (_match, boundary: string, selector: string) => {
    const scoped = selector
      .split(',')
      .map((part: string) => {
        const value = part.trim();
        if (!value || value.startsWith(scopeSelector)) {
          return value;
        }
        if (value === ':root' || value === 'html' || value === 'body') {
          return scopeSelector;
        }
        return `${scopeSelector} ${value}`;
      })
      .join(', ');
    return `${boundary} ${scoped} {`;
  });
}

function renderDiagnosticsHtml(diagnostics: CodeWorkbenchDiagnostic[]): string {
  const errors = diagnostics.filter((item) => item.level === 'error');
  if (!errors.length) {
    return '';
  }
  return `<section class="workbench-card"><h2>Code Workbench error</h2>${errors
    .map((item) => `<p>${escapeHtml(item.message)}</p>`)
    .join('')}</section>`;
}

function renderErrorDom(host: HTMLElement, diagnostics: CodeWorkbenchDiagnostic[]): void {
  const section = document.createElement('section');
  section.style.border = '1px solid #f1bbbc';
  section.style.borderRadius = '8px';
  section.style.padding = '16px';
  section.style.background = '#fff4f4';
  section.style.color = '#a4262c';
  const title = document.createElement('strong');
  title.textContent = 'SPFx Code Workbench error';
  section.appendChild(title);
  for (const diagnostic of diagnostics.filter((item) => item.level === 'error')) {
    const paragraph = document.createElement('p');
    paragraph.textContent = diagnostic.message;
    section.appendChild(paragraph);
  }
  host.appendChild(section);
}

function sizeDiagnostics(rawBytes: number): CodeWorkbenchDiagnostic[] {
  if (rawBytes > CODE_WORKBENCH_RAW_BLOCK_BYTES) {
    return [
      {
        level: 'error',
        source: 'serialization',
        message: `Source is ${formatBytes(rawBytes)}, above the ${formatBytes(CODE_WORKBENCH_RAW_BLOCK_BYTES)} save limit.`
      }
    ];
  }
  if (rawBytes > CODE_WORKBENCH_RAW_WARN_BYTES) {
    return [
      {
        level: 'warning',
        source: 'serialization',
        message: `Source is ${formatBytes(rawBytes)}. Consider moving large code into a managed SPFx app if it keeps growing.`
      }
    ];
  }
  return [];
}

async function graphGet(context: any, path: string): Promise<unknown> {
  const client = await context?.msGraphClientFactory?.getClient('3');
  if (!client) {
    throw new Error('Microsoft Graph client is not available in this SPFx context.');
  }
  const request = client.api(path);
  return request.header ? request.header('ConsistencyLevel', 'eventual').get() : request.get();
}

async function callSpHttp(client: any, method: 'get' | 'post', url: string, body?: unknown, configuration?: unknown): Promise<any> {
  if (!client || typeof client[method] !== 'function') {
    throw new Error('SharePoint HTTP client is not available in this SPFx context.');
  }
  if (configuration === undefined && client[method].length < 3) {
    return method === 'post' ? client.post(url, body) : client.get(url);
  }
  if (method === 'post') {
    return client.post(url, configuration, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  return client.get(url, configuration, { headers: { Accept: 'application/json;odata=nometadata' } });
}

async function responseToJson(response: any): Promise<unknown> {
  if (!response) {
    return undefined;
  }
  if (response.ok === false) {
    const text = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(text || `SharePoint request failed with status ${response.status || 'unknown'}.`);
  }
  if (typeof response.json === 'function') {
    return response.json();
  }
  return response;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeGraphSearch(value: string): string {
  return value.replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function clearElement(element: Element): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function hashSource(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function formatBytes(value: number): string {
  return `${Math.round(value / 1024)} KB`;
}

function toMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  if (typeof value === 'string' && value) {
    return value;
  }
  return fallback;
}
