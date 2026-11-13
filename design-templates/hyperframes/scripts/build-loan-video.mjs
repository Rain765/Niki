#!/usr/bin/env node

// Compatibility entrypoint: this file is intentionally plain ESM so the
// daemon's bundled Node runtime can execute the staged skill without tsx,
// npx, a package install, or any network-loaded build tooling.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMPOSITION_RELATIVE_DIR = '.hyperframes-cache/loan-video-fast';
const HAND_ASSET_NAME = 'tutorial-dark-hand.png';
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const SUPPORTED_ASPECTS = {
  '1:1': { width: 1080, height: 1080, layout: 'square' },
  '16:9': { width: 1920, height: 1080, layout: 'landscape' },
  '9:16': { width: 1080, height: 1920, layout: 'portrait' },
  '4:3': { width: 1440, height: 1080, layout: 'landscape' },
  '3:4': { width: 1080, height: 1440, layout: 'portrait' },
};
const MEDIA_WAIT_BUDGET_MS = 6 * 60 * 1000;
const TTS_CONCURRENCY = 2;
const AUDIO_TAIL_SECONDS = 0.3;
const READABLE_SCENE_MIN_SECONDS = 1.2;
const CURRENT_HOLD_SECONDS = 0.08;
const POINTER_APPROACH_SECONDS = 0.18;
const PRESS_SECONDS = 0.09;
const RIPPLE_SECONDS = 0.24;
const RESPONSE_SECONDS = 0.12;
const CROSSFADE_SECONDS = 0.28;
const MODAL_TRANSITION_SECONDS = 0.46;
const MICROS_PER_SECOND = 1_000_000;

function fail(message) {
  throw new Error(message);
}

function cleanString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be a finite number`);
  return number;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function resolveInside(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(`${label} must stay inside the project directory`);
  }
  return resolved;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function realDirectoryInside(root, candidate, label) {
  const entry = await lstat(candidate).catch(() => null);
  if (!entry) fail(`${label} does not exist`);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (!isPathInside(realRoot, realCandidate)) {
    fail(`${label} resolves outside the project directory`);
  }
  const candidateStat = await stat(realCandidate);
  if (!candidateStat.isDirectory()) fail(`${label} must be a directory`);
  return realCandidate;
}

async function realFileInside(root, candidate, label) {
  const entry = await lstat(candidate).catch(() => null);
  if (!entry) fail(`${label} does not exist`);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (!isPathInside(realRoot, realCandidate)) {
    fail(`${label} resolves outside the project directory`);
  }
  const candidateStat = await stat(realCandidate);
  if (!candidateStat.isFile()) fail(`${label} must be a file`);
  return realCandidate;
}

async function ensureSafeOutputDirectory(root, directory, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedDirectory = path.resolve(directory);
  if (!isPathInside(resolvedRoot, resolvedDirectory) || resolvedDirectory === resolvedRoot) {
    fail(`${label} must stay inside the project directory`);
  }
  const relative = path.relative(resolvedRoot, resolvedDirectory);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let entry = await lstat(current).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (!entry) {
      await mkdir(current).catch((error) => {
        if (error?.code !== 'EEXIST') throw error;
      });
      entry = await lstat(current);
    }
    if (entry.isSymbolicLink()) fail(`${label} cannot contain a symbolic link`);
    if (!entry.isDirectory()) fail(`${label} must be a directory`);
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedDirectory),
  ]);
  if (!isPathInside(realRoot, realDirectory)) {
    fail(`${label} resolves outside the project directory`);
  }
  return resolvedDirectory;
}

async function assertSafeOutputFile(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget) || resolvedTarget === resolvedRoot) {
    fail(`${label} must stay inside the project directory`);
  }
  await ensureSafeOutputDirectory(root, path.dirname(resolvedTarget), `${label} parent directory`);
  const entry = await lstat(resolvedTarget).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (entry?.isSymbolicLink()) fail(`${label} cannot be a symbolic link`);
  if (entry && !entry.isFile()) fail(`${label} must be a regular file`);
  return resolvedTarget;
}

async function writeSafeOutputFile(root, target, contents, label) {
  const resolvedTarget = await assertSafeOutputFile(root, target, label);
  const temporaryPath = path.join(
    path.dirname(resolvedTarget),
    `.${path.basename(resolvedTarget)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle = null;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_WRONLY
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o644,
    );
    await handle.writeFile(contents, typeof contents === 'string' ? 'utf8' : undefined);
    await handle.close();
    handle = null;
    await assertSafeOutputFile(root, resolvedTarget, label);
    await rename(temporaryPath, resolvedTarget);
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
  }
}

function parseArgs(argv) {
  let storyboard = '';
  let allowSilentFallback = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--storyboard') {
      storyboard = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--allow-silent-fallback') {
      allowSilentFallback = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: "$OD_NODE_BIN" build-loan-video.mjs --storyboard <project-relative-json> [--allow-silent-fallback]\n',
      );
      process.exit(0);
    }
    fail(`unsupported argument: ${arg}`);
  }
  return {
    allowSilentFallback,
    storyboard: cleanString(storyboard, '--storyboard'),
  };
}

