import { describe, expect, it } from 'vitest';
import {
  isSlugInput,
  middleTruncatePath,
  slugInputValue,
  slugify,
  sppkgFileNameFromAppId,
  titleFromSlug
} from '../apps/lab/src/lib/text';

describe('slugify', () => {
  it('normalizes titles into slugs', () => {
    expect(slugify('Team Dashboard!')).toBe('team-dashboard');
    expect(slugify('  ')).toBe('spfx-web-part');
  });

  it('caps length at 48 characters', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe('titleFromSlug', () => {
  it('drops the -spfx suffix and title-cases words', () => {
    expect(titleFromSlug('team-dashboard-spfx')).toBe('Team Dashboard');
  });
});

describe('sppkgFileNameFromAppId', () => {
  it('drops only a terminal -spfx suffix', () => {
    expect(sppkgFileNameFromAppId('better-list-spfx')).toBe('better-list.sppkg');
    expect(sppkgFileNameFromAppId('team-spfx-preview')).toBe('team-spfx-preview.sppkg');
  });

  it('provides a safe fallback for an empty app id', () => {
    expect(sppkgFileNameFromAppId('')).toBe('spfx-web-part.sppkg');
  });
});

describe('slugInputValue', () => {
  it('lowercases and collapses separators as the user types', () => {
    expect(slugInputValue('Team  App')).toBe('team-app');
    expect(slugInputValue('a--b')).toBe('a-b');
  });
});

describe('isSlugInput', () => {
  it('validates final slug values', () => {
    expect(isSlugInput('team-app')).toBe(true);
    expect(isSlugInput('-team')).toBe(false);
    expect(isSlugInput('')).toBe(false);
  });
});

describe('middleTruncatePath', () => {
  it('keeps short paths intact', () => {
    expect(middleTruncatePath('.spfx-kit/apps/hello-card-spfx')).toBe('.spfx-kit/apps/hello-card-spfx');
  });

  it('keeps the leaf segment when truncating long paths', () => {
    expect(middleTruncatePath('.spfx-kit/apps/user-management-portal-spfx', 38)).toBe('.spfx-kit…/user-management-portal-spfx');
  });

  it('prefers the leaf when the directory name exceeds the budget', () => {
    expect(middleTruncatePath('.spfx-kit/apps/user-management-portal-spfx', 29)).toBe('…/user-management-portal-spfx');
  });

  it('truncates an oversized leaf from the start of the leaf', () => {
    expect(middleTruncatePath('.spfx-kit/apps/extraordinarily-long-app-directory-name-spfx', 24)).toBe(
      '…/extraordinarily-long-a'
    );
  });

  it('does not exceed maxLength when the leaf-with-slash fills the budget', () => {
    const leaf = 'a'.repeat(41);
    const truncated = middleTruncatePath(`.spfx-kit/apps/${leaf}`, 42);
    expect(truncated.length).toBeLessThanOrEqual(42);
    expect(truncated.startsWith('…/')).toBe(true);
  });
});
