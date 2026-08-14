import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  createHyperFramesRenderEnv,
  resolveHyperFramesBinaryPaths,
  verifyHyperFramesBinaries,
} from '../src/hyperframes-binaries.js';

const execFileAsync = promisify(execFile);

describe('HyperFrames media binaries', () => {
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
