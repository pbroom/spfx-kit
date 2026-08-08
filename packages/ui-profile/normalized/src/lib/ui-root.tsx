import * as React from "react"

import type { SpfxUiThemeTokens } from "./spfx-theme"

export { mapSharePointTheme } from "./spfx-theme"
export type { SharePointThemeLike, SpfxUiThemeMode, SpfxUiThemeTokens } from "./spfx-theme"

export const SPFX_UI_SCOPE_ATTRIBUTE = "data-spfx-ui-scope"
export const SPFX_UI_THEME_ATTRIBUTE = "data-spfx-ui-theme"
export const SPFX_UI_PROFILE_ATTRIBUTE = "data-spfx-ui-profile"
export const SPFX_UI_ROOT_ATTRIBUTE = "data-spfx-ui-root"
export const SPFX_UI_PORTAL_ATTRIBUTE = "data-spfx-ui-portal-host"

export interface CreateSpfxUiHostOptions {
  mountPoint: HTMLElement
  portalParent: HTMLElement
  targetDocument: Document
  instanceId: string
  profileId: string
  scopeValue: string
  theme: SpfxUiThemeTokens
}

export interface SpfxUiHost {
  readonly appRoot: HTMLElement
  readonly portalHost: HTMLElement
  readonly targetDocument: Document
  readonly targetWindow: Window
  readonly instanceId: string
  readonly profileId: string
  readonly scopeValue: string
  idFor(localKey: string): string
  deriveElementId(parentOwnedId: string, semanticPart: string): string
  requireElementId(id: string, label: string): string
  requirePortalId(id: string, label: string): string
  portalIdFor(contentId: string): string
  applyTheme(theme: SpfxUiThemeTokens): void
  dispose(): void
  isDisposed(): boolean
}

interface SpfxUiHostContextValue {
  appRoot: HTMLElement
  portalHost: HTMLElement
  targetDocument: Document
  targetWindow: Window
  instanceId: string
  profileId: string
  scopeValue: string
  idFor(localKey: string): string
  deriveElementId(parentOwnedId: string, semanticPart: string): string
  requireElementId(id: string, label: string): string
  requirePortalId(id: string, label: string): string
  portalIdFor(contentId: string): string
}

export interface SpfxUiHostProviderProps {
  host: SpfxUiHost
  children?: React.ReactNode
}

const SpfxUiHostContext = React.createContext<SpfxUiHostContextValue | undefined>(undefined)

const themeVariableNames: Readonly<Record<Exclude<keyof SpfxUiThemeTokens, "mode">, string>> = {
  colorBackground: "--spfx-ui-color-background",
  colorForeground: "--spfx-ui-color-foreground",
  colorCard: "--spfx-ui-color-card",
  colorCardForeground: "--spfx-ui-color-card-foreground",
  colorPopover: "--spfx-ui-color-popover",
  colorPopoverForeground: "--spfx-ui-color-popover-foreground",
  colorPrimary: "--spfx-ui-color-primary",
  colorPrimaryForeground: "--spfx-ui-color-primary-foreground",
  colorSecondary: "--spfx-ui-color-secondary",
  colorSecondaryForeground: "--spfx-ui-color-secondary-foreground",
  colorMuted: "--spfx-ui-color-muted",
  colorMutedForeground: "--spfx-ui-color-muted-foreground",
  colorAccent: "--spfx-ui-color-accent",
  colorAccentForeground: "--spfx-ui-color-accent-foreground",
  colorDestructive: "--spfx-ui-color-destructive",
  colorBorder: "--spfx-ui-color-border",
  colorInput: "--spfx-ui-color-input",
  colorRing: "--spfx-ui-color-ring",
  radiusSm: "--spfx-ui-radius-sm",
  radiusMd: "--spfx-ui-radius-md",
  radiusLg: "--spfx-ui-radius-lg",
  radiusXl: "--spfx-ui-radius-xl",
  fontHeading: "--spfx-ui-font-heading",
}

