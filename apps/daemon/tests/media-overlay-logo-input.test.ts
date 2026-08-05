import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

describe('media overlay-logo inputs', () => {
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

  it('accepts an SVG overlay logo while keeping provider reference images raster-only', async () => {
    const referenceName = 'loan-poster-z-reference.png';
    const logoName = 'zamloan-logo.svg';
    await writeFile(path.join(projectDir, referenceName), generatedPoster);
    await writeFile(path.join(projectDir, logoName), `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92">
        <rect width="320" height="92" rx="12" fill="white"/>
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
      prompt: 'A premium Zamloan poster',
      aspect: '16:9',
      image: referenceName,
      overlayLogo: logoName,
      loanPosterOutput: true,
      output: 'poster.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
  });
});
