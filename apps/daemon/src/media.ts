// Media-generation dispatcher. The unifying contract is:
//
//   skills + metadata + system-prompt
//        ↓ (the code agent decides what to make)
//   `od media generate --surface … --model … --output … --prompt …`
//        ↓ (this module routes to a provider)
//   bytes written to <projectsRoot>/<projectId>/<output>
//        ↓
//   FileViewer renders it.
//
// Every surface (image / video / audio) flows through this single
// entrypoint. Providers live behind the `provider` field on each model
// entry in media-models.js — when a real integration ships we route to
// it; otherwise we emit a deterministic, lightweight placeholder
// (labelled SVG-PNG, silent WAV/MP3, blank MP4) so the framework works
// without API keys.
//
// Today we ship real integrations for:
//   * provider 'openai'     → OpenAI Images API (gpt-image-* / dall-e-*),
//                              plus text-to-speech via /v1/audio/speech,
//                              with auto-detection for Azure OpenAI
//                              deployments based on the configured base URL
//   * provider 'volcengine' → Volcengine Ark async tasks API for
//                              Doubao Seedance 2.0 (video) and Seedream
//                              (image)
//   * provider 'grok'       → xAI Imagine API: synchronous
//                              /v1/images/generations for grok-imagine-image
//                              and async /v1/videos/generations + GET poll
//                              for grok-imagine-video (t2v + i2v + audio)
//   * provider 'imagerouter'→ ImageRouter OpenAI-compatible image/video
//                              generation endpoints
//   * provider 'custom-image'→ user-supplied OpenAI-compatible
//                              /v1/images/generations endpoint
//
// The fallback stub handlers are gated behind OD_MEDIA_ALLOW_STUBS=1; in
// release builds they throw StubProviderDisabledError (mapped to HTTP
// 503) instead of writing placeholder bytes that look like a successful
// generation. Real-provider failures still produce a stub byte payload
// when stubs are allowed, but they tag the response with providerError
// so the CLI can exit non-zero and the agent can't silently narrate the
// placeholder as the final result.

import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { execFile as execFileCb, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { EnvHttpProxyAgent } from 'undici';
import { createImageRequestRecovery, imageRequestTimeoutMs, isRecoverableImageRequestError } from './image-request-recovery.js';
import type { PosterCopyStyle } from '@open-design/contracts';
import {
  AUDIO_DURATIONS_SEC,
  type AudioKind,
  type MediaModel,
  type MediaProvider,
  type MediaSurface,
  VIDEO_LENGTHS_SEC,
  findMediaModel,
  findProvider,
  modelsForSurface,
} from './media-models.js';
import { assertExternalAssetUrl } from './connectionTest.js';
import {
  createHyperFramesRenderCommand,
  createHyperFramesRenderEnv,
  resolveHyperFramesBinaryPaths,
  verifyHyperFramesBinaries,
} from './hyperframes-binaries.js';
import { resolveModelAlias, resolveProviderConfig } from './media-config.js';
import { createPosterHandDetector, PosterDetectorUnavailableError, type PosterHandDetector } from './poster-hand-detector.js';
import { posterCheckpoint } from './poster-checkpoint.js';
import { warpAntiFraudMessage } from './poster-message-perspective.js';
import {
  placeAntiFraudMessage,
  PosterHandLayoutError,
  PosterMessagePlacementError,
  ANTI_FRAUD_MESSAGE_SPACE_RETRY,
  ANTI_FRAUD_HAND_RETRY,
  ANTI_FRAUD_SIMPLE_POSE_RECOVERY,
  type PosterHandObservation,
  type AntiFraudMessagePlacement,
} from './poster-hand-layout.js';
import {
  ensureProject,
  kindFor,
  mimeFor,
  sanitizeName,
} from './projects.js';

const execFile = promisify(execFileCb);
type ProviderConfig = { apiKey?: string; baseUrl?: string; model?: string };
type ProgressFn = (message: string) => void;
type ImageRef = { path: string; abs: string; mime: string; size: number; dataUrl: string };
type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

function isZamloanLogoAsset(image: ImageRef): boolean {
  const stem = path.parse(path.basename(image.path)).name.toLowerCase();
  return /^(?:[a-z0-9]+-)?zamloan-logo$/u.test(stem);
}

const LAYERED_FOREGROUND_MATTE_INSTRUCTIONS = `
CRITICAL COMPOSITING REQUIREMENT: Render the complete subject against one
uniform chroma green background (#00FF00). The green field must fill every
background pixel edge-to-edge with flat, even color: no scenery, floor,
gradient, texture, shadow, or vignette. Keep the subject fully inside the
canvas with clear green margin on every edge. Do not use green clothing or
green accessories; the small green phone-screen success checkmark is the only
exception.`.trim();

const LAYERED_FOREGROUND_MATTE_RETRY_INSTRUCTIONS = `
CRITICAL MATTE RETRY: The previous foreground could not be separated from its
background. Use a perfectly flat #00FF00 canvas with an uninterrupted green
border on all four sides. Keep every part of the subject away from the canvas
edges and remove all environmental or floor detail.`.trim();

const RASTER_IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const OVERLAY_IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ...RASTER_IMAGE_MIME_BY_EXTENSION,
  '.svg': 'image/svg+xml',
};

export async function optimizeLosslessPng(
  input: Buffer,
): Promise<{ bytes: Buffer; optimized: boolean; savedBytes: number }> {
  try {
    const optimized = await sharp(input)
      .keepMetadata()
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
      .toBuffer();
    if (optimized.length >= input.length) {
      return { bytes: input, optimized: false, savedBytes: 0 };
    }
    return {
      bytes: optimized,
      optimized: true,
      savedBytes: input.length - optimized.length,
    };
  } catch {
    // Image generation must still succeed if a provider returns a malformed
    // or unusual PNG that Sharp cannot optimize.
    return { bytes: input, optimized: false, savedBytes: 0 };
  }
}

/**
 * Preserve the provider's full poster resolution while applying lossless PNG
 * compression. Delivery-sized previews are produced separately by the web
 * runtime, so the persisted source should remain suitable for download and
 * close inspection.
 */
export async function optimizeLoanPosterPng(
  input: Buffer,
): Promise<{
  bytes: Buffer;
  optimized: boolean;
  savedBytes: number;
  pixelScale: number;
}> {
  const optimized = await optimizeLosslessPng(input);
  return { ...optimized, pixelScale: 1 };
}

export interface ZamloanLogoSafeZoneAnalysis {
  intrudes: boolean;
  score: number;
  neutralLightRatio: number;
  strongEdgeRatio: number;
}

/**
 * Detect title-like or cluttered pixels in the region reserved for the
 * deterministic Zamloan logo. This runs before the SVG wordmark is composited,
 * so light neutral runs and strong edges indicate a broken layout contract.
 */
export async function analyzeZamloanLogoSafeZone(
  input: Buffer,
  options: {
    anchor?: 'left' | 'right';
    bottomRatio?: number;
    allowNeutralLight?: boolean;
    strongEdgeRatioLimit?: number;
  } = {},
): Promise<ZamloanLogoSafeZoneAnalysis> {
  const image = sharp(input);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('generated poster has no readable dimensions');
  }

  const isWidescreen = metadata.width / metadata.height >= 1.5;
  const top = Math.max(0, Math.round(metadata.height * 0.02));
  const bottom = Math.min(
    metadata.height,
    Math.round(metadata.height * (
      options.bottomRatio ?? (isWidescreen ? 0.23 : 0.18)
    )),
  );
  const left = Math.max(
    0,
    Math.round(metadata.width * (options.anchor === 'right' ? 0.50 : 0.03)),
  );
  const right = Math.min(
    metadata.width,
    Math.round(metadata.width * (options.anchor === 'right' ? 0.97 : 0.45)),
  );
  const { data, info } = await image
    .extract({
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixelCount = info.width * info.height;
  let neutralLightPixels = 0;
  let strongEdgePixels = 0;
  const lumaAt = (x: number, y: number): number => {
    const offset = (y * info.width + x) * channels;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? red;
    const blue = data[offset + 2] ?? green;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? red;
      const blue = data[offset + 2] ?? green;
      const minimum = Math.min(red, green, blue);
      const maximum = Math.max(red, green, blue);
      if (minimum >= 205 && maximum - minimum <= 48) {
        neutralLightPixels += 1;
      }

      const sampleX = Math.min(info.width - 1, x + 3);
      const sampleY = Math.min(info.height - 1, y + 3);
      const luma = lumaAt(x, y);
      if (
        Math.abs(luma - lumaAt(sampleX, y)) >= 58
        || Math.abs(luma - lumaAt(x, sampleY)) >= 58
      ) {
        strongEdgePixels += 1;
      }
    }
  }

  const neutralLightRatio = neutralLightPixels / pixelCount;
  const strongEdgeRatio = strongEdgePixels / pixelCount;
  const score = (options.allowNeutralLight ? 0 : neutralLightRatio * 2)
    + strongEdgeRatio;
  return {
    intrudes: (
      (!options.allowNeutralLight && neutralLightRatio >= 0.018)
      || strongEdgeRatio >= (options.strongEdgeRatioLimit ?? 0.065)
    ),
    score,
    neutralLightRatio,
    strongEdgeRatio,
  };
}

function logoSafeZoneRetryInstruction(anchor: 'left' | 'right'): string {
  const horizontalRange = anchor === 'right' ? '50% to 97%' : '3% to 45%';
  return `CRITICAL LOGO SAFE-ZONE RETRY: the previous render placed text or visual detail inside the reserved logo band. Keep the rectangle from ${horizontalRange} of the canvas width and from 2% to 23% of the canvas height completely free of text, people, props, windows, shelves, and high-contrast detail. Use only smooth background color there. Put the headline below 25% of the canvas height and align it with the ${anchor} logo column.`;
}

export async function renderImageWithLogoSafeZoneRetry<T extends { bytes: Buffer }>(
  prompt: string,
  render: (resolvedPrompt: string) => Promise<T>,
  options: {
    enabled: boolean;
    anchor?: 'left' | 'right';
    maxRetries?: number;
  },
): Promise<{
  result: T;
  attempts: number;
  safeZone: ZamloanLogoSafeZoneAnalysis;
}> {
  const anchor = options.anchor ?? 'left';
  const maxRetries = Math.max(0, options.maxRetries ?? 1);
  let bestResult = await render(prompt);
  let bestSafeZone = await analyzeZamloanLogoSafeZone(bestResult.bytes, { anchor });
  let attempts = 1;

  if (!options.enabled || !bestSafeZone.intrudes) {
    return { result: bestResult, attempts, safeZone: bestSafeZone };
  }

  for (let retry = 0; retry < maxRetries; retry += 1) {
    let retryResult: T;
    try {
      retryResult = await render(`${prompt}\n\n${logoSafeZoneRetryInstruction(anchor)}`);
    } catch (error) {
      if (isRecoverableImageRequestError(error)) break;
      throw error;
    }
    const retrySafeZone = await analyzeZamloanLogoSafeZone(retryResult.bytes, { anchor });
    attempts += 1;
    if (retrySafeZone.score < bestSafeZone.score) {
      bestResult = retryResult;
      bestSafeZone = retrySafeZone;
    }
    if (!retrySafeZone.intrudes) {
      return { result: retryResult, attempts, safeZone: retrySafeZone };
    }
  }

  return { result: bestResult, attempts, safeZone: bestSafeZone };
}

export interface AntiFraudLowerRightContinuityAnalysis {
  intrudes: boolean;
  score: number;
  verticalEdgeRatio: number;
  horizontalEdgeRatio: number;
}

const ANTI_FRAUD_CONTINUITY_WARNING =
  'Anti-fraud lower-right background remained visually discontinuous after retry; the clearest render was used.';
const ANTI_FRAUD_DIAGONAL_WARNING =
  'Anti-fraud diagonal split remained outside endpoint tolerance after retry; the clearest render was used.';

export async function analyzeAntiFraudLowerRightContinuity(
  input: Buffer,
): Promise<AntiFraudLowerRightContinuityAnalysis> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    return {
      intrudes: true,
      score: Number.POSITIVE_INFINITY,
      verticalEdgeRatio: 1,
      horizontalEdgeRatio: 1,
    };
  }

  const sampleWidth = 180;
  const sampleHeight = Math.max(120, Math.round(sampleWidth * metadata.height / metadata.width));
  const { data, info } = await sharp(input)
    .resize({ width: sampleWidth, height: sampleHeight, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const colorDelta = (firstX: number, firstY: number, secondX: number, secondY: number) => {
    const firstOffset = (firstY * info.width + firstX) * channels;
    const secondOffset = (secondY * info.width + secondX) * channels;
    return (
      Math.abs((data[firstOffset] ?? 0) - (data[secondOffset] ?? 0))
      + Math.abs((data[firstOffset + 1] ?? 0) - (data[secondOffset + 1] ?? 0))
      + Math.abs((data[firstOffset + 2] ?? 0) - (data[secondOffset + 2] ?? 0))
    ) / 3;
  };
  const edgeThreshold = 24;
  const xStart = Math.round(info.width * 0.58);
  const xEnd = Math.round(info.width * 0.86);
  const yStart = Math.round(info.height * 0.63);
  const yEnd = Math.round(info.height * 0.98);
  const horizontalStart = Math.round(info.width * 0.60);
  const horizontalEnd = Math.round(info.width * 0.98);

  let verticalEdgeRatio = 0;
  for (let x = xStart; x <= xEnd; x += 1) {
    let edgePixels = 0;
    let samples = 0;
    for (let y = yStart; y <= yEnd; y += 1) {
      if (x < 2 || x + 2 >= info.width) continue;
      samples += 1;
      if (colorDelta(x - 2, y, x + 2, y) >= edgeThreshold) edgePixels += 1;
    }
    verticalEdgeRatio = Math.max(verticalEdgeRatio, edgePixels / Math.max(1, samples));
  }

  let horizontalEdgeRatio = 0;
  for (let y = yStart; y <= Math.round(info.height * 0.86); y += 1) {
    let edgePixels = 0;
    let samples = 0;
    for (let x = horizontalStart; x <= horizontalEnd; x += 1) {
      if (y < 2 || y + 2 >= info.height) continue;
      samples += 1;
      if (colorDelta(x, y - 2, x, y + 2) >= edgeThreshold) edgePixels += 1;
    }
    horizontalEdgeRatio = Math.max(horizontalEdgeRatio, edgePixels / Math.max(1, samples));
  }

  const score = verticalEdgeRatio + horizontalEdgeRatio;
  return {
    intrudes: verticalEdgeRatio >= 0.42 && horizontalEdgeRatio >= 0.42,
    score,
    verticalEdgeRatio,
    horizontalEdgeRatio,
  };
}

export interface AntiFraudDiagonalSplitAnalysis {
  intrudes: boolean;
  score: number;
  leftEndpointRatio: number;
  rightEndpointRatio: number;
  leftStrength: number;
  rightStrength: number;
}

export async function analyzeAntiFraudDiagonalSplit(
  input: Buffer,
): Promise<AntiFraudDiagonalSplitAnalysis> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    return {
      intrudes: true,
      score: Number.POSITIVE_INFINITY,
      leftEndpointRatio: 0,
      rightEndpointRatio: 1,
      leftStrength: 0,
      rightStrength: 0,
    };
  }

  const sampleWidth = 180;
  const sampleHeight = Math.max(120, Math.round(sampleWidth * metadata.height / metadata.width));
  const { data, info } = await sharp(input)
    .resize({ width: sampleWidth, height: sampleHeight, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const colorDelta = (x: number, firstY: number, secondY: number) => {
    const firstOffset = (firstY * info.width + x) * channels;
    const secondOffset = (secondY * info.width + x) * channels;
    return (
      Math.abs((data[firstOffset] ?? 0) - (data[secondOffset] ?? 0))
      + Math.abs((data[firstOffset + 1] ?? 0) - (data[secondOffset + 1] ?? 0))
      + Math.abs((data[firstOffset + 2] ?? 0) - (data[secondOffset + 2] ?? 0))
    ) / 3;
  };
  const median = (values: number[]) => {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  };
  const detectEndpoint = (
    xRatios: number[],
    endpoint: 'left' | 'right',
  ): { ratio: number; strength: number } => {
    const ratios: number[] = [];
    const strengths: number[] = [];
    for (const xRatio of xRatios) {
      const x = Math.min(info.width - 1, Math.max(0, Math.round(xRatio * (info.width - 1))));
      const expectedYRatio = 1 - (0.92 * xRatio);
      const startY = Math.max(2, Math.round((expectedYRatio - 0.14) * info.height));
      const endY = Math.min(info.height - 3, Math.round((expectedYRatio + 0.14) * info.height));
      let bestY = startY;
      let bestStrength = 0;
      for (let y = startY; y <= endY; y += 1) {
        const strength = colorDelta(x, y - 2, y + 2);
        if (strength > bestStrength) {
          bestStrength = strength;
          bestY = y;
        }
      }
      const detectedYRatio = bestY / Math.max(1, info.height - 1);
      const endpointRatio = endpoint === 'left'
        ? detectedYRatio + (0.92 * xRatio)
        : detectedYRatio - (0.92 * (1 - xRatio));
      ratios.push(Math.min(1, Math.max(0, endpointRatio)));
      strengths.push(bestStrength);
    }
    return {
      ratio: median(ratios),
      strength: median(strengths),
    };
  };

  const left = detectEndpoint([0.025, 0.05, 0.075], 'left');
  const right = detectEndpoint([0.925, 0.95, 0.975], 'right');
  const minimumBoundaryStrength = 16;
  const leftError = Math.abs(1 - left.ratio);
  const rightError = Math.abs(0.08 - right.ratio);
  const missingBoundaryPenalty = (
    (left.strength < minimumBoundaryStrength ? 0.20 : 0)
    + (right.strength < minimumBoundaryStrength ? 0.20 : 0)
  );
  return {
    intrudes: (
      left.ratio < 0.97
      || right.ratio < 0.06
      || right.ratio > 0.10
      || left.strength < minimumBoundaryStrength
      || right.strength < minimumBoundaryStrength
    ),
    score: leftError + rightError + missingBoundaryPenalty,
    leftEndpointRatio: left.ratio,
    rightEndpointRatio: right.ratio,
    leftStrength: left.strength,
    rightStrength: right.strength,
  };
}

async function antiFraudLowerRightRetryInstruction(input: Buffer): Promise<string> {
  const metadata = await sharp(input).metadata();
  const aspect = (metadata.width ?? 1) / (metadata.height ?? 1);
  const zone = aspect >= 1.5
    ? 'x=78% to 100% and y=66% to 94%'
    : aspect >= 0.9
      ? 'x=71% to 100% and y=69% to 94%'
      : 'x=73% to 100% and y=72% to 90%';
  return `CRITICAL LOWER-RIGHT CONTINUITY RETRY: the previous render introduced a separate geometric foreground surface. Re-render the composition so the surrounding base background flows continuously through ${zone} of the canvas. Match the immediately adjacent color, gradient, texture, depth, and lighting with no visible boundary or separate treatment. Keep the person, hands, phone, props, and high-contrast detail outside this zone. The zone must remain ordinary, visually empty surrounding background.`;
}

function antiFraudDiagonalRetryInstruction(): string {
  return 'CRITICAL FIXED-DIAGONAL RETRY: use exactly one straight background boundary from the exact bottom-left corner (0%, 100%) to the right edge at (100%, 8%). The left endpoint must touch the final bottom-left canvas pixel, and the right endpoint must touch the right canvas edge 8% below the top. Do not terminate the boundary early, shift either endpoint, bend it, feather it, or introduce another wedge.';
}

async function antiFraudLogoSafeZoneRules(input: Buffer): Promise<{
  bottomRatio: number;
  retryInstruction: (anchor: 'left' | 'right') => string;
}> {
  const metadata = await sharp(input).metadata();
  const widescreen = (metadata.width ?? 1) / (metadata.height ?? 1) >= 1.5;
  const bottomRatio = widescreen ? 0.20 : 0.17;
  const headlineRange = widescreen ? '22.5% to 23.5%' : '19% to 20%';
  return {
    bottomRatio,
    retryInstruction: (anchor) => {
      const horizontalRange = anchor === 'right' ? '50% to 97%' : '3% to 45%';
      return `CRITICAL LOGO SAFE-ZONE RETRY: keep ${horizontalRange} of the canvas width and 2% to ${Math.round(bottomRatio * 100)}% of the canvas height calm and free of text, people, props, windows, shelves, and high-contrast detail. Use only smooth background color there. Preserve the established type size and place the headline top edge at ${headlineRange} of the canvas height.`;
    },
  };
}

export async function renderImageWithAntiFraudSafeZoneRetry<T extends { bytes: Buffer }>(
  prompt: string,
  render: (resolvedPrompt: string) => Promise<T>,
  options: {
    anchor?: 'left' | 'right';
    maxRetries?: number;
    detectHands?: PosterHandDetector | undefined;
    preserveLayoutDraft?: (bytes: Buffer, error: PosterHandLayoutError, observation?: PosterHandObservation) => Promise<void>;
  } = {},
): Promise<{
  result: T;
  attempts: number;
  logoSafeZone: ZamloanLogoSafeZoneAnalysis;
  lowerRight: AntiFraudLowerRightContinuityAnalysis;
  diagonal: AntiFraudDiagonalSplitAnalysis;
  handObservation?: PosterHandObservation | undefined;
}> {
  const anchor = options.anchor ?? 'left';
  // One correction, then one simpler-pose recovery only if the hands still fail.
  // An explicit smaller budget is honored; callers cannot create an unbounded loop.
  const requestedRetries = options.maxRetries ?? 2;
  const maxRetries = Number.isFinite(requestedRetries)
    ? Math.min(2, Math.max(0, Math.floor(requestedRetries))) : 2;
  let bestResult = await render(prompt);
  const logoRules = await antiFraudLogoSafeZoneRules(bestResult.bytes);
  let bestLogoSafeZone = await analyzeZamloanLogoSafeZone(bestResult.bytes, {
    anchor,
    bottomRatio: logoRules.bottomRatio,
    allowNeutralLight: true,
    strongEdgeRatioLimit: 0.025,
  });
  let bestLowerRight = await analyzeAntiFraudLowerRightContinuity(bestResult.bytes);
  let bestDiagonal = await analyzeAntiFraudDiagonalSplit(bestResult.bytes);
  const inspectHands = async (input: Buffer) => {
    if (!options.detectHands) return { observation: undefined, error: undefined };
    let observation: PosterHandObservation | undefined;
    try {
      observation = await options.detectHands(input);
      const metadata = await sharp(input).metadata();
      placeAntiFraudMessage(metadata.width!, metadata.height!, observation);
      return { observation, error: undefined };
    } catch (error) {
      if (!(error instanceof PosterHandLayoutError) || !error.recoverable) throw error;
      return { observation, error };
    }
  };
  let bestHands = await inspectHands(bestResult.bytes);
  let bestScore = bestLogoSafeZone.score + bestLowerRight.score + bestDiagonal.score;
  let attempts = 1;

  if (!bestHands.error && !bestLogoSafeZone.intrudes && !bestLowerRight.intrudes && !bestDiagonal.intrudes) {
    return {
      result: bestResult,
      attempts,
      logoSafeZone: bestLogoSafeZone,
      lowerRight: bestLowerRight,
      diagonal: bestDiagonal,
      handObservation: bestHands.observation,
    };
  }

  for (let retry = 0; retry < maxRetries; retry += 1) {
    // Cosmetic background checks retain their existing one-retry budget.
    if (retry > 0 && !bestHands.error) break;
    const retryInstructions = [
      bestHands.error
        ? bestHands.error instanceof PosterMessagePlacementError
          ? ANTI_FRAUD_MESSAGE_SPACE_RETRY
          : retry === 0 ? ANTI_FRAUD_HAND_RETRY : ANTI_FRAUD_SIMPLE_POSE_RECOVERY
        : '',
      bestLogoSafeZone.intrudes ? logoRules.retryInstruction(anchor) : '',
      bestLowerRight.intrudes
        ? await antiFraudLowerRightRetryInstruction(bestResult.bytes)
        : '',
      bestDiagonal.intrudes ? antiFraudDiagonalRetryInstruction() : '',
    ].filter(Boolean).join('\n\n');
    let retryResult: T;
    try {
      retryResult = await render(`${prompt}\n\n${retryInstructions}`);
    } catch (error) {
      // A cosmetic refinement cannot discard a usable, hand-validated image.
      // Invalid hands and explicit cancellation must still fail closed.
      if (!bestHands.error && isRecoverableImageRequestError(error)) break;
      throw error;
    }
    const retryLogoSafeZone = await analyzeZamloanLogoSafeZone(retryResult.bytes, {
      anchor,
      bottomRatio: logoRules.bottomRatio,
      allowNeutralLight: true,
      strongEdgeRatioLimit: 0.025,
    });
    const retryLowerRight = await analyzeAntiFraudLowerRightContinuity(retryResult.bytes);
    const retryDiagonal = await analyzeAntiFraudDiagonalSplit(retryResult.bytes);
    const retryHands = await inspectHands(retryResult.bytes);
    const retryScore = retryLogoSafeZone.score + retryLowerRight.score + retryDiagonal.score;
    attempts += 1;
    // Hand clearance is mandatory; background scores only rank equally valid layouts.
    if ((bestHands.error && !retryHands.error)
      || (Boolean(bestHands.error) === Boolean(retryHands.error) && retryScore < bestScore)) {
      bestResult = retryResult;
      bestLogoSafeZone = retryLogoSafeZone;
      bestLowerRight = retryLowerRight;
      bestDiagonal = retryDiagonal;
      bestHands = retryHands;
      bestScore = retryScore;
    }
    if (!retryHands.error && !retryLogoSafeZone.intrudes && !retryLowerRight.intrudes && !retryDiagonal.intrudes) {
      return {
        result: retryResult,
        attempts,
        logoSafeZone: retryLogoSafeZone,
        lowerRight: retryLowerRight,
        diagonal: retryDiagonal,
        handObservation: retryHands.observation,
      };
    }
  }

  if (bestHands.error) {
    try {
      await options.preserveLayoutDraft?.(bestResult.bytes, bestHands.error, bestHands.observation);
    } catch {
      // A disk error must not turn a rejected layout into the generic stub fallback.
      bestHands.error.message += '; could not preserve the layout draft';
    }
    throw bestHands.error;
  }
  return {
    result: bestResult,
    attempts,
    logoSafeZone: bestLogoSafeZone,
    lowerRight: bestLowerRight,
    diagonal: bestDiagonal,
    handObservation: bestHands.observation,
  };
}

type ZamloanTaglineTone = 'black' | 'white';

const ZAMLOAN_TAGLINE_TOP_RATIO = 0.64;
const NORMAL_TEXT_MINIMUM_CONTRAST = 4.5;

function srgbChannelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return (
    srgbChannelToLinear(red) * 0.2126
    + srgbChannelToLinear(green) * 0.7152
    + srgbChannelToLinear(blue) * 0.0722
  );
}