export function createSpfxUiHost(options: CreateSpfxUiHostOptions): SpfxUiHost {
  const { mountPoint, portalParent, targetDocument } = options
  const targetWindow = targetDocument.defaultView
  if (!targetWindow) throw new Error("SPFx UI targetDocument must have an owning window")
  if (mountPoint.ownerDocument !== targetDocument) {
    throw new Error("SPFx UI mountPoint must belong to targetDocument")
  }
  if (portalParent.ownerDocument !== targetDocument) {
    throw new Error("SPFx UI portalParent must belong to targetDocument")
  }
  const instanceId = validatedIdentity(options.instanceId, "instanceId")
  const profileId = validatedIdentity(options.profileId, "profileId")
  const scopeValue = validatedScope(options.scopeValue)
  const duplicate = Array.from(targetDocument.querySelectorAll<HTMLElement>(`[${SPFX_UI_ROOT_ATTRIBUTE}]`)).find(
    (element) => element.getAttribute(SPFX_UI_ROOT_ATTRIBUTE) === instanceId
  )
  if (duplicate) throw new Error(`SPFx UI instanceId ${JSON.stringify(instanceId)} is already mounted`)

  const idNamespace = `spfx-ui-${encodeIdSegment(scopeValue)}-${encodeIdSegment(instanceId)}`
  const elementIdPrefix = `${idNamespace}-element-`
  const idFor = (localKey: string): string =>
    `${elementIdPrefix}${encodeIdSegment(validatedIdentity(localKey, "localKey"))}`
  const requireElementId = (id: string, label: string): string => {
    const validatedId = validatedIdentity(id, label)
    const encodedLocalKey = validatedId.slice(elementIdPrefix.length)
    const localKey = decodeCanonicalIdSegment(encodedLocalKey)
    if (!validatedId.startsWith(elementIdPrefix) || localKey === undefined || idFor(localKey) !== validatedId) {
      throw new Error(`SPFx UI ${label} must come from this host's idFor namespace`)
    }
    return validatedId
  }
  const deriveElementId = (parentOwnedId: string, semanticPart: string): string => {
    const validatedParentId = requireElementId(parentOwnedId, "derived ID parent")
    const validatedSemanticPart = validatedIdentity(semanticPart, "derived ID semantic part")
    return idFor(`derived:${validatedParentId}:${validatedSemanticPart}`)
  }
  const portalIdPrefix = `${idNamespace}-portal-`
  const portalIdFor = (contentId: string): string => {
    const validatedContentId = requireElementId(contentId, "portal content ID")
    return `${portalIdPrefix}${encodeIdSegment(validatedContentId)}`
  }
  const requirePortalId = (id: string, label: string): string => {
    const validatedId = validatedIdentity(id, label)
    const encodedContentId = validatedId.slice(portalIdPrefix.length)
    const contentId = decodeCanonicalIdSegment(encodedContentId)
    let isOwnedPortalId = false
    if (validatedId.startsWith(portalIdPrefix) && contentId !== undefined) {
      try {
        isOwnedPortalId = portalIdFor(requireElementId(contentId, "portal content ID")) === validatedId
      } catch {
        isOwnedPortalId = false
      }
    }
    if (!isOwnedPortalId) {
      throw new Error(`SPFx UI ${label} must come from this host's portalIdFor namespace`)
    }
    return validatedId
  }
  const appRoot = targetDocument.createElement("div")
  const portalHost = targetDocument.createElement("div")
  appRoot.id = `${idNamespace}-host-root`
  portalHost.id = `${idNamespace}-host-portal`
  appRoot.setAttribute(SPFX_UI_ROOT_ATTRIBUTE, instanceId)
  portalHost.setAttribute(SPFX_UI_PORTAL_ATTRIBUTE, instanceId)
  applyThemeToSurfaces(appRoot, portalHost, profileId, scopeValue, options.theme)
  try {
    mountPoint.append(appRoot)
    portalParent.append(portalHost)
  } catch (error) {
    appRoot.remove()
    portalHost.remove()
    throw error
  }

  let disposed = false
  return {
    appRoot,
    portalHost,
    targetDocument,
    targetWindow,
    instanceId,
    profileId,
    scopeValue,
    idFor,
    deriveElementId,
    requireElementId,
    requirePortalId,
    portalIdFor,
    applyTheme(theme) {
      if (disposed) throw new Error("Cannot apply a theme to a disposed SPFx UI host")
      applyThemeToSurfaces(appRoot, portalHost, profileId, scopeValue, theme)
    },
    dispose() {
      if (disposed) return
      disposed = true
      appRoot.remove()
      portalHost.remove()
    },
    isDisposed() {
      return disposed
    },
  }
}

