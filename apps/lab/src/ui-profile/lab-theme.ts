import type { LabThemeContext, LabThemeMode } from '@spfx-kit/spfx-lab-runtime';
import type { SpfxUiThemeTokens } from '@spfx-kit/ui-profile';

export function createLabUiThemeTokens(mode: LabThemeMode, theme: LabThemeContext): SpfxUiThemeTokens {
  const dark = mode === 'dark';

  return {
    mode: dark ? 'dark' : 'light',
    colorBackground: theme.surface,
    colorForeground: theme.foreground,
    colorCard: theme.surface,
    colorCardForeground: theme.foreground,
    colorPopover: theme.surface,
    colorPopoverForeground: theme.foreground,
    colorPrimary: '#0f6cbd',
    colorPrimaryForeground: '#ffffff',
    colorSecondary: dark ? '#333333' : '#f5f5f5',
    colorSecondaryForeground: theme.foreground,
    colorMuted: dark ? '#333333' : '#f0f0f0',
    colorMutedForeground: theme.mutedForeground,
    colorAccent: dark ? '#3d3d3d' : '#eef6ff',
    colorAccentForeground: dark ? '#ffffff' : '#0f548c',
    colorDestructive: dark ? '#ff99a4' : '#c50f1f',
    colorBorder: theme.border,
    colorInput: dark ? '#707070' : '#8a8886',
    colorRing: '#0f6cbd',
    radiusSm: '0.25rem',
    radiusMd: '0.375rem',
    radiusLg: '0.5rem',
    radiusXl: '0.75rem',
    fontHeading: '"Segoe UI", SegoeUI, sans-serif'
  };
}