function chooseZamloanTaglineTone(
  data: Buffer,
  channels: number,
): ZamloanTaglineTone {
  let blackPassingPixels = 0;
  let whitePassingPixels = 0;
  let blackContrastTotal = 0;
  let whiteContrastTotal = 0;
  let pixelCount = 0;

  for (let offset = 0; offset < data.length; offset += channels) {
    const luminance = relativeLuminance(
      data[offset] ?? 0,
      data[offset + 1] ?? 0,
      data[offset + 2] ?? 0,
    );
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    if (blackContrast >= NORMAL_TEXT_MINIMUM_CONTRAST) blackPassingPixels += 1;
    if (whiteContrast >= NORMAL_TEXT_MINIMUM_CONTRAST) whitePassingPixels += 1;
    blackContrastTotal += blackContrast;
    whiteContrastTotal += whiteContrast;
    pixelCount += 1;
  }

  if (blackPassingPixels !== whitePassingPixels) {
    return blackPassingPixels > whitePassingPixels ? 'black' : 'white';
  }
  if (pixelCount === 0) return 'white';
  return blackContrastTotal >= whiteContrastTotal ? 'black' : 'white';
}

async function adaptZamloanTaglineToBackground(
  resizedLogo: Buffer,
  background: Buffer,
  options: {
    left: number;
    top: number;
    tone?: ZamloanTaglineTone;
  },
): Promise<Buffer> {
  const { data: logoPixels, info: logoInfo } = await sharp(resizedLogo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const taglineTop = Math.min(
    logoInfo.height - 1,
    Math.max(0, Math.floor(logoInfo.height * ZAMLOAN_TAGLINE_TOP_RATIO)),
  );
  const taglineHeight = logoInfo.height - taglineTop;
  let tone = options.tone;
  if (!tone) {
    const { data: backgroundPixels, info: backgroundInfo } = await sharp(background)
      .extract({
        left: options.left,
        top: options.top + taglineTop,
        width: logoInfo.width,
        height: taglineHeight,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    tone = chooseZamloanTaglineTone(
      backgroundPixels,
      backgroundInfo.channels,
    );
  }
  const channelValue = tone === 'black' ? 0 : 255;

  for (let y = taglineTop; y < logoInfo.height; y += 1) {
    for (let x = 0; x < logoInfo.width; x += 1) {
      const offset = (y * logoInfo.width + x) * logoInfo.channels;
      if ((logoPixels[offset + 3] ?? 0) === 0) continue;
      logoPixels[offset] = channelValue;
      logoPixels[offset + 1] = channelValue;
      logoPixels[offset + 2] = channelValue;
    }
  }

  return sharp(logoPixels, {
    raw: {
      width: logoInfo.width,
      height: logoInfo.height,
      channels: 4,
    },
  }).png().toBuffer();
}

async function renderImageWithPhoneScreenRetry<T extends { bytes: Buffer }>(
  prompt: string,
  render: (resolvedPrompt: string) => Promise<T>,
): Promise<{ result: T; attempts: number }> {
  const result = await render(prompt);
  if (await detectMagentaPhoneScreen(result.bytes)) {
    return { result, attempts: 1 };
  }
  const retried = await render(`${prompt}

CRITICAL PHONE-SCREEN RETRY: The previous image did not provide a usable screen for compositing. Show exactly one large upright smartphone held toward the camera. The phone must be perfectly front-on with its complete bezel visible. Fill the entire interior display with one flat, uniform, fully saturated magenta rectangle (#ff00ff). Keep fingers, glare, icons, text, reflections, gradients, and other objects completely outside that magenta rectangle.`);
  if (!await detectMagentaPhoneScreen(retried.bytes)) {
    throw new Error('phone screen marker was not detectable after one retry');
  }
  return { result: retried, attempts: 2 };
}

/**
 * Add an exact supplied brand mark after image generation so it remains
 * legible and consistent instead of relying on model-rendered typography.
 * Zamloan's white tagline may opt into local black/white contrast adaptation.
 * Anti-fraud layouts may force the tagline black because their logo-safe area
 * is always light by design.
 * Every other brand must retain the source asset's original colors.
 */
export async function overlayZamloanLogo(
  input: Buffer,
  logo: Buffer,
  options: {
    anchor?: 'left' | 'right';
    adaptTaglineContrast?: boolean;
    taglineTone?: ZamloanTaglineTone;
  } = {},
): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('generated poster has no readable dimensions');
  }

  const aspect = metadata.width / metadata.height;
  const isWidescreen = aspect >= 1.5;
  const isSquareOrPortrait = aspect <= 1.05;
  const logoWidth = Math.min(
    400,
    Math.max(180, Math.round(metadata.width * 0.24)),
  );
  const logoHeight = Math.round(metadata.height * (
    isWidescreen ? 0.15 : isSquareOrPortrait ? 0.07 : 0.12
  ));
  const logoSourceMetadata = await sharp(logo).metadata();
  const logoImage = logoSourceMetadata.format === 'svg'
    ? sharp(logo, { density: 384 })
    : sharp(logo);
  const resizedLogo = await logoImage
    .ensureAlpha()
    .resize({
      width: logoWidth,
      height: logoHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(resizedLogo).metadata();
  if (!logoMetadata.width || !logoMetadata.height) {
    throw new Error('Zamloan logo has no readable dimensions');
  }

  const logoLeft = Math.round(
    metadata.width * (options.anchor === 'right' ? 0.53 : 0.055),
  );
  const logoTop = Math.max(
    24,
    Math.round(metadata.height * (isSquareOrPortrait ? 0.035 : 0.05)),
  );
  const compositedLogo = options.adaptTaglineContrast === false
    ? resizedLogo
    : await adaptZamloanTaglineToBackground(
      resizedLogo,
      input,
      {
        left: logoLeft,
        top: logoTop,
        ...(options.taglineTone ? { tone: options.taglineTone } : {}),
      },
    );

  return sharp(input)
    .composite([{ input: compositedLogo, left: logoLeft, top: logoTop }])
    .png()
    .toBuffer();
}

export interface DetectedPhoneScreen {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isMagentaPhoneScreenPixel(data: Buffer, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  return red >= 155
    && blue >= 145
    && green <= 135
    && red - green >= 55
    && blue - green >= 45;
}

export async function detectMagentaPhoneScreen(
  input: Buffer,
): Promise<DetectedPhoneScreen | null> {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let markerPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (!isMagentaPhoneScreenPixel(data, offset)) continue;
      markerPixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const width = right - left + 1;
  const height = bottom - top + 1;
  const canvasPixels = Math.max(1, info.width * info.height);
  const boxPixels = Math.max(1, width * height);
  const aspect = width / height;
  if (
    markerPixels / canvasPixels < 0.002
    || markerPixels / boxPixels < 0.30
    || width / info.width < 0.06
    || width / info.width > 0.34
    || height / info.height < 0.14
    || height / info.height > 0.68
    || aspect < 0.25
    || aspect > 0.78
  ) {
    return null;
  }
  return { left, top, width, height };
}

export async function overlayPhoneScreenReference(
  input: Buffer,
  reference: Buffer,
): Promise<Buffer> {
  const target = await detectMagentaPhoneScreen(input);
  if (!target) {
    throw new Error('generated poster did not contain a detectable magenta phone screen');
  }
  const cornerRadius = Math.max(3, Math.round(target.width * 0.075));
  const mask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}">
      <rect width="${target.width}" height="${target.height}" rx="${cornerRadius}" fill="white"/>
    </svg>
  `);
  const screen = await sharp(reference)
    .resize({ width: target.width, height: target.height, fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(input)
    .composite([{ input: screen, left: target.left, top: target.top }])
    .png()
    .toBuffer();
}

/**
 * Composite the exact supplied Zamloan Z silhouette after provider rendering.
 * Image models are instructed not to draw a Z themselves, which prevents the
 * branded outline from drifting between generations.
 */
export async function overlayZamloanZReference(
  input: Buffer,
  zReference: Buffer,
): Promise<Buffer> {
  const image = sharp(input);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('generated poster has no readable dimensions');
  }

  const isWidescreen = metadata.width / metadata.height >= 1.5;
  const maxWidth = Math.round(metadata.width * (isWidescreen ? 0.62 : 0.82));
  const maxHeight = Math.round(metadata.height * (isWidescreen ? 0.90 : 0.74));
  const resized = await sharp(zReference)
    .ensureAlpha()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (!resized.info.width || !resized.info.height || resized.info.channels !== 4) {
    throw new Error('Zamloan Z reference has no readable RGBA dimensions');
  }
  for (let offset = 3; offset < resized.data.length; offset += 4) {
    resized.data[offset] = Math.round((resized.data[offset] ?? 0) * 0.14);
  }
  const zLayer = await sharp(resized.data, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  }).png().toBuffer();
  const left = Math.max(0, Math.round((metadata.width - resized.info.width) / 2));
  const top = Math.max(0, Math.round((metadata.height - resized.info.height) / 2));

  return image
    .composite([{ input: zLayer, left, top }])
    .png()
    .toBuffer();
}

export interface LayeredLoanPosterOptions {
  zReference: Buffer;
  foreground: Buffer;
  headline: string;
  subtitle: string;
  textAnchor: 'left' | 'right';
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapPosterCopy(value: string, maximumCharacters: number): string[] {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maximumCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines.slice(0, 4) : [''];
}

async function renderLoanPosterCopy(
  width: number,
  height: number,
  options: Pick<LayeredLoanPosterOptions, 'headline' | 'subtitle' | 'textAnchor'>,
): Promise<Buffer> {
  const widescreen = width / height >= 1.5;
  const columnLeft = Math.round(width * (options.textAnchor === 'right' ? 0.53 : 0.055));
  const columnWidth = Math.round(width * (options.textAnchor === 'right' ? 0.41 : 0.39));
  const headlineSize = Math.round(height * (widescreen ? 0.105 : 0.072));
  const headlineLineHeight = Math.round(headlineSize * 0.94);
  const subtitleSize = Math.round(height * (widescreen ? 0.042 : 0.034));
  const headlineTop = Math.round(height * (widescreen ? 0.28 : 0.22));
  const maximumHeadlineCharacters = Math.max(
    9,
    Math.floor(columnWidth / Math.max(1, headlineSize * 0.58)),
  );
  const maximumSubtitleCharacters = Math.max(
    16,
    Math.floor(columnWidth / Math.max(1, subtitleSize * 0.52)),
  );
  const headlineLines = wrapPosterCopy(options.headline, maximumHeadlineCharacters);
  const subtitleLines = wrapPosterCopy(options.subtitle, maximumSubtitleCharacters);
  const headlineTspans = headlineLines.map((line, index) => (
    `<tspan x="${columnLeft}" dy="${index === 0 ? 0 : headlineLineHeight}">${escapeSvgText(line)}</tspan>`
  )).join('');
  const subtitleTop = headlineTop
    + Math.max(1, headlineLines.length) * headlineLineHeight
    + Math.round(height * 0.045);
  const subtitleLineHeight = Math.round(subtitleSize * 1.28);
  const subtitleTspans = subtitleLines.map((line, index) => (
    `<tspan x="${columnLeft}" dy="${index === 0 ? 0 : subtitleLineHeight}">${escapeSvgText(line)}</tspan>`
  )).join('');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <filter id="copy-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="${Math.max(2, Math.round(height * 0.004))}" stdDeviation="${Math.max(2, Math.round(height * 0.004))}" flood-color="#200000" flood-opacity="0.42"/>
        </filter>
      </defs>
      <g fill="#ffffff" font-family="Arial, Helvetica, sans-serif" filter="url(#copy-shadow)">
        <text x="${columnLeft}" y="${headlineTop}" font-size="${headlineSize}" font-weight="800" letter-spacing="-1.2">${headlineTspans}</text>
        <text x="${columnLeft}" y="${subtitleTop}" font-size="${subtitleSize}" font-weight="600" letter-spacing="0.2">${subtitleTspans}</text>
      </g>
    </svg>
  `);
}

async function renderAntiFraudPosterCopy(
  width: number,
  height: number,
  options: Pick<LayeredLoanPosterOptions, 'headline' | 'subtitle' | 'textAnchor'>,
): Promise<Buffer> {
  const widescreen = width / height >= 1.5;
  const columnLeft = Math.round(width * (options.textAnchor === 'right' ? 0.53 : 0.055));
  const columnWidth = Math.round(width * (options.textAnchor === 'right' ? 0.41 : 0.43));
  const headlineSize = Math.round(height * (widescreen ? 0.098 : 0.068));
  const headlineLineHeight = Math.round(headlineSize * 0.94);
  const subtitleSize = Math.round(height * (widescreen ? 0.034 : 0.024));
  const subtitleLineHeight = Math.round(subtitleSize * 1.20);
  const headlineTop = Math.round(height * (widescreen ? 0.26 : 0.20));
  const maximumHeadlineCharacters = Math.max(
    9,
    Math.floor(columnWidth / Math.max(1, headlineSize * 0.58)),
  );
  const maximumSubtitleCharacters = Math.max(
    16,
    Math.floor(columnWidth / Math.max(1, subtitleSize * 0.52)),
  );
  const headlineLines = options.headline === 'Prevent Fraud'
    ? ['Prevent', 'Fraud']
    : wrapPosterCopy(options.headline, maximumHeadlineCharacters);
  const subtitleLines = options.subtitle === 'Trust Only Official Customer Service'
    ? ['Trust Only', 'Official Customer Service']
    : wrapPosterCopy(options.subtitle, maximumSubtitleCharacters);
  const headlineMarkup = headlineLines.map((line, index) => {
    const color = options.headline === 'Prevent Fraud' && index === 1
      ? '#ef5148'
      : '#202326';
    return `<tspan x="${columnLeft}" dy="${index === 0 ? 0 : headlineLineHeight}" fill="${color}">${escapeSvgText(line)}</tspan>`;
  }).join('');
  const subtitleTop = headlineTop
    + Math.max(1, headlineLines.length) * headlineLineHeight
    + Math.round(height * 0.025);
  const subtitleMarkup = subtitleLines.map((line, index) => {
    const color = options.subtitle === 'Trust Only Official Customer Service' && index === 1
      ? '#176a4d'
      : '#34383d';
    return `<tspan x="${columnLeft}" dy="${index === 0 ? 0 : subtitleLineHeight}" fill="${color}">${escapeSvgText(line)}</tspan>`;
  }).join('');
  const subtitleBottom = subtitleTop
    + Math.max(1, subtitleLines.length) * subtitleLineHeight;
  const messageLeft = columnLeft;
  const messageTop = Math.max(
    subtitleBottom + Math.round(height * 0.020),
    Math.round(height * (widescreen ? 0.54 : 0.43)),
  );
  const messageWidth = Math.round(columnWidth * (widescreen ? 0.80 : 0.76));
  const messageHeight = Math.round(height * (widescreen ? 0.20 : 0.13));
  const messageRadius = Math.round(messageHeight * 0.12);
  const messagePaddingX = Math.round(messageWidth * 0.040);
  const messagePaddingY = Math.round(messageHeight * 0.075);
  const appIconSize = Math.round(messageHeight * 0.22);
  const messageHeaderSize = Math.round(height * (widescreen ? 0.017 : 0.012));
  const senderSize = Math.round(height * (widescreen ? 0.020 : 0.015));
  const messageBodySize = Math.round(height * (widescreen ? 0.016 : 0.012));
  const headerBaseline = messageTop + messagePaddingY + Math.round(appIconSize * 0.72);
  const senderBaseline = messageTop + Math.round(messageHeight * 0.47);
  const bodyBaseline = messageTop + Math.round(messageHeight * 0.65);
  const cardDepthX = Math.max(5, Math.round(messageWidth * 0.025));
  const cardDepthY = Math.max(6, Math.round(messageHeight * 0.065));
  const contactSize = Math.round(messageWidth * 0.32);
  const contactLeft = messageLeft + Math.round(messageWidth * 0.07);
  const contactTop = messageTop
    + messageHeight
    + Math.round(height * (widescreen ? 0.035 : 0.040));
  const contactDepth = Math.max(7, Math.round(contactSize * 0.10));
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="contact-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff7868"/>
          <stop offset="100%" stop-color="#ed4039"/>
        </linearGradient>
      </defs>
      <g font-family="Arial Black, Helvetica Neue, Arial, sans-serif">
        <text x="${columnLeft}" y="${headlineTop}" font-size="${headlineSize}" font-weight="900" letter-spacing="${Math.round(headlineSize * -0.025)}">${headlineMarkup}</text>
        <text x="${columnLeft}" y="${subtitleTop}" font-size="${subtitleSize}" font-weight="900" letter-spacing="${Math.round(subtitleSize * -0.010)}">${subtitleMarkup}</text>
      </g>
      <g transform="translate(${messageLeft} ${messageTop}) skewY(3)">
        <rect x="${cardDepthX}" y="${cardDepthY}" width="${messageWidth}" height="${messageHeight}" rx="${messageRadius}" fill="#bfc2c5"/>
        <rect width="${messageWidth}" height="${messageHeight}" rx="${messageRadius}" fill="#f0f1f2" stroke="#d0d3d5" stroke-width="${Math.max(1, Math.round(width * 0.0012))}"/>
        <path d="M ${messageRadius} 1 H ${messageWidth - messageRadius}" stroke="#ffffff" stroke-opacity="0.70" stroke-width="${Math.max(1, Math.round(height * 0.0015))}" stroke-linecap="round"/>
        <g transform="translate(${messagePaddingX} ${messagePaddingY})">
          <rect width="${appIconSize}" height="${appIconSize}" rx="${Math.round(appIconSize * 0.25)}" fill="#24cf5f"/>
          <ellipse cx="${appIconSize * 0.50}" cy="${appIconSize * 0.46}" rx="${appIconSize * 0.31}" ry="${appIconSize * 0.25}" fill="#ffffff"/>
          <path d="M ${appIconSize * 0.32} ${appIconSize * 0.61} L ${appIconSize * 0.24} ${appIconSize * 0.78} L ${appIconSize * 0.46} ${appIconSize * 0.66} Z" fill="#ffffff"/>
        </g>
        <text x="${messagePaddingX + appIconSize + Math.round(messagePaddingX * 0.50)}" y="${headerBaseline - messageTop}" font-family="Arial, Helvetica, sans-serif" font-size="${messageHeaderSize}" font-weight="600" letter-spacing="${Math.round(messageHeaderSize * 0.025)}" fill="#35383c">MESSAGES</text>
        <text x="${messageWidth - messagePaddingX}" y="${headerBaseline - messageTop}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${messageHeaderSize}" font-weight="500" fill="#35383c">now</text>
        <text x="${messagePaddingX}" y="${senderBaseline - messageTop}" font-family="Arial Black, Helvetica Neue, Arial, sans-serif" font-size="${senderSize}" font-weight="900" fill="#16181a">Unknown Sender</text>
        <text x="${messagePaddingX}" y="${bodyBaseline - messageTop}" font-family="Arial, Helvetica, sans-serif" font-size="${messageBodySize}" font-weight="500" fill="#25282b">
          <tspan x="${messagePaddingX}">Your loan is approved.</tspan>
          <tspan x="${messagePaddingX}" dy="${Math.round(messageBodySize * 1.10)}">Pay a processing fee now</tspan>
          <tspan x="${messagePaddingX}" dy="${Math.round(messageBodySize * 1.10)}">to receive your money.</tspan>
        </text>
      </g>
      <g transform="translate(${contactLeft} ${contactTop}) skewY(3)">
        <rect x="${contactDepth}" y="${contactDepth}" width="${contactSize}" height="${contactSize}" rx="${Math.round(contactSize * 0.14)}" fill="#c63c35"/>
        <rect width="${contactSize}" height="${contactSize}" rx="${Math.round(contactSize * 0.14)}" fill="url(#contact-face)" stroke="#ff9485" stroke-width="${Math.max(1, Math.round(contactSize * 0.018))}"/>
        <circle cx="${contactSize * 0.50}" cy="${contactSize * 0.50}" r="${contactSize * 0.32}" fill="#fff7ed" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(contactSize * 0.025))}"/>
        <circle cx="${contactSize * 0.50}" cy="${contactSize * 0.39}" r="${contactSize * 0.105}" fill="#ef5148"/>
        <path d="M ${contactSize * 0.30} ${contactSize * 0.68} C ${contactSize * 0.34} ${contactSize * 0.50}, ${contactSize * 0.66} ${contactSize * 0.50}, ${contactSize * 0.70} ${contactSize * 0.68} Z" fill="#ef5148"/>
        <path d="M ${contactSize * 0.24} ${contactSize * 0.24} L ${contactSize * 0.76} ${contactSize * 0.76}" stroke="#ef5148" stroke-width="${Math.max(4, Math.round(contactSize * 0.075))}" stroke-linecap="round"/>
        <path d="M ${contactSize * 0.24} ${contactSize * 0.24} L ${contactSize * 0.76} ${contactSize * 0.76}" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(contactSize * 0.030))}" stroke-linecap="round"/>
      </g>
    </svg>
  `);
}

async function renderAntiFraudMessageOverlay(
  width: number,
  height: number,
  placement: AntiFraudMessagePlacement,
): Promise<Buffer> {
  const aspect = width / height;
  const widescreen = aspect >= 1.5;
  const square = !widescreen && aspect >= 0.9;
  const { width: messageWidth, height: messageHeight } = placement;
  const badgeSize = Math.round(messageHeight * 0.28);
  const badgeOverhangX = Math.round(badgeSize * 0.22);
  const badgeOverhangY = badgeSize - Math.round(badgeSize * 0.72);
  const tileWidth = messageWidth + badgeOverhangX;
  const tileHeight = messageHeight + badgeOverhangY;
  // A transparent gutter captures outer strokes before the projective resample.
  const messageLeft = badgeOverhangX + 2;
  const messageTop = 2;
  const messageRadius = Math.round(messageHeight * 0.12);
  const messagePaddingX = Math.round(messageWidth * 0.052);
  const messagePaddingY = Math.round(messageHeight * 0.095);
  const appIconSize = Math.round(messageHeight * 0.18);
  const messageHeaderSize = Math.round(height * (widescreen ? 0.015 : square ? 0.0145 : 0.0115));
  const senderSize = Math.round(height * (widescreen ? 0.019 : square ? 0.018 : 0.0145));
  const messageBodySize = Math.round(height * (widescreen ? 0.0155 : square ? 0.015 : 0.0115));
  const headerBaseline = messagePaddingY + Math.round(appIconSize * 0.72);
  const senderBaseline = Math.round(messageHeight * 0.49);
  const bodyBaseline = Math.round(messageHeight * 0.69);
  const badgeLeft = messageLeft - Math.round(badgeSize * 0.22);
  const badgeTop = messageTop + messageHeight - Math.round(badgeSize * 0.72);
  const flatTile = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth + 4}" height="${tileHeight + 4}">
      <g transform="translate(${messageLeft} ${messageTop})">
        <rect width="${messageWidth}" height="${messageHeight}" rx="${messageRadius}" fill="#f4f5f6" fill-opacity="0.96" stroke="#c9cdd1" stroke-width="${Math.max(1, Math.round(width * 0.0013))}"/>
        <g transform="translate(${messagePaddingX} ${messagePaddingY})">
          <rect width="${appIconSize}" height="${appIconSize}" rx="${Math.round(appIconSize * 0.25)}" fill="#24cf5f"/>
          <ellipse cx="${appIconSize * 0.50}" cy="${appIconSize * 0.46}" rx="${appIconSize * 0.31}" ry="${appIconSize * 0.25}" fill="#ffffff"/>
          <path d="M ${appIconSize * 0.32} ${appIconSize * 0.61} L ${appIconSize * 0.24} ${appIconSize * 0.78} L ${appIconSize * 0.46} ${appIconSize * 0.66} Z" fill="#ffffff"/>
        </g>
        <text x="${messagePaddingX + appIconSize + Math.round(messagePaddingX * 0.55)}" y="${headerBaseline}" font-family="Arial, Helvetica, sans-serif" font-size="${messageHeaderSize}" font-weight="700" letter-spacing="${Math.round(messageHeaderSize * 0.018)}" fill="#30343a">MESSAGES</text>
        <text x="${messagePaddingX}" y="${senderBaseline}" font-family="Arial, Helvetica, sans-serif" font-size="${senderSize}" font-weight="800" fill="#14171a">Unknown Sender</text>
        <text x="${messagePaddingX}" y="${bodyBaseline}" font-family="Arial, Helvetica, sans-serif" font-size="${messageBodySize}" font-weight="500" fill="#202428">
          <tspan x="${messagePaddingX}">Your loan is approved.</tspan>
          <tspan x="${messagePaddingX}" dy="${Math.round(messageBodySize * 1.18)}">Pay a processing fee now.</tspan>
        </text>
      </g>
      <g transform="translate(${badgeLeft} ${badgeTop})">
        <rect width="${badgeSize}" height="${badgeSize}" rx="${Math.round(badgeSize * 0.24)}" fill="#ef5148" stroke="#ff8178" stroke-width="${Math.max(1, Math.round(badgeSize * 0.035))}"/>
        <circle cx="${badgeSize * 0.50}" cy="${badgeSize * 0.40}" r="${badgeSize * 0.11}" fill="#ffffff"/>
        <path d="M ${badgeSize * 0.29} ${badgeSize * 0.70} C ${badgeSize * 0.33} ${badgeSize * 0.51}, ${badgeSize * 0.67} ${badgeSize * 0.51}, ${badgeSize * 0.71} ${badgeSize * 0.70} Z" fill="#ffffff"/>
        <path d="M ${badgeSize * 0.24} ${badgeSize * 0.24} L ${badgeSize * 0.76} ${badgeSize * 0.76}" stroke="#ef5148" stroke-width="${Math.max(4, Math.round(badgeSize * 0.13))}" stroke-linecap="round"/>
        <path d="M ${badgeSize * 0.24} ${badgeSize * 0.24} L ${badgeSize * 0.76} ${badgeSize * 0.76}" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(badgeSize * 0.055))}" stroke-linecap="round"/>
      </g>
    </svg>
  `);
  const tile = await warpAntiFraudMessage(flatTile, tileWidth, tileHeight);
  // The transformed tile stays wholly inside the exact envelope already checked
  // by placeAntiFraudMessage, including the red badge. Other pixels are untouched.
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: tile, left: placement.left - badgeOverhangX, top: placement.top }])
    .png().toBuffer();
}

