import { describe, expect, it } from 'vitest';
import {
  formatLogoColor,
  hsvToRgba,
  parseLogoColor,
  rgbaToHsv,
} from '../../src/components/logo-color';

describe('logo color helpers', () => {
  it('normalizes short, opaque, and alpha hex colors', () => {
    expect(formatLogoColor(parseLogoColor('#1af'))).toBe('#11AAFF');
    expect(formatLogoColor(parseLogoColor('336699'))).toBe('#336699');
    expect(formatLogoColor(parseLogoColor('#33669980'))).toBe('#33669980');
  });

  it('round-trips RGB colors through HSV without losing alpha', () => {
    const source = parseLogoColor('#1F4E5B80');
    const roundTrip = hsvToRgba(rgbaToHsv(source));

    expect(formatLogoColor(roundTrip)).toBe('#1F4E5B80');
  });

  it('falls back to opaque black for invalid colors', () => {
    expect(parseLogoColor('not-a-color')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});
