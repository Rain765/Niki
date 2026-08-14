#!/usr/bin/env node

// Compatibility entrypoint: this file is intentionally plain ESM so the
// daemon's bundled Node runtime can execute the staged skill without tsx,
// npx, a package install, or any network-loaded build tooling.

import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMPOSITION_RELATIVE_DIR = '.hyperframes-cache/loan-video-fast';
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const SUPPORTED_ASPECTS = {
  '1:1': { width: 1080, height: 1080, layout: 'square' },
  '16:9': { width: 1920, height: 1080, layout: 'landscape' },
  '9:16': { width: 1080, height: 1920, layout: 'portrait' },
  '4:3': { width: 1440, height: 1080, layout: 'landscape' },
  '3:4': { width: 1080, height: 1440, layout: 'portrait' },
};
const TTS_OUTPUT_NAME = 'loan-video-fast-narration.mp3';
const MEDIA_WAIT_BUDGET_MS = 6 * 60 * 1000;

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

function parseArgs(argv) {
  let storyboard = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--storyboard') {
      storyboard = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: "$OD_NODE_BIN" build-loan-video.mjs --storyboard <project-relative-json>\n',
      );
      process.exit(0);
    }
    fail(`unsupported argument: ${arg}`);
  }
  return { storyboard: cleanString(storyboard, '--storyboard') };
}

function normalizeStoryboard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('storyboard must be a JSON object');
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
    const caption = cleanString(scene.caption, `storyboard.scenes[${index}].caption`);
    const voiceover = typeof scene.voiceover === 'string' && scene.voiceover.trim()
      ? scene.voiceover.trim()
      : caption;
    const action = scene.action && typeof scene.action === 'object' && !Array.isArray(scene.action)
      ? scene.action
      : { type: 'none' };
    const tap = action.type === 'tap'
      ? {
          x: clamp(finiteNumber(action.x, `storyboard.scenes[${index}].action.x`), 0, 1),
          y: clamp(finiteNumber(action.y, `storyboard.scenes[${index}].action.y`), 0, 1),
        }
      : null;
    return {
      caption,
      voiceover,
      tap,
    };
  });

  return {
    title,
    product,
    language,
    aspectRatio,
    aspect,
    durationSeconds,
    narration: raw.narration === true,
    scenes,
  };
}

async function discoverScreenshotPaths(projectDir, expectedCount) {
  const inputDir = path.join(projectDir, '.od-inputs');
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
  return files.map((name) => path.join(inputDir, name));
}

function brandTokens(product) {
  if (product === 'biumoney') {
    return { label: 'BiuMoney', accent: '#7c8cff', accentSoft: 'rgba(124, 140, 255, 0.34)' };
  }
  return { label: 'ZamLoan', accent: '#ff6a2a', accentSoft: 'rgba(255, 106, 42, 0.34)' };
}

function renderSceneMarkup(storyboard, assetNames) {
  const brand = brandTokens(storyboard.product);
  const sceneDuration = storyboard.durationSeconds / storyboard.scenes.length;
  return storyboard.scenes.map((scene, index) => {
    const start = index * sceneDuration;
    const tap = scene.tap
      ? `\n            <span class="scene__tap" style="--tap-x: ${(scene.tap.x * 100).toFixed(3)}%; --tap-y: ${(scene.tap.y * 100).toFixed(3)}%"></span>`
      : '';
    return [
      `      <section id="scene-${index + 1}" class="scene" data-start="${start.toFixed(6)}" data-duration="${sceneDuration.toFixed(6)}" data-track-index="0">`,
      '        <header class="scene__header">',
      `          <span class="scene__brand">${escapeHtml(brand.label)}</span>`,
      `          <span class="scene__counter">${String(index + 1).padStart(2, '0')} / ${String(storyboard.scenes.length).padStart(2, '0')}</span>`,
      '        </header>',
      '        <div class="scene__content">',
      '          <div class="scene__shot">',
      `            <img src="assets/${escapeHtml(assetNames[index])}" alt="" />${tap}`,
      '          </div>',
      '          <div class="scene__copy">',
      `            <p class="scene__eyebrow">${escapeHtml(storyboard.title)}</p>`,
      `            <h1 class="scene__caption">${escapeHtml(scene.caption)}</h1>`,
      '          </div>',
      '        </div>',
      '      </section>',
    ].join('\n');
  }).join('\n');
}

