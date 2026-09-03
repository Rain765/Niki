import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LoanVideoStoryboard } from '@open-design/contracts';

export const LOAN_VIDEO_COMPOSITION_DIR = '.hyperframes-cache/loan-video-fast';
const LOAN_VIDEO_STORYBOARD_PATH = `${LOAN_VIDEO_COMPOSITION_DIR}/storyboard.json`;
const BUILD_TIMEOUT_MS = 8 * 60 * 1000;
const ASPECTS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
const PRODUCTS = new Set(['zamloan', 'biumoney']);
const LANGUAGES = new Set(['en', 'zh-CN']);

function invalid(message: string): never {
  const error = new Error(message);
  Object.assign(error, { status: 400, code: 'invalid_loan_video_storyboard' });
  throw error;
}

function nonEmptyString(value: unknown, label: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) invalid(`${label} is too long`);
  return normalized;
}

function safeAssetRef(value: unknown, label: string): string {
  const ref = nonEmptyString(value, label, 500).replaceAll('\\', '/');
  if (!ref.startsWith('.od-inputs/') || ref.includes('/../') || ref.endsWith('/..')) {
    invalid(`${label} must reference a file under .od-inputs`);
  }
  return ref;
}

function normalizedUnitNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    invalid(`${label} must be between 0 and 1`);
  }
  return numeric;
}

