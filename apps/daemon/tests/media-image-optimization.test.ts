import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { optimizeLosslessPng } from '../src/media.js';

describe('generated image optimization', () => {
  it('losslessly optimizes PNG output before it is persisted', async () => {
    const rawPixels = Buffer.alloc(128 * 128 * 4);
    for (let offset = 0; offset < rawPixels.length; offset += 4) {
      rawPixels[offset] = (offset / 4) % 255;
      rawPixels[offset + 1] = 96;
      rawPixels[offset + 2] = 220;
      rawPixels[offset + 3] = 255;
    }
    const input = await sharp(rawPixels, {
      raw: { width: 128, height: 128, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeLosslessPng(input);
    const decodedInput = await sharp(input).raw().toBuffer();
    const decodedOutput = await sharp(optimized.bytes).raw().toBuffer();

    expect(optimized.optimized).toBe(true);
    expect(optimized.bytes.length).toBeLessThan(input.length);
    expect(decodedOutput.equals(decodedInput)).toBe(true);
  });
});
