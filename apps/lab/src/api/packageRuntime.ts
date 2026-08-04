import * as React from 'react';
import * as ReactDom from 'react-dom';

const CDN_DESCRIPTOR_ENDPOINT = '/api/lab-packages/cdn';
const CDN_ASSET_API_PREFIX = '/api/lab-packages/cdn-assets/';
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface CdnPackageDescriptor {
  mode: 'cdn';
  appId: string;
  releaseId: string;
  generatedAt: string;
  cdnBasePath: string;
  assetBaseUrl: string;
  entryAssetPath: string;
  entryAssetUrl: string;
  packagePath: string;
  dependencyAssets: CdnPackageScriptAsset[];
}

export interface CdnPackageScriptAsset {
  moduleId: string;
  assetPath: string;
  assetUrl: string;
}

export interface CdnWebPartInstance {
  properties: Record<string, unknown>;
  domElement: HTMLElement;
  context: unknown;
  displayMode: unknown;
  render: () => void;
  onDispose?: () => void;
}

export type CdnWebPartConstructor = new () => CdnWebPartInstance;

export interface LoadedCdnPackage {
  descriptor: CdnPackageDescriptor;
  WebPart: CdnWebPartConstructor;
}

export async function loadCdnPackage(
  appId: string,
  componentId: string | undefined,
  signal: AbortSignal
): Promise<LoadedCdnPackage> {
  const normalizedAppId = appId.trim();
  if (!normalizedAppId) {
    throw new Error('A managed app id is required to load the CDN package.');
  }
  if (componentId !== undefined && !componentId.trim()) {
    throw new Error('The CDN package component id cannot be empty.');
  }

  const query = new URLSearchParams({ app: normalizedAppId });
  if (componentId !== undefined) {
    query.set('component', componentId.trim());
  }

  const response = await fetch(`${CDN_DESCRIPTOR_ENDPOINT}?${query}`, {
    cache: 'no-store',
    redirect: 'error',
    signal
  });
  const descriptorValue = await readJsonResponse(response, 'CDN package descriptor');
  const descriptor = validateCdnPackageDescriptor(descriptorValue, normalizedAppId);
  const dependencySources = await Promise.all(
    descriptor.dependencyAssets.map(async (asset) => ({
      moduleId: asset.moduleId,
      source: await readScriptAsset(asset.assetUrl, `CDN dependency ${asset.moduleId}`, signal)
    }))
  );
  const entrySource = await readScriptAsset(descriptor.entryAssetUrl, 'CDN entry asset', signal);
  const WebPart = evaluateCdnAmdPackage(dependencySources, entrySource);

  return { descriptor, WebPart };
}

function validateCdnPackageDescriptor(value: unknown, expectedAppId: string): CdnPackageDescriptor {
  if (!isRecord(value)) {
    throw new Error('CDN package descriptor must be an object.');
  }
  if (value.mode !== 'cdn') {
    throw new Error('CDN package descriptor has an invalid mode.');
  }

  const appId = requireString(value.appId, 'appId');
  if (appId !== expectedAppId) {
    throw new Error('CDN package descriptor does not match the selected app.');
  }

  const releaseId = requireString(value.releaseId, 'releaseId');
  if (!RELEASE_ID_PATTERN.test(releaseId) || !/\d/.test(releaseId)) {
    throw new Error('CDN package descriptor releaseId is invalid.');
  }

  const generatedAt = requireString(value.generatedAt, 'generatedAt');
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('CDN package descriptor generatedAt is invalid.');
  }

  const cdnBasePath = validateCdnBasePath(requireString(value.cdnBasePath, 'cdnBasePath'));
  const entryAssetPath = validatePortablePath(requireString(value.entryAssetPath, 'entryAssetPath'), 'entryAssetPath');
  const packagePath = validatePortablePath(requireString(value.packagePath, 'packagePath'), 'packagePath');
  if (!/\.(?:m?js)$/i.test(entryAssetPath)) {
    throw new Error('CDN package descriptor entryAssetPath must name a JavaScript asset.');
  }

  const labOrigin = getLabOrigin();
  const assetBaseUrl = validateSimulationUrl(requireString(value.assetBaseUrl, 'assetBaseUrl'), labOrigin, 'assetBaseUrl');
  if (!assetBaseUrl.pathname.endsWith('/')) {
    throw new Error('CDN package descriptor assetBaseUrl must end with a slash.');
  }
  const entryAssetUrl = validateSimulationUrl(requireString(value.entryAssetUrl, 'entryAssetUrl'), labOrigin, 'entryAssetUrl');
  const expectedEntryUrl = new URL(encodePortablePath(entryAssetPath), assetBaseUrl);
  if (entryAssetUrl.href !== expectedEntryUrl.href) {
    throw new Error('CDN package descriptor entryAssetUrl does not match entryAssetPath.');
  }
  if (!Array.isArray(value.dependencyAssets)) {
    throw new Error('CDN package descriptor dependencyAssets must be an array.');
  }
  const dependencyAssets = value.dependencyAssets.map((asset, index) => validateDependencyAsset(asset, index, assetBaseUrl));
  const dependencyModuleIds = new Set<string>();
  const dependencyPaths = new Set<string>();
  for (const dependency of dependencyAssets) {
    if (dependencyModuleIds.has(dependency.moduleId) || dependencyPaths.has(dependency.assetPath)) {
      throw new Error('CDN package descriptor contains duplicate dependency assets.');
    }
    if (dependency.assetPath === entryAssetPath) {
      throw new Error('CDN package descriptor lists its entry asset as a dependency.');
    }
    dependencyModuleIds.add(dependency.moduleId);
    dependencyPaths.add(dependency.assetPath);
  }

  return {
    mode: 'cdn',
    appId,
    releaseId,
    generatedAt,
    cdnBasePath,
    assetBaseUrl: assetBaseUrl.href,
    entryAssetPath,
    entryAssetUrl: entryAssetUrl.href,
    packagePath,
    dependencyAssets
  };
}

