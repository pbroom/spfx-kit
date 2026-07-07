import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { parseArgs, required } from '../packages/spfx-tools/src/lib/args.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { appSlugFromDir, cdnBasePathForSlug, standalonePackageName } from '../packages/spfx-tools/src/lib/spfx.mjs';

describe('parseArgs', () => {
  it('parses flag and value pairs', () => {
    expect(parseArgs(['--app', 'x', '--json', '--target', 'single'])).toEqual({
      app: 'x',
      json: true,
      target: 'single'
    });
  });

  it('treats trailing flags as booleans', () => {
    expect(parseArgs(['--force'])).toEqual({ force: true });
  });
});

describe('required', () => {
  it('throws with usage when a value is missing', () => {
    expect(() => required({ json: true }, 'app', 'usage text')).toThrow('Missing required --app');
    expect(required({ app: 'x' }, 'app', 'usage')).toBe('x');
  });
});

describe('spfx helpers', () => {
  it('derives slugs and package names from app dirs', () => {
    expect(appSlugFromDir('/tmp/apps/team-divider-spfx')).toBe('team-divider-spfx');
    expect(standalonePackageName('/tmp/apps/team-divider-spfx')).toBe('team-divider-spfx');
    expect(standalonePackageName('/tmp/apps/team-divider')).toBe('team-divider-spfx');
  });

  it('builds per-app CDN base paths', () => {
    expect(cdnBasePathForSlug('team-spfx')).toBe('https://cdn.example.com/spfx/team-spfx/');
    expect(cdnBasePathForSlug('team-spfx', 'https://cdn.contoso.com/base///')).toBe('https://cdn.contoso.com/base/team-spfx/');
  });
});
