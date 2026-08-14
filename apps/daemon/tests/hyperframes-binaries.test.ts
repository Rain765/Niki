import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createHyperFramesRenderCommand,
  createHyperFramesRenderEnv,
  resolveHyperFramesCliPath,
  resolveHyperFramesBinaryPaths,
  verifyHyperFramesBinaries,
} from '../src/hyperframes-binaries.js';

const execFileAsync = promisify(execFile);

describe('HyperFrames media binaries', () => {
  it('runs the pinned daemon-local HyperFrames CLI without npx', async () => {
    const daemonPackage = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const cliPath = resolveHyperFramesCliPath();
    const invocation = createHyperFramesRenderCommand('/tmp/composition', '/tmp/render.mp4');

    expect(invocation).toEqual({
      command: process.execPath,
      args: [
        cliPath,
        'render',
        '/tmp/composition',
        '--output',
        '/tmp/render.mp4',
        '--workers',
        '1',
      ],
    });
    expect(invocation.command).not.toBe('npx');
    expect(invocation.args).not.toContain('-y');
    expect(daemonPackage.dependencies?.hyperframes).toBe('0.7.108');

    const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version'], {
      timeout: 10_000,
    });
    expect(stdout.trim()).toBe('0.7.108');
  });

  it('resolves HyperFrames from the assembled app above a standalone prebundle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-design-hyperframes-prebundle-'));
    const bundledDaemon = join(
      root,
      'app',
      'prebundled',
      'daemon',
      'chunks',
      'media-runtime.mjs',
    );
    const packageRoot = join(root, 'app', 'node_modules', 'hyperframes');
    const cliPath = join(packageRoot, 'bin', 'hyperframes.mjs');

    try {
      await mkdir(dirname(bundledDaemon), { recursive: true });
      await mkdir(dirname(cliPath), { recursive: true });
      await writeFile(bundledDaemon, '', 'utf8');
      await writeFile(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: 'hyperframes', version: '0.7.108' }),
        'utf8',
      );
      await writeFile(cliPath, '', 'utf8');

      expect(resolveHyperFramesCliPath(pathToFileURL(bundledDaemon))).toBe(
        await realpath(cliPath),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ships runnable FFmpeg and FFprobe binaries with the daemon', async () => {
    const binaries = resolveHyperFramesBinaryPaths();

    expect(binaries.ffmpeg).toMatch(/ffmpeg(?:\.exe)?$/);
    expect(binaries.ffprobe).toMatch(/ffprobe(?:\.exe)?$/);
    await expect(verifyHyperFramesBinaries(binaries)).resolves.toBeUndefined();
  });

  it('makes both binaries explicitly resolvable inside the render child', async () => {
    const binaries = resolveHyperFramesBinaryPaths();
    const env = createHyperFramesRenderEnv(
      {
        PATH: '/usr/bin:/bin',
        HYPERFRAMES_FFMPEG_PATH: '/missing/ffmpeg',
        HYPERFRAMES_FFPROBE_PATH: '/missing/ffprobe',
      },
      binaries,
    );

    const probeScript = String.raw`
      const { spawnSync } = require('node:child_process');
      const keys = ['HYPERFRAMES_FFMPEG_PATH', 'HYPERFRAMES_FFPROBE_PATH'];
      const result = Object.fromEntries(keys.map((key) => {
        const binary = process.env[key];
        const child = spawnSync(binary, ['-version'], { encoding: 'utf8' });
        return [key, {
          path: binary,
          status: child.status,
          error: child.error?.message ?? null,
          output: String(child.stdout ?? '')
            .concat(String(child.stderr ?? ''))
            .split(/\r?\n/, 1)[0],
        }];
      }));
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout } = await execFileAsync(process.execPath, ['-e', probeScript], {
      env,
      timeout: 10_000,
    });
    const resolved = JSON.parse(stdout) as Record<
      string,
      { path: string; status: number | null; error: string | null; output: string }
    >;

    expect(resolved.HYPERFRAMES_FFMPEG_PATH).toMatchObject({
      path: binaries.ffmpeg,
      status: 0,
      error: null,
    });
    expect(resolved.HYPERFRAMES_FFMPEG_PATH?.output).toContain('ffmpeg version');
    expect(resolved.HYPERFRAMES_FFPROBE_PATH).toMatchObject({
      path: binaries.ffprobe,
      status: 0,
      error: null,
    });
    expect(resolved.HYPERFRAMES_FFPROBE_PATH?.output).toContain('ffprobe version');
  });
});