function validateDependencyAsset(value: unknown, index: number, assetBaseUrl: URL): CdnPackageScriptAsset {
  if (!isRecord(value)) {
    throw new Error(`CDN package dependency ${index} must be an object.`);
  }
  const moduleId = requireString(value.moduleId, `dependencyAssets[${index}].moduleId`);
  if (moduleId.length > 200 || hasControlCharacter(moduleId)) {
    throw new Error(`CDN package dependency ${index} has an invalid moduleId.`);
  }
  const assetPath = validatePortablePath(
    requireString(value.assetPath, `dependencyAssets[${index}].assetPath`),
    `dependencyAssets[${index}].assetPath`
  );
  if (!/\.(?:m?js)$/i.test(assetPath)) {
    throw new Error(`CDN package dependency ${index} must name a JavaScript asset.`);
  }
  const assetUrl = validateSimulationUrl(
    requireString(value.assetUrl, `dependencyAssets[${index}].assetUrl`),
    assetBaseUrl.origin,
    `dependencyAssets[${index}].assetUrl`
  );
  const expectedAssetUrl = new URL(encodePortablePath(assetPath), assetBaseUrl);
  if (assetUrl.href !== expectedAssetUrl.href) {
    throw new Error(`CDN package dependency ${index} URL does not match its assetPath.`);
  }
  return { moduleId, assetPath, assetUrl: assetUrl.href };
}

async function readScriptAsset(url: string, label: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) {
    throw new Error(`${label} failed with status ${response.status}.`);
  }
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'text/javascript' && contentType !== 'application/javascript') {
    throw new Error(`${label} did not return JavaScript content.`);
  }
  if (response.url && response.url !== url) {
    throw new Error(`${label} returned an unexpected URL.`);
  }
  const source = await response.text();
  if (!source.trim()) {
    throw new Error(`${label} is empty.`);
  }
  return source;
}

interface AmdDefinition {
  dependencies: string[];
  factory: unknown;
}

function evaluateCdnAmdPackage(
  dependencies: Array<{ moduleId: string; source: string }>,
  entrySource: string
): CdnWebPartConstructor {
  const definitions = new Map<string, AmdDefinition>();
  const modules = createBuiltInModules();
  const entryDefinitionIds: string[] = [];
  let activeModuleId = '';
  let loadingEntry = false;

  const define = ((...args: unknown[]): void => {
    const named = typeof args[0] === 'string';
    const moduleId = named ? String(args[0]) : activeModuleId;
    const dependenciesValue = (named ? args[1] : args[0]) as unknown;
    const factory = named ? args[2] : args[1];
    if (!moduleId || !Array.isArray(dependenciesValue) || !dependenciesValue.every((item) => typeof item === 'string')) {
      throw new Error('CDN package contains an unsupported AMD module definition.');
    }
    if (definitions.has(moduleId) || modules.has(moduleId)) {
      throw new Error(`CDN package defines duplicate AMD module "${moduleId}".`);
    }
    definitions.set(moduleId, { dependencies: dependenciesValue, factory });
    if (loadingEntry) {
      entryDefinitionIds.push(moduleId);
    }
  }) as ((...args: unknown[]) => void) & { amd?: Record<string, never> };
  define.amd = {};

  const evaluateSource = (source: string, moduleId: string, entry: boolean): void => {
    activeModuleId = moduleId;
    loadingEntry = entry;
    try {
      // The selected, locally validated CDN artifact is intentionally executable in Lab CDN mode.
      Function('define', `'use strict';\n${source}`)(define);
    } finally {
      activeModuleId = '';
      loadingEntry = false;
    }
  };

  for (const dependency of dependencies) {
    evaluateSource(dependency.source, dependency.moduleId, false);
  }
  evaluateSource(entrySource, '__spfx_kit_entry__', true);
  if (entryDefinitionIds.length !== 1) {
    throw new Error('CDN package entry must define exactly one AMD module.');
  }

  const resolving = new Set<string>();
  const resolveModule = (moduleId: string): unknown => {
    if (modules.has(moduleId)) {
      return modules.get(moduleId);
    }
    const definition = definitions.get(moduleId);
    if (!definition) {
      throw new Error(`CDN package requires unsupported module "${moduleId}".`);
    }
    if (resolving.has(moduleId)) {
      throw new Error(`CDN package contains a circular AMD dependency at "${moduleId}".`);
    }
    resolving.add(moduleId);
    const exportsValue: Record<string, unknown> = {};
    const moduleValue: { exports: unknown } = { exports: exportsValue };
    const resolvedDependencies = definition.dependencies.map((dependency) => {
      if (dependency === 'exports') return exportsValue;
      if (dependency === 'module') return moduleValue;
      if (dependency === 'require') return (requested: string): unknown => resolveModule(requested);
      return resolveModule(dependency);
    });
    const factoryResult =
      typeof definition.factory === 'function'
        ? (definition.factory as (...values: unknown[]) => unknown)(...resolvedDependencies)
        : definition.factory;
    const resolved = factoryResult === undefined ? moduleValue.exports : factoryResult;
    resolving.delete(moduleId);
    modules.set(moduleId, resolved);
    return resolved;
  };

  const entryModule = resolveModule(entryDefinitionIds[0]);
  const candidate = isRecord(entryModule) && 'default' in entryModule ? entryModule.default : entryModule;
  if (typeof candidate !== 'function' || typeof candidate.prototype?.render !== 'function') {
    throw new Error('CDN package entry did not export an SPFx web part constructor.');
  }
  return candidate as CdnWebPartConstructor;
}

