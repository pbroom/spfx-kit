import { describe, expect, it } from 'vitest';
import { cdnPackageSelectionKey } from '../apps/lab/src/lib/packageMode';

describe('CDN package selection identity', () => {
  it('distinguishes web parts and components that belong to the same app', () => {
    const first = cdnPackageSelectionKey({ id: 'suite:first', appId: 'suite-spfx', componentId: 'component-one' });
    const second = cdnPackageSelectionKey({ id: 'suite:second', appId: 'suite-spfx', componentId: 'component-two' });

    expect(first).not.toBe(second);
  });

  it('is stable for the same selected web part', () => {
    const webPart = { id: 'suite:first', appId: 'suite-spfx' };

    expect(cdnPackageSelectionKey(webPart)).toBe(cdnPackageSelectionKey({ ...webPart }));
  });
});
