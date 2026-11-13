import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  analyzeAntiFraudDiagonalSplit,
  analyzeAntiFraudLowerRightContinuity,
  analyzeZamloanLogoSafeZone,
  composeLayeredLoanPoster,
  finalizeGeneratedPng,
  overlayZamloanZReference,
  overlayZamloanLogo,
  prepareLayeredForeground,
  optimizeLoanPosterPng,
  optimizeLosslessPng,
  renderImageWithLogoSafeZoneRetry,
  renderImageWithAntiFraudSafeZoneRetry,
} from '../src/media.js';

const adaptiveTaglineLogo = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100">
    <rect x="24" y="12" width="126" height="38" fill="#d35430"/>
    <rect x="170" y="12" width="126" height="38" fill="#46a93c"/>
    <rect x="64" y="72" width="192" height="16" fill="white"/>
  </svg>
`);

async function posterPixel(input: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(input)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
}

describe('generated image optimization', () => {
  it('removes edge-connected chroma green while preserving enclosed green details', async () => {
    const matteForeground = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="70">
          <rect width="60" height="70" fill="#0033ff"/>
          <rect x="18" y="22" width="24" height="34" fill="#ffffff"/>
          <rect x="25" y="34" width="10" height="10" fill="#00ff00"/>
        </svg>
      `),
      left: 20,
      top: 15,
    }]).png().toBuffer();

    const prepared = await prepareLayeredForeground(matteForeground, 100, 100);
    const { data, info } = await sharp(prepared)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    };

    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(25, 25)).toEqual([0, 51, 255, 255]);
    expect(pixel(50, 54)).toEqual([0, 255, 0, 255]);
  });

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

  it('renders the Zamloan tagline black on a light logo-safe background', async () => {
    const poster = await sharp({
      create: {
        width: 1_000,
        height: 500,
        channels: 4,
        background: { r: 238, g: 232, b: 245, alpha: 1 },
      },
    }).png().toBuffer();

    const composited = await overlayZamloanLogo(poster, adaptiveTaglineLogo);

    expect(await posterPixel(composited, 175, 88)).toEqual([0, 0, 0]);
    expect(await posterPixel(composited, 95, 50)).not.toEqual([0, 0, 0]);
  });

  it('keeps the Zamloan tagline white on a dark logo-safe background', async () => {
    const poster = await sharp({
      create: {
        width: 1_000,
        height: 500,
        channels: 4,
        background: { r: 32, g: 28, b: 44, alpha: 1 },
      },
    }).png().toBuffer();

    const composited = await overlayZamloanLogo(poster, adaptiveTaglineLogo);

    expect(await posterPixel(composited, 175, 88)).toEqual([255, 255, 255]);
  });

  it('chooses tagline contrast from the local logo area on a mixed background', async () => {
    const poster = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500">
        <defs>
          <linearGradient id="mixed" x1="0" x2="1">
            <stop offset="0%" stop-color="#f5f0fa"/>
            <stop offset="42%" stop-color="#f5f0fa"/>
            <stop offset="58%" stop-color="#201c2c"/>
            <stop offset="100%" stop-color="#201c2c"/>
          </linearGradient>
        </defs>
        <rect width="1000" height="500" fill="url(#mixed)"/>
      </svg>
    `)).png().toBuffer();

    const leftLogo = await overlayZamloanLogo(poster, adaptiveTaglineLogo);
    const rightLogo = await overlayZamloanLogo(poster, adaptiveTaglineLogo, { anchor: 'right' });

    expect(await posterPixel(leftLogo, 175, 88)).toEqual([0, 0, 0]);
    expect(await posterPixel(rightLogo, 650, 88)).toEqual([255, 255, 255]);
  });

  it('preserves poster pixels between separated logo glyphs', async () => {
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
    const centerRgb = [
      data[centerOffset] ?? 0,
      data[centerOffset + 1] ?? 0,
      data[centerOffset + 2] ?? 0,
    ];

    expect(centerRgb).toEqual([220, 72, 30]);
  });

  it('does not dim transparent areas within the logo bounds', async () => {
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
    const rgbAt = (x: number) => {
      const offset = (55 * info.width + x) * info.channels;
      return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
    };

    expect(rgbAt(35)).toEqual([220, 72, 30]);
    expect(rgbAt(115)).toEqual([220, 72, 30]);
    expect(rgbAt(175)).toEqual([220, 72, 30]);
  });

  it('does not desaturate the background beneath transparent logo areas', async () => {
    const poster = await sharp({
      create: {
        width: 1_000,
        height: 500,
        channels: 4,
        background: { r: 38, g: 190, b: 56, alpha: 1 },
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
    const rgbAt = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
    };
    const originalEdge = rgbAt(0, 55);
    const transparentCenter = rgbAt(175, 55);

    expect(originalEdge).toEqual([38, 190, 56]);
    expect(transparentCenter).toEqual(originalEdge);
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

  it('accepts a calm pale anti-fraud logo band without retrying', async () => {
    const clean = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1067">
        <rect width="800" height="1067" fill="#244c35"/>
        <polygon points="0,0 800,0 800,85 0,1067" fill="#eee7d8"/>
      </svg>
    `)).png().toBuffer();
    const prompts: string[] = [];

    const rendered = await renderImageWithAntiFraudSafeZoneRetry(
      'original prompt',
      async (prompt) => {
        prompts.push(prompt);
        return { bytes: clean };
      },
      { anchor: 'left' },
    );

    expect(rendered.attempts).toBe(1);
    expect(rendered.logoSafeZone.intrudes).toBe(false);
    expect(prompts).toEqual(['original prompt']);
  });

  it('keeps a tall brand logo inside the portrait header safe area', async () => {
    const poster = await sharp({
      create: {
        width: 800,
        height: 1_067,
        channels: 4,
        background: { r: 238, g: 231, b: 216, alpha: 1 },
      },
    }).png().toBuffer();
    const tallLogo = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 501">
        <rect width="1024" height="501" fill="#24263f"/>
      </svg>
    `);

    const composited = await overlayZamloanLogo(poster, tallLogo);
    const { data, info } = await sharp(composited)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bottom = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (
          (data[offset] ?? 0) < 80
          && (data[offset + 1] ?? 0) < 80
          && (data[offset + 2] ?? 0) < 100
        ) {
          bottom = y;
        }
      }
    }

    expect(bottom).toBeGreaterThan(0);
    expect(bottom / info.height).toBeLessThanOrEqual(0.11);
  });

  it('retries when a portrait anti-fraud headline enters the logo clearance band', async () => {
    const clean = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1067">
        <rect width="800" height="1067" fill="#244c35"/>
        <polygon points="0,0 800,0 800,85 0,1067" fill="#eee7d8"/>
      </svg>
    `)).png().toBuffer();
    const intruding = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="90">
            <rect x="0" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="40" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="80" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="120" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="160" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="200" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="240" y="0" width="24" height="90" fill="#173c2a"/>
            <rect x="276" y="0" width="24" height="90" fill="#173c2a"/>
          </svg>
        `),
        left: 44,
        top: 148,
      }])
      .png()
      .toBuffer();
    const prompts: string[] = [];

    const rendered = await renderImageWithAntiFraudSafeZoneRetry(
      'original prompt',
      async (prompt) => {
        prompts.push(prompt);
        return { bytes: prompts.length === 1 ? intruding : clean };
      },
      { anchor: 'left' },
    );

    expect(rendered.attempts).toBe(2);
    expect(rendered.logoSafeZone.intrudes).toBe(false);
    expect(rendered.result.bytes).toBe(clean);
    expect(prompts[1]).toContain('2% to 17% of the canvas height');
    expect(prompts[1]).toContain('headline top edge at 19% to 20%');
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

  it('detects a large generated surface in the anti-fraud lower-right region', async () => {
    const clean = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <defs>
          <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#9bc7ea"/>
            <stop offset="100%" stop-color="#6d9fc8"/>
          </linearGradient>
        </defs>
        <rect width="900" height="1200" fill="url(#background)"/>
      </svg>
    `)).png().toBuffer();
    const blocked = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="360">
            <rect width="300" height="360" rx="28" fill="#b8ddfa"/>
          </svg>
        `),
        left: 580,
        top: 830,
      }])
      .png()
      .toBuffer();

    await expect(analyzeAntiFraudLowerRightContinuity(clean)).resolves.toMatchObject({
      intrudes: false,
    });
    await expect(analyzeAntiFraudLowerRightContinuity(blocked)).resolves.toMatchObject({
      intrudes: true,
    });
  });

  it('checks both endpoints of the fixed anti-fraud diagonal split', async () => {
    const expected = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="900" height="1200" fill="#6f2937"/>
        <polygon points="0,0 900,0 900,96 0,1200" fill="#f1dfc3"/>
      </svg>
    `)).png().toBuffer();
    const shifted = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="900" height="1200" fill="#6f2937"/>
        <polygon points="0,0 900,0 900,1 0,1080" fill="#f1dfc3"/>
      </svg>
    `)).png().toBuffer();

    await expect(analyzeAntiFraudDiagonalSplit(expected)).resolves.toMatchObject({
      intrudes: false,
      leftEndpointRatio: expect.closeTo(1, 1),
      rightEndpointRatio: expect.closeTo(0.08, 1),
    });
    await expect(analyzeAntiFraudDiagonalSplit(shifted)).resolves.toMatchObject({
      intrudes: true,
    });
  });

  it('retries once when the anti-fraud diagonal misses its fixed endpoints', async () => {
    const expected = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="900" height="1200" fill="#174a82"/>
        <polygon points="0,0 900,0 900,96 0,1200" fill="#e5edf3"/>
      </svg>
    `)).png().toBuffer();
    const shifted = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="900" height="1200" fill="#174a82"/>
        <polygon points="0,0 900,0 900,1 0,1080" fill="#e5edf3"/>
      </svg>
    `)).png().toBuffer();
    const prompts: string[] = [];

    const rendered = await renderImageWithAntiFraudSafeZoneRetry(
      'original prompt',
      async (prompt) => {
        prompts.push(prompt);
        return { bytes: prompts.length === 1 ? shifted : expected };
      },
      { anchor: 'left' },
    );

    expect(rendered.attempts).toBe(2);
    expect(rendered.diagonal.intrudes).toBe(false);
    expect(rendered.result.bytes).toBe(expected);
    expect(prompts[1]).toContain('CRITICAL FIXED-DIAGONAL RETRY');
    expect(prompts[1]).toContain('bottom-left corner (0%, 100%)');
    expect(prompts[1]).toContain('right edge at (100%, 8%)');
  });

  it('retries once when the anti-fraud lower-right background is discontinuous', async () => {
    const clean = await sharp({
      create: {
        width: 900,
        height: 1200,
        channels: 4,
        background: { r: 145, g: 190, b: 224, alpha: 1 },
      },
    }).png().toBuffer();
    const blocked = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="360">
            <rect width="300" height="360" rx="28" fill="#d1eafa"/>
          </svg>
        `),
        left: 580,
        top: 830,
      }])
      .png()
      .toBuffer();
    const prompts: string[] = [];

    const rendered = await renderImageWithAntiFraudSafeZoneRetry(
      'original prompt',
      async (prompt) => {
        prompts.push(prompt);
        return { bytes: prompts.length === 1 ? blocked : clean };
      },
      { anchor: 'left' },
    );

    expect(rendered.attempts).toBe(2);
    expect(rendered.lowerRight.intrudes).toBe(false);
    expect(rendered.result.bytes).toBe(clean);
    expect(prompts[1]).toContain('CRITICAL LOWER-RIGHT CONTINUITY RETRY');
    expect(prompts[1]).not.toMatch(/notification|message card|placeholder|backing plate/i);
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