async function renderPosterCopy(
  width: number,
  height: number,
  options: Pick<LayeredLoanPosterOptions, 'headline' | 'subtitle' | 'textAnchor'> & {
    copyStyle?: PosterCopyStyle;
    messagePlacement?: AntiFraudMessagePlacement;
  },
): Promise<Buffer> {
  if (options.copyStyle === 'anti-fraud') {
    return renderAntiFraudPosterCopy(width, height, options);
  }
  if (options.copyStyle === 'anti-fraud-message') {
    if (!options.messagePlacement) throw new PosterHandLayoutError('message placement is missing');
    return renderAntiFraudMessageOverlay(width, height, options.messagePlacement);
  }
  return renderLoanPosterCopy(width, height, options);
}

export async function overlayPosterCopy(
  input: Buffer,
  options: Pick<LayeredLoanPosterOptions, 'headline' | 'subtitle' | 'textAnchor'> & {
    copyStyle?: PosterCopyStyle;
    handObservation?: PosterHandObservation;
  },
): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('poster image has no readable dimensions');
  }
  const observation = options.copyStyle === 'anti-fraud-message'
    ? options.handObservation ?? await (await createPosterHandDetector())(input)
    : undefined;
  const copy = await renderPosterCopy(metadata.width, metadata.height, {
    ...options,
    ...(observation ? { messagePlacement: placeAntiFraudMessage(metadata.width, metadata.height, observation) } : {}),
  });
  return sharp(input)
    .composite([{ input: copy, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function isChromaGreenPixel(
  data: Buffer,
  offset: number,
): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  return green >= 110 && green - red >= 35 && green - blue >= 35;
}

function hasAdjacentMaskedPixel(
  mask: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) continue;
      const nextX = x + deltaX;
      const nextY = y + deltaY;
      if (
        nextX >= 0
        && nextX < width
        && nextY >= 0
        && nextY < height
        && mask[nextY * width + nextX] === 1
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Accept provider-native alpha when available, otherwise remove an opaque
 * edge-connected chroma-green matte. Restricting removal to pixels connected
 * to the canvas boundary preserves enclosed green details such as the phone
 * success checkmark.
 */
export async function prepareLayeredForeground(
  foreground: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const { data, info } = await sharp(foreground)
    .ensureAlpha()
    .resize({ width, height, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    const alpha = data[offset] ?? 255;
    if (alpha < 250) transparentPixels += 1;
    if (alpha > 8) visiblePixels += 1;
  }
  const pixelCount = Math.max(1, info.width * info.height);
  if (transparentPixels / pixelCount < 0.05) {
    const matteMask = Buffer.alloc(pixelCount);
    const queue = new Int32Array(pixelCount);
    let queueStart = 0;
    let queueEnd = 0;
    const enqueue = (pixelIndex: number) => {
      if (matteMask[pixelIndex] === 1) return;
      const offset = pixelIndex * info.channels;
      if (!isChromaGreenPixel(data, offset)) return;
      matteMask[pixelIndex] = 1;
      queue[queueEnd] = pixelIndex;
      queueEnd += 1;
    };

    for (let x = 0; x < info.width; x += 1) {
      enqueue(x);
      enqueue((info.height - 1) * info.width + x);
    }
    for (let y = 1; y < info.height - 1; y += 1) {
      enqueue(y * info.width);
      enqueue(y * info.width + info.width - 1);
    }

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart] ?? 0;
      queueStart += 1;
      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);
      if (x > 0) enqueue(pixelIndex - 1);
      if (x + 1 < info.width) enqueue(pixelIndex + 1);
      if (y > 0) enqueue(pixelIndex - info.width);
      if (y + 1 < info.height) enqueue(pixelIndex + info.width);
    }

    if (queueEnd / pixelCount < 0.05) {
      throw new Error(
        'layered poster foreground did not contain an edge-connected chroma green matte',
      );
    }

    visiblePixels = 0;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * info.channels;
      if (matteMask[pixelIndex] === 1) {
        data[offset + 3] = 0;
        continue;
      }
      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);
      if (hasAdjacentMaskedPixel(matteMask, x, y, info.width, info.height)) {
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const greenDominance = Math.max(0, green - Math.max(red, blue));
        const spill = Math.min(1, greenDominance / 120);
        data[offset + 1] = Math.min(green, Math.max(red, blue) + 18);
        data[offset + 3] = Math.max(24, Math.round(255 * (1 - spill * 0.82)));
      }
      if ((data[offset + 3] ?? 0) > 8) visiblePixels += 1;
    }
  }
  if (visiblePixels / pixelCount < 0.01) {
    throw new Error('layered poster foreground did not contain a visible model');
  }
  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer();
}

