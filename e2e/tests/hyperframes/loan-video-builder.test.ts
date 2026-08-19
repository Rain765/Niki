import { execFile } from 'node:child_process';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const BUILDER = path.join(
  REPO_ROOT,
  'design-templates/hyperframes/scripts/build-loan-video.mjs',
);
const STORYBOARD_RELATIVE_PATH = '.hyperframes-cache/loan-video-fast/storyboard.json';
const HYPERFRAMES_CLI = path.join(
  REPO_ROOT,
  'apps/daemon/node_modules/hyperframes/bin/hyperframes.mjs',
);
const FFMPEG_BIN = path.join(REPO_ROOT, 'apps/daemon/node_modules/ffmpeg-static/ffmpeg');
const FFPROBE_BIN = path.join(
  REPO_ROOT,
  'apps/daemon/node_modules/@derhuerst/ffprobe-static/ffprobe',
);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function createProjectFixture(options: {
  aspectRatio: string;
  durationSeconds?: number;
  narration: boolean;
  sceneCount?: number;
  subtitles?: boolean;
  version?: 1 | 2;
  voiceoverEnabled?: boolean[];
  imageSizes?: Array<{ height: number; width: number }>;
}) {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-builder-'));
  temporaryDirectories.push(projectDir);
  const sceneCount = options.sceneCount ?? 2;
  const version = options.version ?? 1;
  const uploadNames = Array.from({ length: sceneCount }, (_, index) => (
    version === 2
      ? `1700000000000-${String.fromCharCode(122 - index)}-upload.png`
      : `${1700000000000 + index}-scene-${index + 1}.png`
  ));
  await mkdir(path.join(projectDir, '.od-inputs'), { recursive: true });
  await mkdir(path.dirname(path.join(projectDir, STORYBOARD_RELATIVE_PATH)), { recursive: true });
  for (let index = 0; index < sceneCount; index += 1) {
    const size = options.imageSizes?.[index] ?? { width: 48, height: 64 };
    const png = new PNG(size);
    const colors = [
      [224, 72, 72],
      [62, 126, 232],
      [55, 176, 112],
    ] as const;
    const color = colors[index % colors.length]!;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const offset = (y * png.width + x) * 4;
        const highlight = x >= 12 && x < 36 && y >= 44 && y < 54;
        png.data[offset] = highlight ? 248 : color[0];
        png.data[offset + 1] = highlight ? 248 : color[1];
        png.data[offset + 2] = highlight ? 248 : color[2];
        png.data[offset + 3] = 255;
      }
    }
    await writeFile(
      path.join(projectDir, '.od-inputs', uploadNames[index]!),
      PNG.sync.write(png),
    );
  }
  await writeFile(
    path.join(projectDir, STORYBOARD_RELATIVE_PATH),
    JSON.stringify({
      version,
      title: 'How to apply',
      product: 'zamloan',
      language: 'en',
      aspectRatio: options.aspectRatio,
      durationSeconds: options.durationSeconds ?? 30,
      narration: options.narration,
      subtitles: options.subtitles,
      scenes: Array.from({ length: sceneCount }, (_, index) => version === 1
        ? {
            index: index + 1,
            screenshotAttachmentIndex: index + 1,
            screenshotOriginalName: `scene-${index + 1}.png`,
            caption: `Step ${index + 1}`,
            voiceover: `Voiceover ${index + 1}.`,
            action: index === 0
              ? { type: 'tap', x: 0.25, y: 0.75 }
              : { type: 'none' },
          }
        : {
            id: `step-${index + 1}`,
            index: index + 1,
            screenshotAttachmentIndex: index + 1,
            screenshotOriginalName: `scene-${index + 1}.png`,
            assetRef: `.od-inputs/${uploadNames[index]}`,
            text: `Voiceover ${index + 1}.`,
            captionEnabled: options.subtitles !== false,
            voiceoverEnabled: options.voiceoverEnabled?.[index] ?? true,
            terminal: index === sceneCount - 1,
          }),
      ...(version === 2
        ? {
            transitions: Array.from({ length: Math.max(0, sceneCount - 1) }, (_, index) => ({
              fromSceneId: `step-${index + 1}`,
              toSceneId: `step-${index + 2}`,
              action: index === 0
                ? { type: 'tap', x: 0.25, y: 0.75 }
                : { type: 'auto' },
            })),
          }
        : {}),
    }),
    'utf8',
  );
  return projectDir;
}

type LoanVideoManifest = {
  audio: null | {
    clips: Array<{
      durationSeconds: number;
      sceneIndex: number;
      src: string;
      start: number;
    }>;
    durationSeconds: number;
    sceneIndexes: number[];
  };
  backgroundAsset?: string | null;
  durationSeconds: number;
  scenes: Array<{
    asset: string;
    caption: string | null;
    duration: number;
    interaction?: {
      duration: number;
      start: number;
      target: {
        height: number;
        width: number;
        x: number;
        y: number;
      };
      text: string;
      type: 'keypad' | 'otp' | 'type';
    } | null;
    focusTargets?: Array<{
      height: number;
      width: number;
      x: number;
      y: number;
    }>;
    keyframes: {
      currentAt: number;
      pointerStartAt: number | null;
      pressAt: number | null;
      responseAt: number | null;
      rippleAt: number | null;
      tapAt: number | null;
      targetAt: number | null;
    };
    transition: {
      end: number | null;
      start: number | null;
      targetSceneIndex: number | null;
      type: 'auto' | 'close-modal' | 'none' | 'open-modal' | 'tap';
      clipTop?: number;
      height?: number;
      width?: number;
      x?: number;
      y?: number;
    };
    presentation?: 'device' | 'full';
    start: number;
  }>;
  subtitles: boolean;
  version: number;
};

