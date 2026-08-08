import { describe, expect, it } from 'vitest';
import {
  clampPercentage,
  clampUnit,
  hexToHsl,
  hexToHsv,
  hslToHex,
  hsvToHex,
  normalizeHexColor,
  normalizeHue,
  parseHexColor
} from '../apps/lab/src/components/colorFieldMath';

describe('ColorField color math', () => {
  it('normalizes accepted hex input to lowercase expanded values without accepting partial text', () => {
    expect(parseHexColor(' ABC ')).toBe('#aabbcc');
    expect(parseHexColor('#A1B2C3')).toBe('#a1b2c3');
    expect(parseHexColor('#12')).toBeNull();
    expect(parseHexColor('#xyz')).toBeNull();
    expect(normalizeHexColor('not-a-color')).toBe('#8a8886');
  });

  it('round-trips RGB primaries and clamps pointer, percentage, and hue channels', () => {
    expect(hsvToHex(hexToHsv('#ff0000'))).toBe('#ff0000');
    expect(hsvToHex(hexToHsv('#00ff00'))).toBe('#00ff00');
    expect(hslToHex(hexToHsl('#0000ff'))).toBe('#0000ff');
    expect(hslToHex({ h: 0, s: 0, l: 50 })).toBe('#808080');
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampPercentage(105.4)).toBe(100);
    expect(normalizeHue(-1)).toBe(359);
    expect(normalizeHue(361)).toBe(1);
  });
});
