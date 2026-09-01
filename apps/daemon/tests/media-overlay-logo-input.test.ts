import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

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

  it('composites designed anti-fraud copy over a single generated scene plate', async () => {
    const phoneScreenName = 'zamloan-homepage-reference.png';
    const phoneScreen = await sharp({
      create: {
        width: 240,
        height: 504,
        channels: 4,
        background: { r: 245, g: 250, b: 245, alpha: 1 },
      },
    }).composite([{
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="240" height="504">
          <rect x="0" y="0" width="240" height="90" fill="#21a545"/>
          <rect x="20" y="120" width="200" height="70" rx="16" fill="#ff6b65"/>
        </svg>
      `),
      left: 0,
      top: 0,
    }]).png().toBuffer();
    await writeFile(path.join(projectDir, phoneScreenName), phoneScreen);
    generatedPoster = await sharp(generatedPoster).composite([{
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
    const notificationOffset = (340 * info.width + 300) * info.channels;
    expect(data[notificationOffset]).toBeGreaterThan(200);
    expect(data[notificationOffset + 1]).toBeGreaterThan(180);
    expect(data[notificationOffset + 2]).toBeGreaterThan(180);
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
