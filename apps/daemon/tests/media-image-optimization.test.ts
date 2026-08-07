import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  finalizeGeneratedPng,
  overlayZamloanLogo,
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

  it('preserves the provider resolution for direct loan posters', async () => {
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

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(optimized.pixelScale).toBe(1);
  });

  it('composites the Zamloan logo with a unified backdrop without changing poster dimensions', async () => {
    const poster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();
    const logo = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="92" fill="white"/>
      </svg>
    `);

    const composited = await overlayZamloanLogo(poster, logo);
    const metadata = await sharp(composited).metadata();
    const pixels = await sharp(composited).raw().toBuffer();

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(pixels.equals(await sharp(poster).raw().toBuffer())).toBe(false);
  });

  it('uses one continuous backdrop instead of separate shadows around each glyph', async () => {
    const poster = await sharp({
      create: {
        width: 1_000,
        height: 500,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();
    const sparseLogo = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect x="0" y="20" width="40" height="52" fill="white"/>
        <rect x="280" y="20" width="40" height="52" fill="white"/>
      </svg>
    `);

    const composited = await overlayZamloanLogo(poster, sparseLogo);
    const { data, info } = await sharp(composited)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centerOffset = (55 * info.width + 175) * info.channels;

    expect(data[centerOffset]).toBeLessThan(205);
    expect(data[centerOffset + 1]).toBeLessThan(68);
  });

  it('places a right-anchored logo in the same right-side title column', async () => {
    const poster = await sharp({
      create: {
        width: 1_000,
        height: 500,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();
    const logo = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="92" fill="white"/>
      </svg>
    `);

    const composited = await overlayZamloanLogo(poster, logo, { anchor: 'right' });
    const { data, info } = await sharp(composited)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rightLogoOffset = (50 * info.width + 560) * info.channels;
    const oldLeftLogoOffset = (50 * info.width + 80) * info.channels;

    expect(data[rightLogoOffset]).toBeGreaterThan(245);
    expect(data[rightLogoOffset + 1]).toBeGreaterThan(245);
    expect(data[oldLeftLogoOffset]).toBe(220);
    expect(data[oldLeftLogoOffset + 1]).toBe(72);
  });

  it('composites the logo without reducing the provider resolution', async () => {
    const poster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();
    const logo = await sharp({
      create: {
        width: 320,
        height: 92,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).png().toBuffer();

    const finalized = await finalizeGeneratedPng(poster, {
      loanPosterOutput: true,
      overlayLogo: logo,
    });
    const metadata = await sharp(finalized).metadata();
    const { data, info } = await sharp(finalized)
      .raw()
      .toBuffer({ resolveWithObject: true });
    let whitePixelCount = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      if (red > 250 && green > 250 && blue > 250) {
        whitePixelCount += 1;
      }
    }

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(whitePixelCount).toBeGreaterThan(6_500);
  });
});