async function renderLayeredForegroundWithMatteRetry<T extends { bytes: Buffer }>(
  background: Buffer,
  prompt: string,
  render: (resolvedPrompt: string) => Promise<T>,
): Promise<{ result: T; foreground: Buffer; attempts: number }> {
  const metadata = await sharp(background).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('layered poster background has no readable dimensions');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const resolvedPrompt = [
      prompt,
      LAYERED_FOREGROUND_MATTE_INSTRUCTIONS,
      attempt > 1 ? LAYERED_FOREGROUND_MATTE_RETRY_INSTRUCTIONS : '',
    ].filter(Boolean).join('\n\n');
    const result = await render(resolvedPrompt);
    try {
      return {
        result,
        foreground: await prepareLayeredForeground(
          result.bytes,
          metadata.width,
          metadata.height,
        ),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`layered poster foreground matte extraction failed after 2 attempts: ${detail}`);
}

/**
 * Build the poster as real pixel layers: background → exact Z → isolated
 * model → deterministic copy. The Zamloan logo is added by the caller last.
 */
export async function composeLayeredLoanPoster(
  background: Buffer,
  options: LayeredLoanPosterOptions,
): Promise<Buffer> {
  const metadata = await sharp(background).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('layered poster background has no readable dimensions');
  }
  const withZ = await overlayZamloanZReference(background, options.zReference);
  const foreground = await prepareLayeredForeground(
    options.foreground,
    metadata.width,
    metadata.height,
  );
  const copy = await renderLoanPosterCopy(metadata.width, metadata.height, options);
  return sharp(withZ)
    .composite([
      { input: foreground, left: 0, top: 0 },
      { input: copy, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Finalize generated PNG pixels before persistence. Lossless optimization runs
 * before the brand overlay so the logo is rasterized exactly once at its final
 * poster size.
 */
export async function finalizeGeneratedPng(
  input: Buffer,
  options: {
    loanPosterOutput: boolean;
    overlayZ?: Buffer;
    foreground?: Buffer;
    posterHeadline?: string;
    posterSubtitle?: string;
    posterTextAnchor?: 'left' | 'right';
    posterCopyStyle?: PosterCopyStyle;
    posterHandObservation?: PosterHandObservation;
    phoneScreen?: Buffer;
    overlayLogo?: Buffer;
    overlayLogoAnchor?: 'left' | 'right';
    adaptZamloanTaglineContrast?: boolean;
    zamloanTaglineTone?: ZamloanTaglineTone;
  },
): Promise<Buffer> {
  let bytes = (
    options.loanPosterOutput
      ? await optimizeLoanPosterPng(input)
      : await optimizeLosslessPng(input)
  ).bytes;
  const hasLayeredPoster = Boolean(
    options.overlayZ
    && options.foreground
    && options.posterHeadline
    && options.posterSubtitle
    && options.posterTextAnchor,
  );
  if (hasLayeredPoster) {
    bytes = await composeLayeredLoanPoster(bytes, {
      zReference: options.overlayZ!,
      foreground: options.foreground!,
      headline: options.posterHeadline!,
      subtitle: options.posterSubtitle!,
      textAnchor: options.posterTextAnchor!,
    });
  } else if (options.overlayZ) {
    bytes = await overlayZamloanZReference(bytes, options.overlayZ);
  }
  if (!hasLayeredPoster && options.posterHeadline && options.posterSubtitle && options.posterTextAnchor) {
    bytes = await overlayPosterCopy(bytes, {
      headline: options.posterHeadline,
      subtitle: options.posterSubtitle,
      textAnchor: options.posterTextAnchor,
      ...(options.posterCopyStyle ? { copyStyle: options.posterCopyStyle } : {}),
      ...(options.posterHandObservation ? { handObservation: options.posterHandObservation } : {}),
    });
  }
  if (options.phoneScreen) {
    bytes = await overlayPhoneScreenReference(bytes, options.phoneScreen);
  }
  if (options.overlayLogo) {
    bytes = await overlayZamloanLogo(
      bytes,
      options.overlayLogo,
      {
        ...(options.overlayLogoAnchor ? { anchor: options.overlayLogoAnchor } : {}),
        adaptTaglineContrast: options.adaptZamloanTaglineContrast ?? true,
        ...(options.zamloanTaglineTone
          ? { taglineTone: options.zamloanTaglineTone }
          : {}),
      },
    );
  }
  return bytes;
}

type MediaContext = {
  surface: MediaSurface;
  /**
   * Registered catalog id (e.g. `dall-e-3`, `gpt-4o-mini-tts`,
   * `doubao-seedream-3-0-t2i-250415`). Every model-family branch in
   * the renderers below keys off this field so DALL·E sizing,
   * gpt-image quality, gpt-4o-mini-tts instructions, and the
   * MINIMAX/FISHAUDIO TTS lookup tables continue to fire even when
   * the user has aliased the catalog id to a custom wire-name via
   * issue #1277's alias layer. lefarcen + codex P2 review on PR
   * #1309 caught the regression where a single `ctx.model` doubled
   * for both purposes and accidentally disabled the capability
   * branches under aliasing.
   */
  model: string;
  /**
   * What the provider's request body should carry as `model` (or
   * what gets templated into the URL for Azure-style deployment
   * routing). Equal to `model` when no alias is configured; equal
   * to the user-supplied alias from `OD_MEDIA_MODEL_ALIASES` /
   * `media-config.json` otherwise. Renderers must use this field
   * for `body.model = ...` and for `providerNote` so users see
   * what was actually sent.
   */
  wireModel: string;
  modelDef: MediaModel;
  provider: MediaProvider | null;
  prompt: string;
  aspect: string | undefined;
  quality: ImageQuality | undefined;
  length: number | undefined;
  duration: number | undefined;
  voice: string;
  audioKind: AudioKind | undefined;
  language: string;
  loop: boolean;
  promptInfluence: number | undefined;
  compositionDir: string | null;
  imageRef: ImageRef | null;
  signal?: AbortSignal;
  imageRecovery?: ReturnType<typeof createImageRequestRecovery>;
};
type RenderResult = { bytes: Buffer; providerNote: string; suggestedExt?: string };
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStringProp(err: unknown, key: string): string {
  return isRecord(err) && typeof err[key] === 'string' ? err[key] : '';
}
const NANOBANANA_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
// Verify the current Nano Banana / Gemini image model name against:
// https://ai.google.dev/gemini-api/docs/models
const NANOBANANA_DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
const NANOBANANA_DEFAULT_IMAGE_SIZE = '1K';
const IMAGEROUTER_DEFAULT_BASE_URL = 'https://api.imagerouter.io/v1/openai';
const CUSTOM_IMAGE_MODEL_ID = 'custom-image';

const DEFAULT_OUTPUT_BY_SURFACE = {
  image: 'image.png',
  video: 'video.mp4',
  audio: 'audio.mp3',
};

const SURFACES = new Set(['image', 'video', 'audio']);
const AUDIO_KINDS = new Set(['music', 'speech', 'sfx']);

// Stubs ship a 1×1 PNG / ~24-byte mp4 / silent WAV / single-frame mp3 so
// the dispatch path is exercisable before real provider integrations
// land. On a release build that lands as "successful" but functionally
// empty bytes — confusing to users. We therefore gate the stub renderers
// behind OD_MEDIA_ALLOW_STUBS=1 and otherwise return a 503 (mapped from
// the StubProviderDisabledError thrown below) with a clear message.
class StubProviderDisabledError extends Error {
  code = 'STUB_PROVIDER_DISABLED';
  status = 503;
  constructor(model: string) {
    super(
      `provider not configured: ${model}. Add your API key in Settings -> Media Providers to enable real generation.`,
    );
    this.name = 'StubProviderDisabledError';
  }
}

function stubsAllowed() {
  const v = process.env.OD_MEDIA_ALLOW_STUBS;
  return v === '1' || v === 'true';
}

/**
 * Resolve a project-relative image input. Provider references default to the
 * raster formats accepted by upstream model APIs. Post-generation overlays
 * may additionally use SVG because they are rasterized locally by Sharp and
 * are never sent to a provider.
 *
 * Security: refuses anything that escapes the project directory.
 * Without this guard, an agent (or a hallucinated arg) could ask the
 * daemon to upload `/etc/passwd` to a paid model.
 */
async function resolveProjectImage(
  rel: unknown,
  projectDir: string,
  options: {
    argumentName?: '--image' | '--overlay-z' | '--overlay-logo' | '--overlay-phone-screen';
    allowSvg?: boolean;
  } = {},
): Promise<ImageRef | null> {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const argumentName = options.argumentName ?? '--image';
  const projectRootResolved = path.resolve(projectDir);
  const abs = path.resolve(projectRootResolved, rel.trim());
  if (
    abs !== projectRootResolved &&
    !abs.startsWith(projectRootResolved + path.sep)
  ) {
    throw new Error(
      `${argumentName} path "${rel}" resolves outside the project directory.`,
    );
  }
  let info;
  try {
    info = await stat(abs);
  } catch {
    throw new Error(`${argumentName} not found: ${rel}`);
  }
  if (!info.isFile()) {
    throw new Error(`${argumentName} is not a regular file: ${rel}`);
  }
  // Cap at 16 MB. Beyond this, base64 inflation alone (≈4/3) starts
  // hitting body-size limits at the upstream APIs and our own express
  // 4mb body cap on inbound requests; bigger payloads should travel
  // via the dedicated upload endpoint, not the dispatcher.
  const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
  if (info.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `${argumentName} too large (${info.size} bytes; max ${MAX_IMAGE_BYTES}).`,
    );
  }
  const bytes = await readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimeByExtension = options.allowSvg
    ? OVERLAY_IMAGE_MIME_BY_EXTENSION
    : RASTER_IMAGE_MIME_BY_EXTENSION;
  const mime = mimeByExtension[ext];
  if (!mime) {
    const allowed = options.allowSvg
      ? 'svg, png, jpg, jpeg, webp, or gif'
      : 'png, jpg, jpeg, webp, or gif';
    throw new Error(
      `${argumentName} has unsupported extension "${ext}". Use ${allowed}.`,
    );
  }
  return {
    path: rel.trim(),
    abs,
    mime,
    size: bytes.length,
    dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
  };
}

function clampNumber(value: unknown, allowed: number[]): number | undefined {
  // Accept exact registry values; otherwise snap to the nearest allowed
  // bucket so a hallucinated `Number.MAX_SAFE_INTEGER` can't bill an
  // entire month of credits when real providers plug in.
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (allowed.length === 0) return undefined;
  if (allowed.includes(value)) return value;
  let best = allowed[0]!;
  let bestDiff = Math.abs(value - best);
  for (const a of allowed) {
    const d = Math.abs(value - a);
    if (d < bestDiff) {
      best = a;
      bestDiff = d;
    }
  }
  return best;
}

function clampWithWarning(value: unknown, allowed: number[], flagName: string): { value: number | undefined; warning: string | null } {
  const clamped = clampNumber(value, allowed);
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && typeof clamped === 'number'
    && clamped !== value
  ) {
    return {
      value: clamped,
      warning: `--${flagName} ${value} clamped to ${clamped} (allowed: ${allowed.join(', ')})`,
    };
  }
  return { value: clamped, warning: null };
}

/**
 * Generate a media artifact and write it into the project's files dir.
 *
 * @param {Object} args
 * @param {string} args.projectRoot   - Repo root (.od/ lives directly under).
 * @param {string} args.projectsRoot  - Absolute path to <repo>/.od/projects.
 * @param {string} args.projectId
 * @param {'image'|'video'|'audio'} args.surface
 * @param {string} args.model
 * @param {string} [args.prompt]
 * @param {string} [args.output]
 * @param {string} [args.aspect]
 * @param {number} [args.length]
 * @param {number} [args.duration]
 * @param {string} [args.voice]
 * @param {string} [args.audioKind]
 * @param {string} [args.language]
 * @returns {Promise<{ name: string, size: number, mtime: number, kind: string, mime: string, model: string, surface: string, providerNote: string, providerId: string }>}
 */
export async function generateMedia(args: {
  /** Internal continuation: cached provider images only; never charges again. */
  posterRecoveryOnly?: boolean;
  projectRoot: string; projectsRoot: string; projectId: string; surface: MediaSurface; model: string;
  prompt?: string; output?: string; aspect?: string; length?: number; duration?: number; voice?: string;
  quality?: ImageQuality;
  loanPosterOutput?: boolean;
  audioKind?: AudioKind; language?: string; loop?: boolean; promptInfluence?: number;
  compositionDir?: string; image?: string; overlayZ?: string; overlayLogo?: string;
  overlayLogoAnchor?: 'left' | 'right';
  overlayPhoneScreen?: string;
  foregroundPrompt?: string;
  posterHeadline?: string;
  posterSubtitle?: string;
  posterTextAnchor?: 'left' | 'right';
  posterCopyStyle?: PosterCopyStyle;
  onProgress?: ProgressFn; signal?: AbortSignal;
}) {
  const {
    projectRoot,
    projectsRoot,
    projectId,
    surface,
    model,
    prompt,
    output,
    aspect,
    quality,
    loanPosterOutput,
    length,
    duration,
    voice,
    audioKind,
    language,
    loop,
    promptInfluence,
    compositionDir,
    image,
    overlayZ,
    overlayLogo,
    overlayLogoAnchor,
    overlayPhoneScreen,
    foregroundPrompt,
    posterHeadline,
    posterSubtitle,
    posterTextAnchor,
    posterCopyStyle,
  } = args;

  if (!projectRoot) throw new Error('projectRoot required');
  if (!projectsRoot) throw new Error('projectsRoot required');
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('projectId required');
  }
  if (!SURFACES.has(surface)) {
    throw new Error(`unsupported surface: ${surface}`);
  }
  if (typeof model !== 'string' || !model) {
    throw new Error('model required');
  }
  if (surface === 'audio' && audioKind && !AUDIO_KINDS.has(audioKind)) {
    throw new Error(
      `unsupported audioKind: ${audioKind}. Allowed: music | speech | sfx.`,
    );
  }
  if (
    quality !== undefined
    && !(['low', 'medium', 'high', 'auto'] as const).includes(quality)
  ) {
    throw new Error('unsupported image quality. Allowed: low | medium | high | auto.');
  }
  const def = findMediaModel(model);
  if (!def) {
    throw new Error(
      `unknown model: ${model}. Pass --model from the registered list (see /api/media/models).`,
    );
  }
  // Reject cross-surface combinations (e.g. surface=image + model=seedance-2)
  // here so the dispatcher never silently routes a video model id through
  // the image renderer. We compare against the surface-specific list — for
  // audio we further restrict to the kind-specific bucket so a `music`
  // surface can't bill an `elevenlabs-v3` (speech) call.
  const resolvedAudioKind =
    surface === 'audio' ? audioKind || 'music' : undefined;
  const allowed = modelsForSurface(surface, resolvedAudioKind);
  if (!allowed.some((m) => m.id === model)) {
    const ids = allowed.map((m) => m.id).join(', ');
    const where =
      surface === 'audio' ? `audio · ${resolvedAudioKind}` : surface;
    throw new Error(
      `model "${model}" is not registered for surface "${where}". Allowed: ${ids}.`,
    );
  }

  // Clamp registry-bound numeric inputs to their allowed buckets so a
  // hallucinated --length 9999999 doesn't reach a real provider as-is
  // when stubs are swapped for paid integrations.
  const lengthClamp =
    surface === 'video'
      ? clampWithWarning(length, VIDEO_LENGTHS_SEC, 'length')
      : { value: undefined, warning: null };
  const usesProviderSpecificAudioDuration =
    def.provider === 'elevenlabs'
    && surface === 'audio'
    && resolvedAudioKind === 'sfx';
  const durationClamp =
    surface === 'audio' && !usesProviderSpecificAudioDuration
      ? clampWithWarning(duration, AUDIO_DURATIONS_SEC, 'duration')
      : { value: undefined, warning: null };
  const clampedLength = lengthClamp.value;
  const clampedDuration = usesProviderSpecificAudioDuration
    ? duration
    : durationClamp.value;
  const warnings = [lengthClamp.warning, durationClamp.warning].filter(Boolean);

  const dir = await ensureProject(projectsRoot, projectId);
  const safeOut = sanitizeName(
    output || autoOutputName(surface, model, resolvedAudioKind),
  );
  const target = path.join(dir, safeOut);
  await mkdir(path.dirname(target), { recursive: true });

  // Reference image for image-to-video / image-edit flows. The agent
  // passes a project-relative path; we read it once here, validate it
  // stays inside the project, and turn it into a base64 data URL the
  // upstream APIs accept directly. Renderers consume `ctx.imageRef`
  // and decide how to splice the data URL into their request.
  const imageRef = await resolveProjectImage(image, dir);
  const overlayZRef = await resolveProjectImage(overlayZ, dir, {
    argumentName: '--overlay-z',
  });
  const overlayLogoRef = await resolveProjectImage(overlayLogo, dir, {
    argumentName: '--overlay-logo',
    allowSvg: true,
  });
  const overlayPhoneScreenRef = await resolveProjectImage(overlayPhoneScreen, dir, {
    argumentName: '--overlay-phone-screen',
    allowSvg: true,
  });
  if (overlayLogoAnchor && !['left', 'right'].includes(overlayLogoAnchor)) {
    throw new Error('unsupported overlay logo anchor. Allowed: left | right.');
  }
  if (posterTextAnchor && !['left', 'right'].includes(posterTextAnchor)) {
    throw new Error('unsupported poster text anchor. Allowed: left | right.');
  }
  if (overlayPhoneScreenRef && surface !== 'image') {
    throw new Error('phone screen overlay requires an image surface');
  }
  if (
    posterCopyStyle
    && !['standard', 'anti-fraud', 'anti-fraud-message'].includes(posterCopyStyle)
  ) {
    throw new Error(
      'unsupported poster copy style. Allowed: standard | anti-fraud | anti-fraud-message.',
    );
  }
  const posterCopyValues = [
    posterHeadline,
    posterSubtitle,
    posterTextAnchor,
  ];
  const posterCopyRequested = posterCopyValues.some(Boolean);
  const completePosterCopy = posterCopyValues.every(Boolean);
  if (posterCopyRequested && !completePosterCopy) {
    throw new Error(
      'poster copy requires posterHeadline, posterSubtitle, and posterTextAnchor',
    );
  }
  if (posterCopyStyle && !completePosterCopy) {
    throw new Error('poster copy style requires complete poster copy');
  }
  const layeredPosterRequested = Boolean(foregroundPrompt);
  if (layeredPosterRequested && !completePosterCopy) {
    throw new Error(
      'layered poster requires foregroundPrompt, posterHeadline, posterSubtitle, and posterTextAnchor',
    );
  }
  if (layeredPosterRequested && (!overlayZRef || surface !== 'image')) {
    throw new Error('layered poster requires an image surface and --overlay-z');
  }
  if (layeredPosterRequested && def.provider !== 'openai') {
    throw new Error('layered poster foregrounds currently require a gpt-image model');
  }

  // Resolve any user-configured model alias BEFORE we hand the id to a
  // dispatcher (issue #1277). Catalog lookup + surface validation above
  // ran against the original id so we still enforce the registered
  // catalog; the alias only changes what the provider receives on the
  // wire. lefarcen + codex P2 on PR #1309: keep BOTH values on ctx so
  // capability branches (DALL-E sizing, gpt-image quality, gpt-4o-mini-tts
  // instructions, MINIMAX/FISHAUDIO TTS map) continue to key off the
  // catalog id while the provider's request body carries the alias.
  const wireModel = await resolveModelAlias(projectRoot, model);
  const ctx = {
    surface,
    model,
    wireModel,
    modelDef: def,
    provider: findProvider(def.provider),
    prompt: prompt || '',
    aspect: aspect || defaultAspectFor(surface),
    quality: surface === 'image' ? quality : undefined,
    length: clampedLength,
    duration: clampedDuration,
    voice: voice || '',
    audioKind: resolvedAudioKind,
    language: language || '',
    loop: loop === true,
    promptInfluence: typeof promptInfluence === 'number' && Number.isFinite(promptInfluence)
      ? promptInfluence
      : undefined,
    // Project-relative path to the directory the agent scaffolded with
    // hyperframes.json / meta.json / index.html. Only consumed by the
    // hyperframes renderer; null/empty for every other provider.
    compositionDir: typeof compositionDir === 'string' ? compositionDir : null,
    // Resolved reference image for i2v / image-edit flows. `null` when
    // the agent didn't pass --image. See resolveProjectImage below.
    imageRef,
    ...(surface === 'image' && def.provider === 'openai'
      ? { imageRecovery: createImageRequestRecovery({ signal: args.signal, onProgress: args.onProgress, poster: loanPosterOutput === true }) }
      : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  };

  if (args.posterRecoveryOnly && !(surface === 'image' && def.provider === 'openai' && loanPosterOutput
    && posterCopyStyle === 'anti-fraud-message' && !overlayPhoneScreenRef && !layeredPosterRequested)) {
    throw Object.assign(new Error('Poster recovery only supports saved anti-fraud image stages'), { status: 409, code: 'poster_checkpoint_missing' });
  }
  const detectPosterHands = surface === 'image' && posterCopyStyle === 'anti-fraud-message'
    ? await createPosterHandDetector({ signal: args.signal, onProgress: args.onProgress })
    : undefined;
  let posterHandObservation: PosterHandObservation | undefined;
  const preserveLayoutDraft = async (input: Buffer, error: PosterHandLayoutError, observation?: PosterHandObservation) => {
    // Drafts are not finished posters and must not overwrite the requested output
    // or enter the successful-generation gallery. Keep provider bytes unchanged.
    const draftRoot = path.join(dir, '.poster-layout-drafts');
    await mkdir(draftRoot, { recursive: true, mode: 0o700 });
    const draftDir = await mkdtemp(path.join(draftRoot, 'layout-'));
    await writeFile(path.join(draftDir, 'base.png'), input, { flag: 'wx', mode: 0o600 });
    const draftPath = path.relative(dir, path.join(draftDir, 'base.png'));
    const reason = error.message;
    const { width, height } = await sharp(input).metadata();
    await writeFile(path.join(draftDir, 'layout.json'), JSON.stringify({
      output: safeOut, reason, width, height, observation,
    }, null, 2), { flag: 'wx', mode: 0o600 });
    error.message = `Poster layout not accepted; base image saved as ${draftPath} (draft, not a finished poster). ${reason}`;
  };
  const credentials = await resolveProviderConfig(projectRoot, def.provider);
  const customImageCredentials =
    surface === 'image' && def.provider === 'openai'
      ? await resolveProviderConfig(projectRoot, 'custom-image')
      : null;

  const checkpoint = loanPosterOutput && posterCopyStyle === 'anti-fraud-message'
    ? posterCheckpoint(dir, JSON.stringify({ version: 1, output: safeOut, model: ctx.wireModel, aspect: ctx.aspect, quality: ctx.quality, prompt: ctx.prompt, provider: customImageOverridesOpenAIModel(ctx, customImageCredentials) ? 'custom-image' : def.provider }), args.posterRecoveryOnly)
    : undefined;
  const renderPoster = async (resolvedPrompt: string, render: () => Promise<RenderResult>) => {
    const result = checkpoint ? await checkpoint.render(resolvedPrompt, render) : await render();
    if (checkpoint) args.onProgress?.('image:checkpoint-saved');
    args.onProgress?.('image:processing');
    return result;
  };

  let bytes: Buffer;
  let foregroundBytes: Buffer | undefined;
  let providerNote: string;
  let suggestedExt: string | undefined;
  let providerId = def.provider;
  // Tracks whether the bytes came from a real provider call or from the
  // stub fallback. Surfaces in the response so the CLI/agent can tell a
  // legitimate placeholder ("provider not integrated yet") apart from a
  // silent failure ("API call blew up, here's a 67-byte PNG"). Without
  // this flag the chat agent narrates the stub as if it's the expected
  // output, and the user sees a blank file.
  let providerError: string | null = null;
  let usedStubFallback = false;
  // True only when the dispatcher intentionally returned a stub because
  // no real renderer is wired up for this (provider, surface) pair.
  let intentionalStub = false;
  try {
    if (
      def.provider === 'openai'
      && surface === 'image'
      && customImageOverridesOpenAIModel(ctx, customImageCredentials)
    ) {
      providerId = 'custom-image';
      const phoneChecked = overlayPhoneScreenRef
        ? await renderImageWithPhoneScreenRetry(
          ctx.prompt,
          (resolvedPrompt) => renderCustomOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            customImageCredentials!,
          ),
        )
        : null;
      const antiFraudChecked = !phoneChecked
        && loanPosterOutput
        && posterCopyStyle === 'anti-fraud-message'
        ? await renderImageWithAntiFraudSafeZoneRetry(
          ctx.prompt,
          (resolvedPrompt) => renderPoster(resolvedPrompt, () => renderCustomOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            customImageCredentials!,
          )),
          {
            detectHands: detectPosterHands,
            preserveLayoutDraft,
            ...(overlayLogoAnchor ? { anchor: overlayLogoAnchor } : {}),
          },
        )
        : null;
      const checked = !phoneChecked && !antiFraudChecked && loanPosterOutput && overlayLogoRef
        ? await renderImageWithLogoSafeZoneRetry(
          ctx.prompt,
          (resolvedPrompt) => renderCustomOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            customImageCredentials!,
          ),
          {
            enabled: true,
            ...(overlayLogoAnchor ? { anchor: overlayLogoAnchor } : {}),
          },
        )
        : null;
      const result = phoneChecked?.result ?? antiFraudChecked?.result ?? checked?.result
        ?? await renderCustomOpenAIImage(ctx, customImageCredentials!);
      if (antiFraudChecked?.lowerRight.intrudes) {
        warnings.push(ANTI_FRAUD_CONTINUITY_WARNING);
      }
      if (antiFraudChecked?.diagonal.intrudes) {
        warnings.push(ANTI_FRAUD_DIAGONAL_WARNING);
      }
      bytes = result.bytes;
      posterHandObservation = antiFraudChecked?.handObservation;
      if (layeredPosterRequested) {
        const renderedForeground = await renderLayeredForegroundWithMatteRetry(
          result.bytes,
          foregroundPrompt!,
          (resolvedPrompt) => renderCustomOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            customImageCredentials!,
          ),
        );
        foregroundBytes = renderedForeground.foreground;
        if (renderedForeground.attempts > 1) {
          warnings.push('Foreground matte required one retry before compositing.');
        }
      }
      providerNote = `${result.providerNote}${phoneChecked && phoneChecked.attempts > 1 ? ' · phone-screen retry' : ''}${antiFraudChecked && antiFraudChecked.attempts > 1 ? ' · anti-fraud safe-zone retry' : ''}${checked && checked.attempts > 1 ? ' · logo-safe retry' : ''}${layeredPosterRequested ? ' · layered foreground' : ''}`;
      suggestedExt = result.suggestedExt;
      if (checked?.safeZone.intrudes || antiFraudChecked?.logoSafeZone.intrudes) {
        warnings.push('Logo safe-zone remained visually busy after retry; the clearest render was used.');
      }
    } else if (def.provider === 'openai' && surface === 'image') {
      const phoneChecked = overlayPhoneScreenRef
        ? await renderImageWithPhoneScreenRetry(
          ctx.prompt,
          (resolvedPrompt) => renderOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            credentials,
          ),
        )
        : null;
      const antiFraudChecked = !phoneChecked
        && loanPosterOutput
        && posterCopyStyle === 'anti-fraud-message'
        ? await renderImageWithAntiFraudSafeZoneRetry(
          ctx.prompt,
          (resolvedPrompt) => renderPoster(resolvedPrompt, () => renderOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            credentials,
          )),
          {
            detectHands: detectPosterHands,
            preserveLayoutDraft,
            ...(overlayLogoAnchor ? { anchor: overlayLogoAnchor } : {}),
          },
        )
        : null;
      const checked = !phoneChecked && !antiFraudChecked && loanPosterOutput && overlayLogoRef
        ? await renderImageWithLogoSafeZoneRetry(
          ctx.prompt,
          (resolvedPrompt) => renderOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            credentials,
          ),
          {
            enabled: true,
            ...(overlayLogoAnchor ? { anchor: overlayLogoAnchor } : {}),
          },
        )
        : null;
      const result = phoneChecked?.result
        ?? antiFraudChecked?.result
        ?? checked?.result
        ?? await renderOpenAIImage(ctx, credentials);
      if (antiFraudChecked?.lowerRight.intrudes) {
        warnings.push(ANTI_FRAUD_CONTINUITY_WARNING);
      }
      if (antiFraudChecked?.diagonal.intrudes) {
        warnings.push(ANTI_FRAUD_DIAGONAL_WARNING);
      }
      bytes = result.bytes;
      posterHandObservation = antiFraudChecked?.handObservation;
      if (layeredPosterRequested) {
        const renderedForeground = await renderLayeredForegroundWithMatteRetry(
          result.bytes,
          foregroundPrompt!,
          (resolvedPrompt) => renderOpenAIImage(
            { ...ctx, prompt: resolvedPrompt },
            credentials,
          ),
        );
        foregroundBytes = renderedForeground.foreground;
        if (renderedForeground.attempts > 1) {
          warnings.push('Foreground matte required one retry before compositing.');
        }
      }
      providerNote = `${result.providerNote}${phoneChecked && phoneChecked.attempts > 1 ? ' · phone-screen retry' : ''}${antiFraudChecked && antiFraudChecked.attempts > 1 ? ' · anti-fraud safe-zone retry' : ''}${checked && checked.attempts > 1 ? ' · logo-safe retry' : ''}${layeredPosterRequested ? ' · layered foreground' : ''}`;
      suggestedExt = result.suggestedExt;
      if (checked?.safeZone.intrudes || antiFraudChecked?.logoSafeZone.intrudes) {
        warnings.push('Logo safe-zone remained visually busy after retry; the clearest render was used.');
      }
    } else if (
      def.provider === 'openai'
      && surface === 'audio'
      && ctx.audioKind === 'speech'
    ) {
      const result = await renderOpenAISpeech(ctx, credentials, safeOut);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'volcengine' && surface === 'video') {
      const result = await renderVolcengineVideo(ctx, credentials, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'volcengine' && surface === 'image') {
      const result = await renderVolcengineImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'grok' && surface === 'image') {
      const result = await renderGrokImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'grok' && surface === 'video') {
      const result = await renderGrokVideo(ctx, credentials, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'grok'
      && surface === 'audio'
      && ctx.audioKind === 'speech'
    ) {
      const result = await renderXAITTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'nanobanana' && surface === 'image') {
      const result = await renderNanoBananaImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'imagerouter' && surface === 'image') {
      const result = await renderImageRouterImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'imagerouter' && surface === 'video') {
      const result = await renderImageRouterVideo(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'custom-image' && surface === 'image') {
      const result = await renderCustomOpenAIImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'leonardo' && surface === 'image') {
      const result = await renderLeonardoImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'elevenlabs'
      && surface === 'audio'
      && ctx.audioKind === 'speech'
    ) {
      const result = await renderElevenLabsTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'elevenlabs'
      && surface === 'audio'
      && ctx.audioKind === 'sfx'
    ) {
      const result = await renderElevenLabsSfx(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'hyperframes' && surface === 'video') {
      // HyperFrames is templated by the agent (it reads the vendored
      // skill at skills/hyperframes/SKILL.md and writes a composition
      // HTML based on the user's prompt). But the actual bundled
      // HyperFrames render step runs HERE in the daemon process, not
      // in the agent's shell. Reason: the agent's shell on macOS
      // (Claude Code in particular) is wrapped in `sandbox-exec`, and
      // puppeteer's Chrome subprocess hangs partway through frame
      // capture under that sandbox. The daemon process is unsandboxed,
      // so puppeteer behaves correctly. Agent-side npx is reserved for
      // the lighter HF subcommands (lint, transcribe, tts) that don't
      // need to spawn Chrome.
      const result = await renderHyperFramesViaCli(ctx, dir, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'minimax' && surface === 'audio') {
      const result = await renderMinimaxTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'senseaudio' && surface === 'audio') {
      const result = await renderSenseAudioTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'senseaudio' && surface === 'image') {
      const result = await renderSenseAudioImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'fishaudio' && surface === 'audio') {
      const result = await renderFishAudioTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else {
      // No real renderer wired up for this (provider, surface). Gate the
      // stub fallback behind OD_MEDIA_ALLOW_STUBS so release builds don't
      // silently write placeholder bytes to disk and confuse the user.
      if (!stubsAllowed()) {
        throw new StubProviderDisabledError(model);
      }
      const result = await renderStub(ctx, safeOut);
      bytes = result.bytes;
      providerNote = result.providerNote;
      intentionalStub = true;
    }
  } catch (err) {
    // Stub-disabled errors are intentional — propagate so the daemon
    // maps them to 503 and the CLI surfaces a clear "configure a real
    // provider" message rather than writing fake bytes.
    if (checkpoint || args.posterRecoveryOnly || err instanceof StubProviderDisabledError || err instanceof PosterHandLayoutError || err instanceof PosterDetectorUnavailableError) {
      throw err;
    }
    // A real provider failed (network blip, 4xx, missing key, …). We
    // still want to fall back to a stub so the agent's chat loop
    // doesn't dead-end — but only when stubs are allowed for this
    // build. Otherwise re-throw so the CLI exits non-zero with the
    // real upstream message.
    if (!stubsAllowed()) {
      throw err;
    }
    const stub = await renderStub(ctx, safeOut);
    bytes = stub.bytes;
    const msg = errorMessage(err);
    providerNote = `[${providerId} error → stub] ${msg}`;
    providerError = msg;
    usedStubFallback = true;
    // Also log to daemon stderr so the failure is visible in the daemon
    // terminal — easiest place for the developer/operator to spot it.
    try {
      console.error(
        `[media] ${providerId}/${surface}/${model} failed: ${msg}`,
      );
    } catch {
      // best-effort logging only
    }
  }
  // Tag the providerNote with `[stub]` only when the bytes actually came
  // from the stub renderer — either as the intentional fallback for an
  // unintegrated (provider, surface) pair, or because a real-provider
  // call failed and we wrote a placeholder. Real-provider successes keep
  // the renderer's own note (e.g. "openai/gpt-image-2 · 1:1 · 1.2 MB")
  // untouched so the FileViewer toolbar shows the truth.
  if (intentionalStub || usedStubFallback) {
    providerNote = `[stub] ${providerNote}`;
  }

  // If the real provider returned a different extension than the
  // requested filename, swap it. Saves the agent from having to guess
  // (.png vs .jpg vs .webp) before it knows what the model emits.
  let finalOut = safeOut;
  if (suggestedExt) {
    const dot = safeOut.lastIndexOf('.');
    const stem = dot > 0 ? safeOut.slice(0, dot) : safeOut;
    finalOut = `${stem}${suggestedExt}`;
  }
  if (
    surface === 'image'
    && (overlayZRef || overlayLogoRef || overlayPhoneScreenRef || completePosterCopy)
  ) {
    const dot = finalOut.lastIndexOf('.');
    const stem = dot > 0 ? finalOut.slice(0, dot) : finalOut;
    finalOut = `${stem}.png`;
  }
  if (surface === 'image' && /\.png$/i.test(finalOut)) {
    bytes = await finalizeGeneratedPng(bytes, {
      loanPosterOutput: Boolean(loanPosterOutput),
      ...(overlayZRef
        ? { overlayZ: await readFile(overlayZRef.abs) }
        : {}),
      ...(foregroundBytes ? { foreground: foregroundBytes } : {}),
      ...(posterHeadline ? { posterHeadline } : {}),
      ...(posterSubtitle ? { posterSubtitle } : {}),
      ...(posterTextAnchor ? { posterTextAnchor } : {}),
      ...(posterCopyStyle ? { posterCopyStyle } : {}),
      ...(posterHandObservation ? { posterHandObservation } : {}),
      ...(overlayPhoneScreenRef
        ? { phoneScreen: await readFile(overlayPhoneScreenRef.abs) }
        : {}),
      ...(overlayLogoRef
        ? {
          overlayLogo: await readFile(overlayLogoRef.abs),
          adaptZamloanTaglineContrast: isZamloanLogoAsset(overlayLogoRef),
          ...(isZamloanLogoAsset(overlayLogoRef)
            && (posterCopyStyle === 'anti-fraud'
              || posterCopyStyle === 'anti-fraud-message')
            ? { zamloanTaglineTone: 'black' as const }
            : {}),
        }
        : {}),
      ...(overlayLogoAnchor ? { overlayLogoAnchor } : {}),
    });
  }
  const finalTarget = path.join(dir, finalOut);
  const temporaryTarget = path.join(
    dir,
    `.${path.basename(finalOut)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporaryTarget, bytes);
    await rename(temporaryTarget, finalTarget);
  } finally {
    await unlink(temporaryTarget).catch(() => {});
  }
  const st = await stat(finalTarget);
  return {
    name: finalOut,
    size: st.size,
    mtime: st.mtimeMs,
    kind: kindFor(finalOut),
    mime: mimeFor(finalOut),
    model,
    surface,
    providerNote,
    providerId,
    providerError,
    usedStubFallback,
    intentionalStub,
    warnings,
  };
}

function autoOutputName(surface: MediaSurface, model: string, audioKind?: AudioKind): string {
  const base = DEFAULT_OUTPUT_BY_SURFACE[surface] || 'artifact.bin';
  const stamp = Date.now().toString(36);
  // Slug the model id so the filename stays short and shell-safe.
  const slug = String(model).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
  const tag = surface === 'audio' && audioKind ? `${audioKind}-${slug}` : slug;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  return `${stem}-${tag}-${stamp}${ext}`;
}

function defaultAspectFor(surface: MediaSurface): string | undefined {
  if (surface === 'image') return '1:1';
  if (surface === 'video') return '16:9';
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider: OpenAI Images API (gpt-image-2, gpt-image-1.5, dall-e-3 …)
//
// We support both the canonical OpenAI endpoint AND Azure-hosted
// OpenAI deployments behind the same provider slot — Azure is detected
// from the base URL (`*.azure.com` host or a `/deployments/<name>`
// segment in the path). For Azure we additionally:
//   * append `?api-version=…` (default 2024-02-01, unless the user has
//     already encoded one into the base URL),
//   * send the api-key header in addition to Authorization (Azure
//     accepts either; some setups only honor api-key),
//   * drop the `model` field from the body since the deployment in the
//     path already names the model.
// ---------------------------------------------------------------------------

const AZURE_DEFAULT_API_VERSION = '2024-02-01';
const OPENAI_CONNECT_TIMEOUT_MS = 3_000;
const OPENAI_HEADERS_TIMEOUT_MS = imageRequestTimeoutMs();
const OPENAI_BODY_TIMEOUT_MS = imageRequestTimeoutMs();
// Honor HTTP(S)_PROXY / NO_PROXY from the daemon's environment. Users in
// regions that can only reach api.openai.com through a local proxy (e.g.
// Clash) otherwise hit a connection timeout here — the chat agent has its own
// proxy wrapper, but media requests previously used a proxy-blind Agent.
// EnvHttpProxyAgent reads the proxy env when present and connects directly
// when it is not, so it is inert for users without a proxy.
const openAIHttpDispatcher = new EnvHttpProxyAgent({
  connectTimeout: OPENAI_CONNECT_TIMEOUT_MS,
  headersTimeout: OPENAI_HEADERS_TIMEOUT_MS,
  bodyTimeout: OPENAI_BODY_TIMEOUT_MS,
});

function openAISpeechRequestTimeoutMs(): number {
  const configured = Number(process.env.OD_OPENAI_TTS_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 2 * 60 * 1000;
  return Math.min(5 * 60 * 1000, Math.max(30_000, Math.floor(configured)));
}

function openAISpeechRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(openAISpeechRequestTimeoutMs());
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function renderOpenAIImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  const recovery = ctx.imageRecovery ?? createImageRequestRecovery({ signal: ctx.signal, poster: false });
  return recovery.run((signal, stage) => renderOpenAIImageRequest({ ...ctx, signal }, credentials, stage));
}

async function renderOpenAIImageRequest(ctx: MediaContext, credentials: ProviderConfig, stage: (name: string) => void): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no OpenAI credential — configure an API key in Settings, set OPENAI_API_KEY, or refresh Codex/Hermes OAuth');
  }
  const rawBase = credentials.baseUrl || 'https://api.openai.com/v1';
  const azure = detectAzureEndpoint(rawBase);
  const url = buildOpenAIImageUrl(rawBase, azure);

  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A high-quality reference image.',
    n: 1,
    size: openaiSizeFor(ctx.model, ctx.aspect),
  };
  // For non-Azure calls, include `model` in the body. Azure infers it
  // from the deployment in the path so omitting it keeps payloads
  // compatible across both flavors. The wire-name (post-alias) goes
  // on the body so the user's alias from issue #1277 reaches the API.
  if (!azure) {
    body.model = ctx.wireModel;
  }
  // Capability branches key off the CATALOG id (not the alias) so a
  // user who aliased `dall-e-3` to a custom Azure / proxy deployment
  // still gets the DALL-E-specific quality + response_format flags
  // (lefarcen + codex P2 on PR #1309).
  if (ctx.model.startsWith('dall-e-')) {
    body.response_format = 'b64_json';
    body.quality = ctx.model === 'dall-e-3' ? 'hd' : 'standard';
  } else {
    // gpt-image-* accepts quality 'high' | 'medium' | 'low'.
    body.quality = ctx.quality === 'auto' ? 'medium' : (ctx.quality ?? 'high');
  }

  const headers: Record<string, string> = {
    'authorization': `Bearer ${credentials.apiKey}`,
    'content-type': 'application/json',
  };
  if (azure) {
    // Azure's canonical auth header. Some deployments accept Bearer
    // (the curl example we tested against does) but api-key is what
    // their docs document, so send both. OpenAI ignores unknown
    // headers, so this is harmless on the standard endpoint too.
    headers['api-key'] = credentials.apiKey;
  }
  const signal = ctx.signal;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: signal ?? null,
    dispatcher: openAIHttpDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
  });
  stage('response-headers');
  const text = await resp.text();
  stage('response-body');
  if (!resp.ok) {
    const tag = azure ? 'azure-openai' : 'openai';
    throw imageProviderResponseError(resp, `${tag} ${resp.status}: ${truncate(text, 240)}`, text);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`openai non-JSON response: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('openai response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    stage('image-download');
    const imgResp = await fetch(entry.url, {
      signal: signal ?? null,
      dispatcher: openAIHttpDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
    });
    if (!imgResp.ok) throw imageProviderResponseError(imgResp, `openai image fetch ${imgResp.status}`);
    const arr = await imgResp.arrayBuffer();
    bytes = Buffer.from(arr);
  } else {
    throw new Error('openai response had neither b64_json nor url');
  }

  const tag = azure ? 'azure-openai' : 'openai';
  return {
    bytes,
    providerNote: `${tag}/${ctx.wireModel} · ${ctx.aspect} · ${bytes.length} bytes`,
    suggestedExt: '.png',
  };
}

function imageProviderResponseError(response: Response, message: string, body = ''): Error {
  if (response.status === 429 && /insufficient_quota|credit_balance_too_low|no credits remaining|billing_hard_limit_reached/i.test(body)) {
    return Object.assign(new Error('Image provider quota exhausted: restore API credits before generating again'), { status: 429, code: 'image_provider_quota_exhausted' });
  }
  const value = response.headers.get('retry-after');
  const seconds = value ? Number(value) : NaN;
  const retryAfterMs = Number.isFinite(seconds) ? seconds * 1_000
    : value ? Math.max(0, Date.parse(value) - Date.now()) : undefined;
  return Object.assign(new Error(message), { status: response.status, retryAfterMs });
}

async function renderImageRouterImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ImageRouter API key — configure it in Settings or set OD_IMAGEROUTER_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || IMAGEROUTER_DEFAULT_BASE_URL).trim();
  const wireModel = (credentials.model || ctx.wireModel).trim();
  const url = buildOpenAIImageUrl(baseUrl, false);
  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A high-quality reference image.',
    model: wireModel,
    quality: 'auto',
    size: imageRouterSizeFor(ctx.aspect, 'image'),
    response_format: 'b64_json',
    output_format: 'png',
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await parseOpenAICompatibleJson(resp, 'imagerouter image');
  const bytes = await bytesFromOpenAICompatibleData(data, 'imagerouter image');
  return {
    bytes,
    providerNote: `imagerouter/${wireModel} · ${imageRouterSizeFor(ctx.aspect, 'image')} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

async function renderImageRouterVideo(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ImageRouter API key — configure it in Settings or set OD_IMAGEROUTER_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || IMAGEROUTER_DEFAULT_BASE_URL).trim();
  const wireModel = (credentials.model || ctx.wireModel).trim();
  const url = buildOpenAIVideoUrl(baseUrl);
  const seconds = typeof ctx.length === 'number' ? ctx.length : 'auto';
  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A short cinematic clip.',
    model: wireModel,
    size: imageRouterSizeFor(ctx.aspect, 'video'),
    seconds,
    response_format: 'b64_json',
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await parseOpenAICompatibleJson(resp, 'imagerouter video');
  const bytes = await bytesFromOpenAICompatibleData(data, 'imagerouter video');
  return {
    bytes,
    providerNote: `imagerouter/${wireModel} · ${imageRouterSizeFor(ctx.aspect, 'video')} · ${seconds === 'auto' ? 'auto' : `${seconds}s`} · ${bytes.length} bytes`,
    suggestedExt: '.mp4',
  };
}

async function renderCustomOpenAIImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (ctx.imageRecovery) {
    return ctx.imageRecovery.run((signal, stage) => renderCustomOpenAIImageRequest({ ...ctx, signal }, credentials, stage));
  }
  return renderCustomOpenAIImageRequest(ctx, credentials);
}

async function renderCustomOpenAIImageRequest(ctx: MediaContext, credentials: ProviderConfig, stage: (name: string) => void = () => {}): Promise<RenderResult> {
  const baseUrl = (credentials.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error(
      'Custom Image API base URL required — configure a /v1/images/generations compatible endpoint in Settings',
    );
  }
  const wireModel = (
    credentials.model
    || (ctx.wireModel !== CUSTOM_IMAGE_MODEL_ID ? ctx.wireModel : '')
  ).trim();
  if (!wireModel) {
    throw new Error(
      'Custom Image API model required — configure the provider model in Settings',
    );
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (credentials.apiKey) {
    headers.authorization = `Bearer ${credentials.apiKey}`;
  }
  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A high-quality reference image.',
    model: wireModel,
    n: 1,
    size: openaiSizeFor('gpt-image-1', ctx.aspect),
  };
  const resp = await fetch(buildOpenAIImageUrl(baseUrl, false), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal ?? null,
    ...(ctx.imageRecovery ? { dispatcher: openAIHttpDispatcher as unknown as NonNullable<RequestInit['dispatcher']> } : {}),
  });
  stage('response-headers');
  if (!resp.ok && ctx.imageRecovery) {
    await resp.body?.cancel();
    throw imageProviderResponseError(resp, `custom image ${resp.status}`);
  }
  const data = await parseOpenAICompatibleJson(resp, 'custom image');
  stage('response-body');
  const bytes = await bytesFromOpenAICompatibleData(data, 'custom image', ctx.signal, stage);
  return {
    bytes,
    providerNote: `custom-image/${wireModel} · ${body.size} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

function customImageOverridesOpenAIModel(
  ctx: MediaContext,
  credentials: ProviderConfig | null,
): credentials is ProviderConfig {
  const baseUrl = credentials?.baseUrl?.trim();
  const model = credentials?.model?.trim();
  if (!baseUrl || !model) return false;
  return model === ctx.model || model === ctx.wireModel;
}

async function parseOpenAICompatibleJson(resp: Response, providerTag: string): Promise<any> {
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${providerTag} ${resp.status}: ${truncate(text, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${providerTag} non-JSON response: ${truncate(text, 200)}`);
  }
}

async function bytesFromOpenAICompatibleData(data: any, providerTag: string, signal?: AbortSignal, stage: (name: string) => void = () => {}): Promise<Buffer> {
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error(`${providerTag} response had no data[0]`);
  if (typeof entry.b64_json === 'string' && entry.b64_json) {
    const raw = entry.b64_json.includes(',')
      ? entry.b64_json.slice(entry.b64_json.indexOf(',') + 1)
      : entry.b64_json;
    return Buffer.from(raw, 'base64');
  }
  if (typeof entry.url === 'string' && entry.url) {
    stage('image-download');
    const mediaResp = await fetch(entry.url, signal ? { signal, dispatcher: openAIHttpDispatcher as unknown as NonNullable<RequestInit['dispatcher']> } : undefined);
    if (!mediaResp.ok) {
      throw imageProviderResponseError(mediaResp, `${providerTag} media fetch ${mediaResp.status}`);
    }
    const arr = await mediaResp.arrayBuffer();
    return Buffer.from(arr);
  }
  throw new Error(`${providerTag} response had neither b64_json nor url`);
}

function imageRouterSizeFor(aspect: string | undefined, surface: 'image' | 'video'): string {
  if (surface === 'video') {
    if (aspect === '1:1') return '1024x1024';
    if (aspect === '9:16') return '576x1024';
    if (aspect === '4:3') return '1024x768';
    if (aspect === '3:4') return '768x1024';
    return '1024x576';
  }
  if (aspect === '16:9') return '1024x576';
  if (aspect === '9:16') return '576x1024';
  if (aspect === '4:3') return '1024x768';
  if (aspect === '3:4') return '768x1024';
  return '1024x1024';
}

/**
 * Heuristic: do we think this base URL points at an Azure OpenAI
 * deployment rather than the public OpenAI API?
 *
 *   true examples
 *     https://x.cognitiveservices.azure.com/openai/deployments/gpt-image-2
 *     https://x.openai.azure.com/openai/deployments/foo
 *     /openai/deployments/foo?api-version=2024-02-01
 *   false examples
 *     https://api.openai.com/v1
 *     http://localhost:8080/v1
 */
function detectAzureEndpoint(baseUrl: string): boolean {
  if (typeof baseUrl !== 'string' || !baseUrl) return false;
  if (/\.azure\.com\b/i.test(baseUrl)) return true;
  if (/\/openai\/deployments\//i.test(baseUrl)) return true;
  return false;
}

/**
 * Build the full /images/generations URL, preserving any user-supplied
 * query string (e.g. an explicit `?api-version=2024-12-01`) and
 * appending the default api-version for Azure when the user didn't
 * specify one. Returns a string ready for `fetch`.
 */
function buildOpenAICompatibleGenerationUrl(baseUrl: string, endpoint: 'images' | 'videos'): string {
  const suffix = `/${endpoint}/generations`;
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    const stripped = baseUrl.replace(/\/$/, '');
    return stripped.endsWith(suffix) ? stripped : `${stripped}${suffix}`;
  }
  const strippedPath = parsed.pathname.replace(/\/+$/, '');
  if (!strippedPath.endsWith(suffix)) {
    parsed.pathname = `${strippedPath}${suffix}`;
  }
  return parsed.toString();
}

function buildOpenAIImageUrl(baseUrl: string, isAzure: boolean): string {
  let parsed;
  try {
    parsed = new URL(buildOpenAICompatibleGenerationUrl(baseUrl, 'images'));
  } catch {
    // Bad URL — fall back to naive concat so the upstream error is
    // surfaced through the normal HTTP path rather than a parse crash.
    return buildOpenAICompatibleGenerationUrl(baseUrl, 'images');
  }
  if (isAzure && !parsed.searchParams.has('api-version')) {
    parsed.searchParams.set('api-version', AZURE_DEFAULT_API_VERSION);
  }
  return parsed.toString();
}

function buildOpenAIVideoUrl(baseUrl: string): string {
  return buildOpenAICompatibleGenerationUrl(baseUrl, 'videos');
}

function openaiSizeFor(model: string, aspect?: string): string {
  // gpt-image-1.5 / gpt-image-2 accept arbitrary sizes up to 4096; we
  // pick concrete ones tuned to common aspects so the API never
  // negotiates them down silently.
  if (model.startsWith('gpt-image-')) {
    if (aspect === '16:9') return '1792x1024';
    if (aspect === '9:16') return '1024x1792';
    if (aspect === '4:3') return '1408x1056';
    if (aspect === '3:4') return '1056x1408';
    return '1024x1024';
  }
  if (model === 'dall-e-3') {
    if (aspect === '16:9') return '1792x1024';
    if (aspect === '9:16') return '1024x1792';
    return '1024x1024';
  }
  // dall-e-2 only supports 256/512/1024 squares.
  return '1024x1024';
}

const OPENAI_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
]);

function buildOpenAISpeechUrl(baseUrl: string, isAzure: boolean): string {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    const stripped = baseUrl.replace(/\/$/, '');
    return `${stripped}/audio/speech`;
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/audio/speech';
  if (isAzure && !parsed.searchParams.has('api-version')) {
    parsed.searchParams.set('api-version', AZURE_DEFAULT_API_VERSION);
  }
  return parsed.toString();
}

function openaiSpeechFormatFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.wav') return 'wav';
  if (ext === '.flac') return 'flac';
  if (ext === '.aac') return 'aac';
  if (ext === '.opus' || ext === '.ogg' || ext === '.oga') return 'opus';
  return 'mp3';
}

async function renderOpenAISpeech(ctx: MediaContext, credentials: ProviderConfig, fileName: string): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no OpenAI credential — configure an API key in Settings, set OPENAI_API_KEY, or refresh Codex/Hermes OAuth');
  }
  const rawBase = credentials.baseUrl || 'https://api.openai.com/v1';
  const azure = detectAzureEndpoint(rawBase);
  const url = buildOpenAISpeechUrl(rawBase, azure);
  const format = openaiSpeechFormatFor(fileName);
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';

  let voiceId = 'alloy';
  let instructions = '';
  const requestedVoice = (ctx.voice && ctx.voice.trim()) || '';
  if (requestedVoice) {
    if (OPENAI_TTS_VOICES.has(requestedVoice)) {
      voiceId = requestedVoice;
    } else {
      // gpt-4o-mini-tts accepts free-form speaking style instructions.
      // If the UI metadata carries prose rather than a concrete voice id,
      // preserve it here instead of surfacing a provider error.
      instructions = requestedVoice;
    }
  }

  const body: Record<string, unknown> = {
    input: text,
    voice: voiceId,
    response_format: format,
  };
  if (!azure) {
    body.model = ctx.wireModel;
  }
  if (instructions && ctx.model === 'gpt-4o-mini-tts') {
    body.instructions = instructions;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${credentials.apiKey}`,
    'content-type': 'application/json',
  };
  if (azure) {
    headers['api-key'] = credentials.apiKey;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: openAISpeechRequestSignal(ctx.signal),
    dispatcher: openAIHttpDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
  });
  if (!resp.ok) {
    const text = await resp.text();
    const tag = azure ? 'azure-openai' : 'openai';
    throw new Error(`${tag} speech ${resp.status}: ${truncate(text, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('openai speech returned zero bytes');
  }
  const tag = azure ? 'azure-openai' : 'openai';
  const noteBits = [`${tag}/${ctx.wireModel}`, voiceId, `${format}`, `${bytes.length} bytes`];
  if (instructions) noteBits.splice(2, 0, 'styled');
  return {
    bytes,
    providerNote: noteBits.join(' · '),
    suggestedExt: format === 'opus' ? '.ogg' : `.${format}`,
  };
}

// ---------------------------------------------------------------------------
// Provider: Volcengine Ark — Doubao Seedance 2.0 video.
//
// Docs:
//   POST /api/v3/contents/generations/tasks   → { id }
//   GET  /api/v3/contents/generations/tasks/{id} → { status, content: { video_url } }
// We submit, poll until succeeded/failed, then fetch the produced
// video_url and return the raw bytes. The temporary URL Volcengine
// returns is only valid for ~24h, so streaming the bytes into the
// project folder is required to keep them addressable.
// ---------------------------------------------------------------------------

async function renderVolcengineVideo(ctx: MediaContext, credentials: ProviderConfig, onProgress?: ProgressFn): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no Volcengine Ark API key — configure it in Settings or set ARK_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');

  // Seedance accepts inline `--resolution`, `--duration`, `--ratio` and
  // `--camerafixed` flags inside the prompt text. We append a flags
  // suffix so user prompts that already contain them still win.
  const ratio = volcengineRatioFor(ctx.aspect);
  const durationSec = ctx.length || 5;
  const resolution = '720p';
  const promptText = (ctx.prompt && ctx.prompt.trim()) || 'A short cinematic clip.';
  const suffixFlags: string[] = [];
  if (!/--resolution\b/.test(promptText)) suffixFlags.push(`--resolution ${resolution}`);
  if (!/--duration\b/.test(promptText)) suffixFlags.push(`--duration ${durationSec}`);
  if (!/--ratio\b/.test(promptText)) suffixFlags.push(`--ratio ${ratio}`);
  const fullText = suffixFlags.length
    ? `${promptText} ${suffixFlags.join(' ')}`
    : promptText;

  // Seedance i2v (and seedance-2.0/-fast which support both modes)
  // accept an additional `image_url` content entry — Volcengine treats
  // it as the first frame and animates from there. We pass the data
  // URL directly; the API does not require a public URL. When no
  // image is provided, this is a regular t2v call.
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: fullText }];
  if (ctx.imageRef && ctx.imageRef.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: ctx.imageRef.dataUrl },
    });
  }

  const taskBody = {
    model: ctx.wireModel,
    content,
  };

  const taskResp = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(taskBody),
  });
  const taskText = await taskResp.text();
  if (!taskResp.ok) {
    throw new Error(`volcengine task create ${taskResp.status}: ${truncate(taskText, 240)}`);
  }
  let taskData: any;
  try {
    taskData = JSON.parse(taskText);
  } catch {
    throw new Error(`volcengine non-JSON: ${truncate(taskText, 200)}`);
  }
  const taskId = taskData && taskData.id;
  if (!taskId) throw new Error('volcengine task response missing id');

  // Poll until succeeded/failed. Keep a hard cap, but make it long
  // enough for real Seedance queues: fast t2v often returns in 30-120s,
  // while i2v and busy-region t2v can exceed the old 6-minute ceiling.
  const startedAt = Date.now();
  const configuredMaxMs = Number(process.env.OD_VOLCENGINE_VIDEO_MAX_POLL_MS);
  const maxMs =
    Number.isFinite(configuredMaxMs) && configuredMaxMs >= 60_000
      ? configuredMaxMs
      : 12 * 60 * 1000;
  let videoUrl: string | null = null;
  let lastStatus = '';
  // Emit a "task accepted" line right away so the agent's chat shows
  // something within the first second instead of going silent for the
  // full poll loop. cc's Bash tool considers a long-quiet pipe stuck
  // and times out at ~2 minutes — Volcengine i2v routinely takes
  // 3-5 minutes, so without this stream, every i2v dispatch dies
  // mid-flight.
  if (typeof onProgress === 'function') {
    const mode = ctx.imageRef ? 'i2v' : 't2v';
    onProgress(`volcengine ${mode} task ${taskId} accepted; polling status…`);
  }
  while (Date.now() - startedAt < maxMs) {
    await sleep(4000);
    const pollResp = await fetch(`${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { 'authorization': `Bearer ${credentials.apiKey}` },
    });
    const pollText = await pollResp.text();
    if (!pollResp.ok) {
      throw new Error(`volcengine poll ${pollResp.status}: ${truncate(pollText, 240)}`);
    }
    let pollData: any;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      throw new Error(`volcengine poll non-JSON: ${truncate(pollText, 200)}`);
    }
    lastStatus = pollData.status || '';
    // Forward each poll tick. Heartbeat doubles as a "command is alive"
    // signal for the agent's bash tool — the daemon's SSE stream emits
    // an event for every line, which cc renders into the chat as live
    // output so its watchdog never marks the call as hung.
    if (typeof onProgress === 'function') {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      onProgress(`volcengine task ${taskId} status=${lastStatus || 'pending'} (elapsed ${elapsedSec}s)`);
    }
    if (lastStatus === 'succeeded') {
      videoUrl = pollData?.content?.video_url || null;
      break;
    }
    if (lastStatus === 'failed' || lastStatus === 'cancelled') {
      const reason = pollData?.error?.message || lastStatus;
      throw new Error(`volcengine task ${lastStatus}: ${reason}`);
    }
  }
  if (!videoUrl) {
    throw new Error(`volcengine task did not finish in time (last status: ${lastStatus || 'unknown'})`);
  }

  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) throw new Error(`volcengine video fetch ${dlResp.status}`);
  const arr = await dlResp.arrayBuffer();
  const bytes = Buffer.from(arr);

  return {
    bytes,
    providerNote: `volcengine/${ctx.wireModel} · ${ratio} · ${durationSec}s · ${bytes.length} bytes`,
    suggestedExt: '.mp4',
  };
}

function volcengineRatioFor(aspect?: string): string {
  // Seedance accepts a fixed list of ratios; map the OD vocabulary to
  // its canonical strings.
  if (!aspect) return '16:9';
  if (aspect === '1:1' || aspect === '16:9' || aspect === '9:16' || aspect === '4:3' || aspect === '3:4') {
    return aspect;
  }
  return '16:9';
}

// Volcengine Seedream / Seededit images. Same auth, different endpoint:
// POST /api/v3/images/generations (OpenAI-compatible payload).
async function renderVolcengineImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no Volcengine Ark API key — configure it in Settings or set ARK_API_KEY');
  }
  const baseUrl = (credentials.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');

  const body = {
    model: ctx.wireModel,
    prompt: ctx.prompt || 'A high-quality reference image.',
    response_format: 'b64_json',
    // openaiSizeFor branches on the catalog id (gpt-image-* vs dall-e-*
    // accept different size enums), so it must NOT see the post-alias
    // wire name. lefarcen + codex P2 on PR #1309.
    size: openaiSizeFor(ctx.model, ctx.aspect),
  };
  const resp = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`volcengine image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`volcengine image non-JSON: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('volcengine image response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    const imgResp = await fetch(entry.url);
    if (!imgResp.ok) throw new Error(`volcengine image fetch ${imgResp.status}`);
    bytes = Buffer.from(await imgResp.arrayBuffer());
  } else {
    throw new Error('volcengine image response missing b64_json/url');
  }
  return {
    bytes,
    providerNote: `volcengine/${ctx.wireModel} · ${ctx.aspect} · ${bytes.length} bytes`,
    suggestedExt: '.png',
  };
}

// ---------------------------------------------------------------------------
// Provider: xAI Grok Imagine.
//
// Docs: https://docs.x.ai/developers/model-capabilities/{images,video}/generation
//   * Image: POST /v1/images/generations — synchronous, returns
//            {data:[{b64_json|url}]}; we ask for b64_json so the bytes
//            arrive in one round-trip.
//   * Video: POST /v1/videos/generations — may return the finished video
//            inline ({status:'done', video:{url}}) or an async stub
//            ({id, status:'pending'}); in the async case we poll
//            GET /v1/videos/{id} until status flips to done/failed.
//
// xAI's video model produces native audio (background music + SFX +
// ambient) synchronised with the visual; that's the headline
// differentiator vs Seedance and Sora and is why grok-imagine-video
// declares the `audio` capability.
// ---------------------------------------------------------------------------

async function renderGrokImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no xAI credentials — sign in with your SuperGrok subscription (in OD or via `hermes auth add xai-oauth`), set XAI_API_KEY, or configure a key in Settings',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');

  const aspectRatio = grokAspectFor(ctx.aspect);
  const body = {
    model: ctx.wireModel,
    prompt: ctx.prompt || 'A high-quality reference image.',
    n: 1,
    aspect_ratio: aspectRatio,
    response_format: 'b64_json',
  };
  const resp = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`grok image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`grok image non-JSON: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('grok image response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    const imgResp = await fetch(entry.url);
    if (!imgResp.ok) throw new Error(`grok image fetch ${imgResp.status}`);
    bytes = Buffer.from(await imgResp.arrayBuffer());
  } else {
    throw new Error('grok image response missing b64_json/url');
  }
  // xAI's Imagine returns JPEG by default (no format option in the API
  // surface), but PNG/WebP are technically possible. Sniff the magic
  // bytes so the on-disk extension matches reality — saving JPEG bytes
  // as `.png` confuses Finder previews and any downstream consumer that
  // trusts the extension.
  return {
    bytes,
    providerNote: `grok/${ctx.wireModel} · ${aspectRatio} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

async function renderNanoBananaImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no Nano Banana API key — configure it in Settings or set OD_NANOBANANA_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || NANOBANANA_DEFAULT_BASE_URL).replace(/\/$/, '');
  const wireModel = (credentials.model || ctx.wireModel || NANOBANANA_DEFAULT_MODEL).trim();
  const body = {
    contents: [{
      parts: [{
        text: ctx.prompt || 'A high-quality reference image.',
      }],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: nanoBananaAspectFor(ctx.aspect),
        imageSize: NANOBANANA_DEFAULT_IMAGE_SIZE,
      },
    },
  };

  const resp = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(wireModel)}:generateContent`, {
    method: 'POST',
    headers: nanoBananaHeaders(baseUrl, credentials.apiKey),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`nano-banana image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`nano-banana image non-JSON: ${truncate(text, 200)}`);
  }
  const bytes = inlineImageBytesFromGenerateContent(data);
  return {
    bytes,
    providerNote: `nano-banana/${wireModel} · ${nanoBananaAspectFor(ctx.aspect)} · ${NANOBANANA_DEFAULT_IMAGE_SIZE} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

function nanoBananaHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (usesOfficialGoogleApiKeyHeader(baseUrl)) {
    headers['x-goog-api-key'] = apiKey;
    return headers;
  }
  headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

function usesOfficialGoogleApiKeyHeader(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'generativelanguage.googleapis.com';
  } catch {
    return false;
  }
}

function nanoBananaAspectFor(aspect?: string): string {
  if (
    aspect === '1:1'
    || aspect === '16:9'
    || aspect === '9:16'
    || aspect === '4:3'
    || aspect === '3:4'
  ) {
    return aspect;
  }
  return '1:1';
}

function inlineImageBytesFromGenerateContent(data: any): Buffer {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData;
      if (typeof inline?.data === 'string' && inline.data) {
        return Buffer.from(inline.data, 'base64');
      }
    }
  }
  throw new Error('nano-banana image response missing candidates[].content.parts[].inlineData.data');
}