export function SpfxUiHostProvider({ host, children }: SpfxUiHostProviderProps): React.ReactElement {
  if (host.isDisposed()) throw new Error("Cannot render a disposed SPFx UI host")
  if (
    host.appRoot.ownerDocument !== host.targetDocument ||
    host.portalHost.ownerDocument !== host.targetDocument ||
    host.targetDocument.defaultView !== host.targetWindow
  ) {
    throw new Error("SPFx UI host nodes, document, and window must share one owner")
  }
  const value = React.useMemo<SpfxUiHostContextValue>(
    () => ({
      appRoot: host.appRoot,
      portalHost: host.portalHost,
      targetDocument: host.targetDocument,
      targetWindow: host.targetWindow,
      instanceId: host.instanceId,
      profileId: host.profileId,
      scopeValue: host.scopeValue,
      idFor: host.idFor,
      deriveElementId: host.deriveElementId,
      requireElementId: host.requireElementId,
      requirePortalId: host.requirePortalId,
      portalIdFor: host.portalIdFor,
    }),
    [host]
  )
  return <SpfxUiHostContext.Provider value={value}>{children}</SpfxUiHostContext.Provider>
}

export function useSpfxUiHost(): SpfxUiHostContextValue {
  const value = React.useContext(SpfxUiHostContext)
  if (!value) throw new Error("SPFx UI components must render inside SpfxUiHostProvider")
  return value
}

export function useSpfxUiPortalHost(): HTMLElement {
  const { portalHost, targetDocument } = useSpfxUiHost()
  if (portalHost.ownerDocument !== targetDocument) {
    throw new Error("SPFx UI portalHost must belong to targetDocument")
  }
  return portalHost
}

export function useSpfxUiPortalId(contentId: string | undefined): string {
  const { portalIdFor, requirePortalId } = useSpfxUiHost()
  if (!contentId) throw new Error("SPFx UI portal content must provide an ID from useSpfxUiId")
  return requirePortalId(portalIdFor(contentId), "portal ID")
}

export function useSpfxUiRequiredId(id: string | undefined, label: string): string {
  const { requireElementId } = useSpfxUiHost()
  if (!id) throw new Error(`SPFx UI ${label} must provide an ID from useSpfxUiId`)
  return requireElementId(id, label)
}

export function useSpfxUiOwnedRender<Render>(
  renderProp: Render,
  idProp: string | undefined,
  label: string
): Render {
  const id = useSpfxUiRequiredId(idProp, label)
  return useValidatedOwnedRender(renderProp, id, label)
}

export function useSpfxUiOwnedPortalRender<Render>(
  renderProp: Render,
  contentId: string | undefined,
  label: string
): Render {
  const portalId = useSpfxUiPortalId(contentId)
  return useValidatedOwnedRender(renderProp, portalId, label)
}

function useValidatedOwnedRender<Render>(renderProp: Render, id: string, label: string): Render {
  const render = React.useMemo(() => {
    if (renderProp === undefined) return undefined
    if (typeof renderProp === "function") {
      const renderCallback = renderProp as (renderProps: unknown, state: unknown) => unknown
      return ((renderProps: unknown, state: unknown) =>
        withOwnedRenderId(renderCallback(renderProps, state), id, label)) as Render
    }
    return withOwnedRenderId(renderProp, id, label) as Render
  }, [id, label, renderProp])
  return render as Render
}

