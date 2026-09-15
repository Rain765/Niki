import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const layoutFixture = vi.hoisted(() => ({ invalid: false, unavailable: false }));
vi.mock('../src/poster-hand-detector.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/poster-hand-detector.js')>(),
  createPosterHandDetector: async () => async () => {
    if (layoutFixture.unavailable) throw Object.assign(new Error('local detector timeout'), { code: 'poster_detector_unavailable' });
    return ({
    hands: (layoutFixture.invalid ? [] : [[0.30, 0.48, 0.45, 0.60], [0.64, 0.62, 0.76, 0.718]]).map(([left, top, right, bottom]) => ({
      points: Array.from({ length: 21 }, (_, index) => ({
        x: left! + (right! - left!) * (index % 3) / 2,
        y: top! + (bottom! - top!) * Math.floor(index / 3) / 6,
        confidence: 0.99,
      })),
    })),
    phones: [],
  }); },
}));

describe('media brand overlay inputs', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let projectDir: string;
  let generatedPoster: Buffer;
  const realFetch = globalThis.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    layoutFixture.invalid = false;
    layoutFixture.unavailable = false;
    root = await mkdtemp(path.join(tmpdir(), 'od-media-overlay-logo-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectDir = path.join(projectsRoot, 'poster-project');
    await mkdir(projectDir, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    generatedPoster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 220, g: 72, b: 30, alpha: 1 },
      },
    }).png().toBuffer();
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalOpenAIKey == null) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
    if (originalMediaConfigDir == null) {
      delete process.env.OD_MEDIA_CONFIG_DIR;
    } else {
      process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    }
    if (originalDataDir == null) {
      delete process.env.OD_DATA_DIR;
    } else {
      process.env.OD_DATA_DIR = originalDataDir;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('retains layout-rejected bases separately, without publishing a false success or overwriting drafts', async () => {
    layoutFixture.invalid = true;
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(generateMedia({
        projectRoot, projectsRoot, projectId: 'poster-project',
        surface: 'image', model: 'gpt-image-2', prompt: 'Anti-fraud poster',
        aspect: '3:4', loanPosterOutput: true,
        posterHeadline: 'Prevent Fraud', posterSubtitle: 'Trust Only Official Customer Service',
        posterTextAnchor: 'right',
        posterCopyStyle: 'anti-fraud-message', output: 'poster.png',
      })).rejects.toThrow('base image saved as .poster-layout-drafts/');
    }
    // A new generation gets fresh candidates, even with identical output/prompt.
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await expect(readFile(path.join(projectDir, 'poster.png'))).rejects.toThrow();
    const draftRoot = path.join(projectDir, '.poster-layout-drafts');
    const drafts = await readdir(draftRoot);
    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      expect(await readFile(path.join(draftRoot, draft, 'base.png'))).toEqual(generatedPoster);
      const metadata = JSON.parse(await readFile(path.join(draftRoot, draft, 'layout.json'), 'utf8'));
      expect(metadata).toMatchObject({ output: 'poster.png', width: 800, height: 600 });
      expect(metadata.reason).toContain('exactly two');
    }
  });

  it('accepts an SVG logo and exact raster Z overlay without provider redrawing', async () => {
    const referenceName = 'loan-poster-z-reference.png';
    const logoName = 'zamloan-logo.svg';
    const zReference = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <rect x="50" width="100" height="100" fill="white"/>
      </svg>
    `)).png().toBuffer();
    await writeFile(path.join(projectDir, referenceName), zReference);
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="92" rx="12" fill="white"/>
      </svg>
    `);

    let providerRequestBody: unknown;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      providerRequestBody = init?.body;
      return new Response(
        JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A premium Zamloan poster',
      aspect: '16:9',
      overlayZ: referenceName,
      overlayLogo: logoName,
      overlayLogoAnchor: 'right',
      loanPosterOutput: true,
      output: 'poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(providerRequestBody))).not.toHaveProperty('image');
    expect(result.name).toBe('poster.png');
    const output = await readFile(path.join(projectDir, result.name));
    expect(await sharp(output).metadata()).toMatchObject({
      width: 800,
      height: 600,
      format: 'png',
    });
    expect(
      (await sharp(output).raw().toBuffer()).equals(
        await sharp(generatedPoster).raw().toBuffer(),
      ),
    ).toBe(false);
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rightLogoOffset = (50 * info.width + 450) * info.channels;
    const oldLeftLogoOffset = (50 * info.width + 60) * info.channels;
    expect(data[rightLogoOffset]).toBeGreaterThan(245);
    expect(data[rightLogoOffset + 1]).toBeGreaterThan(245);
    expect(data[oldLeftLogoOffset]).toBe(220);
    expect(data[oldLeftLogoOffset + 1]).toBe(72);

    const zOverlayOffset = (300 * info.width + 400) * info.channels;
    expect(data[zOverlayOffset]).not.toBe(220);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'An invalid SVG provider reference',
      image: logoName,
      output: 'invalid.png',
    })).rejects.toThrow('--image has unsupported extension ".svg"');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'An invalid overlay anchor',
      overlayLogo: logoName,
      overlayLogoAnchor: 'center' as 'left',
      output: 'invalid-anchor.png',
    })).rejects.toThrow('unsupported overlay logo anchor');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'mtv47ei2-zamcash-logo.svg',
    'mtv47ei2-zammoney-logo.svg',
    'mtv47ei2-fastako-logo.svg',
    'mtv47ei2-yangaloan-logo.svg',
  ])('preserves the source colors of the %s brand mark', async (logoName) => {
    generatedPoster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 245, g: 240, b: 232, alpha: 1 },
      },
    }).png().toBuffer();
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="58" fill="#e4572e"/>
        <rect y="58" width="320" height="34" fill="#18a957"/>
      </svg>
    `);
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A loan poster with a reserved logo-safe area',
      aspect: '4:3',
      overlayLogo: logoName,
      loanPosterOutput: true,
      output: `${path.parse(logoName).name}-poster.png`,
    });

    const output = await readFile(path.join(projectDir, result.name));
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const preservedGreenOffset = (77 * info.width + 140) * info.channels;
    expect([
      data[preservedGreenOffset],
      data[preservedGreenOffset + 1],
      data[preservedGreenOffset + 2],
    ]).toEqual([24, 169, 87]);
  });

  it('resumes a paid image after detector failure without a second provider call', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = { posterGenerationId: 'resume-test-task', projectRoot, projectsRoot, projectId: 'poster-project', surface: 'image', model: 'gpt-image-2', prompt: 'unchanged branded scene', aspect: '3:4', quality: 'medium', loanPosterOutput: true, posterCopyStyle: 'anti-fraud-message', posterHeadline: 'Prevent Fraud', posterSubtitle: 'Trust Only Official Customer Service', posterTextAnchor: 'left', output: 'resume.png' } as const;
    layoutFixture.unavailable = true;
    await expect(generateMedia(request)).rejects.toThrow('local detector timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readdir(projectDir)).includes('resume.png')).toBe(false);
    expect((await readdir(projectDir)).includes('.poster-checkpoints')).toBe(true);
    layoutFixture.unavailable = false;
    const result = await generateMedia({ ...request, posterRecoveryOnly: true });
    expect(result.name).toBe('resume.png');
    expect(result.usedStubFallback).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readFile(path.join(projectDir, result.name))).length).toBeGreaterThan(1000);
  });

  it('reports exhausted provider credits without retrying or saving a fake poster', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {
      message: 'You have no credits remaining.', type: 'insufficient_quota', code: 'credit_balance_too_low',
    } }), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateMedia({ projectRoot, projectsRoot, projectId: 'poster-project', surface: 'image', model: 'gpt-image-2', prompt: 'scene', aspect: '3:4', loanPosterOutput: true, posterCopyStyle: 'anti-fraud-message', posterHeadline: 'Prevent Fraud', posterSubtitle: 'Trust Only Official Customer Service', posterTextAnchor: 'left', output: 'quota.png' })).rejects.toMatchObject({ code: 'image_provider_quota_exhausted', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(readFile(path.join(projectDir, 'quota.png'))).rejects.toThrow();
  });

  it('forces the Zamloan tagline black on anti-fraud posters', async () => {
    const logoName = 'mtv47ei2-zamloan-logo.svg';
    generatedPoster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 34, g: 39, b: 48, alpha: 1 },
      },
    }).png().toBuffer();
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="58" fill="#e4572e"/>
        <rect y="58" width="320" height="34" fill="#ffffff"/>
      </svg>
    `);
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A dark anti-fraud poster with a reserved logo-safe area',
      aspect: '4:3',
      overlayLogo: logoName,
      posterHeadline: 'Prevent Fraud',
      posterSubtitle: 'Trust Only Official Customer Service',
      posterTextAnchor: 'left',
      posterCopyStyle: 'anti-fraud-message',
      output: 'zamloan-anti-fraud-poster.png',
    });

    const output = await readFile(path.join(projectDir, result.name));
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const taglineOffset = (77 * info.width + 140) * info.channels;
    expect([
      data[taglineOffset],
      data[taglineOffset + 1],
      data[taglineOffset + 2],
    ]).toEqual([0, 0, 0]);
  });

  it('composites designed anti-fraud copy over a single generated scene plate', async () => {
    const phoneScreenName = 'zamloan-safe-screen.svg';
    const phoneScreen = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="504">
        <rect width="240" height="504" fill="#f5faf5"/>
        <rect width="240" height="140" fill="#21a545"/>
        <path d="M120 170 180 195v55c0 50-25 88-60 108-35-20-60-58-60-108v-55l60-25Z" fill="#ffffff" stroke="#21a545" stroke-width="10"/>
        <text x="120" y="420" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700">zamloan.com</text>
      </svg>
    `);
    await writeFile(path.join(projectDir, phoneScreenName), phoneScreen);
    generatedPoster = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 247, g: 236, b: 217, alpha: 1 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="252">
          <rect width="120" height="252" rx="12" fill="#ff00ff"/>
        </svg>
      `),
      left: 560,
      top: 180,
    }]).png().toBuffer();
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: generatedPoster.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A text-free anti-fraud scene with a reserved left copy panel',
      aspect: '3:4',
      quality: 'medium',
      posterHeadline: 'Prevent Fraud',
      posterSubtitle: 'Trust Only Official Customer Service',
      posterTextAnchor: 'left',
      posterCopyStyle: 'anti-fraud',
      overlayPhoneScreen: phoneScreenName,
      loanPosterOutput: true,
      output: 'anti-fraud-poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const output = await readFile(path.join(projectDir, result.name));
    expect(await sharp(output).metadata()).toMatchObject({
      width: 800,
      height: 600,
      format: 'png',
    });
    expect(
      (await sharp(output).raw().toBuffer()).equals(
        await sharp(generatedPoster).raw().toBuffer(),
      ),
    ).toBe(false);
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const screenOffset = (210 * info.width + 600) * info.channels;
    expect(data[screenOffset]).toBeLessThan(100);
    expect(data[screenOffset + 1]).toBeGreaterThan(140);
    expect(data[screenOffset + 2]).toBeLessThan(130);
    const notificationOffset = (290 * info.width + 250) * info.channels;
    expect(data[notificationOffset]).toBeGreaterThan(200);
    expect(data[notificationOffset + 1]).toBeGreaterThan(180);
    expect(data[notificationOffset + 2]).toBeGreaterThan(180);
    const blockedContactOffset = (380 * info.width + 75) * info.channels;
    expect(data[blockedContactOffset]).toBeGreaterThan(220);
    expect(data[blockedContactOffset + 1]).toBeLessThan(160);
    expect(data[blockedContactOffset + 2]).toBeLessThan(160);
    let darkTitlePixels = 0;
    let coralTitlePixels = 0;
    let greenSubtitlePixels = 0;
    for (let y = 80; y < 255; y += 1) {
      for (let x = 35; x < 420; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        if (red < 75 && green < 75 && blue < 85) darkTitlePixels += 1;
        if (red > 200 && green < 125 && blue < 125) coralTitlePixels += 1;
        if (red < 65 && green > 75 && green < 145 && blue < 115) {
          greenSubtitlePixels += 1;
        }
      }
    }
    expect(darkTitlePixels).toBeGreaterThan(100);
    expect(coralTitlePixels).toBeGreaterThan(100);
    expect(greenSubtitlePixels).toBeGreaterThan(100);
  });

  it('composites only a high-legibility anti-fraud message beneath the rejecting hand', async () => {
    const messagePlate = await sharp({
      create: {
        width: 800,
        height: 1067,
        channels: 4,
        background: { r: 226, g: 213, b: 192, alpha: 1 },
      },
    }).png().toBuffer();
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: messagePlate.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Unified anti-fraud poster with a clean notification-safe area beneath the rejecting hand',
      aspect: '3:4',
      quality: 'medium',
      posterHeadline: 'Prevent Fraud',
      posterSubtitle: 'Trust Only Official Customer Service',
      posterTextAnchor: 'right',
      posterCopyStyle: 'anti-fraud-message',
      loanPosterOutput: true,
      output: 'anti-fraud-message-poster.png',
    });

    // A flat fixture has no diagonal scene; anti-fraud validation retries once
    // even without a supplied logo, then uses its valid hand-relative placement.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const output = await readFile(path.join(projectDir, result.name));
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const offsetAt = (x: number, y: number) => (y * info.width + x) * info.channels;
    const untouchedTitleOffset = offsetAt(100, 250);
    expect(Array.from(data.subarray(
      untouchedTitleOffset,
      untouchedTitleOffset + 3,
    ))).toEqual([226, 213, 192]);
    const previousMessageAreaOffset = offsetAt(700, 1020);
    expect(Array.from(data.subarray(
      previousMessageAreaOffset,
      previousMessageAreaOffset + 3,
    ))).toEqual([226, 213, 192]);
    const messageFaceOffset = offsetAt(700, 830);
    expect(data[messageFaceOffset]).toBeGreaterThan(225);
    expect(data[messageFaceOffset + 1]).toBeGreaterThan(225);
    expect(data[messageFaceOffset + 2]).toBeGreaterThan(225);
    let redBadgePixels = 0;
    for (let y = 880; y < 930; y += 1) {
      for (let x = 585; x < 630; x += 1) {
        const offset = offsetAt(x, y);
        if (
          (data[offset] ?? 0) > 200
          && (data[offset + 1] ?? 255) < 150
          && (data[offset + 2] ?? 255) < 150
        ) {
          redBadgePixels += 1;
        }
      }
    }
    expect(redBadgePixels).toBeGreaterThan(300);
    let darkTextPixels = 0;
    for (let y = 810; y < 910; y += 1) {
      for (let x = 600; x < 765; x += 1) {
        const offset = offsetAt(x, y);
        if (
          (data[offset] ?? 255) < 80
          && (data[offset + 1] ?? 255) < 80
          && (data[offset + 2] ?? 255) < 80
        ) {
          darkTextPixels += 1;
        }
      }
    }
    expect(darkTextPixels).toBeGreaterThan(150);
  });

  it('retries a Zamloan anti-fraud render before compositing when a large lower-right surface appears', async () => {
    const logoName = 'zamloan-logo.svg';
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect x="20" y="18" width="125" height="36" fill="#d35430"/>
        <rect x="170" y="18" width="125" height="36" fill="#46a93c"/>
      </svg>
    `);
    const clean = await sharp({
      create: {
        width: 800,
        height: 1067,
        channels: 4,
        background: { r: 126, g: 174, b: 211, alpha: 1 },
      },
    }).png().toBuffer();
    const blocked = await sharp(clean)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="270" height="330">
            <rect width="270" height="330" rx="26" fill="#c3e3f8"/>
          </svg>
        `),
        left: 510,
        top: 720,
      }])
      .png()
      .toBuffer();
    const providerPrompts: string[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { prompt?: string };
      providerPrompts.push(body.prompt ?? '');
      const image = providerPrompts.length === 1 ? blocked : clean;
      return new Response(
        JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'One person with continuous lower-right background',
      aspect: '3:4',
      quality: 'medium',
      overlayLogo: logoName,
      overlayLogoAnchor: 'left',
      posterHeadline: 'Prevent Fraud',
      posterSubtitle: 'Trust Only Official Customer Service',
      posterTextAnchor: 'right',
      posterCopyStyle: 'anti-fraud-message',
      loanPosterOutput: true,
      output: 'anti-fraud-retry-poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(providerPrompts[1]).toContain('CRITICAL LOWER-RIGHT CONTINUITY RETRY');
    expect(providerPrompts[1]).not.toMatch(/notification|message card|placeholder|backing plate/i);
    expect(result.providerNote).toContain('anti-fraud safe-zone retry');
    const output = await readFile(path.join(projectDir, result.name));
    const pixel = await sharp(output)
      .extract({ left: 650, top: 1_010, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(Array.from(pixel)).toEqual([126, 174, 211]);
  });

  it('returns the clearest anti-fraud render when the lower-right check still flags the retry', async () => {
    const logoName = 'zamloan-logo.svg';
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect x="20" y="18" width="125" height="36" fill="#d35430"/>
        <rect x="170" y="18" width="125" height="36" fill="#46a93c"/>
      </svg>
    `);
    const base = await sharp({
      create: {
        width: 800,
        height: 1067,
        channels: 4,
        background: { r: 126, g: 174, b: 211, alpha: 1 },
      },
    }).png().toBuffer();
    const flagged = await sharp(base)
      .composite([{
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="270" height="330">
            <rect width="270" height="330" rx="26" fill="#c3e3f8"/>
          </svg>
        `),
        left: 510,
        top: 720,
      }])
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ b64_json: flagged.toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'One person with continuous lower-right background',
      aspect: '3:4',
      quality: 'medium',
      overlayLogo: logoName,
      overlayLogoAnchor: 'left',
      posterHeadline: 'Prevent Fraud',
      posterSubtitle: 'Trust Only Official Customer Service',
      posterTextAnchor: 'right',
      posterCopyStyle: 'anti-fraud-message',
      loanPosterOutput: true,
      output: 'anti-fraud-flagged-retry-poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.name).toBe('anti-fraud-flagged-retry-poster.png');
    expect(result.warnings).toContain(
      'Anti-fraud lower-right background remained visually discontinuous after retry; the clearest render was used.',
    );
    await expect(readFile(path.join(projectDir, result.name))).resolves.not.toHaveLength(0);
  });

  it('requests an opaque matte foreground and composites it above the exact Z', async () => {
    const referenceName = 'loan-poster-z-reference.png';
    const zReference = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <rect width="200" height="100" fill="white"/>
      </svg>
    `)).png().toBuffer();
    const matteForeground = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="180" height="260">
          <rect width="180" height="260" fill="#0033ff"/>
        </svg>
      `),
      left: 510,
      top: 170,
    }]).png().toBuffer();
    await writeFile(path.join(projectDir, referenceName), zReference);

    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const bytes = requestBodies.length === 1 ? generatedPoster : matteForeground;
      return new Response(
        JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Background plate without people or copy',
      foregroundPrompt: 'Model isolated for compositing',
      posterHeadline: 'GET CASH',
      posterSubtitle: 'Fast support through your phone',
      posterTextAnchor: 'left',
      aspect: '16:9',
      overlayZ: referenceName,
      loanPosterOutput: true,
      output: 'layered-poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodies[0]).not.toHaveProperty('background');
    expect(requestBodies[1]).not.toHaveProperty('background');
    expect(requestBodies[1]?.prompt).toContain('Model isolated for compositing');
    expect(requestBodies[1]?.prompt).toContain('uniform chroma green');
    const output = await readFile(path.join(projectDir, result.name));
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const modelOffset = (300 * info.width + 600) * info.channels;
    const zOffset = (300 * info.width + 400) * info.channels;
    expect([
      data[modelOffset],
      data[modelOffset + 1],
      data[modelOffset + 2],
    ]).toEqual([0, 51, 255]);
    expect(data[zOffset]).not.toBe(220);
  });

  it('retries the foreground once with stricter matte instructions', async () => {
    const referenceName = 'loan-poster-z-reference.png';
    const zReference = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <rect width="200" height="100" fill="white"/>
      </svg>
    `)).png().toBuffer();
    const invalidForeground = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).png().toBuffer();
    const matteForeground = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="180" height="260">
          <rect width="180" height="260" fill="#0033ff"/>
        </svg>
      `),
      left: 510,
      top: 170,
    }]).png().toBuffer();
    await writeFile(path.join(projectDir, referenceName), zReference);

    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const bytes = requestBodies.length === 1
        ? generatedPoster
        : requestBodies.length === 2
          ? invalidForeground
          : matteForeground;
      return new Response(
        JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'poster-project',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Background plate without people or copy',
      foregroundPrompt: 'Model isolated for compositing',
      posterHeadline: 'GET CASH',
      posterSubtitle: 'Fast support through your phone',
      posterTextAnchor: 'left',
      aspect: '16:9',
      overlayZ: referenceName,
      loanPosterOutput: true,
      output: 'retried-layered-poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBodies[2]?.prompt).toContain('CRITICAL MATTE RETRY');
    expect(result.warnings).toContain('Foreground matte required one retry before compositing.');
    await expect(readFile(path.join(projectDir, result.name))).resolves.toBeInstanceOf(Buffer);
  });
});
