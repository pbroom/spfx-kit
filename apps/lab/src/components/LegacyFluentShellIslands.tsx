import * as React from 'react';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import type { LabThemeMode } from '@spfx-kit/spfx-lab-runtime';

interface LegacyFluentShellIslandsProps {
  children: React.ReactNode;
  themeMode: LabThemeMode;
}

/**
 * Temporary boundary for administrative surfaces that have not moved to the
 * owned React 17 UI profile yet. Keeping this provider local prevents its
 * tokens and reset from owning the Lab chrome or managed preview surface.
 */
export function LegacyFluentShellIslands({ children, themeMode }: LegacyFluentShellIslandsProps): JSX.Element {
  return <FluentProvider theme={themeMode === 'dark' ? webDarkTheme : webLightTheme}>{children}</FluentProvider>;
}