function readManifest(html: string): LoanVideoManifest {
  const match = html.match(
    /<script id="loan-video-manifest" type="application\/json">([\s\S]*?)<\/script>/,
  );
  expect(match?.[1]).toBeTruthy();
  return JSON.parse(match![1]!) as LoanVideoManifest;
}

async function runBuilder(
  projectDir: string,
  odBin = path.join(projectDir, 'unused-od.mjs'),
  storyboardRelativePath = STORYBOARD_RELATIVE_PATH,
  allowSilentFallback = false,
) {
  return execFileAsync(process.execPath, [
    BUILDER,
    '--storyboard',
    storyboardRelativePath,
    ...(allowSilentFallback ? ['--allow-silent-fallback'] : []),
  ], {
    cwd: projectDir,
    env: {
      ...process.env,
      OD_BIN: odBin,
      OD_NODE_BIN: process.execPath,
      OD_PROJECT_DIR: projectDir,
      OD_PROJECT_ID: 'loan-video-project',
    },
    timeout: 15_000,
  });
}

async function builderOutcome(operation: Promise<unknown>) {
  try {
    await operation;
    return 'resolved' as const;
  } catch {
    return 'rejected' as const;
  }
}

describe('loan-video fixed HyperFrames builder', () => {
  it.each([
    ['1:1', 1080, 1080, 'square'],
    ['16:9', 1920, 1080, 'landscape'],
    ['9:16', 1080, 1920, 'portrait'],
    ['4:3', 1440, 1080, 'landscape'],
    ['3:4', 1080, 1440, 'portrait'],
  ])('builds the %s composition from uploaded screenshots', async (
    aspectRatio,
    width,
    height,
    layout,
  ) => {
    const projectDir = await createProjectFixture({ aspectRatio, narration: false });

    const { stdout } = await runBuilder(projectDir);
    const result = JSON.parse(stdout.trim()) as { size: string; scenes: number };
    const html = await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/index.html'),
      'utf8',
    );
    const manifest = readManifest(html);
    const copiedPng = PNG.sync.read(await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/assets/scene-01.png'),
    ));

    expect(result).toMatchObject({ size: `${width}x${height}`, scenes: 2 });
    expect(copiedPng).toMatchObject({ width: 48, height: 64 });
    expect(html).toContain(`data-width="${width}"`);
    expect(html).toContain(`data-height="${height}"`);
    expect(html).toContain(`class="layout-${layout}"`);
    expect(html).toContain('assets/scene-01.png');
    expect(html).toContain('assets/scene-02.png');
    expect(manifest).toMatchObject({ version: 1, subtitles: true });
    expect(manifest.scenes[0]).toMatchObject({
      asset: 'assets/scene-01.png',
      transition: {
        type: 'tap',
        targetSceneIndex: 2,
        x: 0.25,
        y: 0.75,
      },
    });
    expect(html.match(/<div class="tutorial__subtitle" data-loan-video-subtitle>/g))
      .toHaveLength(1);
    expect(html).not.toContain('<audio');
    expect(html).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
  });

  it('builds v2 current, tap, and target keyframes over a persistent background', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      sceneCount: 3,
      version: 2,
    });

    await runBuilder(projectDir);
    const html = await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/index.html'),
      'utf8',
    );
    const manifest = readManifest(html);
    const hand = PNG.sync.read(await readFile(
      path.join(
        projectDir,
        '.hyperframes-cache/loan-video-fast/assets/tutorial-dark-hand.png',
      ),
    ));

    expect(manifest.version).toBe(2);
    expect(manifest.scenes.map((scene) => scene.transition.type))
      .toEqual(['tap', 'auto', 'none']);
    expect(manifest.scenes[0]?.transition).toMatchObject({
      targetSceneIndex: 2,
      type: 'tap',
      x: 0.25,
      y: 0.75,
    });
    expect(manifest.scenes[1]?.transition).toMatchObject({
      targetSceneIndex: 3,
      type: 'auto',
    });
    expect(manifest.scenes[2]?.transition).toMatchObject({
      end: null,
      start: null,
      targetSceneIndex: null,
      type: 'none',
    });
    expect(manifest.scenes[0]!.keyframes.currentAt)
      .toBeLessThan(manifest.scenes[0]!.keyframes.tapAt!);
    expect(manifest.scenes[0]!.keyframes.tapAt!)
      .toBeLessThan(manifest.scenes[0]!.transition.start!);
    expect(manifest.scenes[0]!.transition.start!)
      .toBeLessThan(manifest.scenes[0]!.keyframes.targetAt!);
    expect(manifest.scenes[0]!.keyframes.currentAt).toBeGreaterThan(manifest.scenes[0]!.start);
    expect(manifest.scenes[0]!.keyframes.targetAt).toBe(manifest.scenes[1]!.start);
    const tapKeyframes = manifest.scenes[0]!.keyframes;
    expect(tapKeyframes.pressAt! - tapKeyframes.pointerStartAt!).toBeCloseTo(0.18, 5);
    expect(tapKeyframes.rippleAt! - tapKeyframes.pressAt!).toBeCloseTo(0.09, 5);
    expect(tapKeyframes.responseAt! - tapKeyframes.rippleAt!).toBeCloseTo(0.24, 5);
    expect(manifest.scenes[0]!.transition.start! - tapKeyframes.responseAt!)
      .toBeCloseTo(0.12, 5);
    expect(tapKeyframes.targetAt! - manifest.scenes[0]!.transition.start!)
      .toBeCloseTo(0.28, 5);
    expect(manifest.scenes[1]!.asset).toBe('assets/scene-02.png');
    expect(manifest.scenes[1]!.keyframes.tapAt).toBeNull();
    expect(manifest.scenes[1]!.keyframes.pointerStartAt).toBeNull();
    expect(manifest.scenes[1]!.transition.end! - manifest.scenes[1]!.transition.start!)
      .toBeCloseTo(0.28, 5);
    expect(manifest.scenes[1]!.transition.start! - manifest.scenes[1]!.keyframes.responseAt!)
      .toBeCloseTo(0.12, 5);
    expect(html.match(/<div class="tutorial-background" data-loan-video-background/g))
      .toHaveLength(1);
    expect(html).toContain('data-loan-video-current');
    expect(html).toContain('data-loan-video-target');
    expect(html).toContain('data-loan-video-tap');
    expect(html).toContain('data-loan-video-hand');
    expect(html).toContain('assets/tutorial-dark-hand.png');
    expect(html).toContain('const handWidthRatio = 0.56;');
    expect(hand).toMatchObject({ width: 1254, height: 1254 });
    expect(hand.data[3]).toBe(0);
    expect(html).not.toContain('<section id="scene-');
    expect(html).not.toContain('aspect-ratio: 3 / 4');
    expect(html).toContain('object-fit: contain');
    expect(html).not.toContain('tutorial__header');
    expect(html).not.toContain('tutorial__counter');
    expect(html).not.toContain('filter:');
    expect(html).not.toContain('PingFang SC');
    expect(html).not.toContain('Microsoft YaHei');
    expect(html).toMatch(
      /<div class="tutorial__camera">[\s\S]*data-loan-video-tap[\s\S]*?<\/div>/,
    );
  });

  it('keeps a supplied tutorial background fixed while full-frame and device scenes transition', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '3:4',
      narration: false,
      sceneCount: 3,
      version: 2,
    });
    const backgroundName = '1700000000000-tutorial-background.png';
    const background = new PNG({ width: 60, height: 80 });
    background.data.fill(28);
    await writeFile(
      path.join(projectDir, '.od-inputs', backgroundName),
      PNG.sync.write(background),
    );
    const storyboardPath = path.join(projectDir, STORYBOARD_RELATIVE_PATH);
    const storyboard = JSON.parse(await readFile(storyboardPath, 'utf8')) as {
      backgroundRef?: string;
      scenes: Array<Record<string, unknown>>;
      transitions: Array<{ action: Record<string, unknown> }>;
    };
    storyboard.backgroundRef = `.od-inputs/${backgroundName}`;
    storyboard.scenes[0]!.presentation = 'full';
    storyboard.scenes[1]!.presentation = 'device';
    storyboard.scenes[1]!.focusTargets = [
      { x: 0.31, y: 0.24, width: 0.42, height: 0.06 },
    ];
    storyboard.scenes[2]!.presentation = 'full';
    storyboard.transitions[1]!.action = {
      type: 'tap',
      x: 0.5,
      y: 0.91,
      width: 0.82,
      height: 0.055,
    };
    await writeFile(storyboardPath, JSON.stringify(storyboard), 'utf8');

    await runBuilder(projectDir);
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');
    const manifest = readManifest(html);
    const copiedBackground = PNG.sync.read(await readFile(
      path.join(compositionDir, 'assets/tutorial-background.png'),
    ));

    expect(copiedBackground).toMatchObject({ width: 60, height: 80 });
    expect(manifest.backgroundAsset).toBe('assets/tutorial-background.png');
    expect(manifest.scenes.map((scene) => scene.presentation))
      .toEqual(['full', 'device', 'full']);
    expect(manifest.scenes[1]?.focusTargets).toEqual([
      { x: 0.31, y: 0.24, width: 0.42, height: 0.06 },
    ]);
    expect(manifest.scenes[1]?.transition).toMatchObject({
      type: 'tap',
      width: 0.82,
      height: 0.055,
    });
    expect(html).toContain('data-loan-video-background-image');
    expect(html.match(/<img class="tutorial-background__image" data-loan-video-background-image/g))
      .toHaveLength(1);
    expect(html).toContain('data-loan-video-shell');
    expect(html).toContain('data-loan-video-field-layer');
    expect(html).toContain('tutorial__field-fill-image');
    expect(html).not.toContain('data-loan-video-focus-layer');
    expect(html).not.toContain('tutorial__focus-target');
    expect(html).not.toContain('data-loan-video-press');
    expect(html).toContain('const deviceContentClipTop = targetImageRect.top + targetImageRect.height * 0.106;');
    expect(html).toContain('const deviceContentInsetX = 0.046;');
    expect(html).toContain('targetAsset.style.clipPath = `inset(10.6% ${deviceContentInsetX * 100}%');
    expect(html).toContain('targetSlot.style.opacity = transitionProgress > 0 ? "1" : "0";');
    expect(html).toContain('targetAsset.style.transform = `translate(calc(-50% + ${offsetX.toFixed(2)}px), -50%)`;');
    expect(html).toContain('currentAsset.style.transform = `translate(calc(-50% - ${currentOffsetX.toFixed(2)}px), -50%)`;');
    expect(html).toContain('const renderFieldInputs = (scene, time, imageRect, options = {}) =>');
    expect(html).toContain('const targets = scene?.presentation === "device" && !scene.interaction');
    expect(html).toContain('fieldLayer.style.clipPath = targetSlot.style.clipPath;');
    expect(html).toContain('forceBlank: true');
    expect(html).toContain('camera.style.transform = "none";');
    expect(html).toContain('const fingertipX = handWidth * 0.145;');
    expect(html).toContain('hand.style.transformOrigin = "0 0";');
    expect(html).not.toContain('currentSlot.style.transform = `translateX(');
    expect(html).not.toContain('tutorial-background__image--target');
  });

  it('preserves typed fields and uses clipped modal transitions instead of whole-screen crossfades', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '3:4',
      narration: false,
      sceneCount: 4,
      version: 2,
    });
    const storyboardPath = path.join(projectDir, STORYBOARD_RELATIVE_PATH);
    const storyboard = JSON.parse(await readFile(storyboardPath, 'utf8')) as {
      scenes: Array<Record<string, unknown>>;
      transitions: Array<{ action: Record<string, unknown> }>;
    };
    storyboard.scenes[0]!.presentation = 'device';
    storyboard.scenes[0]!.interaction = {
      type: 'keypad',
      start: 0.42,
      duration: 3.42,
      text: '971234567',
      target: { x: 0.25, y: 0.268, width: 0.34, height: 0.052 },
    };
    storyboard.scenes[1]!.presentation = 'device';
    storyboard.scenes[1]!.interaction = {
      type: 'otp',
      start: 0.38,
      duration: 1.08,
      text: '2479',
      target: { x: 0.09, y: 0.27, width: 0.82, height: 0.074 },
    };
    storyboard.scenes[2]!.presentation = 'device';
    storyboard.scenes[3]!.presentation = 'device';
    storyboard.transitions[1]!.action = {
      type: 'open-modal',
      x: 0.88,
      y: 0.145,
      width: 0.2,
      height: 0.09,
      clipTop: 0.105,
    };
    storyboard.transitions[2]!.action = {
      type: 'close-modal',
      x: 0.92,
      y: 0.205,
      width: 0.1,
      height: 0.08,
      clipTop: 0.105,
    };
    await writeFile(storyboardPath, JSON.stringify(storyboard), 'utf8');

    await runBuilder(projectDir);
    const html = await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/index.html'),
      'utf8',
    );
    const manifest = readManifest(html);

    expect(manifest.scenes[0]?.interaction).toEqual({
      type: 'keypad',
      start: 0.42,
      duration: 3.42,
      text: '971234567',
      target: { x: 0.25, y: 0.268, width: 0.34, height: 0.052 },
    });
    expect(manifest.scenes[1]?.interaction?.type).toBe('otp');
    expect(manifest.scenes[2]?.transition).toMatchObject({
      type: 'close-modal',
      clipTop: 0.105,
    });
    expect(manifest.scenes[1]?.transition).toMatchObject({
      type: 'open-modal',
      clipTop: 0.105,
    });
    expect(html).toContain('data-loan-video-interaction-layer');
    expect(html).toContain('tutorial__typed-text');
    expect(html).toContain('tutorial__otp-box');
    expect(html).toContain('const keyboardTapPoint = (digit) =>');
    expect(html).toContain('const formatMobileNumber = (digits) =>');
    expect(html).toContain('interaction.type === "keypad"');
    expect(html).toContain('left: 71%;');
    expect(html).toContain('max-width: 56%;');
    expect(html).toContain('height: 82%;');
    expect(html).toContain('data-loan-video-subtitle-step');
    expect(html).toContain('data-loan-video-subtitle-title');
    expect(html).toContain('data-loan-video-subtitle-body');
    expect(html).toContain('"2": { x: 0.376, y: 0.742 }');
    expect(html).toContain('"4": { x: 0.132, y: 0.804 }');
    expect(html).toContain('"7": { x: 0.132, y: 0.869 }');
    expect(html).toContain('"9": { x: 0.622, y: 0.869 }');
    expect(html).toContain('const modalTransition = action.type === "open-modal"');
    expect(html).toContain('if (action.type === "open-modal")');
    expect(html).toContain('setSource(shellAsset, targetScene.asset);');
    expect(html).toContain('currentSlot.style.zIndex = "2";');
    expect(html).toContain('const movingClipTop = clipTop + offsetY;');
    expect(html).toContain('targetSlot.style.clipPath = `inset(${movingClipTop.toFixed(2)}px ${clipRight.toFixed(2)}px ${clipBottom.toFixed(2)}px ${targetImageRect.left.toFixed(2)}px)`;');
  });

  it('copies v2 screenshots by assetRef when upload timestamps and lexical order collide', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      sceneCount: 3,
      version: 2,
      imageSizes: [
        { width: 80, height: 40 },
        { width: 48, height: 64 },
        { width: 72, height: 48 },
      ],
    });

    await runBuilder(projectDir);
    const assetsDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast/assets');
    const first = PNG.sync.read(await readFile(path.join(assetsDir, 'scene-01.png')));
    const second = PNG.sync.read(await readFile(path.join(assetsDir, 'scene-02.png')));
    const third = PNG.sync.read(await readFile(path.join(assetsDir, 'scene-03.png')));

    expect([...first.data.subarray(0, 3)]).toEqual([224, 72, 72]);
    expect(first).toMatchObject({ width: 80, height: 40 });
    expect([...second.data.subarray(0, 3)]).toEqual([62, 126, 232]);
    expect(second).toMatchObject({ width: 48, height: 64 });
    expect([...third.data.subarray(0, 3)]).toEqual([55, 176, 112]);
    expect(third).toMatchObject({ width: 72, height: 48 });
  });

  it('rejects a v2 assetRef symlink that resolves outside the project', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const storyboard = JSON.parse(await readFile(
      path.join(projectDir, STORYBOARD_RELATIVE_PATH),
      'utf8',
    )) as { scenes: Array<{ assetRef: string }> };
    const assetPath = path.join(projectDir, storyboard.scenes[0]!.assetRef);
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-external-'));
    temporaryDirectories.push(externalDir);
    const externalAsset = path.join(externalDir, 'outside.png');
    await writeFile(externalAsset, await readFile(assetPath));
    await rm(assetPath);
    await symlink(externalAsset, assetPath);

    await expect(runBuilder(projectDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('resolves outside the project directory'),
    });
  });

  it('rejects a storyboard symlink that resolves outside the project', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const storyboardPath = path.join(projectDir, STORYBOARD_RELATIVE_PATH);
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-storyboard-'));
    temporaryDirectories.push(externalDir);
    const externalStoryboard = path.join(externalDir, 'storyboard.json');
    await writeFile(externalStoryboard, await readFile(storyboardPath));
    await rm(storyboardPath);
    await symlink(externalStoryboard, storyboardPath);

    await expect(runBuilder(projectDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('resolves outside the project directory'),
    });
  });

  it('does not follow a composition output directory symlink outside the project', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const rootStoryboard = path.join(projectDir, 'storyboard.json');
    await writeFile(
      rootStoryboard,
      await readFile(path.join(projectDir, STORYBOARD_RELATIVE_PATH)),
    );
    await rm(compositionDir, { recursive: true, force: true });
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-output-'));
    temporaryDirectories.push(externalDir);
    const externalIndex = path.join(externalDir, 'index.html');
    await writeFile(externalIndex, 'external composition sentinel', 'utf8');
    await symlink(externalDir, compositionDir, 'dir');

    const outcome = await builderOutcome(
      runBuilder(projectDir, path.join(projectDir, 'unused-od.mjs'), 'storyboard.json'),
    );

    expect({
      externalIndex: await readFile(externalIndex, 'utf8'),
      outcome,
    }).toEqual({
      externalIndex: 'external composition sentinel',
      outcome: 'rejected',
    });
  });

  it('does not follow a symlinked assets output directory', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const assetsDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast/assets');
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-assets-'));
    temporaryDirectories.push(externalDir);
    const externalScene = path.join(externalDir, 'scene-01.png');
    const sentinel = Buffer.from('external assets sentinel');
    await writeFile(externalScene, sentinel);
    await symlink(externalDir, assetsDir, 'dir');

    const outcome = await builderOutcome(runBuilder(projectDir));

    expect({
      externalScene: await readFile(externalScene),
      outcome,
    }).toEqual({
      externalScene: sentinel,
      outcome: 'rejected',
    });
  });

  it('does not follow a scene output file symlink', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const assetsDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast/assets');
    await mkdir(assetsDir, { recursive: true });
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-scene-'));
    temporaryDirectories.push(externalDir);
    const externalScene = path.join(externalDir, 'outside.png');
    const sentinel = Buffer.from('external scene sentinel');
    await writeFile(externalScene, sentinel);
    await symlink(externalScene, path.join(assetsDir, 'scene-01.png'));

    const outcome = await builderOutcome(runBuilder(projectDir));

    expect({
      externalScene: await readFile(externalScene),
      outcome,
    }).toEqual({
      externalScene: sentinel,
      outcome: 'rejected',
    });
  });

  it('does not follow symlinked composition metadata output files', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: false,
      version: 2,
    });
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const externalDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-metadata-'));
    temporaryDirectories.push(externalDir);
    const outputs = ['index.html', 'hyperframes.json', 'meta.json'];
    const sentinels = await Promise.all(outputs.map(async (name) => {
      const externalPath = path.join(externalDir, name);
      const sentinel = `external ${name} sentinel`;
      await writeFile(externalPath, sentinel, 'utf8');
      await symlink(externalPath, path.join(compositionDir, name));
      return { externalPath, name, sentinel };
    }));

    const outcome = await builderOutcome(runBuilder(projectDir));
    const externalContents = Object.fromEntries(await Promise.all(sentinels.map(async (entry) => [
      entry.name,
      await readFile(entry.externalPath, 'utf8'),
    ])));

    expect({ externalContents, outcome }).toEqual({
      externalContents: Object.fromEntries(
        sentinels.map((entry) => [entry.name, entry.sentinel]),
      ),
      outcome: 'rejected',
    });
  });

  it('discovers every scene image and renders its pixels through real HyperFrames', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '1:1',
      durationSeconds: 1,
      narration: false,
      sceneCount: 3,
      version: 2,
    });
    await runBuilder(projectDir);
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const compositionPath = path.join(compositionDir, 'index.html');
    const generatedHtml = await readFile(compositionPath, 'utf8');
    const generatedManifest = readManifest(generatedHtml);
    const oneFrameManifest = { ...generatedManifest, durationSeconds: 1 };
    await writeFile(
      compositionPath,
      generatedHtml
        .replace(
          `data-duration="${generatedManifest.durationSeconds}"`,
          'data-duration="1"',
        )
        .replace(JSON.stringify(generatedManifest), JSON.stringify(oneFrameManifest)),
      'utf8',
    );
    const output = path.join(projectDir, 'compiled-assets.mp4');
    const producerRoot = path.join(projectDir, 'hyperframes-producer');

    await execFileAsync(process.execPath, [
      HYPERFRAMES_CLI,
      'render',
      '--fps',
      '1',
      '--workers',
      '1',
      '--quality',
      'draft',
      '--no-best-effort',
      '--no-browser-gpu',
      '--debug',
      '--output',
      output,
      compositionDir,
    ], {
      env: {
        ...process.env,
        HYPERFRAMES_FFMPEG_PATH: FFMPEG_BIN,
        HYPERFRAMES_FFPROBE_PATH: FFPROBE_BIN,
        PRODUCER_RENDERS_DIR: path.join(producerRoot, 'renders'),
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });

    const debugRoot = path.join(producerRoot, '.debug');
    const renderWorkDirName = (await readdir(debugRoot))[0];
    expect(renderWorkDirName).toBeTruthy();
    const renderWorkDir = path.join(debugRoot, renderWorkDirName!);
    const compiledHtml = await readFile(path.join(renderWorkDir, 'compiled/index.html'), 'utf8');
    const renderLog = await readFile(path.join(renderWorkDir, 'render.log'), 'utf8');
    for (const index of [1, 2, 3]) {
      expect(compiledHtml).toContain(
        `src="assets/scene-${String(index).padStart(2, '0')}.png"`,
      );
    }
    const imageCount = Number(
      renderLog.match(/["']?imageCount["']?\s*[:=]\s*(\d+)/)?.[1],
    );
    expect(imageCount).toBeGreaterThan(0);
    expect((await stat(output)).size).toBeGreaterThan(0);
    const { stdout: frameCountOutput } = await execFileAsync(FFPROBE_BIN, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-count_frames',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'default=nokey=1:noprint_wrappers=1',
      output,
    ], { timeout: 30_000 });
    expect(Number(frameCountOutput.trim())).toBe(1);

    const renderedFrame = path.join(projectDir, 'rendered-frame.png');
    await execFileAsync(FFMPEG_BIN, [
      '-y',
      '-i',
      output,
      '-frames:v',
      '1',
      renderedFrame,
    ], { timeout: 30_000 });
    const frame = PNG.sync.read(await readFile(renderedFrame));
    let fixtureColorPixels = 0;
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      const red = frame.data[offset]!;
      const green = frame.data[offset + 1]!;
      const blue = frame.data[offset + 2]!;
      if (
        (red > 175 && green < 140 && blue < 140)
        || (blue > 155 && red < 145 && green < 195)
        || (green > 125 && red < 155 && blue < 170)
      ) {
        fixtureColorPixels += 1;
      }
    }
    expect(fixtureColorPixels).toBeGreaterThan(1000);
  }, 120_000);

  it('omits the single-line subtitle layer when v2 subtitles are disabled', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '1:1',
      narration: false,
      sceneCount: 2,
      subtitles: false,
      version: 2,
    });

    await runBuilder(projectDir);
    const html = await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/index.html'),
      'utf8',
    );

    expect(readManifest(html).subtitles).toBe(false);
    expect(html).not.toContain('<div class="tutorial__subtitle" data-loan-video-subtitle>');
  });

  it('embeds the one real daemon TTS result and removes its transient root file', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: true,
      sceneCount: 1,
    });
    const fakeOd = path.join(projectDir, 'fake-od.mjs');
    await writeFile(fakeOd, `
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
await appendFile(path.join(process.env.OD_PROJECT_DIR, 'od-calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] !== 'media' || args[1] !== 'generate' || args[args.indexOf('--surface') + 1] !== 'audio') {
  process.stderr.write('unexpected fake OD invocation\\n');
  process.exit(9);
}
const output = args[args.indexOf('--output') + 1];
const frameLength = 417;
const mp3 = Buffer.alloc(frameLength * 24);
for (let offset = 0; offset < mp3.length; offset += frameLength) {
  mp3.set([0xff, 0xfb, 0x90, 0x64], offset);
}
await writeFile(path.join(process.env.OD_PROJECT_DIR, output), mp3);
process.stdout.write(JSON.stringify({
  file: {
    name: output,
    size: 21,
    kind: 'audio',
    mime: 'audio/mpeg',
    providerId: 'openai',
  },
}) + '\\n');
`, 'utf8');

    await runBuilder(projectDir, fakeOd);

    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');
    const audio = await readFile(path.join(compositionDir, 'narration/scene-01.mp3'));
    const calls = (await readFile(path.join(projectDir, 'od-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);

    expect([...audio.subarray(0, 2)]).toEqual([0xff, 0xfb]);
    expect(html).toContain('src="narration/scene-01.mp3"');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('tts-1');
    expect(calls[0]).toContain('speech');
    await expect(
      stat(path.join(projectDir, 'loan-video-fast-narration-scene-01.mp3')),
    ).rejects.toThrow();
  });

  it('continues a TTS generate handoff through media wait when generate exits 2', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '16:9',
      narration: true,
      sceneCount: 1,
    });
    const fakeOd = path.join(projectDir, 'fake-od-running.mjs');
    await writeFile(fakeOd, `
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
await appendFile(path.join(process.env.OD_PROJECT_DIR, 'od-running-calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] === 'media' && args[1] === 'generate') {
  const output = args[args.indexOf('--output') + 1];
  await writeFile(path.join(process.env.OD_PROJECT_DIR, 'requested-output.txt'), output, 'utf8');
  process.stdout.write(JSON.stringify({ taskId: 'tts-task', status: 'running', nextSince: 3 }) + '\\n');
  process.exit(2);
}
if (args[0] === 'media' && args[1] === 'wait' && args[2] === 'tts-task') {
  const output = await readFile(path.join(process.env.OD_PROJECT_DIR, 'requested-output.txt'), 'utf8');
  await writeFile(
    path.join(process.env.OD_PROJECT_DIR, output),
    (() => {
      const frameLength = 417;
      const mp3 = Buffer.alloc(frameLength * 24);
      for (let offset = 0; offset < mp3.length; offset += frameLength) {
        mp3.set([0xff, 0xfb, 0x90, 0x64], offset);
      }
      return mp3;
    })(),
  );
  process.stdout.write(JSON.stringify({
    file: {
      name: output,
      size: 24,
      kind: 'audio',
      mime: 'audio/mpeg',
      providerId: 'openai',
    },
  }) + '\\n');
  process.exit(0);
}
process.stderr.write('unexpected fake OD invocation\\n');
process.exit(9);
`, 'utf8');

    await runBuilder(projectDir, fakeOd);

    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const audio = await readFile(path.join(compositionDir, 'narration/scene-01.mp3'));
    const calls = (await readFile(path.join(projectDir, 'od-running-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);

    expect([...audio.subarray(0, 2)]).toEqual([0xff, 0xfb]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.slice(0, 3)).toEqual(['media', 'wait', 'tts-task']);
    expect(calls[1]).toContain('3');
  });

  it('renders captions without audio when direct mode allows a TTS failure fallback', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: true,
      sceneCount: 1,
      version: 2,
    });
    const fakeOd = path.join(projectDir, 'fake-od-failed.mjs');
    await writeFile(fakeOd, `
process.stdout.write(JSON.stringify({
  taskId: 'tts-failed',
  status: 'failed',
  error: { message: 'temporary TTS failure' },
}) + '\\n');
process.exit(5);
`, 'utf8');

    const { stdout } = await runBuilder(
      projectDir,
      fakeOd,
      STORYBOARD_RELATIVE_PATH,
      true,
    );

    const summary = JSON.parse(stdout.trim()) as { narration: boolean; warnings: string[] };
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');
    expect(summary.narration).toBe(false);
    expect(summary.warnings).toEqual([
      expect.stringContaining('temporary TTS failure'),
    ]);
    expect(readManifest(html).audio).toBeNull();
    expect(html).not.toContain('<audio');
  });

  it('uses only enabled v2 voiceovers and synchronizes the manifest to real MP3 duration', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '3:4',
      durationSeconds: 1,
      narration: true,
      sceneCount: 3,
      version: 2,
      voiceoverEnabled: [true, false, true],
    });
    const fakeOd = path.join(projectDir, 'fake-od-v2.mjs');
    await writeFile(fakeOd, `
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
await appendFile(path.join(process.env.OD_PROJECT_DIR, 'v2-tts-calls.jsonl'), JSON.stringify(args) + '\\n');
const output = args[args.indexOf('--output') + 1];
const frameLength = 417;
const mp3 = Buffer.alloc(frameLength * 24);
for (let offset = 0; offset < mp3.length; offset += frameLength) {
  mp3.set([0xff, 0xfb, 0x90, 0x64], offset);
}
await writeFile(path.join(process.env.OD_PROJECT_DIR, output), mp3);
process.stdout.write(JSON.stringify({
  file: { name: output, size: mp3.length, kind: 'audio', mime: 'audio/mpeg' },
}) + '\\n');
`, 'utf8');

    await runBuilder(projectDir, fakeOd);

    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const narrationOne = await readFile(
      path.join(compositionDir, 'narration/scene-01.txt'),
      'utf8',
    );
    const narrationThree = await readFile(
      path.join(compositionDir, 'narration/scene-03.txt'),
      'utf8',
    );
    const calls = (await readFile(path.join(projectDir, 'v2-tts-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');
    const manifest = readManifest(html);

    expect(narrationOne.trim()).toBe('Voiceover 1.');
    expect(narrationThree.trim()).toBe('Voiceover 3.');
    await expect(stat(path.join(compositionDir, 'narration/scene-02.txt'))).rejects.toThrow();
    expect(calls).toHaveLength(2);
    expect(manifest.audio?.sceneIndexes).toEqual([1, 3]);
    expect(manifest.audio?.clips).toHaveLength(2);
    expect(manifest.audio?.durationSeconds).toBeCloseTo(2 * 24 * 1152 / 44_100, 3);
    expect(manifest.audio?.clips[0]).toMatchObject({
      sceneIndex: 1,
      src: 'narration/scene-01.mp3',
      start: manifest.scenes[0]!.start,
    });
    expect(manifest.audio?.clips[1]).toMatchObject({
      sceneIndex: 3,
      src: 'narration/scene-03.mp3',
      start: manifest.scenes[2]!.start,
    });
    expect(manifest.audio!.clips[1]!.start).toBeGreaterThan(0);
    for (const clip of manifest.audio!.clips) {
      expect(manifest.scenes[clip.sceneIndex - 1]!.duration)
        .toBeGreaterThanOrEqual(clip.durationSeconds + 0.3);
    }
    expect(manifest.scenes[1]!.duration).toBeGreaterThanOrEqual(1.2);
    expect(manifest.durationSeconds).toBeGreaterThanOrEqual(3.6);
    expect(html.match(/<audio/g)).toHaveLength(2);
    for (const clip of manifest.audio!.clips) {
      expect(html).toContain(`src="${clip.src}"`);
      expect(html).toContain(`data-start="${clip.start}"`);
    }
  });

  it('does not request narration when every v2 voiceover is disabled', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '3:4',
      narration: true,
      sceneCount: 3,
      version: 2,
      voiceoverEnabled: [false, false, false],
    });

    const { stdout } = await runBuilder(projectDir);
    const compositionDir = path.join(projectDir, '.hyperframes-cache/loan-video-fast');
    const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');

    expect(JSON.parse(stdout.trim())).toMatchObject({ narration: false, durationSeconds: 30 });
    expect(readManifest(html)).toMatchObject({ audio: null, durationSeconds: 30 });
    expect(html).not.toContain('<audio');
    await expect(
      stat(path.join(compositionDir, 'narration/scene-01.mp3')),
    ).rejects.toThrow();
  });

  it('extends the selected duration when real narration plus tail room is longer', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '16:9',
      narration: true,
      sceneCount: 1,
      version: 2,
    });
    const fakeOd = path.join(projectDir, 'fake-od-long-audio.mjs');
    await writeFile(fakeOd, `
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const output = args[args.indexOf('--output') + 1];
const frameLength = 417;
const mp3 = Buffer.alloc(frameLength * 1200);
for (let offset = 0; offset < mp3.length; offset += frameLength) {
  mp3.set([0xff, 0xfb, 0x90, 0x64], offset);
}
await writeFile(path.join(process.env.OD_PROJECT_DIR, output), mp3);
process.stdout.write(JSON.stringify({ file: { name: output, kind: 'audio', mime: 'audio/mpeg' } }) + '\\n');
`, 'utf8');

    await runBuilder(projectDir, fakeOd);
    const html = await readFile(
      path.join(projectDir, '.hyperframes-cache/loan-video-fast/index.html'),
      'utf8',
    );
    const manifest = readManifest(html);

    expect(manifest.audio?.durationSeconds).toBeCloseTo(1200 * 1152 / 44_100, 3);
    expect(manifest.durationSeconds).toBeCloseTo(manifest.audio!.durationSeconds + 0.3, 3);
    expect(manifest.durationSeconds).toBeGreaterThan(30);
  });
});