function sniffImageExt(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return '.jpg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return '.png';
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return '.webp';
  }
  return '.png';
}

async function renderLeonardoImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no Leonardo.ai API key — configure it in Settings or set LEONARDO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://cloud.leonardo.ai/api/rest/v1').replace(/\/$/, '');
  
  // Map model IDs to Leonardo.ai platform model IDs
  const modelMap: Record<string, string> = {
    'leonardo-phoenix': '6b645e3a-d64f-4341-a6d8-7a3690fbf042',  // Phoenix
    'leonardo-kino-xl': 'aa77f04e-3eec-4034-9c07-d0f619684628',  // Kino XL
    'leonardo-flux-dev': 'b2614463-296c-462a-9586-aafdb8f00e36', // FLUX.1 [dev]
    'leonardo-flux-schnell': '1dd50843-d653-4516-a8e3-f0238ee453ff', // FLUX.1 [schnell]
    'leonardo-anime-pastel': '1e60896f-3c26-4296-8ecc-53e2afecc132', // Anime Pastel Dream
  };
  
  const platformModelId = modelMap[ctx.model];
  if (!platformModelId) {
    throw new Error(`unsupported leonardo.ai model: ${ctx.model}`);
  }
  
  // Map aspect ratios to Leonardo.ai dimensions
  const aspectMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
    '4:3': { width: 1152, height: 896 },
    '3:4': { width: 896, height: 1152 },
  };
  
  const size = (ctx.aspect ? aspectMap[ctx.aspect] : undefined) || { width: 1024, height: 1024 };
  
  // Submit generation request. Phoenix and the FLUX family require the
  // `contrast` field per Leonardo's API reference; valid values are
  // 3 (Low) / 3.5 (Medium) / 4 (High). Default to 3.5 so prompts that
  // omit a contrast hint fall in the middle of the supported range.
  const requiresContrast =
    ctx.model === 'leonardo-phoenix'
    || ctx.model === 'leonardo-flux-dev'
    || ctx.model === 'leonardo-flux-schnell';
  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A high-quality reference image.',
    modelId: platformModelId,
    width: size.width,
    height: size.height,
    num_images: 1,
    ...(requiresContrast ? { contrast: 3.5 } : {}),
  };
  
  const submitResp = await fetch(`${baseUrl}/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  const submitText = await submitResp.text();
  if (!submitResp.ok) {
    throw new Error(`leonardo.ai submit ${submitResp.status}: ${truncate(submitText, 240)}`);
  }
  
  let submitData: any;
  try {
    submitData = JSON.parse(submitText);
  } catch {
    throw new Error(`leonardo.ai non-JSON: ${truncate(submitText, 200)}`);
  }
  
  const generationId = submitData?.sdGenerationJob?.generationId;
  if (!generationId) {
    throw new Error('leonardo.ai response missing generationId');
  }
  
  // Poll for completion
  const maxPollMs = 120000; // 2 minutes
  const pollIntervalMs = 2000; // 2 seconds
  const startedAt = Date.now();
  let imageUrl: string | null = null;
  
  while (Date.now() - startedAt < maxPollMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    
    const pollResp = await fetch(`${baseUrl}/generations/${generationId}`, {
      headers: {
        'authorization': `Bearer ${credentials.apiKey}`,
      },
    });
    
    if (!pollResp.ok) {
      throw new Error(`leonardo.ai poll ${pollResp.status}`);
    }
    
    const pollData = (await pollResp.json()) as Record<string, any>;
    const generation = pollData?.generations_by_pk;
    
    if (generation?.status === 'COMPLETE') {
      const images = generation?.generated_images;
      if (Array.isArray(images) && images.length > 0) {
        imageUrl = images[0]?.url;
        break;
      }
    } else if (generation?.status === 'FAILED') {
      throw new Error('leonardo.ai generation failed');
    }
  }
  
  if (!imageUrl) {
    throw new Error('leonardo.ai generation timed out after 2 minutes');
  }
  
  // Fetch the generated image
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    throw new Error(`leonardo.ai image fetch ${imgResp.status}`);
  }
  
  const bytes = Buffer.from(await imgResp.arrayBuffer());
  
  return {
    bytes,
    providerNote: `leonardo.ai/${ctx.model} · ${ctx.aspect} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}