function createBuiltInModules(): Map<string, unknown> {
  function BaseClientSideWebPart(): void {
    // SPFx production bundles extend this function using ES5 helper semantics.
  }
  class Version {
    public static parse(value: string): Version {
      return new Version(value);
    }

    public constructor(private readonly value: string) {}

    public toString(): string {
      return this.value;
    }
  }
  const propertyPaneField = (...args: unknown[]): { args: unknown[] } => ({ args });
  return new Map<string, unknown>([
    ['react', React],
    ['react-dom', ReactDom],
    ['@microsoft/sp-core-library', { Version }],
    [
      '@microsoft/sp-property-pane',
      {
        PropertyPaneCheckbox: propertyPaneField,
        PropertyPaneChoiceGroup: propertyPaneField,
        PropertyPaneDropdown: propertyPaneField,
        PropertyPaneHorizontalRule: propertyPaneField,
        PropertyPaneLabel: propertyPaneField,
        PropertyPaneLink: propertyPaneField,
        PropertyPaneSlider: propertyPaneField,
        PropertyPaneTextField: propertyPaneField,
        PropertyPaneToggle: propertyPaneField
      }
    ],
    ['@microsoft/sp-webpart-base', { BaseClientSideWebPart }]
  ]);
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let serverMessage = '';
    const value = tryParseJson(text);
    if (isRecord(value) && typeof value.error === 'string') {
      serverMessage = value.error.trim();
    } else if (value === undefined) {
      serverMessage = text.trim();
    }
    throw new Error(`${label} request failed with status ${response.status}${serverMessage ? `: ${serverMessage}` : '.'}`);
  }
  if (!text.trim()) {
    throw new Error(`${label} response is empty.`);
  }
  const value = tryParseJson(text);
  if (value === undefined) {
    throw new Error(`${label} response is not valid JSON.`);
  }
  return value;
}

function validateCdnBasePath(value: string): string {
  const url = tryParseUrl(value);
  if (!url) {
    throw new Error('CDN package descriptor cdnBasePath must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('CDN package descriptor cdnBasePath must be a credential-free HTTPS URL.');
  }
  if (!url.pathname.endsWith('/')) {
    throw new Error('CDN package descriptor cdnBasePath must end with a slash.');
  }
  return url.href;
}

function validateSimulationUrl(value: string, labOrigin: string, label: string): URL {
  const url = tryParseUrl(value, labOrigin);
  if (!url) {
    throw new Error(`CDN package descriptor ${label} is not a valid URL.`);
  }
  if (
    url.origin !== labOrigin ||
    !url.pathname.startsWith(CDN_ASSET_API_PREFIX) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hasUnsafeEncodedPath(url.pathname)
  ) {
    throw new Error(`CDN package descriptor ${label} must stay within the Lab CDN asset API.`);
  }
  return url;
}

function validatePortablePath(value: string, label: string): string {
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /^[A-Za-z]:/.test(value) ||
    hasControlCharacter(value) ||
    value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`CDN package descriptor ${label} must be a safe relative path.`);
  }
  return value;
}

function encodePortablePath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function hasUnsafeEncodedPath(pathname: string): boolean {
  try {
    return pathname.split('/').some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
    });
  } catch {
    return true;
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function tryParseUrl(value: string, base?: string): URL | undefined {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return undefined;
  }
}

function getLabOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('The Lab origin is unavailable.');
  }
  return new URL(window.location.origin).origin;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`CDN package descriptor ${field} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
