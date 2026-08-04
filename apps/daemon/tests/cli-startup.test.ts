import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('CLI startup boundaries', () => {
  it('does not import daemon startup code for media client commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-media-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    await chmod(dataDir, 0o500);

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'repro',
          '--surface',
          'image',
          '--model',
          'gpt-image-2',
          '--prompt',
          'test',
          '--daemon-url',
          'http://127.0.0.1:59999',
        ],
        {
          cwd: daemonRoot,
          env: {
            ...process.env,
            OD_DATA_DIR: dataDir,
          },
        },
      );
      throw new Error('media command unexpectedly succeeded');
    } catch (error: unknown) {
      const failed = error as { code?: number; stderr?: string };
      const stderr = failed.stderr ?? '';
      expect(failed.code).toBe(3);
      expect(stderr).toContain('failed to reach daemon');
      expect(stderr).not.toContain('OD_DATA_DIR');
    } finally {
      await chmod(dataDir, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts --quick for daemon database verification', async () => {
    let requestedUrl = '';
    const server = http.createServer((req, res) => {
      requestedUrl = req.url ?? '';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        mode: 'quick_check',
        issues: [],
        elapsedMs: 1,
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'daemon',
          'db',
          'verify',
          '--quick',
          '--json',
          '--daemon-url',
          `http://127.0.0.1:${address.port}`,
        ],
        { cwd: daemonRoot },
      );

      expect(requestedUrl).toBe('/api/daemon/db/verify?quick=1');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        mode: 'quick_check',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('logs in with a password file and requests a bearer session for other CLI commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-auth-'));
    const passwordFile = join(root, 'password.txt');
    await writeFile(passwordFile, 'correct horse battery staple\n', { mode: 0o600 });
    let requestBody = '';
    let sessionTransport = '';
    const server = http.createServer((req, res) => {
      sessionTransport = String(req.headers['x-niki-session-transport'] ?? '');
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        requestBody += chunk;
      });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          user: { id: 'user-1', name: 'Owner', role: 'admin' },
          sessionToken: 'session-token',
          expiresAt: Date.now() + 60_000,
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'auth',
          'login',
          '--username',
          'owner',
          '--password-file',
          passwordFile,
          '--json',
          '--daemon-url',
          `http://127.0.0.1:${address.port}`,
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env, OD_NIKI_SESSION_TOKEN: '' },
        },
      );

      expect(sessionTransport).toBe('bearer');
      expect(JSON.parse(requestBody)).toEqual({
        username: 'owner',
        password: 'correct horse battery staple',
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        user: { name: 'Owner', role: 'admin' },
        sessionToken: 'session-token',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