async function renderGrokVideo(ctx: MediaContext, credentials: ProviderConfig, onProgress?: ProgressFn): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no xAI credentials — sign in with your SuperGrok subscription (in OD or via `hermes auth add xai-oauth`), set XAI_API_KEY, or configure a key in Settings',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');

  // Grok caps duration at 15s. The dispatcher already clamps to
  // VIDEO_LENGTHS_SEC (which goes up to 30) — re-clamp here so a user
  // who picked 30 doesn't bounce off the upstream API with a 4xx.
  const requested = ctx.length || 5;
  const durationSec = Math.min(Math.max(requested, 1), 15);
  const aspectRatio = grokAspectFor(ctx.aspect);

  const body: Record<string, unknown> = {
    model: ctx.wireModel,
    prompt: ctx.prompt || 'A short cinematic clip.',
    duration: durationSec,
    aspect_ratio: aspectRatio,
    resolution: '720p',
  };
  if (ctx.imageRef && ctx.imageRef.dataUrl) {
    // grok-imagine-video accepts a base64 data URI in `image` for i2v.
    // Same surface as Seedance — the dispatcher already produced the
    // data URL via resolveProjectImage, so we just hand it through.
    body.image = ctx.imageRef.dataUrl;
  }

  const submitResp = await fetch(`${baseUrl}/videos/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const submitText = await submitResp.text();
  if (!submitResp.ok) {
    throw new Error(`grok video submit ${submitResp.status}: ${truncate(submitText, 240)}`);
  }
  let submitData: any;
  try {
    submitData = JSON.parse(submitText);
  } catch {
    throw new Error(`grok video non-JSON: ${truncate(submitText, 200)}`);
  }

  // Two paths: (a) the API returned the finished video synchronously
  // (cached/short jobs), in which case we skip polling; (b) we got an
  // {id, status:'pending'} stub and need to poll GET /videos/{id}
  // until status flips to done/failed/expired.
  let videoUrl = submitData?.video?.url || null;
  let lastStatus = submitData?.status || '';
  const requestId = submitData?.id || submitData?.request_id || null;

  if (!videoUrl && requestId) {
    const startedAt = Date.now();
    const configuredMaxMs = Number(process.env.OD_GROK_VIDEO_MAX_POLL_MS);
    const maxMs =
      Number.isFinite(configuredMaxMs) && configuredMaxMs >= 60_000
        ? configuredMaxMs
        : 8 * 60 * 1000;
    if (typeof onProgress === 'function') {
      const mode = ctx.imageRef ? 'i2v' : 't2v';
      onProgress(`grok ${mode} task ${requestId} accepted; polling status…`);
    }
    while (Date.now() - startedAt < maxMs) {
      await sleep(4000);
      const pollResp = await fetch(`${baseUrl}/videos/${encodeURIComponent(requestId)}`, {
        headers: { 'authorization': `Bearer ${credentials.apiKey}` },
      });
      const pollText = await pollResp.text();
      if (!pollResp.ok) {
        throw new Error(`grok poll ${pollResp.status}: ${truncate(pollText, 240)}`);
      }
      let pollData: any;
      try {
        pollData = JSON.parse(pollText);
      } catch {
        throw new Error(`grok poll non-JSON: ${truncate(pollText, 200)}`);
      }
      lastStatus = pollData.status || '';
      if (typeof onProgress === 'function') {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        onProgress(`grok task ${requestId} status=${lastStatus || 'pending'} (elapsed ${elapsedSec}s)`);
      }
      if (lastStatus === 'done' || lastStatus === 'succeeded') {
        videoUrl = pollData?.video?.url || null;
        break;
      }
      if (lastStatus === 'failed' || lastStatus === 'expired') {
        const reasonRaw = pollData?.error?.message || pollData?.error || lastStatus;
        const reason = typeof reasonRaw === 'string' ? reasonRaw : JSON.stringify(reasonRaw);
        throw new Error(`grok task ${lastStatus}: ${reason}`);
      }
    }
    // Loop exited without a videoUrl. Distinguish the two reachable
    // cases so operators know which lever to pull: bumping the poll
    // ceiling (timeout) vs filing a bug against the upstream contract
    // (status=done but no video.url).
    if (!videoUrl) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const ceilingSec = Math.round(maxMs / 1000);
      throw new Error(
        `grok video timed out after ${elapsedSec}s waiting for status=done `
        + `(last status: ${lastStatus || 'pending'}, ceiling ${ceilingSec}s). `
        + `If your jobs legitimately need longer, raise OD_GROK_VIDEO_MAX_POLL_MS.`,
      );
    }
  }

  if (!videoUrl) {
    // Submit returned neither an inline video.url nor a request_id —
    // upstream broke its own contract. Surfacing the last status helps
    // pinpoint whether it was a transient API blip or a malformed
    // response we should add a parser branch for.
    throw new Error(
      `grok video submit returned no inline video and no request_id to poll `
      + `(status=${lastStatus || 'unknown'})`,
    );
  }

  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) throw new Error(`grok video fetch ${dlResp.status}`);
  const arr = await dlResp.arrayBuffer();
  const bytes = Buffer.from(arr);

  return {
    bytes,
    providerNote: `grok/${ctx.wireModel} · ${aspectRatio} · ${durationSec}s · ${bytes.length} bytes`,
    suggestedExt: '.mp4',
  };
}

function grokAspectFor(aspect?: string): string {
  // xAI accepts a wide list (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1,
  // 1:2, 19.5:9, 9:19.5, 20:9, 9:20, auto). Our MEDIA_ASPECTS subset
  // is a strict subset — pass through known values, otherwise 16:9.
  if (
    aspect === '1:1'
    || aspect === '16:9'
    || aspect === '9:16'
    || aspect === '4:3'
    || aspect === '3:4'
  ) {
    return aspect;
  }
  return '16:9';
}

// ---------------------------------------------------------------------------
// Provider: xAI Grok TTS — POST /v1/tts.
//
// xAI exposes a dedicated /tts endpoint that returns audio bytes directly,
// not the OpenAI /audio/speech shape. Docs:
//   https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
// Credentials come through the same OAuth-aware path as Grok image / video,
// so a SuperGrok subscriber gets TTS for free once they have authorized.
// ---------------------------------------------------------------------------

const XAI_TTS_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const XAI_TTS_DEFAULT_VOICE_ID = 'eve';
const XAI_TTS_DEFAULT_LANGUAGE = 'en';

async function renderXAITTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no xAI credentials — sign in with your SuperGrok subscription (in OD or via `hermes auth add xai-oauth`), set XAI_API_KEY, or configure a key in Settings',
    );
  }
  const baseUrl = (credentials.baseUrl || XAI_TTS_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';
  const voiceId = (ctx.voice && ctx.voice.trim()) || XAI_TTS_DEFAULT_VOICE_ID;
  const language =
    typeof ctx.language === 'string' && ctx.language.trim()
      ? ctx.language.trim()
      : XAI_TTS_DEFAULT_LANGUAGE;

  // Stick to the documented minimal POST /v1/tts shape; the server
  // defaults output_format to mp3 / 24kHz / 128kbps which matches what
  // we want. Future work: surface sample_rate / bit_rate / codec via
  // ctx so the agent can request wav for high-fidelity workflows.
  const body = {
    text,
    voice_id: voiceId,
    language,
  };

  const resp = await fetch(`${baseUrl}/tts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`xai tts ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  if (bytes.length === 0) {
    throw new Error('xai tts response had zero bytes');
  }
  return {
    bytes,
    providerNote: `xai/${ctx.wireModel} · voice=${voiceId} · ${language} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: ElevenLabs — v3 text-to-speech (synchronous).
//
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// The API returns MP3 bytes directly. The catalogue id `elevenlabs-v3`
// maps to the wire model `eleven_v3`, while `--voice` selects the
// voice id in the path.
// ---------------------------------------------------------------------------

const ELEVENLABS_DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const ELEVENLABS_TTS_MODEL_MAP = {
  'elevenlabs-v3': 'eleven_v3',
} as Record<string, string>;

const ELEVENLABS_SFX_MODEL_MAP = {
  'elevenlabs-sfx': 'eleven_text_to_sound_v2',
} as Record<string, string>;
const ELEVENLABS_SFX_MAX_PROMPT_CHARS = 450;
const ELEVENLABS_SFX_DEFAULT_PROMPT_INFLUENCE = 0.3;

function clampElevenLabsSfxDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.min(30, Math.max(0.5, value));
}