export function normalizeLoanVideoStoryboard(value: unknown): LoanVideoStoryboard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('loanVideoStoryboard must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2) invalid('loanVideoStoryboard.version must be 2');
  const title = nonEmptyString(raw.title, 'loanVideoStoryboard.title', 200);
  const product = nonEmptyString(raw.product, 'loanVideoStoryboard.product', 30);
  if (!PRODUCTS.has(product)) invalid('loanVideoStoryboard.product is unsupported');
  const language = nonEmptyString(raw.language, 'loanVideoStoryboard.language', 20);
  if (!LANGUAGES.has(language)) invalid('loanVideoStoryboard.language is unsupported');
  const aspectRatio = nonEmptyString(raw.aspectRatio, 'loanVideoStoryboard.aspectRatio', 10);
  if (!ASPECTS.has(aspectRatio)) invalid('loanVideoStoryboard.aspectRatio is unsupported');
  const durationSeconds = Number(raw.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 120) {
    invalid('loanVideoStoryboard.durationSeconds must be between 1 and 120');
  }
  const rawScenes = raw.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0 || rawScenes.length > 20) {
    invalid('loanVideoStoryboard.scenes must contain 1-20 scenes');
  }
  const backgroundRef = raw.backgroundRef === undefined
    ? undefined
    : safeAssetRef(raw.backgroundRef, 'loanVideoStoryboard.backgroundRef');
  const scenes = rawScenes.map((entry, offset) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      invalid(`loanVideoStoryboard.scenes[${offset}] must be an object`);
    }
    const scene = entry as Record<string, unknown>;
    const rawPresentation = scene.presentation;
    if (rawPresentation !== undefined && rawPresentation !== 'full' && rawPresentation !== 'device') {
      invalid(`loanVideoStoryboard.scenes[${offset}].presentation is unsupported`);
    }
    const presentation: 'full' | 'device' | undefined = rawPresentation === 'full'
      || rawPresentation === 'device'
      ? rawPresentation
      : undefined;
    const rawFocusTargets = scene.focusTargets ?? [];
    if (!Array.isArray(rawFocusTargets) || rawFocusTargets.length > 12) {
      invalid(`loanVideoStoryboard.scenes[${offset}].focusTargets must contain 0-12 targets`);
    }
    const focusTargets = rawFocusTargets.map((target, targetIndex) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        invalid(`loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}] must be an object`);
      }
      const rawTarget = target as Record<string, unknown>;
      const x = normalizedUnitNumber(
        rawTarget.x,
        `loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}].x`,
      );
      const y = normalizedUnitNumber(
        rawTarget.y,
        `loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}].y`,
      );
      const width = normalizedUnitNumber(
        rawTarget.width,
        `loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}].width`,
      );
      const height = normalizedUnitNumber(
        rawTarget.height,
        `loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}].height`,
      );
      if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
        invalid(`loanVideoStoryboard.scenes[${offset}].focusTargets[${targetIndex}] exceeds the image bounds`);
      }
      return { x, y, width, height };
    });
    let interaction: LoanVideoStoryboard['scenes'][number]['interaction'];
    if (scene.interaction !== undefined) {
      if (!scene.interaction || typeof scene.interaction !== 'object' || Array.isArray(scene.interaction)) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction must be an object`);
      }
      const rawInteraction = scene.interaction as Record<string, unknown>;
      if (
        rawInteraction.type !== 'type'
        && rawInteraction.type !== 'keypad'
        && rawInteraction.type !== 'otp'
      ) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.type is unsupported`);
      }
      if (!rawInteraction.target || typeof rawInteraction.target !== 'object' || Array.isArray(rawInteraction.target)) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.target must be an object`);
      }
      const rawTarget = rawInteraction.target as Record<string, unknown>;
      const target = {
        x: normalizedUnitNumber(
          rawTarget.x,
          `loanVideoStoryboard.scenes[${offset}].interaction.target.x`,
        ),
        y: normalizedUnitNumber(
          rawTarget.y,
          `loanVideoStoryboard.scenes[${offset}].interaction.target.y`,
        ),
        width: normalizedUnitNumber(
          rawTarget.width,
          `loanVideoStoryboard.scenes[${offset}].interaction.target.width`,
        ),
        height: normalizedUnitNumber(
          rawTarget.height,
          `loanVideoStoryboard.scenes[${offset}].interaction.target.height`,
        ),
      };
      if (
        target.width <= 0
        || target.height <= 0
        || target.x + target.width > 1
        || target.y + target.height > 1
      ) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.target exceeds the image bounds`);
      }
      const interactionText = nonEmptyString(
        rawInteraction.text,
        `loanVideoStoryboard.scenes[${offset}].interaction.text`,
        64,
      );
      if (rawInteraction.type === 'otp' && !/^\d{1,8}$/.test(interactionText)) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.text must contain 1-8 digits`);
      }
      if (rawInteraction.type === 'keypad' && !/^\d{1,15}$/.test(interactionText)) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.text must contain 1-15 digits`);
      }
      const start = Number(rawInteraction.start);
      const interactionDuration = Number(rawInteraction.duration);
      if (!Number.isFinite(start) || start < 0 || start > 30) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.start is invalid`);
      }
      if (!Number.isFinite(interactionDuration) || interactionDuration < 0.2 || interactionDuration > 10) {
        invalid(`loanVideoStoryboard.scenes[${offset}].interaction.duration is invalid`);
      }
      interaction = {
        type: rawInteraction.type,
        start,
        duration: interactionDuration,
        text: interactionText,
        target,
      };
    }
    return {
      id: nonEmptyString(scene.id, `loanVideoStoryboard.scenes[${offset}].id`, 100),
      index: offset + 1,
      screenshotAttachmentIndex: offset + 1,
      screenshotOriginalName: typeof scene.screenshotOriginalName === 'string'
        ? scene.screenshotOriginalName.slice(0, 300)
        : null,
      assetRef: safeAssetRef(
        scene.assetRef,
        `loanVideoStoryboard.scenes[${offset}].assetRef`,
      ),
      text: typeof scene.text === 'string' ? scene.text.trim().slice(0, 1_000) : '',
      captionEnabled: scene.captionEnabled === true,
      voiceoverEnabled: scene.voiceoverEnabled === true,
      terminal: offset === rawScenes.length - 1,
      ...(presentation ? { presentation } : {}),
      ...(focusTargets.length > 0 ? { focusTargets } : {}),
      ...(interaction ? { interaction } : {}),
    };
  });
  if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length) {
    invalid('loanVideoStoryboard scene ids must be unique');
  }
  for (const [offset, scene] of scenes.entries()) {
    if ((scene.captionEnabled || scene.voiceoverEnabled) && scene.text.length === 0) {
      invalid(`loanVideoStoryboard.scenes[${offset}].text is required`);
    }
  }
  if (!Array.isArray(raw.transitions) || raw.transitions.length !== Math.max(0, scenes.length - 1)) {
    invalid('loanVideoStoryboard.transitions must connect every adjacent scene');
  }
  const transitions = raw.transitions.map((entry, offset) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      invalid(`loanVideoStoryboard.transitions[${offset}] must be an object`);
    }
    const transition = entry as Record<string, unknown>;
    const action = transition.action;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      invalid(`loanVideoStoryboard.transitions[${offset}].action must be an object`);
    }
    const rawAction = action as Record<string, unknown>;
    let normalizedAction:
      | { type: 'auto' }
      | { type: 'tap'; x: number; y: number; width?: number; height?: number }
      | {
          type: 'open-modal' | 'close-modal';
          x: number;
          y: number;
          width?: number;
          height?: number;
          clipTop?: number;
        };
    if (rawAction.type === 'auto') {
      normalizedAction = { type: 'auto' };
    } else if (
      rawAction.type === 'tap'
      || rawAction.type === 'open-modal'
      || rawAction.type === 'close-modal'
    ) {
      const x = normalizedUnitNumber(
        rawAction.x,
        `loanVideoStoryboard.transitions[${offset}].action.x`,
      );
      const y = normalizedUnitNumber(
        rawAction.y,
        `loanVideoStoryboard.transitions[${offset}].action.y`,
      );
      const width = rawAction.width === undefined
        ? undefined
        : normalizedUnitNumber(
            rawAction.width,
            `loanVideoStoryboard.transitions[${offset}].action.width`,
          );
      const height = rawAction.height === undefined
        ? undefined
        : normalizedUnitNumber(
            rawAction.height,
            `loanVideoStoryboard.transitions[${offset}].action.height`,
          );
      if (width === 0 || height === 0) {
        invalid(`loanVideoStoryboard.transitions[${offset}] tap size must be greater than 0`);
      }
      const clipTop = rawAction.type === 'tap' || rawAction.clipTop === undefined
        ? undefined
        : normalizedUnitNumber(
            rawAction.clipTop,
            `loanVideoStoryboard.transitions[${offset}].action.clipTop`,
          );
      normalizedAction = {
        type: rawAction.type,
        x,
        y,
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        ...(clipTop === undefined ? {} : { clipTop }),
      };
    } else {
      invalid(`loanVideoStoryboard.transitions[${offset}].action.type is unsupported`);
    }
    const expectedFrom = scenes[offset]!.id;
    const expectedTo = scenes[offset + 1]!.id;
    if (transition.fromSceneId !== expectedFrom || transition.toSceneId !== expectedTo) {
      invalid(`loanVideoStoryboard.transitions[${offset}] must connect adjacent scenes`);
    }
    return {
      fromSceneId: expectedFrom,
      toSceneId: expectedTo,
      action: normalizedAction,
    };
  });

  return {
    version: 2,
    title,
    product: product as LoanVideoStoryboard['product'],
    language: language as LoanVideoStoryboard['language'],
    aspectRatio: aspectRatio as LoanVideoStoryboard['aspectRatio'],
    durationSeconds,
    narration: raw.narration === true && scenes.some((scene) => scene.voiceoverEnabled),
    subtitles: raw.subtitles !== false && scenes.some((scene) => scene.captionEnabled),
    ...(backgroundRef ? { backgroundRef } : {}),
    scenes,
    transitions,
  };
}

interface LoanVideoBuildResult {
  compositionDir: string;
  durationSeconds: number;
  narration: boolean;
  scenes: number;
  size: string;
  version: number;
  warnings: string[];
}

function lastJsonLine(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]!);
    } catch {
      // Builder progress may precede its final JSON summary.
    }
  }
  return null;
}

export async function prepareLoanVideoComposition(options: {
  projectDir: string;
  projectId: string;
  storyboard: LoanVideoStoryboard;
  designTemplatesDir: string;
  odBin: string;
  onProgress?: (line: string) => void;
}): Promise<LoanVideoBuildResult> {
  const compositionDir = path.join(options.projectDir, LOAN_VIDEO_COMPOSITION_DIR);
  await mkdir(compositionDir, { recursive: true });
  const compositionStat = await stat(compositionDir);
  if (!compositionStat.isDirectory()) invalid('loan video composition path is not a directory');
  const storyboardPath = path.join(options.projectDir, LOAN_VIDEO_STORYBOARD_PATH);
  const temporaryPath = path.join(
    compositionDir,
    `.storyboard.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(options.storyboard, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, storyboardPath);

  const builderPath = path.join(
    options.designTemplatesDir,
    'hyperframes',
    'scripts',
    'build-loan-video.mjs',
  );
  const builderStat = await stat(builderPath).catch(() => null);
  if (!builderStat?.isFile()) {
    throw new Error(`loan video builder not found: ${builderPath}`);
  }
  options.onProgress?.('Preparing tutorial scenes from the uploaded screenshots');

  return new Promise<LoanVideoBuildResult>((resolve, reject) => {
    const child = spawn(process.execPath, [
      builderPath,
      '--storyboard',
      LOAN_VIDEO_STORYBOARD_PATH,
      '--allow-silent-fallback',
    ], {
      cwd: options.projectDir,
      env: {
        ...process.env,
        OD_BIN: options.odBin,
        OD_NODE_BIN: process.execPath,
        OD_PROJECT_DIR: options.projectDir,
        OD_PROJECT_ID: options.projectId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const emitLines = (chunk: Buffer, target: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf8');
      if (target === 'stdout') stdout += text;
      else stderr = `${stderr}${text}`.slice(-16_000);
      for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
        options.onProgress?.(line);
      }
    };
    child.stdout.on('data', (chunk: Buffer) => emitLines(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => emitLines(chunk, 'stderr'));
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`loan video preparation timed out after ${BUILD_TIMEOUT_MS / 1000}s`));
    }, BUILD_TIMEOUT_MS);
    timeout.unref?.();
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(
          `loan video preparation failed${signal ? ` (${signal})` : ''}: ${stderr.trim() || `exit ${code}`}`,
        ));
        return;
      }
      const payload = lastJsonLine(stdout) as Partial<LoanVideoBuildResult> | null;
      if (!payload || payload.compositionDir !== LOAN_VIDEO_COMPOSITION_DIR) {
        reject(new Error('loan video builder did not return a valid composition summary'));
        return;
      }
      resolve({
        compositionDir: payload.compositionDir,
        durationSeconds: Number(payload.durationSeconds),
        narration: payload.narration === true,
        scenes: Number(payload.scenes),
        size: String(payload.size ?? ''),
        version: Number(payload.version),
        warnings: Array.isArray(payload.warnings)
          ? payload.warnings.filter((warning): warning is string => typeof warning === 'string')
          : [],
      });
    });
  });
}
