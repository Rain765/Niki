import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { createNikiSession, upsertFeishuUser } from '../src/niki-auth.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import { updateNikiUserQuota, userDailyGenerationCount } from '../src/niki-quota.js';
import { startServer } from '../src/server.js';

const storageScan = vi.hoisted(() => ({ path: '', gate: undefined as Promise<void> | undefined, reads: 0 }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, readdir: async (...args: Parameters<typeof fs.readdir>) => {
    if (String(args[0]) === storageScan.path && storageScan.gate) {
      storageScan.reads++;
      await storageScan.gate;
    }
    return fs.readdir(...args);
  } };
});

vi.mock('../src/media.js', async (original) => ({
  ...await original<typeof import('../src/media.js')>(),
  generateMedia: vi.fn(async () => { throw new Error('Offline provider fixture'); }),
}));
let server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  server = undefined;
  closeDatabase();
  vi.unstubAllEnvs();
});

it('admits only the remaining quota across parallel HTTP requests and replays accepted requests', async () => {
  vi.stubEnv('NIKI_AUTH_MODE', 'feishu');
  vi.stubEnv('FEISHU_APP_ID', 'test-app');
  vi.stubEnv('FEISHU_APP_SECRET', 'test-secret');
  vi.stubEnv('NIKI_PUBLIC_URL', 'https://niki.example.test');
  const root = process.env.OD_DATA_DIR!;
  const db = openDatabase(process.cwd(), { dataDir: root });
  const user = upsertFeishuUser(db, { tenantKey: 'test', openId: randomUUID(), name: 'Quota tester' });
  updateNikiUserQuota(db, user.id, { storageBytes: 100_000, dailyGenerations: 1 });
  const projectId = randomUUID();
  runAsNikiUser(user, () => insertProject(db, { id: projectId, name: 'Quota', createdAt: Date.now(), updatedAt: Date.now() }));
  await mkdir(path.join(root, 'projects', projectId), { recursive: true });
  const { token } = createNikiSession(db, user.id);
  const started = await startServer({ port: 0, returnServer: true }) as { url: string; server: Server };
  server = started.server;
  const send = (clientRequestId: string) => fetch(`${started.url}/api/projects/${projectId}/media/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ surface: 'image', model: 'gpt-image-2', prompt: 'Offline fixture', clientRequestId }),
  });
  const ids = Array.from({ length: 8 }, () => randomUUID());
  let release!: () => void;
  storageScan.path = path.join(root, 'projects', projectId);
  storageScan.reads = 0;
  storageScan.gate = new Promise<void>(resolve => { release = resolve; });
  const pending = Promise.all(ids.map(send));
  try {
    await vi.waitFor(() => expect(storageScan.reads).toBe(ids.length));
  } finally {
    release();
    storageScan.gate = undefined;
  }
  const responses = await pending;
  expect(responses.filter(response => response.status === 202)).toHaveLength(1);
  expect(responses.filter(response => response.status === 429)).toHaveLength(7);
  expect(userDailyGenerationCount(db, user.id)).toBe(1);
  const accepted = responses.findIndex(response => response.status === 202);
  const replay = await send(ids[accepted]!);
  expect(replay.status).toBe(202);
  expect(await replay.json()).toMatchObject({ idempotentReplay: true, taskId: ids[accepted] });
  expect(userDailyGenerationCount(db, user.id)).toBe(1);
});
