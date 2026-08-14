import { execFile } from 'node:child_process';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const BUILDER = path.join(
  REPO_ROOT,
  'design-templates/hyperframes/scripts/build-loan-video.mjs',
);
const STORYBOARD_RELATIVE_PATH = '.hyperframes-cache/loan-video-fast/storyboard.json';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function createProjectFixture(options: {
  aspectRatio: string;
  narration: boolean;
  sceneCount?: number;
}) {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'od-loan-video-builder-'));
  temporaryDirectories.push(projectDir);
  const sceneCount = options.sceneCount ?? 2;
  await mkdir(path.join(projectDir, '.od-inputs'), { recursive: true });
  await mkdir(path.dirname(path.join(projectDir, STORYBOARD_RELATIVE_PATH)), { recursive: true });
  for (let index = 0; index < sceneCount; index += 1) {
    await writeFile(
      path.join(projectDir, '.od-inputs', `${1700000000000 + index}-scene-${index + 1}.png`),
      Buffer.from(`real-screenshot-${index + 1}`),
    );
  }
  await writeFile(
    path.join(projectDir, STORYBOARD_RELATIVE_PATH),
    JSON.stringify({
      version: 1,
      title: 'How to apply',
      product: 'zamloan',
      language: 'en',
      aspectRatio: options.aspectRatio,
      durationSeconds: 30,
      narration: options.narration,
      scenes: Array.from({ length: sceneCount }, (_, index) => ({
        index: index + 1,
        screenshotAttachmentIndex: index + 1,
        screenshotOriginalName: `scene-${index + 1}.png`,
        caption: `Step ${index + 1}`,
        voiceover: `Voiceover ${index + 1}.`,
        action: index === 0 ? { type: 'tap', x: 0.25, y: 0.75 } : { type: 'none' },
      })),
    }),
    'utf8',
  );
  return projectDir;
}

async function runBuilder(projectDir: string, odBin = path.join(projectDir, 'unused-od.mjs')) {
  return execFileAsync(process.execPath, [
    BUILDER,
    '--storyboard',
    STORYBOARD_RELATIVE_PATH,
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

    expect(result).toMatchObject({ size: `${width}x${height}`, scenes: 2 });
    expect(html).toContain(`data-width="${width}"`);
    expect(html).toContain(`data-height="${height}"`);
    expect(html).toContain(`class="layout-${layout}"`);
    expect(html).toContain('assets/scene-01.png');
    expect(html).toContain('assets/scene-02.png');
    expect(html).toContain('Step 1');
    expect(html).toContain('--tap-x: 25.000%; --tap-y: 75.000%');
    expect(html).not.toContain('<audio');
    expect(html).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
  });

  it('embeds the one real daemon TTS result and removes its transient root file', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '9:16',
      narration: true,
      sceneCount: 1,
    });
    const fakeOd = path.join(projectDir, 'fake-od.mjs');
    await writeFile(fakeOd, `
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
await appendFile(path.join(process.env.OD_PROJECT_DIR, 'od-calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] !== 'media' || args[1] !== 'generate' || args[args.indexOf('--surface') + 1] !== 'audio') {
  process.stderr.write('unexpected fake OD invocation\\n');
  process.exit(9);
}
const output = args[args.indexOf('--output') + 1];
await writeFile(path.join(process.env.OD_PROJECT_DIR, output), Buffer.from('ID3-real-daemon-audio'));
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
    const audio = await readFile(path.join(compositionDir, 'narration.mp3'), 'utf8');
    const calls = (await readFile(path.join(projectDir, 'od-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);

    expect(audio).toBe('ID3-real-daemon-audio');
    expect(html).toContain('src="narration.mp3"');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('gpt-4o-mini-tts');
    expect(calls[0]).toContain('speech');
    await expect(stat(path.join(projectDir, 'loan-video-fast-narration.mp3'))).rejects.toThrow();
  });

  it('continues a TTS generate handoff through media wait when generate exits 2', async () => {
    const projectDir = await createProjectFixture({
      aspectRatio: '16:9',
      narration: true,
      sceneCount: 1,
    });
    const fakeOd = path.join(projectDir, 'fake-od-running.mjs');
    await writeFile(fakeOd, `
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
await appendFile(path.join(process.env.OD_PROJECT_DIR, 'od-running-calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] === 'media' && args[1] === 'generate') {
  process.stdout.write(JSON.stringify({ taskId: 'tts-task', status: 'running', nextSince: 3 }) + '\\n');
  process.exit(2);
}
if (args[0] === 'media' && args[1] === 'wait' && args[2] === 'tts-task') {
  await writeFile(
    path.join(process.env.OD_PROJECT_DIR, 'loan-video-fast-narration.mp3'),
    Buffer.from('ID3-waited-daemon-audio'),
  );
  process.stdout.write(JSON.stringify({
    file: {
      name: 'loan-video-fast-narration.mp3',
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
    const audio = await readFile(path.join(compositionDir, 'narration.mp3'), 'utf8');
    const calls = (await readFile(path.join(projectDir, 'od-running-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);

    expect(audio).toBe('ID3-waited-daemon-audio');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.slice(0, 3)).toEqual(['media', 'wait', 'tts-task']);
    expect(calls[1]).toContain('3');
  });
});