export function useSpfxUiId(localKey: string): string {
  const { idFor } = useSpfxUiHost()
  return React.useMemo(() => idFor(localKey), [idFor, localKey])
}

export function useSpfxUiDerivedId(parentOwnedId: string | undefined, semanticPart: string): string {
  const { deriveElementId } = useSpfxUiHost()
  if (!parentOwnedId) throw new Error("SPFx UI derived ID must provide a parent ID from useSpfxUiId")
  return React.useMemo(
    () => deriveElementId(parentOwnedId, semanticPart),
    [deriveElementId, parentOwnedId, semanticPart]
  )
}

function applyOwnedAttributes(
  element: HTMLElement,
  profileId: string,
  scopeValue: string,
  theme: SpfxUiThemeTokens
): void {
  element.setAttribute(SPFX_UI_PROFILE_ATTRIBUTE, profileId)
  element.setAttribute(SPFX_UI_SCOPE_ATTRIBUTE, scopeValue)
  element.setAttribute(SPFX_UI_THEME_ATTRIBUTE, theme.mode)
  for (const key of Object.keys(themeVariableNames) as Array<Exclude<keyof SpfxUiThemeTokens, "mode">>) {
    element.style.setProperty(themeVariableNames[key], theme[key].trim())
  }
}

function applyThemeToSurfaces(
  appRoot: HTMLElement,
  portalHost: HTMLElement,
  profileId: string,
  scopeValue: string,
  theme: SpfxUiThemeTokens
): void {
  assertValidTheme(theme)
  applyOwnedAttributes(appRoot, profileId, scopeValue, theme)
  applyOwnedAttributes(portalHost, profileId, scopeValue, theme)
}

function assertValidTheme(theme: SpfxUiThemeTokens): void {
  if (theme.mode !== "light" && theme.mode !== "dark") {
    throw new Error("SPFx UI theme mode must be light or dark")
  }
  for (const key of Object.keys(themeVariableNames) as Array<Exclude<keyof SpfxUiThemeTokens, "mode">>) {
    if (typeof theme[key] !== "string" || !theme[key].trim()) {
      throw new Error(`SPFx UI theme token ${key} must not be empty`)
    }
  }
}

function validatedIdentity(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`SPFx UI ${label} must be a non-empty, trimmed string without control characters`)
  }
  return value
}

function validatedScope(value: string): string {
  if (!/^skui-[a-f0-9]{16}$/u.test(value)) {
    throw new Error("SPFx UI scopeValue must be the manifest's digest-derived skui scope")
  }
  return value
}

function encodeIdSegment(value: string): string {
  return Array.from(value, (character) => character.codePointAt(0)!.toString(16)).join("-")
}

function withOwnedRenderId(rendered: unknown, id: string, label: string): React.ReactElement {
  if (!React.isValidElement(rendered)) {
    throw new Error(`SPFx UI ${label} render prop must return a React element`)
  }
  if (typeof rendered.type !== "string") {
    throw new Error(`SPFx UI ${label} render prop must return an intrinsic DOM element`)
  }
  const renderedId = (rendered.props as { id?: unknown }).id
  if (renderedId !== undefined && renderedId !== id) {
    throw new Error(`SPFx UI ${label} render prop must not override its owned ID`)
  }
  return React.cloneElement(rendered as React.ReactElement<{ id?: string }>, { id })
}

function decodeCanonicalIdSegment(value: string): string | undefined {
  if (!/^(?:0|[1-9a-f][0-9a-f]*)(?:-(?:0|[1-9a-f][0-9a-f]*))*$/u.test(value)) return undefined
  try {
    const decoded = value
      .split("-")
      .map((segment) => String.fromCodePoint(Number.parseInt(segment, 16)))
      .join("")
    validatedIdentity(decoded, "encoded ID segment")
    return encodeIdSegment(decoded) === value ? decoded : undefined
  } catch {
    return undefined
  }
}
