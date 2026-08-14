import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
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

  it('exits 2 when media generate hands off a task that is still running', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/projects/repro/media/generate') {
        res.statusCode = 202;
        res.end(JSON.stringify({ taskId: 'task-running', status: 'running' }));
        return;
      }
      if (req.url === '/api/media/tasks/task-running/wait') {
        res.end(JSON.stringify({
          taskId: 'task-running',
          status: 'running',
          progress: [],
          nextSince: 0,
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');

    // Advance wall-clock time only in the child process so the production
    // 25-second budget is exercised without making the regression test sleep.
    const advanceClock =
      'data:text/javascript,' +
      encodeURIComponent('const realNow=Date.now.bind(Date);let offset=0;Date.now=()=>realNow()+(offset+=26000);');

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          advanceClock,
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'repro',
          '--surface',
          'video',
          '--model',
          'seedance-2.0',
          '--prompt',
          'test',
          '--daemon-url',
          `http://127.0.0.1:${address.port}`,
        ],
        { cwd: daemonRoot },
      );
      throw new Error('media generate unexpectedly exited 0 for a running task');
    } catch (error: unknown) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      expect(failed.code).toBe(2);
      expect(JSON.parse((failed.stdout ?? '').trim())).toMatchObject({
        taskId: 'task-running',
        status: 'running',
      });
      expect(failed.stderr).toContain('still running');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each(['failed', 'interrupted'] as const)(
    'exits 5 when media generate observes a %s task regardless of HTTP status',
    async (terminalStatus) => {
      const taskId = `task-${terminalStatus}`;
      const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/api/projects/repro/media/generate') {
          res.statusCode = 202;
          res.end(JSON.stringify({ taskId, status: 'running' }));
          return;
        }
        if (req.url === `/api/media/tasks/${taskId}/wait`) {
          res.end(JSON.stringify({
            taskId,
            status: terminalStatus,
            progress: [],
            nextSince: 0,
            error: {
              status: 502,
              code: 'UND_ERR_CONNECT_TIMEOUT',
              message: 'fetch failed: Connect Timeout Error',
            },
          }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server not listening');

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
            'audio',
            '--model',
            'gpt-4o-mini-tts',
            '--prompt',
            'test',
            '--daemon-url',
            `http://127.0.0.1:${address.port}`,
          ],
          { cwd: daemonRoot },
        );
        throw new Error(`media generate unexpectedly exited 0 for a ${terminalStatus} task`);
      } catch (error: unknown) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        expect(failed.code).toBe(5);
        expect(JSON.parse((failed.stdout ?? '').trim())).toMatchObject({
          taskId,
          status: terminalStatus,
          error: {
            status: 502,
            code: 'UND_ERR_CONNECT_TIMEOUT',
          },
        });
        expect(failed.stderr).toContain('fetch failed: Connect Timeout Error');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );
});
