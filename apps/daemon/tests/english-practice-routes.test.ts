import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import { registerEnglishPracticeRoutes } from '../src/english-practice-routes.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import { upsertFeishuUser } from '../src/niki-auth.js';

describe('English practice routes', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;
  let activeUser: ReturnType<typeof upsertFeishuUser>;
  let otherUser: ReturnType<typeof upsertFeishuUser>;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'english-practice-routes-'));
    const db = openDatabase(tempDir, { dataDir: tempDir });
    activeUser = upsertFeishuUser(db, { tenantKey: 'tenant', openId: 'learner-a', name: 'Learner A' });
    otherUser = upsertFeishuUser(db, { tenantKey: 'tenant', openId: 'learner-b', name: 'Learner B' });
    const app = express();
    app.use(express.json());
    app.use('/api', (_req, _res, next) => runAsNikiUser(activeUser, () => next()));
    registerEnglishPracticeRoutes(app, { db });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves ten stable scenarios and the twelve-turn coffee lesson', async () => {
    const catalog = await fetch(`${baseUrl}/api/english-practice/catalog`);
    expect(catalog.status).toBe(200);
    const catalogBody = await catalog.json() as any;
    expect(catalogBody.scenarios).toHaveLength(10);
    expect(catalogBody.scenarios.find((item: any) => item.id === 'coffee-shop')).toMatchObject({
      available: true,
      turnCount: 12,
    });

    const lesson = await fetch(`${baseUrl}/api/english-practice/lessons/coffee-shop`);
    expect(lesson.status).toBe(200);
    const lessonBody = await lesson.json() as any;
    expect(lessonBody.lesson.dialogue).toHaveLength(12);
    expect(lessonBody.lesson.dialogue[0]).toMatchObject({ speaker: 'B', chinese: '早上好！请问想点些什么？' });
  });

  it('persists validated progress for the current user only', async () => {
    const updated = await fetch(`${baseUrl}/api/english-practice/progress`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listenedLineIds: ['coffee-01', 'not-a-line'],
        favorites: ['Latte', 'espresso'],
        shadowingCompleted: true,
      }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      progress: {
        listenedLineIds: ['coffee-01'],
        favorites: ['latte', 'espresso'],
        shadowingCompleted: true,
      },
    });

    const stored = await fetch(`${baseUrl}/api/english-practice/progress`);
    await expect(stored.json()).resolves.toMatchObject({
      progress: { favorites: ['latte', 'espresso'] },
    });

    activeUser = otherUser;
    const isolated = await fetch(`${baseUrl}/api/english-practice/progress`);
    await expect(isolated.json()).resolves.toMatchObject({
      progress: { listenedLineIds: [], favorites: [] },
    });
  });
});
