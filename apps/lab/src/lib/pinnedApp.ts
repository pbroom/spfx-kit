import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import { slugify } from './text';

export const PINNED_APP_STORAGE_KEY = 'spfx-kit.lab.pinned-app.v1';

type PinnableWebPart = Pick<LabWebPart, 'appId' | 'id' | 'title'>;
type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'removeItem' | 'setItem'>;

export function getLabAppId(webPart: PinnableWebPart): string {
  return webPart.appId || slugify(webPart.title || webPart.id);
}

export function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch (_error) {
    return undefined;
  }
}

export function readPinnedAppId(storage: ReadableStorage | undefined): string {
  if (!storage) {
    return '';
  }
  try {
    return storage.getItem(PINNED_APP_STORAGE_KEY)?.trim() || '';
  } catch (_error) {
    return '';
  }
}

export function persistPinnedAppId(storage: WritableStorage | undefined, appId: string): void {
  if (!storage) {
    return;
  }
  try {
    if (appId) {
      storage.setItem(PINNED_APP_STORAGE_KEY, appId);
    } else {
      storage.removeItem(PINNED_APP_STORAGE_KEY);
    }
  } catch (_error) {
    // Storage can be unavailable without disabling the in-session pin state.
  }
}

export function resolvePinnedAppId(webParts: readonly PinnableWebPart[], pinnedAppId: string): string {
  if (!pinnedAppId) {
    return '';
  }
  return webParts.some((webPart) => getLabAppId(webPart) === pinnedAppId) ? pinnedAppId : '';
}

export function resolveInitialWebPartId(webParts: readonly PinnableWebPart[], pinnedAppId: string): string {
  return webParts.find((webPart) => getLabAppId(webPart) === pinnedAppId)?.id || webParts[0]?.id || '';
}
