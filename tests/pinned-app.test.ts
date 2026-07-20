import { describe, expect, it, vi } from 'vitest';
import {
  PINNED_APP_STORAGE_KEY,
  persistPinnedAppId,
  readPinnedAppId,
  resolveInitialWebPartId,
  resolvePinnedAppId
} from '../apps/lab/src/lib/pinnedApp';

const webParts = [
  { appId: 'better-divider-spfx', id: 'better-divider-spfx:default', title: 'Better Divider' },
  { appId: 'better-list-spfx', id: 'better-list-spfx:default', title: 'Better List' },
  { appId: 'better-list-spfx', id: 'better-list-spfx:secondary', title: 'Better List Secondary' }
];

describe('pinned lab app', () => {
  it('loads the first web part from the pinned app', () => {
    expect(resolvePinnedAppId(webParts, 'better-list-spfx')).toBe('better-list-spfx');
    expect(resolveInitialWebPartId(webParts, 'better-list-spfx')).toBe('better-list-spfx:default');
  });

  it('falls back deterministically when the pin is empty, stale, or the registry is empty', () => {
    expect(resolvePinnedAppId(webParts, 'missing-app')).toBe('');
    expect(resolveInitialWebPartId(webParts, '')).toBe('better-divider-spfx:default');
    expect(resolveInitialWebPartId(webParts, 'missing-app')).toBe('better-divider-spfx:default');
    expect(resolveInitialWebPartId([], 'better-list-spfx')).toBe('');
  });

  it('reads, replaces, and removes the single persisted app id', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };

    persistPinnedAppId(storage, 'better-list-spfx');
    expect(readPinnedAppId(storage)).toBe('better-list-spfx');
    expect(values.get(PINNED_APP_STORAGE_KEY)).toBe('better-list-spfx');

    persistPinnedAppId(storage, 'better-text-spfx');
    expect(readPinnedAppId(storage)).toBe('better-text-spfx');
    expect(values.size).toBe(1);

    persistPinnedAppId(storage, '');
    expect(readPinnedAppId(storage)).toBe('');
    expect(values.size).toBe(0);
  });

  it('tolerates denied browser storage', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
      removeItem: vi.fn(() => {
        throw new Error('denied');
      })
    };

    expect(readPinnedAppId(storage)).toBe('');
    expect(() => persistPinnedAppId(storage, 'better-list-spfx')).not.toThrow();
    expect(() => persistPinnedAppId(storage, '')).not.toThrow();
  });
});