function normalizeStoryboard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('storyboard must be a JSON object');
  }
  const version = Number(raw.version ?? 1);
  if (version !== 1 && version !== 2) {
    fail(`unsupported storyboard version: ${String(raw.version)}`);
  }
  const title = cleanString(raw.title, 'storyboard.title');
  const product = cleanString(raw.product, 'storyboard.product').toLowerCase();
  const language = cleanString(raw.language, 'storyboard.language');
  const aspectRatio = cleanString(raw.aspectRatio, 'storyboard.aspectRatio');
  const aspect = SUPPORTED_ASPECTS[aspectRatio];
  if (!aspect) {
    fail(`unsupported aspect ratio: ${aspectRatio}`);
  }
  const durationSeconds = finiteNumber(raw.durationSeconds, 'storyboard.durationSeconds');
  if (durationSeconds < 1 || durationSeconds > 120) {
    fail('storyboard.durationSeconds must be between 1 and 120');
  }
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    fail('storyboard.scenes must contain at least one scene');
  }
  if (raw.scenes.length > 40) fail('storyboard.scenes cannot exceed 40 scenes');

  const scenes = raw.scenes.map((scene, index) => {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      fail(`storyboard.scenes[${index}] must be an object`);
    }
    if (version === 1) {
      const caption = cleanString(scene.caption, `storyboard.scenes[${index}].caption`);
      const voiceover = typeof scene.voiceover === 'string' && scene.voiceover.trim()
        ? scene.voiceover.trim()
        : caption;
      return {
        id: `scene-${index + 1}`,
        caption,
        captionEnabled: raw.subtitles !== false,
        voiceover,
        voiceoverEnabled: true,
        sourceAction: scene.action,
      };
    }

    const id = cleanString(scene.id, `storyboard.scenes[${index}].id`);
    const text = typeof scene.text === 'string' ? scene.text.trim() : '';
    const captionEnabled = raw.subtitles !== false && scene.captionEnabled === true;
    const voiceoverEnabled = scene.voiceoverEnabled === true;
    if ((captionEnabled || voiceoverEnabled) && !text) {
      fail(`storyboard.scenes[${index}].text must be non-empty when caption or voiceover is enabled`);
    }
    const presentation = scene.presentation === undefined
      ? 'full'
      : cleanString(scene.presentation, `storyboard.scenes[${index}].presentation`);
    if (presentation !== 'full' && presentation !== 'device') {
      fail(`storyboard.scenes[${index}].presentation must be full or device`);
    }
    const rawFocusTargets = scene.focusTargets ?? [];
    if (!Array.isArray(rawFocusTargets)) {
      fail(`storyboard.scenes[${index}].focusTargets must be an array`);
    }
    if (rawFocusTargets.length > 12) {
      fail(`storyboard.scenes[${index}].focusTargets cannot exceed 12 entries`);
    }
    const focusTargets = rawFocusTargets.map((target, targetIndex) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        fail(`storyboard.scenes[${index}].focusTargets[${targetIndex}] must be an object`);
      }
      const x = clamp(finiteNumber(
        target.x,
        `storyboard.scenes[${index}].focusTargets[${targetIndex}].x`,
      ), 0, 0.995);
      const y = clamp(finiteNumber(
        target.y,
        `storyboard.scenes[${index}].focusTargets[${targetIndex}].y`,
      ), 0, 0.995);
      const width = clamp(finiteNumber(
        target.width,
        `storyboard.scenes[${index}].focusTargets[${targetIndex}].width`,
      ), 0.005, 1 - x);
      const height = clamp(finiteNumber(
        target.height,
        `storyboard.scenes[${index}].focusTargets[${targetIndex}].height`,
      ), 0.005, 1 - y);
      return { x, y, width, height };
    });
    let interaction = null;
    if (scene.interaction !== undefined && scene.interaction !== null) {
      const rawInteraction = scene.interaction;
      if (!rawInteraction || typeof rawInteraction !== 'object' || Array.isArray(rawInteraction)) {
        fail(`storyboard.scenes[${index}].interaction must be an object`);
      }
      if (
        rawInteraction.type !== 'type'
        && rawInteraction.type !== 'keypad'
        && rawInteraction.type !== 'otp'
      ) {
        fail(`storyboard.scenes[${index}].interaction has unsupported type`);
      }
      const target = rawInteraction.target;
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        fail(`storyboard.scenes[${index}].interaction.target must be an object`);
      }
      const x = clamp(finiteNumber(
        target.x,
        `storyboard.scenes[${index}].interaction.target.x`,
      ), 0, 0.995);
      const y = clamp(finiteNumber(
        target.y,
        `storyboard.scenes[${index}].interaction.target.y`,
      ), 0, 0.995);
      const width = clamp(finiteNumber(
        target.width,
        `storyboard.scenes[${index}].interaction.target.width`,
      ), 0.005, 1 - x);
      const height = clamp(finiteNumber(
        target.height,
        `storyboard.scenes[${index}].interaction.target.height`,
      ), 0.005, 1 - y);
      const interactionText = cleanString(
        rawInteraction.text,
        `storyboard.scenes[${index}].interaction.text`,
      );
      if (interactionText.length > 64) {
        fail(`storyboard.scenes[${index}].interaction.text cannot exceed 64 characters`);
      }
      if (rawInteraction.type === 'otp' && !/^\d{1,8}$/.test(interactionText)) {
        fail(`storyboard.scenes[${index}].interaction.text must contain 1 to 8 digits for otp`);
      }
      if (rawInteraction.type === 'keypad' && !/^\d{1,15}$/.test(interactionText)) {
        fail(
          `storyboard.scenes[${index}].interaction.text must contain 1 to 15 digits for keypad`,
        );
      }
      interaction = {
        type: rawInteraction.type,
        start: clamp(finiteNumber(
          rawInteraction.start,
          `storyboard.scenes[${index}].interaction.start`,
        ), 0, 30),
        duration: clamp(finiteNumber(
          rawInteraction.duration,
          `storyboard.scenes[${index}].interaction.duration`,
        ), 0.2, 10),
        text: interactionText,
        target: { x, y, width, height },
      };
    }
    return {
      id,
      assetRef: cleanString(scene.assetRef, `storyboard.scenes[${index}].assetRef`),
      caption: text,
      captionEnabled,
      focusTargets,
      interaction,
      presentation,
      voiceover: text,
      voiceoverEnabled,
      sourceTransition: scene.transition,
    };
  });

  const seenIds = new Set();
  for (const scene of scenes) {
    if (seenIds.has(scene.id)) fail(`storyboard scene id must be unique: ${scene.id}`);
    seenIds.add(scene.id);
  }

  const transitionByFromId = new Map();
  if (version === 2 && raw.transitions !== undefined) {
    if (!Array.isArray(raw.transitions)) fail('storyboard.transitions must be an array');
    for (let index = 0; index < raw.transitions.length; index += 1) {
      const transition = raw.transitions[index];
      if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
        fail(`storyboard.transitions[${index}] must be an object`);
      }
      const fromSceneId = cleanString(
        transition.fromSceneId,
        `storyboard.transitions[${index}].fromSceneId`,
      );
      if (transitionByFromId.has(fromSceneId)) {
        fail(`storyboard.transitions contains duplicate transition from ${fromSceneId}`);
      }
      transitionByFromId.set(fromSceneId, transition);
    }
  }

  function normalizeAction(action, index, targetSceneIndex) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      fail(`storyboard transition from scene ${index + 1} must define an action`);
    }
    if (action.type === 'auto') {
      return { type: 'auto', targetSceneIndex };
    }
    if (action.type === 'tap' || action.type === 'open-modal' || action.type === 'close-modal') {
      const normalized = {
        type: action.type,
        targetSceneIndex,
        x: clamp(finiteNumber(action.x, `storyboard scene ${index + 1} action x`), 0, 1),
        y: clamp(finiteNumber(action.y, `storyboard scene ${index + 1} action y`), 0, 1),
      };
      if (action.width !== undefined) {
        normalized.width = clamp(
          finiteNumber(action.width, `storyboard scene ${index + 1} tap width`),
          0.01,
          1,
        );
      }
      if (action.height !== undefined) {
        normalized.height = clamp(
          finiteNumber(action.height, `storyboard scene ${index + 1} tap height`),
          0.01,
          1,
        );
      }
      if (action.type === 'open-modal' || action.type === 'close-modal') {
        normalized.clipTop = clamp(
          finiteNumber(action.clipTop ?? 0, `storyboard scene ${index + 1} modal clipTop`),
          0,
          0.8,
        );
      }
      return normalized;
    }
    fail(`storyboard transition from scene ${index + 1} has unsupported action type`);
  }

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (index === scenes.length - 1) {
      scene.transition = { type: 'none', targetSceneIndex: null };
      continue;
    }
    const nextScene = scenes[index + 1];
    if (version === 1) {
      const action = scene.sourceAction && typeof scene.sourceAction === 'object'
        && !Array.isArray(scene.sourceAction)
        ? scene.sourceAction
        : { type: 'none' };
      scene.transition = action.type === 'tap'
        ? normalizeAction(action, index, index + 2)
        : { type: 'auto', targetSceneIndex: index + 2 };
      continue;
    }

    const declared = transitionByFromId.get(scene.id);
    if (declared) {
      if (cleanString(declared.toSceneId, `transition from ${scene.id} toSceneId`) !== nextScene.id) {
        fail(`transition from ${scene.id} must target the next scene ${nextScene.id}`);
      }
      scene.transition = normalizeAction(declared.action, index, index + 2);
      continue;
    }

    const inline = scene.sourceTransition;
    if (inline && typeof inline === 'object' && !Array.isArray(inline)) {
      if (Number(inline.targetSceneIndex) !== index + 2) {
        fail(`inline transition from scene ${index + 1} must target scene ${index + 2}`);
      }
      scene.transition = normalizeAction(inline, index, index + 2);
      continue;
    }
    fail(`storyboard transition from ${scene.id} to ${nextScene.id} is missing`);
  }

  for (const fromSceneId of transitionByFromId.keys()) {
    if (!scenes.slice(0, -1).some((scene) => scene.id === fromSceneId)) {
      fail(`storyboard transition references an unknown or terminal scene: ${fromSceneId}`);
    }
  }

  return {
    version,
    title,
    product,
    language,
    aspectRatio,
    aspect,
    backgroundRef: version === 2 && raw.backgroundRef !== undefined
      ? cleanString(raw.backgroundRef, 'storyboard.backgroundRef')
      : null,
    durationSeconds,
    narration: raw.narration === true
      && scenes.some((scene) => scene.voiceoverEnabled && scene.voiceover),
    subtitles: scenes.some((scene) => scene.captionEnabled),
    scenes,
  };
}