function clampElevenLabsSfxPromptInfluence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ELEVENLABS_SFX_DEFAULT_PROMPT_INFLUENCE;
  }
  return Math.min(1, Math.max(0, value));
}

function requireElevenLabsPrompt(text: string, kind: 'TTS' | 'SFX'): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`ElevenLabs ${kind} prompt must not be empty. Pass --prompt before retrying.`);
  }
  return trimmed;
}

function assertElevenLabsSfxPromptLength(text: string) {
  const promptChars = Array.from(text).length;
  if (promptChars > ELEVENLABS_SFX_MAX_PROMPT_CHARS) {
    throw new Error(
      `ElevenLabs SFX prompt exceeds ${ELEVENLABS_SFX_MAX_PROMPT_CHARS} characters (${promptChars}). Shorten --prompt before retrying.`,
    );
  }
}

async function renderElevenLabsTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ElevenLabs API key - configure it in Settings or set OD_ELEVENLABS_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || ELEVENLABS_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = ELEVENLABS_TTS_MODEL_MAP[ctx.model] || ctx.model;
  const text = requireElevenLabsPrompt(ctx.prompt ?? '', 'TTS');
  const voiceId = (ctx.voice && ctx.voice.trim()) || ELEVENLABS_DEFAULT_VOICE_ID;
  const body = {
    text,
    model_id: wireModel,
    voice_settings: {
      stability: 1,
      similarity_boost: 1,
      style: 0,
      speed: 1,
      use_speaker_boost: true,
    },
  };

  const resp = await fetch(
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': credentials.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`elevenlabs tts ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('elevenlabs tts returned zero bytes');
  }
  return {
    bytes,
    providerNote: `elevenlabs/${wireModel} · ${voiceId} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

async function renderElevenLabsSfx(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ElevenLabs API key - configure it in Settings or set OD_ELEVENLABS_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || ELEVENLABS_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = ELEVENLABS_SFX_MODEL_MAP[ctx.model] || ctx.model;
  const text = requireElevenLabsPrompt(ctx.prompt ?? '', 'SFX');
  assertElevenLabsSfxPromptLength(text);
  const durationSeconds = clampElevenLabsSfxDuration(ctx.duration);
  const promptInfluence = clampElevenLabsSfxPromptInfluence(ctx.promptInfluence);
  const body = {
    text,
    duration_seconds: durationSeconds,
    prompt_influence: promptInfluence,
    ...(ctx.loop ? { loop: true } : {}),
    model_id: wireModel,
  };

  const resp = await fetch(
    `${baseUrl}/v1/sound-generation?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': credentials.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`elevenlabs sfx ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('elevenlabs sfx returned zero bytes');
  }
  return {
    bytes,
    providerNote: `elevenlabs/${wireModel} · ${durationSeconds}s${ctx.loop ? ' · loop' : ''} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: MiniMax — Speech-02 family text-to-speech (synchronous).
//
// Docs: https://platform.minimaxi.com — POST /t2a_v2 with a JSON body
// describing the voice + audio settings. Response is JSON with the
// audio bytes hex-encoded under `data.audio`. The MiniMax catalogue we
// surface as the generic id `minimax-tts` resolves to `speech-02-turbo`
// (their fast tier). Voice id defaults to a neutral Mandarin voice but
// the agent can override via the model registry's `voice` slot.
// ---------------------------------------------------------------------------

const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimaxi.chat/v1';

// Map our generic catalogue ids onto MiniMax's actual model ids. The
// `minimax-tts` slot in src/media/models.ts is shorthand for "their
// fast TTS tier"; we substitute the real model name on the wire so
// MiniMax accepts the request without exposing the user to their
// internal naming.
const MINIMAX_TTS_MODEL_MAP = {
  'minimax-tts': 'speech-02-turbo',
} as Record<string, string>;

async function renderMinimaxTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no MiniMax API key — configure it in Settings or set OD_MINIMAX_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || MINIMAX_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  // Precedence: user alias from #1277 (when set) -> project's known
  // MINIMAX legacy rename map -> catalog id. The user knows their
  // deployment name better than our hardcoded table, so an explicit
  // alias trumps the legacy mapping.
  const wireModel = ctx.wireModel !== ctx.model
    ? ctx.wireModel
    : (MINIMAX_TTS_MODEL_MAP[ctx.model] || ctx.model);
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';
  // Voice id picks: the agent can pass --voice to choose, otherwise we
  // default to a neutral Mandarin male voice that handles both Chinese
  // and English text reasonably. MiniMax's voice catalogue is large
  // (`male-qn-qingse`, `female-shaonv`, etc.) — listed at
  // platform.minimaxi.com under voice management.
  const voiceId = (ctx.voice && ctx.voice.trim()) || 'male-qn-qingse';

  const languageBoost = typeof ctx.language === 'string' ? ctx.language.trim() : '';

  const body = {
    model: wireModel,
    text,
    stream: false,
    ...(languageBoost ? { language_boost: languageBoost } : {}),
    voice_setting: {
      voice_id: voiceId,
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      format: 'mp3',
    },
  };

  const resp = await fetch(`${baseUrl}/t2a_v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`minimax tts ${resp.status}: ${truncate(respText, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(respText);
  } catch {
    throw new Error(`minimax tts non-JSON: ${truncate(respText, 200)}`);
  }
  // MiniMax wraps every response in `base_resp`; even an HTTP 200 can
  // be a logical failure (`status_code !== 0`). Surface that distinct
  // class of error so the user knows it's an auth / params issue, not
  // a network blip.
  if (data?.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(
      `minimax tts api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
    );
  }
  const hex = data?.data?.audio;
  if (typeof hex !== 'string' || !hex) {
    throw new Error('minimax tts response missing data.audio');
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) {
    throw new Error('minimax tts decoded zero bytes');
  }
  // Pull a few useful descriptors from extra_info for the providerNote
  // so the FileViewer toolbar tells the truth about what was generated.
  const xi = data?.extra_info || {};
  const seconds = xi.audio_length ? Math.round(xi.audio_length / 100) / 10 : '?';

  return {
    bytes,
    providerNote: `minimax/${wireModel} · ${voiceId} · ${seconds}s · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: SenseAudio — senseaudio-tts-1.5 text-to-speech (synchronous).
//
// Docs: https://docs.senseaudio.cn — POST /v1/t2a_v2 with a JSON body
// shaped like MiniMax's (voice_setting / audio_setting). The response is
// JSON with hex-encoded audio under `data.audio` and a `base_resp`
// envelope that distinguishes HTTP-level from API-level failures, again
// mirroring MiniMax. The catalogue id we surface as `senseaudio-tts`
// resolves to `senseaudio-tts-1.5-260319` on the wire — SenseAudio's
// recommended flagship model (supports emotion control, polyphonic
// characters, LaTeX formula reading, voice cloning, and text-generated
// voices). Default voice is `female_0033_b` per the official example; the agent
// can override via the model registry's `voice` slot with any system,
// cloned, or text-generated voice id from the customer's catalogue.
// Audio shape is hard-coded to mp3 / 32kHz / 128kbps / stereo for parity
// with the other TTS providers; SenseAudio supports wav/pcm/flac and
// other sample rates but we don't expose them through MediaContext yet.
// ---------------------------------------------------------------------------

const SENSEAUDIO_DEFAULT_BASE_URL = 'https://api.senseaudio.cn';
const SENSEAUDIO_DEFAULT_VOICE_ID = 'female_0033_b';

const SENSEAUDIO_TTS_MODEL_MAP = {
  'senseaudio-tts': 'senseaudio-tts-1.5-260319',
} as Record<string, string>;

async function renderSenseAudioTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no SenseAudio API key — configure it in Settings or set OD_SENSEAUDIO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || SENSEAUDIO_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = SENSEAUDIO_TTS_MODEL_MAP[ctx.model] || ctx.model;
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';
  const voiceId = (ctx.voice && ctx.voice.trim()) || SENSEAUDIO_DEFAULT_VOICE_ID;

  const body = {
    model: wireModel,
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      format: 'mp3',
      sample_rate: 32000,
      bitrate: 128000,
      channel: 2,
    },
  };

  const resp = await fetch(`${baseUrl}/v1/t2a_v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`senseaudio tts ${resp.status}: ${truncate(respText, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(respText);
  } catch {
    throw new Error(`senseaudio tts non-JSON: ${truncate(respText, 200)}`);
  }
  // SenseAudio mirrors MiniMax's base_resp envelope: HTTP 200 can still
  // be a logical failure (auth, quota, voice not on this account, …).
  // Surface the upstream status_code/status_msg so users see the real
  // cause instead of a downstream "missing data.audio" red herring.
  if (data?.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(
      `senseaudio tts api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
    );
  }
  const hex = data?.data?.audio;
  if (typeof hex !== 'string' || !hex) {
    throw new Error('senseaudio tts response missing data.audio');
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) {
    throw new Error('senseaudio tts decoded zero bytes');
  }
  const xi = data?.extra_info || {};
  const seconds = xi.audio_length ? Math.round(xi.audio_length / 100) / 10 : '?';

  return {
    bytes,
    providerNote: `senseaudio/${wireModel} · ${voiceId} · ${seconds}s · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: SenseAudio image — POST /v1/image/sync (synchronous text-to-image).
//
// Docs: https://docs.senseaudio.cn/guides/image/overview
//   * Models: senseaudio-image-2.0-260319 (multi-aspect), senseaudio-image-1.0-260319
//     (standard), doubao-seedream-5-0-260128 (hi-res). The wire `model` field
//     accepts the catalog id directly so no alias map is needed.
//   * Body: { model, prompt (≤2000 chars), size (WxH, required when no
//     reference), reference (URL or data URI, optional), seed (optional int) }.
//   * Response: { url: string } pointing at the rendered PNG; we fetch it
//     once to materialise bytes the dispatcher can write to disk.
//   * Auth: Authorization: Bearer <API_KEY>; shares the senseaudio provider
//     slot with the TTS path (OD_SENSEAUDIO_API_KEY / SENSEAUDIO_API_KEY).
// We default to the /sync endpoint because the chat runtime already streams
// progress and a single round-trip keeps the dispatcher contract identical
// to OpenAI / Volcengine image. Switching to /v1/image/async + GET
// /v1/image/pending is a future option if the upstream model latency
// outgrows the daemon's request timeout.
// ---------------------------------------------------------------------------

const SENSEAUDIO_IMAGE_PROMPT_LIMIT = 2000;

// SenseAudio's image gateway rejects non-standard pixel sizes with a 400
// `参数错误：size`. Keep this table in sync with byok-tools.ts's
// ASPECT_TO_SIZE — both paths hit the same /v1/image/sync endpoint.
function senseAudioImageSize(aspect?: string): string {
  if (aspect === '16:9') return '1280x720';
  if (aspect === '9:16') return '720x1280';
  if (aspect === '4:3') return '1024x768';
  if (aspect === '3:4') return '768x1024';
  return '1024x1024';
}

async function renderSenseAudioImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no SenseAudio API key — configure it in Settings or set OD_SENSEAUDIO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || SENSEAUDIO_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const promptRaw = (ctx.prompt && ctx.prompt.trim()) || 'A high-quality reference image.';
  // SenseAudio rejects >2000-char prompts with a 4xx; trim defensively so a
  // verbose agent plan doesn't dead-end the generation. The truncated tail
  // surfaces in providerNote so the user sees what was actually sent.
  const prompt =
    promptRaw.length > SENSEAUDIO_IMAGE_PROMPT_LIMIT
      ? promptRaw.slice(0, SENSEAUDIO_IMAGE_PROMPT_LIMIT)
      : promptRaw;
  const size = senseAudioImageSize(ctx.aspect);
  const reference = ctx.imageRef?.dataUrl;

  const body: Record<string, unknown> = {
    model: ctx.wireModel,
    prompt,
    size,
  };
  if (reference) {
    // When a reference image is supplied the API documents `size` as
    // optional; we still send it so the output dimensions stay
    // deterministic across t2i / i2i runs of the same project.
    body.reference = reference;
  }

  const resp = await fetch(`${baseUrl}/v1/image/sync`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`senseaudio image ${resp.status}: ${truncate(respText, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(respText);
  } catch {
    throw new Error(`senseaudio image non-JSON: ${truncate(respText, 200)}`);
  }
  // Mirror the TTS base_resp envelope check: HTTP 200 can still encode an
  // upstream logical failure. The image API uses the same shape on the
  // failure path documented for /v1/image/pending (status=failed +
  // error_message), so surface either source verbatim.
  if (data?.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(
      `senseaudio image api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
    );
  }
  if (typeof data?.error_message === 'string' && data.error_message) {
    throw new Error(`senseaudio image api error: ${data.error_message}`);
  }
  const url = typeof data?.url === 'string' ? data.url : '';
  if (!url) {
    throw new Error('senseaudio image response missing url');
  }
  // Mirror the chat-tool SSRF guard (byok-tools.ts): the gateway-returned
  // `url` is attacker-controllable inside a successful response, so DNS-
  // resolve it through validateBaseUrlResolved and refuse loopback /
  // RFC1918 / metadata-service hosts. Pair with `redirect: 'error'` so a
  // 3xx hop into private space is also blocked.
  const urlCheck = await assertExternalAssetUrl(url);
  if (!urlCheck.ok) {
    throw new Error(`senseaudio image ${urlCheck.error}`);
  }
  const imgResp = await fetch(url, { redirect: 'error' });
  if (!imgResp.ok) {
    throw new Error(`senseaudio image fetch ${imgResp.status}`);
  }
  const bytes = Buffer.from(await imgResp.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('senseaudio image fetch returned zero bytes');
  }

  return {
    bytes,
    providerNote: `senseaudio/${ctx.wireModel} · ${size}${reference ? ' · i2i' : ''} · ${bytes.length} bytes`,
    suggestedExt: '.png',
  };
}

// ---------------------------------------------------------------------------
// Provider: FishAudio — Speech-1.x family text-to-speech (synchronous).
//
// Docs: https://docs.fish.audio — POST /v1/tts with a JSON body.
// FishAudio returns the audio bytes directly (Content-Type: audio/mpeg
// for mp3, audio/wav for wav) rather than wrapping them in JSON, so we
// stream the body straight into a Buffer. The catalogue id we expose
// as `fish-speech-2` resolves to `speech-1.6` (their newer model) on
// the wire; older builds can paste `speech-1.5` via the model picker
// once arbitrary model ids are accepted.
// ---------------------------------------------------------------------------

const FISHAUDIO_DEFAULT_BASE_URL = 'https://api.fish.audio';

const FISHAUDIO_TTS_MODEL_MAP = {
  'fish-speech-2': 'speech-1.6',
} as Record<string, string>;

async function renderFishAudioTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no FishAudio API key — configure it in Settings or set OD_FISHAUDIO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || FISHAUDIO_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  // Same precedence as the MINIMAX TTS path: user alias wins, then
  // the project's hardcoded fishaudio map, then catalog id.
  const wireModel = ctx.wireModel !== ctx.model
    ? ctx.wireModel
    : (FISHAUDIO_TTS_MODEL_MAP[ctx.model] || ctx.model);
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';

  // FishAudio's `reference_id` slot pins which voice the synth uses.
  // The agent passes it via --voice (carried in ctx.voice). Empty means
  // FishAudio falls back to its default voice for the chosen model.
  const body: Record<string, unknown> = {
    text,
    format: 'mp3',
    mp3_bitrate: 128,
    model: wireModel,
    normalize: true,
    latency: 'normal',
  };
  if (ctx.voice && ctx.voice.trim()) {
    body.reference_id = ctx.voice.trim();
  }

  const resp = await fetch(`${baseUrl}/v1/tts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`fishaudio tts ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('fishaudio tts returned zero bytes');
  }
  return {
    bytes,
    providerNote: `fishaudio/${wireModel} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: HyperFrames — local HTML→MP4 renderer (heygen-com/hyperframes).
//
// The agent does the creative work: it reads skills/hyperframes/SKILL.md,
// writes a composition (`hyperframes.json` + `meta.json` + `index.html`,
// with a GSAP timeline) into a hidden cache dir under the project, then
// dispatches here with `--composition-dir <relative-path>`.
//
// We run the pinned daemon-local HyperFrames CLI from the daemon process with
// the same Node runtime that started it. This path never invokes npx or reaches
// the network, and it stays outside the agent's shell for two reasons:
//   1. HyperFrames spawns a puppeteer-controlled Chrome to capture frames.
//      Claude Code's Bash tool wraps subprocesses in macOS sandbox-exec,
//      under which Chrome hangs partway through frame capture.
//   2. Pointing --output at a temp dir keeps HF's auto-created
//      `work-<uuid>/` (per-frame jpegs + intermediate compiled HTML)
//      OUT of the project folder. We delete the temp tree in the
//      `finally` block; only the final mp4 bytes are returned to the
//      generic dispatcher flow, which writes them into the project dir
//      under the user-supplied filename.
// ---------------------------------------------------------------------------

// A 30-second 1080x1440 tutorial can take 6-8 minutes on the production
// Mac mini because every UI interaction is rendered frame by frame. Keep the
// watchdog comfortably above that normal path while still terminating a
// genuinely stuck renderer.
const HYPERFRAMES_RENDER_TIMEOUT_MS = 15 * 60 * 1000;

async function renderHyperFramesViaCli(ctx: MediaContext, projectDir: string, onProgress?: ProgressFn): Promise<RenderResult> {
  const compRel = ctx.compositionDir;
  if (typeof compRel !== 'string' || !compRel.trim()) {
    throw new Error(
      'hyperframes-html requires --composition-dir <project-relative-path> ' +
        'pointing at the directory the agent scaffolded with hyperframes.json / ' +
        'meta.json / index.html. The agent should write the composition into ' +
        '$OD_PROJECT_DIR/.hyperframes-cache/<id>/ and pass that path here.',
    );
  }
  // Resolve compositionDir against projectDir and refuse anything that
  // escapes — the agent has free file access to the project but the
  // dispatcher must not let a bad relative path render an arbitrary
  // directory on the host.
  const projectRootResolved = path.resolve(projectDir);
  const compAbs = path.resolve(projectRootResolved, compRel);
  if (
    compAbs !== projectRootResolved &&
    !compAbs.startsWith(projectRootResolved + path.sep)
  ) {
    throw new Error(
      `compositionDir "${compRel}" resolves outside the project directory. ` +
        'Pass a path relative to the project (e.g. ".hyperframes-cache/abc").',
    );
  }
  // Existence check — render against a missing directory hangs HF for
  // a while before failing, so short-circuit with a clear error.
  let compStat;
  try {
    compStat = await stat(compAbs);
  } catch {
    throw new Error(
      `compositionDir not found: ${compRel} (resolved to ${compAbs})`,
    );
  }
  if (!compStat.isDirectory()) {
    throw new Error(`compositionDir is not a directory: ${compRel}`);
  }
  const indexStat = await stat(path.join(compAbs, 'index.html')).catch(
    () => null,
  );
  if (!indexStat || !indexStat.isFile()) {
    throw new Error(
      `compositionDir is missing index.html: ${compRel}. The agent must ` +
        'write index.html (with window.__timelines registration) before dispatch.',
    );
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'open-design-hf-'));
  const tmpOutput = path.join(tmpRoot, 'render.mp4');
  try {
    // Pin --workers 1 to keep memory bounded (each worker is a Chrome
    // process at ~256 MB). standard quality matches HF's default. We
    // do NOT pass --quiet so progress lines stream out and the agent
    // (and the user reading the chat in real time) can see frame-by-
    // frame capture status instead of staring at a hung pipe.
    await runHyperFramesRender(compAbs, tmpOutput, onProgress);
    const bytes = await readFile(tmpOutput);
    return {
      bytes,
      providerNote: `hyperframes/local-html · ${ctx.aspect} · ${bytes.length} bytes`,
      suggestedExt: '.mp4',
    };
  } catch (err) {
    const stderr =
      errorStringProp(err, 'stderr').trim();
    const message = stderr || errorMessage(err);
    throw new Error(`hyperframes render failed: ${truncate(message, 480)}`);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

/**
 * Run the bundled HyperFrames CLI and stream every line of stdout/stderr
 * through `onProgress`. Resolves on a clean exit, rejects on non-zero
 * exit (with the stderr tail attached so the dispatcher can surface it).
 *
 * Streaming matters for UX: the render typically takes 60–120s and
 * HF prints "Capturing frame N/M" as it goes. Without piping these
 * lines back to the caller, the HTTP request looks hung and the
 * agent's chat tool shows a long quiet spinner — users can't tell
 * whether anything is happening.
 */
async function runHyperFramesRender(compAbs: string, tmpOutput: string, onProgress?: ProgressFn): Promise<void> {
  const binaries = resolveHyperFramesBinaryPaths();
  await verifyHyperFramesBinaries(binaries);
  const renderEnv = createHyperFramesRenderEnv(process.env, binaries);
  const invocation = createHyperFramesRenderCommand(compAbs, tmpOutput);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      invocation.command,
      invocation.args,
      {
        // Keep the daemon environment while pinning FFmpeg/FFprobe to the
        // static binaries shipped with this daemon release. stdin is closed
        // (HF doesn't read from it); stdout/stderr are piped for progress.
        env: renderEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // HF uses ANSI escape sequences (cursor moves, color codes, line
    // erases) for its pretty progress bar. Strip those before
    // forwarding so the agent's chat doesn't render a wall of `[2K`.
    // The regex covers CSI sequences (most of what HF emits).
    const stripAnsi = (s: string): string =>
      s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\[\?[0-9]+[hl]/g, '');

    const emit = (chunk: Buffer): void => {
      if (typeof onProgress !== 'function') return;
      const text = stripAnsi(chunk.toString('utf8'));
      // HF refreshes a single progress line many times per second; split
      // on \r and \n so each "Capturing frame X/Y" update reaches the
      // caller as its own line. Drop empty/duplicate lines so the
      // SSE stream stays compact.
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onProgress(trimmed);
        } catch {
          // best-effort: never let an emitter throw kill the render
        }
      }
    };

    let stderrTail = '';
    child.stdout.on('data', emit);
    child.stderr.on('data', (chunk) => {
      stderrTail += chunk.toString('utf8');
      if (stderrTail.length > 8000) stderrTail = stderrTail.slice(-8000);
      emit(chunk);
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(
        new Error(
          `hyperframes render timed out after ${Math.round(HYPERFRAMES_RENDER_TIMEOUT_MS / 1000)}s`,
        ),
      );
    }, HYPERFRAMES_RENDER_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const reason = signal ? `signal ${signal}` : `exit ${code}`;
      const tail = stderrTail.trim().split('\n').slice(-12).join('\n');
      const err = new Error(
        `hyperframes render exited ${reason}` + (tail ? `\n${tail}` : ''),
      ) as Error & { stderr: string };
      err.stderr = tail;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Stub renderer.
//
// Used when no real provider integration ships for (provider, surface)
// or when the real one fails. Produces small but valid bytes so the
// downstream FileViewer round-trip works while the backend matures.
// ---------------------------------------------------------------------------

async function renderStub(ctx: MediaContext, fileName: string): Promise<RenderResult> {
  const note = ctx.provider && !ctx.provider.integrated
    ? `stub-${ctx.surface} · provider '${ctx.provider.id}' integration pending`
    : `stub-${ctx.surface} · model=${ctx.model}`;
  if (ctx.surface === 'image') {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.svg') {
      return { bytes: Buffer.from(svgPlaceholder(ctx), 'utf8'), providerNote: note };
    }
    const png = Buffer.from(
      [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ],
    );
    return {
      bytes: png,
      providerNote: `${note} · aspect=${ctx.aspect} · prompt=${truncate(ctx.prompt, 60)}`,
    };
  }
  if (ctx.surface === 'video') {
    const ftyp = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);
    const mdat = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74]);
    return {
      bytes: Buffer.concat([ftyp, mdat]),
      providerNote: `${note} · aspect=${ctx.aspect} · length=${ctx.length ?? '?'}s · prompt=${truncate(ctx.prompt, 60)}`,
    };
  }
  // Audio
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.wav') {
    return {
      bytes: silentWav(0.5),
      providerNote: `${note} · kind=${ctx.audioKind} · duration=${ctx.duration ?? '?'}s`,
    };
  }
  const mp3 = Buffer.from([
    0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return {
    bytes: mp3,
    providerNote: `${note} · kind=${ctx.audioKind} · voice=${ctx.voice || '-'} · duration=${ctx.duration ?? '?'}s`,
  };
}

function svgPlaceholder(ctx: MediaContext): string {
  const [w, h] = aspectToBox(ctx.aspect, 800);
  const safe = (s: unknown): string =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<rect width="${w}" height="${h}" fill="#0f1424"/>`,
    `<text x="50%" y="50%" fill="#7da4ff" font-family="ui-sans-serif" font-size="20" text-anchor="middle">${safe(ctx.model)} — ${safe(ctx.prompt).slice(0, 60)}</text>`,
    '</svg>',
  ].join('');
}

function aspectToBox(aspect: string | undefined, base: number): [number, number] {
  const [a, b] = String(aspect || '1:1').split(':').map(Number);
  if (!a || !b) return [base, base];
  if (a >= b) return [base, Math.round((base * b) / a)];
  return [Math.round((base * a) / b), base];
}

function silentWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.max(1, Math.round(sampleRate * seconds));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function truncate(s: unknown, n: number): string {
  const v = String(s || '');
  if (v.length <= n) return v;
  return v.slice(0, n - 1) + '…';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
