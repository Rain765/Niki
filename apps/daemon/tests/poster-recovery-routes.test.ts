import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { insertMediaTask } from '../src/media-tasks.js';
import { posterRecoveryJobs } from '../src/poster-recovery-jobs.js';
import { generateMedia } from '../src/media.js';
import { startServer } from '../src/server.js';

vi.mock('../src/media.js', async (original) => ({
  ...await original<typeof import('../src/media.js')>(),
  generateMedia: vi.fn(async () => ({ name: 'recovered.png', kind: 'image', mime: 'image/png' })),
}));
let server: http.Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
  closeDatabase();
  vi.mocked(generateMedia).mockClear();
});

it.each([false, true])('resumes a persisted job after restart without charging (legacy=%s)', async (legacy) => {
  const dataDir = process.env.OD_DATA_DIR;
  if (!dataDir) throw new Error('OD_DATA_DIR is required for tests');
  const db = openDatabase(process.cwd(), { dataDir });
  const projectId = randomUUID();
  const taskId = randomUUID();
  insertProject(db, { id: projectId, name: 'Saved poster', createdAt: Date.now(), updatedAt: Date.now(), metadata: { directGeneration: { kind: 'loan-poster' } } });
  insertMediaTask(db, { id: taskId, projectId, status: 'running', surface: 'image', model: 'gpt-image-2', progress: ['image:checkpoint-saved'] });
  posterRecoveryJobs(db).save(taskId, projectId, { surface: 'image', model: 'gpt-image-2', prompt: 'stored scene', output: 'recovered.png', posterCopyStyle: 'anti-fraud-message' });
  if (legacy) {
    db.prepare('UPDATE poster_recovery_jobs SET request_json = ? WHERE task_id = ?')
      .run(JSON.stringify({ surface: 'image', model: 'gpt-image-2', prompt: 'stored scene', output: 'recovered.png', posterCopyStyle: 'anti-fraud-message' }), taskId);
  }
  const started = await startServer({ port: 0, returnServer: true }) as { url: string; server: http.Server };
  server = started.server;
  await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledWith(expect.objectContaining({ projectId, prompt: 'stored scene', output: 'recovered.png', posterRecoveryOnly: true, posterGenerationId: legacy ? undefined : taskId })));
  const response = await fetch(`${started.url}/api/media/tasks/${taskId}/wait`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeoutMs: 1000 }) });
  expect(await response.json()).toMatchObject({ status: 'done', file: { name: 'recovered.png' } });
  const resume = await fetch(`${started.url}/api/projects/${projectId}/media/generate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: started.url }, body: JSON.stringify({ resumeTaskId: taskId }) });
  expect(resume.status).toBe(202);
  expect(generateMedia).toHaveBeenCalledTimes(1);
});