async function discoverScreenshotPaths(projectDir, expectedCount) {
  const inputDir = path.join(projectDir, '.od-inputs');
  const realInputDir = await realDirectoryInside(projectDir, inputDir, '.od-inputs');
  const entries = await readdir(inputDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (files.length !== expectedCount) {
    fail(
      `expected ${expectedCount} uploaded screenshot(s) in .od-inputs, found ${files.length}; `
        + 'do not guess or replace missing product screenshots',
    );
  }
  return Promise.all(files.map(async (name) => {
    const file = path.join(inputDir, name);
    const realFile = await realFileInside(projectDir, file, `.od-inputs/${name}`);
    if (!isPathInside(realInputDir, realFile)) {
      fail(`.od-inputs/${name} resolves outside the project directory`);
    }
    return realFile;
  }));
}

async function resolveInputAsset(projectDir, assetRef, label) {
  const inputDir = path.resolve(projectDir, '.od-inputs');
  const realInputDir = await realDirectoryInside(projectDir, inputDir, '.od-inputs');
  if (path.isAbsolute(assetRef)) fail(`${label} must be project-relative`);
  const resolved = resolveInside(projectDir, assetRef, label);
  const relativeToInputs = path.relative(inputDir, resolved);
  if (
    !relativeToInputs
    || relativeToInputs === '..'
    || relativeToInputs.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToInputs)
  ) {
    fail(`${label} must reference a file in .od-inputs`);
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    fail(`${label} must reference a supported image`);
  }
  const realAsset = await realFileInside(projectDir, resolved, label);
  if (!isPathInside(realInputDir, realAsset)) fail(`${label} resolves outside the project directory`);
  if (!IMAGE_EXTENSIONS.has(path.extname(realAsset).toLowerCase())) {
    fail(`${label} must resolve to a supported image`);
  }
  return realAsset;
}