function renderTimings(storyboard) {
  const sceneDuration = storyboard.durationSeconds / storyboard.scenes.length;
  return storyboard.scenes.map((_, index) => ({
    id: `scene-${index + 1}`,
    start: Number((index * sceneDuration).toFixed(6)),
    duration: Number(sceneDuration.toFixed(6)),
  }));
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
  const { storyboard: storyboardPathArg } = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(cleanString(process.env.OD_PROJECT_DIR, 'OD_PROJECT_DIR'));
  const storyboardPath = resolveInside(projectDir, storyboardPathArg, '--storyboard');
  const storyboard = normalizeStoryboard(JSON.parse(await readFile(storyboardPath, 'utf8')));
  const compositionDir = path.join(projectDir, COMPOSITION_RELATIVE_DIR);
  const assetsDir = path.join(compositionDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const screenshots = await discoverScreenshotPaths(projectDir, storyboard.scenes.length);
  const assetNames = [];
  for (let index = 0; index < screenshots.length; index += 1) {
    const extension = path.extname(screenshots[index]).toLowerCase();
    const assetName = `scene-${String(index + 1).padStart(2, '0')}${extension}`;
    await copyFile(screenshots[index], path.join(assetsDir, assetName));
    assetNames.push(assetName);
  }

  let audioMarkup = '';
  if (storyboard.narration) {
    const narrationRelativePath = `${COMPOSITION_RELATIVE_DIR}/narration.txt`;
    const narrationPath = path.join(compositionDir, 'narration.txt');
    const narration = storyboard.scenes.map((scene) => scene.voiceover).join('\n\n');
    await writeFile(narrationPath, `${narration}\n`, 'utf8');
    const file = await runMediaToCompletion(projectDir, [
      '--surface',
      'audio',
      '--audio-kind',
      'speech',
      '--model',
      'gpt-4o-mini-tts',
      '--prompt-file',
      narrationRelativePath,
      '--voice',
      'Warm, clear mobile tutorial narration. Speak at a measured pace and pause briefly between paragraphs.',
      '--output',
      TTS_OUTPUT_NAME,
    ]);
    const generatedAudio = resolveInside(projectDir, cleanString(file.name, 'generated audio filename'), 'generated audio');
    const audioTarget = path.join(compositionDir, 'narration.mp3');
    await unlink(audioTarget).catch(() => {});
    await rename(generatedAudio, audioTarget);
    const audioStat = await stat(audioTarget);
    if (audioStat.size === 0) fail('daemon TTS returned an empty narration file');
    audioMarkup = [
      '      <audio',
      '        id="narration"',
      '        src="narration.mp3"',
      '        data-start="0"',
      `        data-duration="${storyboard.durationSeconds}"`,
      '        data-track-index="2"',
      '        data-volume="1"',
      '      ></audio>',
    ].join('\n');
  }

  const scaffoldPath = fileURLToPath(new URL('../assets/loan-video-scaffold.html', import.meta.url));
  const template = await readFile(scaffoldPath, 'utf8');
  const brand = brandTokens(storyboard.product);
  const html = fillScaffold(template, {
    ACCENT: brand.accent,
    ACCENT_SOFT: brand.accentSoft,
    AUDIO: audioMarkup,
    DURATION: storyboard.durationSeconds,
    HEIGHT: storyboard.aspect.height,
    LANG: escapeHtml(storyboard.language),
    LAYOUT: storyboard.aspect.layout,
    SCENES: renderSceneMarkup(storyboard, assetNames),
    TIMINGS: safeJsonForHtml(renderTimings(storyboard)),
    WIDTH: storyboard.aspect.width,
  });
  await writeFile(path.join(compositionDir, 'index.html'), html, 'utf8');
  await writeFile(
    path.join(compositionDir, 'hyperframes.json'),
    `${JSON.stringify({
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      media: { autoProxy: true },
    }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(compositionDir, 'meta.json'),
    `${JSON.stringify({
      id: 'loan-video-fast',
      name: `${brand.label} tutorial`,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  );

  process.stdout.write(`${JSON.stringify({
    compositionDir: COMPOSITION_RELATIVE_DIR,
    durationSeconds: storyboard.durationSeconds,
    narration: storyboard.narration,
    scenes: storyboard.scenes.length,
    size: `${storyboard.aspect.width}x${storyboard.aspect.height}`,
  })}\n`);
}

build().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`loan-video fast path failed: ${message}\n`);
  process.exitCode = 1;
});
