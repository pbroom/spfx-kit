import { describe, expect, it } from 'vitest';
import {
  normalizeSpfxSlug,
  sanitizeAppName,
  sanitizeOptionalRef,
  sanitizeRequiredText,
  sanitizeSlug,
  sanitizeWebPartName
} from '../apps/lab/server/sanitize';

describe('sanitizeSlug', () => {
  it('accepts lowercase slugs', () => {
    expect(sanitizeSlug('team-dashboard-spfx')).toBe('team-dashboard-spfx');
  });

  it('rejects path traversal and shell metacharacters', () => {
    expect(() => sanitizeSlug('../etc')).toThrow();
    expect(() => sanitizeSlug('app;rm -rf /')).toThrow();
    expect(() => sanitizeSlug('App')).toThrow();
    expect(() => sanitizeSlug('')).toThrow();
  });
});

describe('sanitizeAppName', () => {
  it('trims and accepts valid names', () => {
    expect(sanitizeAppName('  team-app ')).toBe('team-app');
  });

  it('rejects invalid names', () => {
    expect(() => sanitizeAppName('-leading-hyphen')).toThrow();
    expect(() => sanitizeAppName('UPPER')).toThrow();
  });
});

describe('normalizeSpfxSlug', () => {
  it('appends -spfx only when missing', () => {
    expect(normalizeSpfxSlug('team')).toBe('team-spfx');
    expect(normalizeSpfxSlug('team-spfx')).toBe('team-spfx');
  });
});

describe('sanitizeRequiredText', () => {
  it('rejects empty and oversized values', () => {
    expect(() => sanitizeRequiredText('', 'Required.')).toThrow('Required.');
    expect(() => sanitizeRequiredText('x'.repeat(2049), 'Required.')).toThrow('too long');
    expect(sanitizeRequiredText(' ok ', 'Required.')).toBe('ok');
  });
});

describe('sanitizeOptionalRef', () => {
  it('allows git ref characters and empty values', () => {
    expect(sanitizeOptionalRef('feature/topic-1')).toBe('feature/topic-1');
    expect(sanitizeOptionalRef('')).toBe('');
    expect(sanitizeOptionalRef(undefined)).toBe('');
  });

  it('rejects shell metacharacters', () => {
    expect(() => sanitizeOptionalRef('main; rm -rf /')).toThrow();
    expect(() => sanitizeOptionalRef('$(evil)')).toThrow();
  });
});

describe('sanitizeWebPartName', () => {
  it('accepts pascal and spaced names', () => {
    expect(sanitizeWebPartName('TeamDivider')).toBe('TeamDivider');
    expect(sanitizeWebPartName('Team Divider 2')).toBe('Team Divider 2');
  });

  it('rejects names not starting with a letter', () => {
    expect(() => sanitizeWebPartName('1Team')).toThrow();
    expect(() => sanitizeWebPartName('<script>')).toThrow();
  });
});
