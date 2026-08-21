import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { vectorizeLogoSource } from '../src/logo-vectorize.js';

describe('faithful logo vectorization', () => {
  it('preserves source composition as true vector geometry and passes render-back validation', async () => {
    const sourceSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#F4F1EA"/>
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0B3B12"/><stop offset="1" stop-color="#167029"/></linearGradient></defs>
        <path fill="url(#g)" d="M44 180 91 66h18l52 114h-27l-13-31H75l-12 31H44Zm40-53h28L98 91 84 127Z"/>
        <circle cx="184" cy="92" r="13" fill="#F5C93B"/>
      </svg>
    `);
    const sourcePng = await sharp(sourceSvg).png().toBuffer();

    const result = await vectorizeLogoSource(sourcePng, { brandName: 'Northstar' });
    const primary = result.files.get('logo.svg')?.toString('utf8') ?? '';

    expect(result.similarityScore).toBeGreaterThanOrEqual(0.94);
    expect(primary).toContain('data-vectorization="faithful"');
    expect(primary).toContain('viewBox="0 0 256 256"');
    expect(primary).toContain('<path');
    expect(primary).not.toMatch(/<image|data:image|base64/iu);
    expect(result.files.get('logo-dark.svg')).toBeTruthy();
    expect(result.files.get('logo-mono.svg')).toBeTruthy();
    expect(result.files.get('favicon.ico')?.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(result.files.get('apple-touch-icon.png')).toBeTruthy();
    expect(result.files.get('og-image.png')).toBeTruthy();
    expect(result.files.get('BRAND.md')?.toString('utf8')).toContain('faithful vectorization');
  });
});
