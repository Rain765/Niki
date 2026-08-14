import { spawn } from 'node:child_process';
import path from 'node:path';

import * as ffprobeStaticModule from '@derhuerst/ffprobe-static';
import * as ffmpegStaticModule from 'ffmpeg-static';

export const HYPERFRAMES_FFMPEG_PATH_ENV = 'HYPERFRAMES_FFMPEG_PATH';
export const HYPERFRAMES_FFPROBE_PATH_ENV = 'HYPERFRAMES_FFPROBE_PATH';

export type HyperFramesBinaryPaths = {
  ffmpeg: string;
  ffprobe: string;
};

const VERIFY_TIMEOUT_MS = 10_000;
const verificationCache = new Map<string, Promise<void>>();

function requireBundledPath(
  binary: 'FFmpeg' | 'FFprobe',
  value: string | null,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `bundled ${binary} is unavailable for ${process.platform}/${process.arch}`,
    );
  }
  return path.resolve(value);
}

function staticBinaryPath(moduleValue: unknown): string | null {
  if (typeof moduleValue === 'string') return moduleValue;
  if (
    moduleValue != null &&
    typeof moduleValue === 'object' &&
    'default' in moduleValue
  ) {
    const value = moduleValue.default;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * Resolve the platform-specific static binaries installed with the daemon.
 * The package versions are pinned together so FFmpeg and FFprobe always come
 * from the same upstream release instead of depending on the host PATH.
 */
export function resolveHyperFramesBinaryPaths(): HyperFramesBinaryPaths {
  return {
    ffmpeg: requireBundledPath(
      'FFmpeg',
      staticBinaryPath(ffmpegStaticModule),
    ),
    ffprobe: requireBundledPath(
      'FFprobe',
      staticBinaryPath(ffprobeStaticModule),
    ),
  };
}

function pathEnvironmentKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ??
    (process.platform === 'win32' ? 'Path' : 'PATH');
}

function prependUniquePathEntries(
  current: string | undefined,
  entries: string[],
): string {
  const caseInsensitive = process.platform === 'win32';
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of [...entries, ...(current ?? '').split(path.delimiter)]) {
    if (!entry) continue;
    const key = caseInsensitive ? entry.toLowerCase() : entry;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }
  return normalized.join(path.delimiter);
}

/**
 * Build the exact environment inherited by `npx hyperframes render`.
 * HyperFrames reads the two explicit variables during preflight; PATH is also
 * augmented for any nested tool that invokes the conventional command names.
 */
export function createHyperFramesRenderEnv(
  baseEnv: NodeJS.ProcessEnv,
  binaries: HyperFramesBinaryPaths = resolveHyperFramesBinaryPaths(),
): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const pathKey = pathEnvironmentKey(env);
  env[pathKey] = prependUniquePathEntries(env[pathKey], [
    path.dirname(binaries.ffmpeg),
    path.dirname(binaries.ffprobe),
  ]);
  env[HYPERFRAMES_FFMPEG_PATH_ENV] = binaries.ffmpeg;
  env[HYPERFRAMES_FFPROBE_PATH_ENV] = binaries.ffprobe;
  return env;
}

function verifyBinary(binary: 'FFmpeg' | 'FFprobe', binaryPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let stderrTail = '';
    let settled = false;
    const child = spawn(binaryPath, ['-version'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `bundled ${binary} verification timed out after ${VERIFY_TIMEOUT_MS}ms: ${binaryPath}`,
        ),
      );
    }, VERIFY_TIMEOUT_MS);

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail += chunk.toString('utf8');
      if (stderrTail.length > 4_000) stderrTail = stderrTail.slice(-4_000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `bundled ${binary} is not executable at ${binaryPath}: ${error.message}`,
        ),
      );
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) return resolve();
      const reason = signal == null ? `exit ${code ?? 'unknown'}` : `signal ${signal}`;
      const detail = stderrTail.trim().split('\n').slice(-3).join('\n');
      reject(
        new Error(
          `bundled ${binary} verification failed (${reason}) at ${binaryPath}` +
            (detail ? `\n${detail}` : ''),
        ),
      );
    });
  });
}

/** Verify both static executables once before giving them to HyperFrames. */
export async function verifyHyperFramesBinaries(
  binaries: HyperFramesBinaryPaths = resolveHyperFramesBinaryPaths(),
): Promise<void> {
  const key = `${binaries.ffmpeg}\0${binaries.ffprobe}`;
  let verification = verificationCache.get(key);
  if (verification == null) {
    verification = Promise.all([
      verifyBinary('FFmpeg', binaries.ffmpeg),
      verifyBinary('FFprobe', binaries.ffprobe),
    ]).then(() => undefined);
    verificationCache.set(key, verification);
  }
  try {
    await verification;
  } catch (error) {
    if (verificationCache.get(key) === verification) {
      verificationCache.delete(key);
    }
    throw error;
  }
}
