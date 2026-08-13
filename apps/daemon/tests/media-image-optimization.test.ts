import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  analyzeZamloanLogoSafeZone,
  composeLayeredLoanPoster,
  finalizeGeneratedPng,
  overlayZamloanZReference,
  overlayZamloanLogo,
  optimizeLoanPosterPng,
  optimizeLosslessPng,
  renderImageWithLogoSafeZoneRetry,
} from '../src/media.js';

describe('generated image optimization', () => {
  it('keeps the deterministic Z behind the transparent model and programmatic copy', async () => {
    const background = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 24, g: 48, b: 96, alpha: 1 },
      },
    }).png().toBuffer();
    const zReference = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <rect width="200" height="100" fill="#ff0000"/>
      </svg>
    `);
    const foreground = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="180" height="260">
          <rect width="180" height="260" fill="#00ff00"/>
        </svg>
      `),
      left: 310,
      top: 170,
    }]).png().toBuffer();

    const composited = await composeLayeredLoanPoster(background, {
      zReference,
      foreground,
      headline: 'GET CASH',
      subtitle: 'Fast support through your phone',
      textAnchor: 'left',
    });
    const { data, info } = await sharp(composited)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [data[offset], data[offset + 1], data[offset + 2]];
    };

    expect(pixel(400, 300)).toEqual([0, 255, 0]);
    expect(pixel(250, 300)).not.toEqual([24, 48, 96]);
    expect(pixel(40, 560)).toEqual([24, 48, 96]);
  });

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

  it('mildly dims the real background beneath the logo and fades to the original edges', async () => {
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
    const redAt = (x: number) => data[(55 * info.width + x) * info.channels] ?? 0;
    const centerOffset = (55 * info.width + 175) * info.channels;

    expect(data[centerOffset]).toBeGreaterThan(190);
    expect(data[centerOffset + 1]).toBeGreaterThan(60);
    expect(redAt(175)).toBeLessThanOrEqual(redAt(115) - 4);
    expect(redAt(115)).toBeLessThan(redAt(35) - 4);
  });

  it('distinguishes a clean logo-safe band from title-like content', async () => {
    const clean = await sharp({
      create: {
        width: 1_000,
        height: 1_000,
        channels: 4,
        background: { r: 210, g: 54, b: 34, alpha: 1 },
      },
    }).png().toBuffer();
    const intruding = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="420" height="180">
            <rect x="20" y="45" width="330" height="34" fill="white"/>
            <rect x="20" y="96" width="270" height="34" fill="white"/>
          </svg>
        `),
        left: 30,
        top: 20,
      }])
      .png()
      .toBuffer();

    await expect(analyzeZamloanLogoSafeZone(clean)).resolves.toMatchObject({
      intrudes: false,
    });
    await expect(analyzeZamloanLogoSafeZone(intruding)).resolves.toMatchObject({
      intrudes: true,
    });
  });

  it('retries a provider render once when content enters the logo-safe band', async () => {
    const clean = await sharp({
      create: {
        width: 1_000,
        height: 1_000,
        channels: 4,
        background: { r: 210, g: 54, b: 34, alpha: 1 },
      },
    }).png().toBuffer();
    const intruding = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="420" height="180">
            <rect x="20" y="45" width="330" height="34" fill="white"/>
            <rect x="20" y="96" width="270" height="34" fill="white"/>
          </svg>
        `),
        left: 30,
        top: 20,
      }])
      .png()
      .toBuffer();
    const prompts: string[] = [];

    const rendered = await renderImageWithLogoSafeZoneRetry(
      'original prompt',
      async (prompt) => {
        prompts.push(prompt);
        return { bytes: prompts.length === 1 ? intruding : clean };
      },
      { enabled: true, anchor: 'left' },
    );

    expect(rendered.attempts).toBe(2);
    expect(rendered.safeZone.intrudes).toBe(false);
    expect(rendered.result.bytes).toBe(clean);
    expect(prompts[1]).toContain('CRITICAL LOGO SAFE-ZONE RETRY');
    expect(prompts[1]).toContain('headline below 25% of the canvas height');
  });

  it('composites the supplied Z silhouette exactly instead of asking the model to redraw it', async () => {
    const poster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).png().toBuffer();
    const zReference = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <rect width="60" height="100" fill="#d6502e"/>
      </svg>
    `);

    const composited = await overlayZamloanZReference(poster, zReference);
    const { data, info } = await sharp(composited)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const inside = (250 * info.width + 220) * info.channels;
    const transparentGap = (250 * info.width + 500) * info.channels;

    expect(data[inside + 1]).toBeLessThan(250);
    expect(data[transparentGap]).toBe(255);
    expect(data[transparentGap + 1]).toBe(255);
    expect(data[transparentGap + 2]).toBe(255);
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
