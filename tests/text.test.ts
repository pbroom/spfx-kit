import { describe, expect, it } from 'vitest';
import { isSlugInput, slugInputValue, slugify, titleFromSlug } from '../apps/lab/src/lib/text';

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
