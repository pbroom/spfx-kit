export type SpfxUiThemeMode = "light" | "dark"

export interface SpfxUiThemeTokens {
  mode: SpfxUiThemeMode
  colorBackground: string
  colorForeground: string
  colorCard: string
  colorCardForeground: string
  colorPopover: string
  colorPopoverForeground: string
  colorPrimary: string
  colorPrimaryForeground: string
  colorSecondary: string
  colorSecondaryForeground: string
  colorMuted: string
  colorMutedForeground: string
  colorAccent: string
  colorAccentForeground: string
  colorDestructive: string
  colorBorder: string
  colorInput: string
  colorRing: string
  radiusSm: string
  radiusMd: string
  radiusLg: string
  radiusXl: string
  fontHeading: string
}

export interface SharePointThemeLike {
  isInverted?: boolean
  palette?: {
    white?: string
    neutralPrimary?: string
    neutralSecondary?: string
    neutralLight?: string
    neutralLighter?: string
    neutralLighterAlt?: string
    themePrimary?: string
    themeDarkAlt?: string
    themeLighter?: string
    redDark?: string
  }
  semanticColors?: {
    bodyBackground?: string
    bodyText?: string
    bodyDivider?: string
    buttonBackground?: string
    buttonBackgroundHovered?: string
    buttonText?: string
    buttonTextHovered?: string
    disabledBackground?: string
    disabledText?: string
    errorText?: string
    focusBorder?: string
    inputBorder?: string
    primaryButtonText?: string
  }
  fonts?: {
    medium?: {
      fontFamily?: string
    }
  }
}

export function mapSharePointTheme(theme: SharePointThemeLike): SpfxUiThemeTokens {
  const palette = theme.palette ?? {}
  const semantic = theme.semanticColors ?? {}
  const background = requiredThemeValue(
    semantic.bodyBackground ?? palette.white,
    "semanticColors.bodyBackground or palette.white"
  )
  const foreground = requiredThemeValue(
    semantic.bodyText ?? palette.neutralPrimary,
    "semanticColors.bodyText or palette.neutralPrimary"
  )
  const primary = requiredThemeValue(palette.themePrimary, "palette.themePrimary")
  const primaryForeground = requiredThemeValue(
    semantic.primaryButtonText ?? palette.white,
    "semanticColors.primaryButtonText or palette.white"
  )
  const secondary = requiredThemeValue(
    semantic.buttonBackground ?? palette.neutralLighterAlt,
    "semanticColors.buttonBackground or palette.neutralLighterAlt"
  )
  const secondaryForeground = requiredThemeValue(
    semantic.buttonText ?? foreground,
    "semanticColors.buttonText or body text"
  )
  const muted = requiredThemeValue(
    semantic.disabledBackground ?? palette.neutralLighter,
    "semanticColors.disabledBackground or palette.neutralLighter"
  )
  const mutedForeground = requiredThemeValue(
    semantic.disabledText ?? palette.neutralSecondary,
    "semanticColors.disabledText or palette.neutralSecondary"
  )
  const accent = requiredThemeValue(
    semantic.buttonBackgroundHovered ?? palette.themeLighter,
    "semanticColors.buttonBackgroundHovered or palette.themeLighter"
  )
  const accentForeground = requiredThemeValue(
    semantic.buttonTextHovered ?? palette.themeDarkAlt ?? foreground,
    "semanticColors.buttonTextHovered, palette.themeDarkAlt, or body text"
  )
  const destructive = requiredThemeValue(
    semantic.errorText ?? palette.redDark,
    "semanticColors.errorText or palette.redDark"
  )
  const border = requiredThemeValue(
    semantic.bodyDivider ?? palette.neutralLight,
    "semanticColors.bodyDivider or palette.neutralLight"
  )
  const input = requiredThemeValue(semantic.inputBorder ?? border, "semanticColors.inputBorder or body divider")
  const ring = requiredThemeValue(semantic.focusBorder ?? primary, "semanticColors.focusBorder or palette.themePrimary")

  return {
    mode: theme.isInverted ? "dark" : "light",
    colorBackground: background,
    colorForeground: foreground,
    colorCard: background,
    colorCardForeground: foreground,
    colorPopover: background,
    colorPopoverForeground: foreground,
    colorPrimary: primary,
    colorPrimaryForeground: primaryForeground,
    colorSecondary: secondary,
    colorSecondaryForeground: secondaryForeground,
    colorMuted: muted,
    colorMutedForeground: mutedForeground,
    colorAccent: accent,
    colorAccentForeground: accentForeground,
    colorDestructive: destructive,
    colorBorder: border,
    colorInput: input,
    colorRing: ring,
    radiusSm: "0.25rem",
    radiusMd: "0.375rem",
    radiusLg: "0.5rem",
    radiusXl: "0.75rem",
    fontHeading: theme.fonts?.medium?.fontFamily?.trim() || '"Segoe UI", SegoeUI, sans-serif',
  }
}

function requiredThemeValue(value: string | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`SharePoint theme is missing ${label}`)
  return normalized
}
