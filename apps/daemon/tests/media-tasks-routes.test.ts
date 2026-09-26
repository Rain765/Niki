import * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { insertMediaTask } from '../src/media-tasks.js';
import { registerMediaRoutes } from '../src/media-routes.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import { startServer } from '../src/server.js';

describe('media task route recovery', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    closeDatabase();
  });

  it('recovers a pre-restart running task so wait returns interrupted instead of 404', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now() - 5_000;

    insertProject(db, {
      id: projectId,
      name: 'Recovered media project',
      createdAt: now,
      updatedAt: now,
    });
    insertMediaTask(db, {
      id: taskId,
      projectId,
      status: 'running',
      surface: 'video',
      model: 'seedance-2',
      progress: ['provider task accepted'],
      startedAt: now,
      updatedAt: now,
    });

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(`${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });
    const body = await response.json() as {
      status?: string;
      progress?: string[];
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe('interrupted');
    expect(body.progress).toEqual(['provider task accepted']);
    expect(body.error).toMatchObject({
      code: 'DAEMON_RESTART',
      message: 'media task interrupted by daemon restart',
    });
  });

  it('allows an authenticated project owner to queue media when an embedded webview omits Origin', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, _res, next) => runAsNikiUser({
      id: 'user-1',
      tenantKey: 'tenant-1',
      openId: 'open-1',
      name: 'Colleague',
      role: 'member',
      createdAt: 1,
      updatedAt: 1,
    }, () => next()));

    registerMediaRoutes(app, {
      db: {},
      http: {
        isLocalSameOrigin: () => false,
        resolvedPortRef: { current: 17456 },
      },
      paths: {
        PROJECT_ROOT: process.cwd(),
        PROJECTS_DIR: process.cwd(),
        RUNTIME_DATA_DIR: process.cwd(),
      },
      ids: { randomUUID: () => 'media-task-1' },
      media: {
        MEDIA_PROVIDERS: [],
        IMAGE_MODELS: [],
        VIDEO_MODELS: [],
        AUDIO_MODELS_BY_KIND: {},
        MEDIA_ASPECTS: [],
        VIDEO_LENGTHS_SEC: [],
        AUDIO_DURATIONS_SEC: [],
        createMediaTask: () => ({
          id: 'media-task-1',
          projectId: 'project-1',
          status: 'queued',
          surface: 'image',
          model: 'gpt-image-2',
          progress: [],
          startedAt: Date.now(),
          updatedAt: Date.now(),
        }),
        persistMediaTask: () => undefined,
        generateMedia: () => new Promise(() => undefined),
      },
      projectStore: {
        getProject: () => ({ id: 'project-1', name: 'Owned project' }),
      },
      appConfig: {},
      orbit: {},
      nativeDialogs: {},
      projectFiles: {},
      conversations: {},
      research: {},
    } as any);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server?.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/projects/project-1/media/generate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          surface: 'image',
          model: 'gpt-image-2',
          prompt: 'Generate one poster',
        }),
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      taskId: 'media-task-1',
      status: 'running',
    });
  });
});