async function resolveScreenshotPaths(projectDir, storyboard) {
  if (storyboard.version === 1) {
    return discoverScreenshotPaths(projectDir, storyboard.scenes.length);
  }
  return Promise.all(storyboard.scenes.map(async (scene, index) => {
    return resolveInputAsset(
      projectDir,
      scene.assetRef,
      `storyboard.scenes[${index}].assetRef`,
    );
  }));
}

function brandTokens(product) {
  if (product === 'biumoney') {
    return { label: 'BiuMoney', accent: '#7c8cff', accentSoft: 'rgba(124, 140, 255, 0.34)' };
  }
  return { label: 'ZamLoan', accent: '#ff6a2a', accentSoft: 'rgba(255, 106, 42, 0.34)' };
}

function secondsToMicros(seconds) {
  return Math.ceil(seconds * MICROS_PER_SECOND - Number.EPSILON);
}

function microsToSeconds(micros) {
  return micros / MICROS_PER_SECOND;
}

function renderTimings(storyboard, requestedDurationSeconds, audioClips) {
  const audioBySceneIndex = new Map(audioClips.map((clip) => [clip.sceneIndex - 1, clip]));
  const minimumMicros = storyboard.scenes.map((_, index) => {
    const scene = storyboard.scenes[index];
    const clip = audioBySceneIndex.get(index);
    return Math.max(
      secondsToMicros(READABLE_SCENE_MIN_SECONDS),
      clip ? secondsToMicros(clip.durationSeconds + AUDIO_TAIL_SECONDS) : 0,
      scene.interaction
        ? secondsToMicros(scene.interaction.start + scene.interaction.duration + 0.72)
        : 0,
    );
  });
  const minimumTotalMicros = minimumMicros.reduce((sum, duration) => sum + duration, 0);
  const durationMicros = Math.max(
    secondsToMicros(requestedDurationSeconds),
    minimumTotalMicros,
  );
  const weights = storyboard.scenes.map((scene) => (
    Math.max(1, (scene.voiceoverEnabled ? scene.voiceover : scene.caption).length)
  ));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let remainingMicros = durationMicros - minimumTotalMicros;
  const durationsMicros = minimumMicros.map((minimum, index) => {
    if (index === minimumMicros.length - 1) return minimum + remainingMicros;
    const share = Math.floor((durationMicros - minimumTotalMicros) * weights[index] / totalWeight);
    remainingMicros -= share;
    return minimum + share;
  });

  let cursorMicros = 0;
  const timings = storyboard.scenes.map((scene, index) => {
    const durationSceneMicros = durationsMicros[index];
    const startMicros = cursorMicros;
    const endMicros = startMicros + durationSceneMicros;
    cursorMicros = endMicros;
    const hasTarget = scene.transition.type !== 'none';
    const transitionSeconds = scene.transition.type === 'open-modal'
      || scene.transition.type === 'close-modal'
      ? MODAL_TRANSITION_SECONDS
      : CROSSFADE_SECONDS;
    const transitionStartMicros = hasTarget
      ? endMicros - secondsToMicros(transitionSeconds)
      : null;
    const responseMicros = hasTarget
      ? transitionStartMicros - secondsToMicros(RESPONSE_SECONDS)
      : null;
    const hasPointer = scene.transition.type === 'tap'
      || scene.transition.type === 'open-modal'
      || scene.transition.type === 'close-modal';
    const rippleMicros = hasPointer
      ? responseMicros - secondsToMicros(RIPPLE_SECONDS)
      : null;
    const pressMicros = hasPointer
      ? rippleMicros - secondsToMicros(PRESS_SECONDS)
      : null;
    const pointerStartMicros = hasPointer
      ? pressMicros - secondsToMicros(POINTER_APPROACH_SECONDS)
      : null;
    return {
      start: microsToSeconds(startMicros),
      duration: microsToSeconds(durationSceneMicros),
      keyframes: {
        currentAt: microsToSeconds(startMicros + secondsToMicros(CURRENT_HOLD_SECONDS)),
        pointerStartAt: pointerStartMicros === null ? null : microsToSeconds(pointerStartMicros),
        pressAt: pressMicros === null ? null : microsToSeconds(pressMicros),
        rippleAt: rippleMicros === null ? null : microsToSeconds(rippleMicros),
        responseAt: responseMicros === null ? null : microsToSeconds(responseMicros),
        tapAt: pressMicros === null ? null : microsToSeconds(pressMicros),
        targetAt: hasTarget ? microsToSeconds(endMicros) : null,
      },
      transition: {
        ...scene.transition,
        start: transitionStartMicros === null ? null : microsToSeconds(transitionStartMicros),
        end: hasTarget ? microsToSeconds(endMicros) : null,
      },
    };
  });
  return {
    durationSeconds: microsToSeconds(durationMicros),
    timings,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}

function mp3DurationSeconds(buffer) {
  let offset = 0;
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    const tagSize = ((buffer[6] & 0x7f) << 21)
      | ((buffer[7] & 0x7f) << 14)
      | ((buffer[8] & 0x7f) << 7)
      | (buffer[9] & 0x7f);
    offset = Math.min(buffer.length, 10 + tagSize + ((buffer[5] & 0x10) ? 10 : 0));
  }

  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRates = [44_100, 48_000, 32_000];
  let duration = 0;
  let frameCount = 0;

  while (offset + 4 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    if (first !== 0xff || (second & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const versionBits = (second >> 3) & 0x03;
    const layerBits = (second >> 1) & 0x03;
    const third = buffer[offset + 2];
    const bitrateIndex = (third >> 4) & 0x0f;
    const sampleRateIndex = (third >> 2) & 0x03;
    if (
      versionBits === 1
      || layerBits !== 1
      || bitrateIndex === 0
      || bitrateIndex === 15
      || sampleRateIndex === 3
    ) {
      offset += 1;
      continue;
    }

    const mpeg1 = versionBits === 3;
    const bitrate = (mpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex];
    const sampleRateDivisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
    const sampleRate = sampleRates[sampleRateIndex] / sampleRateDivisor;
    const padding = (third >> 1) & 0x01;
    const frameLength = Math.floor((mpeg1 ? 144_000 : 72_000) * bitrate / sampleRate) + padding;
    if (!Number.isFinite(frameLength) || frameLength < 4 || offset + frameLength > buffer.length) {
      offset += 1;
      continue;
    }
    duration += (mpeg1 ? 1152 : 576) / sampleRate;
    frameCount += 1;
    offset += frameLength;
  }

  if (frameCount === 0 || duration <= 0) {
    fail('daemon TTS returned audio whose MP3 duration could not be determined');
  }
  return Number(duration.toFixed(6));
}

function renderPreloads(assetNames) {
  return assetNames
    .map((assetName) => `    <link rel="preload" as="image" href="assets/${escapeHtml(assetName)}" />`)
    .join('\n');
}

function renderAssetCatalog(assetNames) {
  if (assetNames.length <= 2) return '';
  return [
    '      <div class="tutorial__asset-catalog" aria-hidden="true">',
    ...assetNames.slice(2).map((assetName) => (
      `        <img src="assets/${escapeHtml(assetName)}" alt="" />`
    )),
    '      </div>',
  ].join('\n');
}

function buildManifest(
  storyboard,
  assetNames,
  backgroundAssetName,
  timings,
  durationSeconds,
  audio,
) {
  return {
    version: storyboard.version,
    title: storyboard.title,
    durationSeconds,
    backgroundAsset: backgroundAssetName ? `assets/${backgroundAssetName}` : null,
    subtitles: storyboard.subtitles,
    audio,
    scenes: storyboard.scenes.map((scene, index) => ({
      id: scene.id,
      asset: `assets/${assetNames[index]}`,
      caption: scene.captionEnabled ? scene.caption : null,
      focusTargets: scene.focusTargets ?? [],
      interaction: scene.interaction ?? null,
      presentation: scene.presentation ?? 'full',
      voiceoverEnabled: scene.voiceoverEnabled,
      start: timings[index].start,
      duration: timings[index].duration,
      keyframes: timings[index].keyframes,
      transition: timings[index].transition,
    })),
  };
}

function fillScaffold(template, values) {
  let output = template;
  for (const [token, value] of Object.entries(values)) {
    output = output.replaceAll(`__${token}__`, String(value));
  }
  const unresolved = output.match(/__[A-Z][A-Z0-9_]*__/g);
  if (unresolved) fail(`scaffold has unresolved token(s): ${[...new Set(unresolved)].join(', ')}`);
  return output;
}

function parseLastJsonLine(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Progress output may precede the final JSON line.
    }
  }
  return null;
}

