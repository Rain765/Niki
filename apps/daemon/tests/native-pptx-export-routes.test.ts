import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { NATIVE_PRESENTATION_INSPECTOR_VERSION, type NativePptxExportJob } from '@open-design/contracts';
import { expect, it } from 'vitest';
import { openDatabase, insertProject, closeDatabase } from '../src/db.js';
import { upsertFeishuUser } from '../src/niki-auth.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import { registerNativePptxExportRoutes } from '../src/native-pptx-export-routes.js';

it('deduplicates, protects and refreshes native PPTX downloads when source changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'native-pptx-route-'));
  const db = openDatabase(root, { dataDir: root });
  const owner = upsertFeishuUser(db, { tenantKey: 't', openId: 'owner', name: 'Owner' });
  const other = upsertFeishuUser(db, { tenantKey: 't', openId: 'other', name: 'Other' });
  const projectsRoot = path.join(root, 'projects');
  const dir = path.join(projectsRoot, 'deck');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), 'original');
  runAsNikiUser(owner, () => insertProject(db, { id: 'deck', name: 'My deck', skillId: 'html-ppt', createdAt: 1, updatedAt: 1 }));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => runAsNikiUser(req.headers['x-user'] === 'other' ? other : owner, next));
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let calls = 0;
  registerNativePptxExportRoutes(app, {
    db, projectsRoot,
    async exportPptx(projectDir, entry, _title, onPage) {
      calls++;
      await gate;
      const bytes = await readFile(path.join(projectDir, entry));
      const report = {
        version: 1 as const, inspectorVersion: NATIVE_PRESENTATION_INSPECTOR_VERSION, entry,
        sourceHash: createHash('sha256').update(bytes).digest('hex'), resourceHashes: {}, stale: false,
        viewport: { width: 1280, height: 720 }, reportFile: '', visualReviewRequired: true as const,
        slides: [], blockedResources: [], failedResources: [],
      };
      onPage(1);
      return { pptx: bytes, report, pages: 1, warnings: [] };
    },
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const url = origin + '/api/projects/deck/native-presentation/pptx';
  const start = async () => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: 'index.html' }) });
    expect(response.status).toBe(202);
    return await response.json() as NativePptxExportJob;
  };
  const complete = async (id: string) => {
    const get = async () => await (await fetch(url + '/jobs/' + id)).json() as NativePptxExportJob;
    await expect.poll(async () => (await get()).status).toBe('ready');
    const job = await get();
    if (job.status !== 'ready') throw new Error('Export not ready');
    return origin + job.downloadUrl;
  };
  try {
    const first = await start();
    expect((await start()).id).toBe(first.id);
    expect((await fetch(url + '/jobs/' + first.id, { headers: { 'x-user': 'other' } })).status).toBe(404);
    finish();
    const download = await complete(first.id);
    expect((await fetch(download, { headers: { 'x-user': 'other' } })).status).toBe(404);
    const response = await fetch(download);
    expect(response.headers.get('content-disposition')).toContain('My deck.pptx');
    expect(await response.text()).toBe('original');
    expect(await complete((await start()).id)).toBe(download);
    expect(calls).toBe(1);
    await writeFile(path.join(dir, 'index.html'), 'changed');
    expect((await fetch(download)).status).toBe(409);
    const updated = await complete((await start()).id);
    expect(updated).not.toBe(download);
    expect(await (await fetch(updated)).text()).toBe('changed');
    expect(calls).toBe(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    closeDatabase();
    await rm(root, { recursive: true, force: true });
  }
});
