import {
  createSpfxUiHost as createProfileHost,
  type CreateSpfxUiHostOptions as InternalCreateSpfxUiHostOptions
} from '../normalized/src/lib/ui-root';

export {
  SPFX_UI_PORTAL_ATTRIBUTE,
  SPFX_UI_PROFILE_ATTRIBUTE,
  SPFX_UI_ROOT_ATTRIBUTE,
  SPFX_UI_SCOPE_ATTRIBUTE,
  SPFX_UI_THEME_ATTRIBUTE,
  SpfxUiHostProvider,
  mapSharePointTheme,
  useSpfxUiDerivedId,
  useSpfxUiHost,
  useSpfxUiId,
  useSpfxUiPortalHost,
  useSpfxUiPortalId,
  useSpfxUiRequiredId
} from '../normalized/src/lib/ui-root';
export type {
  SharePointThemeLike,
  SpfxUiHost,
  SpfxUiHostProviderProps,
  SpfxUiThemeMode,
  SpfxUiThemeTokens
} from '../normalized/src/lib/ui-root';

export const SPFX_UI_PROFILE_ID = 'spfx-react17-base-nova-v1';
export const SPFX_UI_SCOPE_VALUE = 'skui-d0cb51634265e868';

export type CreateSpfxUiHostOptions = Omit<InternalCreateSpfxUiHostOptions, 'profileId' | 'scopeValue'>;

/** Creates a host bound to the exact component and stylesheet generation shipped by this package. */
export function createSpfxUiHost(options: CreateSpfxUiHostOptions) {
  return createProfileHost({
    ...options,
    profileId: SPFX_UI_PROFILE_ID,
    scopeValue: SPFX_UI_SCOPE_VALUE
  });
}