async function runOdCommand(projectDir, args) {
  const nodeBin = cleanString(process.env.OD_NODE_BIN, 'OD_NODE_BIN');
  const odBin = cleanString(process.env.OD_BIN, 'OD_BIN');
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [odBin, ...args], {
      cwd: projectDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

function mediaFailure(result, payload) {
  const payloadMessage = payload?.error?.message || payload?.error || '';
  const stderr = result.stderr.trim().split(/\r?\n/).slice(-8).join('\n');
  return cleanString(
    String(payloadMessage || stderr || `media command exited ${result.code}`),
    'media failure',
  );
}

async function runMediaToCompletion(projectDir, generateArgs) {
  const projectId = cleanString(process.env.OD_PROJECT_ID, 'OD_PROJECT_ID');
  let result = await runOdCommand(projectDir, [
    'media',
    'generate',
    '--project',
    projectId,
    ...generateArgs,
  ]);
  let payload = parseLastJsonLine(result.stdout);
  if (
    (result.code !== 0 && result.code !== 2)
    || payload?.status === 'failed'
    || payload?.status === 'interrupted'
  ) {
    fail(mediaFailure(result, payload));
  }
  if (payload?.file) {
    if (payload.file.providerError || payload.file.usedStubFallback || payload.file.intentionalStub) {
      fail(payload.file.providerError || 'daemon returned a placeholder instead of real media');
    }
    return payload.file;
  }

  const taskId = cleanString(payload?.taskId, 'media task id');
  let since = Number.isFinite(Number(payload?.nextSince)) ? Number(payload.nextSince) : 0;
  const deadline = Date.now() + MEDIA_WAIT_BUDGET_MS;
  while (Date.now() < deadline) {
    result = await runOdCommand(projectDir, [
      'media',
      'wait',
      taskId,
      '--since',
      String(since),
    ]);
    payload = parseLastJsonLine(result.stdout);
    if (payload?.file) {
      if (payload.file.providerError || payload.file.usedStubFallback || payload.file.intentionalStub) {
        fail(payload.file.providerError || 'daemon returned a placeholder instead of real media');
      }
      return payload.file;
    }
    if (payload?.status === 'failed' || payload?.status === 'interrupted') {
      fail(mediaFailure(result, payload));
    }
    if (result.code !== 0 && result.code !== 2) {
      fail(mediaFailure(result, payload));
    }
    if (Number.isFinite(Number(payload?.nextSince))) since = Number(payload.nextSince);
  }
  fail(`media task ${taskId} did not finish within ${MEDIA_WAIT_BUDGET_MS / 1000}s`);
}

async function build() {
  const {
    allowSilentFallback,
    storyboard: storyboardPathArg,
  } = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(cleanString(process.env.OD_PROJECT_DIR, 'OD_PROJECT_DIR'));
  const storyboardPath = resolveInside(projectDir, storyboardPathArg, '--storyboard');
  const realStoryboardPath = await realFileInside(projectDir, storyboardPath, '--storyboard');
  const storyboard = normalizeStoryboard(JSON.parse(await readFile(realStoryboardPath, 'utf8')));
  const compositionDir = path.join(projectDir, COMPOSITION_RELATIVE_DIR);
  const assetsDir = path.join(compositionDir, 'assets');
  await ensureSafeOutputDirectory(projectDir, compositionDir, 'composition output directory');
  await ensureSafeOutputDirectory(projectDir, assetsDir, 'composition assets directory');

  const [screenshots, background] = await Promise.all([
    resolveScreenshotPaths(projectDir, storyboard),
    storyboard.backgroundRef
      ? resolveInputAsset(projectDir, storyboard.backgroundRef, 'storyboard.backgroundRef')
      : null,
  ]);
  const assetNames = screenshots.map((screenshot, index) => {
    const extension = path.extname(screenshot).toLowerCase();
    return `scene-${String(index + 1).padStart(2, '0')}${extension}`;
  });
  const backgroundAssetName = background
    ? `tutorial-background${path.extname(background).toLowerCase()}`
    : null;
  const metadataOutputs = ['index.html', 'hyperframes.json', 'meta.json']
    .map((name) => path.join(compositionDir, name));
  const handOutput = path.join(assetsDir, HAND_ASSET_NAME);
  await Promise.all([
    ...assetNames.map((assetName) => assertSafeOutputFile(
      projectDir,
      path.join(assetsDir, assetName),
      `composition asset ${assetName}`,
    )),
    ...metadataOutputs.map((output) => assertSafeOutputFile(
      projectDir,
      output,
      `composition metadata ${path.basename(output)}`,
    )),
    ...(backgroundAssetName ? [assertSafeOutputFile(
      projectDir,
      path.join(assetsDir, backgroundAssetName),
      'tutorial background asset',
    )] : []),
    assertSafeOutputFile(projectDir, handOutput, 'tutorial hand asset'),
  ]);
  for (let index = 0; index < screenshots.length; index += 1) {
    const assetName = assetNames[index];
    await writeSafeOutputFile(
      projectDir,
      path.join(assetsDir, assetName),
      await readFile(screenshots[index]),
      `composition asset ${assetName}`,
    );
  }
  if (background && backgroundAssetName) {
    await writeSafeOutputFile(
      projectDir,
      path.join(assetsDir, backgroundAssetName),
      await readFile(background),
      'tutorial background asset',
    );
  }
  const handSource = fileURLToPath(new URL(`../assets/${HAND_ASSET_NAME}`, import.meta.url));
  const handSourceStat = await stat(handSource).catch(() => null);
  if (!handSourceStat?.isFile()) fail(`tutorial hand asset not found: ${handSource}`);
  await writeSafeOutputFile(
    projectDir,
    handOutput,
    await readFile(handSource),
    'tutorial hand asset',
  );

  const narrationDir = path.join(compositionDir, 'narration');
  let audioClips = [];
  const warnings = [];
  if (storyboard.narration) {
    await ensureSafeOutputDirectory(projectDir, narrationDir, 'composition narration directory');
    const narratedScenes = storyboard.scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => scene.voiceoverEnabled && scene.voiceover);
    await Promise.all(narratedScenes.flatMap(({ index }) => {
      const number = String(index + 1).padStart(2, '0');
      return [
        assertSafeOutputFile(
          projectDir,
          path.join(narrationDir, `scene-${number}.txt`),
          `scene ${index + 1} narration prompt`,
        ),
        assertSafeOutputFile(
          projectDir,
          path.join(narrationDir, `scene-${number}.mp3`),
          `scene ${index + 1} narration audio`,
        ),
      ];
    }));
    audioClips = await mapWithConcurrency(
      narratedScenes,
      TTS_CONCURRENCY,
      async ({ scene, index }) => {
        const number = String(index + 1).padStart(2, '0');
        const narrationName = `scene-${number}.txt`;
        const narrationRelativePath = `${COMPOSITION_RELATIVE_DIR}/narration/${narrationName}`;
        await writeSafeOutputFile(
          projectDir,
          path.join(narrationDir, narrationName),
          `${scene.voiceover}\n`,
          `scene ${index + 1} narration prompt`,
        );
        const generatedOutputName = `loan-video-fast-narration-scene-${number}.mp3`;
        await unlink(path.join(projectDir, generatedOutputName)).catch(() => {});
        const generatedAudioPath = path.join(projectDir, generatedOutputName);
        let file;
        try {
          file = await runMediaToCompletion(projectDir, [
            '--surface',
            'audio',
            '--audio-kind',
            'speech',
            '--model',
            'tts-1',
            '--prompt-file',
            narrationRelativePath,
            '--voice',
            'alloy',
            '--output',
            generatedOutputName,
          ]);
        } catch (error) {
          if (!allowSilentFallback) throw error;
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(
            `Scene ${index + 1} narration unavailable; rendered captions only: ${message}`,
          );
          await unlink(generatedAudioPath).catch(() => {});
          return null;
        }
        const resolvedGeneratedAudioPath = resolveInside(
          projectDir,
          cleanString(file.name, 'generated audio filename'),
          'generated audio',
        );
        const realGeneratedAudioPath = await realFileInside(
          projectDir,
          resolvedGeneratedAudioPath,
          'generated audio',
        );
        const source = `narration/scene-${number}.mp3`;
        const audioTarget = path.join(compositionDir, source);
        await writeSafeOutputFile(
          projectDir,
          audioTarget,
          await readFile(realGeneratedAudioPath),
          `scene ${index + 1} narration audio`,
        );
        await unlink(resolvedGeneratedAudioPath);
        const audioStat = await stat(audioTarget);
        if (audioStat.size === 0) fail(`daemon TTS returned an empty file for scene ${index + 1}`);
        return {
          durationSeconds: mp3DurationSeconds(await readFile(audioTarget)),
          sceneIndex: index + 1,
          source,
        };
      },
    ).then((clips) => clips.filter(Boolean));
  }

  const scaffoldPath = fileURLToPath(new URL('../assets/loan-video-scaffold.html', import.meta.url));
  const template = await readFile(scaffoldPath, 'utf8');
  const brand = brandTokens(storyboard.product);
  const initialCurrentAsset = `assets/${assetNames[0]}`;
  const initialTargetAsset = `assets/${assetNames[1] ?? assetNames[0]}`;
  const initialBackgroundAsset = backgroundAssetName
    ? `assets/${backgroundAssetName}`
    : initialCurrentAsset;
  const timeline = renderTimings(storyboard, storyboard.durationSeconds, audioClips);
  const durationSeconds = timeline.durationSeconds;
  const timings = timeline.timings;
  audioClips = audioClips.map((clip) => ({
    durationSeconds: clip.durationSeconds,
    sceneIndex: clip.sceneIndex,
    src: clip.source,
    start: timings[clip.sceneIndex - 1].start,
  }));
  const audio = audioClips.length === 0
    ? null
    : {
        clips: audioClips,
        durationSeconds: Number(
          audioClips.reduce((sum, clip) => sum + clip.durationSeconds, 0).toFixed(6),
        ),
        sceneIndexes: audioClips.map((clip) => clip.sceneIndex),
      };
  const audioMarkup = audioClips.map((clip) => [
    '      <audio',
    `        id="narration-scene-${String(clip.sceneIndex).padStart(2, '0')}"`,
    `        src="${escapeHtml(clip.src)}"`,
    `        data-start="${clip.start}"`,
    `        data-duration="${clip.durationSeconds}"`,
    '        data-track-index="2"',
    '        data-volume="1"',
    '      ></audio>',
  ].join('\n')).join('\n');
  const manifest = buildManifest(
    storyboard,
    assetNames,
    backgroundAssetName,
    timings,
    durationSeconds,
    audio,
  );
  const html = fillScaffold(template, {
    ACCENT: brand.accent,
    ACCENT_SOFT: brand.accentSoft,
    ASSET_CATALOG: renderAssetCatalog(assetNames),
    AUDIO: audioMarkup,
    DURATION: durationSeconds,
    HEIGHT: storyboard.aspect.height,
    HAND_ASSET: `assets/${HAND_ASSET_NAME}`,
    INITIAL_BACKGROUND: escapeHtml(initialBackgroundAsset),
    INITIAL_CURRENT: escapeHtml(initialCurrentAsset),
    INITIAL_TARGET: escapeHtml(initialTargetAsset),
    LANG: escapeHtml(storyboard.language),
    LAYOUT: storyboard.aspect.layout,
    MANIFEST: safeJsonForHtml(manifest),
    PRELOADS: renderPreloads([
      ...assetNames,
      ...(backgroundAssetName ? [backgroundAssetName] : []),
    ]),
    SUBTITLE: storyboard.subtitles
      ? [
          '      <div class="tutorial__subtitle" data-loan-video-subtitle>',
          '        <span class="tutorial__subtitle-step" data-loan-video-subtitle-step></span>',
          '        <strong class="tutorial__subtitle-title" data-loan-video-subtitle-title></strong>',
          '        <span class="tutorial__subtitle-body" data-loan-video-subtitle-body></span>',
          '      </div>',
        ].join('\n')
      : '',
    WIDTH: storyboard.aspect.width,
  });
  await writeSafeOutputFile(
    projectDir,
    path.join(compositionDir, 'index.html'),
    html,
    'composition index.html',
  );
  await writeSafeOutputFile(
    projectDir,
    path.join(compositionDir, 'hyperframes.json'),
    `${JSON.stringify({
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      media: { autoProxy: true },
    }, null, 2)}\n`,
    'composition hyperframes.json',
  );
  await writeSafeOutputFile(
    projectDir,
    path.join(compositionDir, 'meta.json'),
    `${JSON.stringify({
      id: 'loan-video-fast',
      name: `${brand.label} tutorial`,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'composition meta.json',
  );

  process.stdout.write(`${JSON.stringify({
    compositionDir: COMPOSITION_RELATIVE_DIR,
    durationSeconds,
    narration: audioClips.length > 0,
    scenes: storyboard.scenes.length,
    size: `${storyboard.aspect.width}x${storyboard.aspect.height}`,
    version: storyboard.version,
    warnings,
  })}\n`);
}

build().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`loan-video fast path failed: ${message}\n`);
  process.exitCode = 1;
});
