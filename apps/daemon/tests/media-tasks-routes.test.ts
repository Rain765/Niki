import type http from 'node:http';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { insertMediaTask } from '../src/media-tasks.js';
import { readProjectFile } from '../src/projects.js';
import { startServer } from '../src/server.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

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

  it('restores the latest tutorial video, files, presets, and task in one request', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon tests');
    const projectsRoot = path.join(dataDir, 'projects');
    const db = openDatabase(process.cwd(), { dataDir });
    const olderProjectId = `project_${randomUUID()}`;
    const latestProjectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now();

    insertProject(db, {
      id: olderProjectId,
      name: 'BiuMoney · Top Up guide',
      skillId: 'hyperframes',
      createdAt: now - 20,
      updatedAt: now - 20,
      metadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
        loanVideoPreset: {
          version: 1,
          brand: 'biumoney',
          purpose: 'top-up-guide',
        },
      },
    });
    insertProject(db, {
      id: latestProjectId,
      name: 'ZamLoan · Anti-fraud',
      skillId: 'hyperframes',
      createdAt: now - 10,
      updatedAt: now - 10,
      metadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
        videoAspect: '9:16',
        loanVideoPreset: {
          version: 1,
          brand: 'zamloan',
          purpose: 'anti-fraud',
        },
      },
    });
    await Promise.all([olderProjectId, latestProjectId].map(async (projectId) => {
      const dir = path.join(projectsRoot, projectId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${projectId}.mp4`), Buffer.from('video'));
    }));
    insertMediaTask(db, {
      id: taskId,
      projectId: latestProjectId,
      status: 'done',
      surface: 'video',
      model: 'hyperframes-html',
      progress: ['complete'],
      file: {
        name: `${latestProjectId}.mp4`,
        size: 5,
        mtime: now,
        kind: 'video',
        mime: 'video/mp4',
      },
      startedAt: now - 9,
      endedAt: now - 8,
      updatedAt: now - 8,
    });

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(
      `${started.url}/api/media/loan-video/restore?projectId=${latestProjectId}&taskId=${taskId}`,
    );
    const body = await response.json() as {
      configuredPresetKeys: string[];
      files: Array<{ name: string }>;
      project: { id: string } | null;
      task: { taskId: string; status: string } | null;
    };

    expect(response.status).toBe(200);
    expect(body.project?.id).toBe(latestProjectId);
    expect(body.files.map((file) => file.name)).toContain(`${latestProjectId}.mp4`);
    expect(body.configuredPresetKeys.sort()).toEqual([
      'biumoney:top-up-guide',
      'zamloan:anti-fraud',
    ]);
    expect(body.task).toMatchObject({ taskId, status: 'done' });
  });

  it('builds and persists a tutorial MP4 directly from a storyboard media task', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon tests');
    const projectsRoot = path.join(dataDir, 'projects');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectId = `project_${randomUUID()}`;
    const now = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Direct tutorial video',
      createdAt: now,
      updatedAt: now,
      metadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
        videoAspect: '1:1',
        videoLength: 1,
      },
    });
    const inputsDir = path.join(projectsRoot, projectId, '.od-inputs');
    await mkdir(inputsDir, { recursive: true });
    for (let index = 1; index <= 3; index += 1) {
      await writeFile(path.join(inputsDir, `scene-${index}.png`), ONE_PIXEL_PNG);
    }

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(`${started.url}/api/projects/${projectId}/media/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: `loan-video-${randomUUID()}`,
        surface: 'video',
        model: 'hyperframes-html',
        output: 'direct-tutorial.mp4',
        aspect: '1:1',
        length: 1,
        loanVideoStoryboard: {
          version: 2,
          title: 'How to apply',
          product: 'zamloan',
          language: 'en',
          aspectRatio: '1:1',
          durationSeconds: 1,
          narration: false,
          subtitles: true,
          scenes: [1, 2, 3].map((index) => ({
            id: `step-${index}`,
            index,
            screenshotAttachmentIndex: index,
            screenshotOriginalName: `scene-${index}.png`,
            assetRef: `.od-inputs/scene-${index}.png`,
            text: `Step ${index}`,
            captionEnabled: true,
            voiceoverEnabled: false,
            terminal: index === 3,
          })),
          transitions: [
            {
              fromSceneId: 'step-1',
              toSceneId: 'step-2',
              action: { type: 'tap', x: 0.5, y: 0.75 },
            },
            {
              fromSceneId: 'step-2',
              toSceneId: 'step-3',
              action: { type: 'auto' },
            },
          ],
        },
      }),
    });
    expect(response.status).toBe(202);
    const accepted = await response.json() as { taskId: string };

    type TaskSnapshot = {
      status?: string;
      file?: { name?: string; size?: number };
      error?: { message?: string };
      nextSince?: number;
    };
    let terminal: TaskSnapshot | null = null;
    let since = 0;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const waitResponse = await fetch(
        `${started.url}/api/media/tasks/${encodeURIComponent(accepted.taskId)}/wait`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ since, timeoutMs: 5_000 }),
        },
      );
      terminal = await waitResponse.json() as TaskSnapshot;
      since = terminal?.nextSince ?? since;
      if (terminal?.status === 'done' || terminal?.status === 'failed') break;
    }

    expect(terminal).toMatchObject({
      status: 'done',
      file: { name: 'direct-tutorial.mp4' },
    });
    expect(terminal?.file?.size).toBeGreaterThan(0);
    const persisted = await readProjectFile(projectsRoot, projectId, 'direct-tutorial.mp4');
    expect(persisted.size).toBe(terminal?.file?.size);
  }, 120_000);
});
