import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  optimizeLoanPosterPng,
  optimizeLosslessPng,
} from '../src/media.js';

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

  it('reduces direct loan posters to one quarter of their pixel area', async () => {
    const input = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();

    const optimized = await optimizeLoanPosterPng(input);
    const metadata = await sharp(optimized.bytes).metadata();

    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(300);
    expect(optimized.pixelScale).toBe(0.5);
  });
});
