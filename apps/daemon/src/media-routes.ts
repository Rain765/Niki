import type { Express } from 'express';

import { appendImageNodes } from './canvas-store.js';
import { currentNikiUser } from './niki-auth-context.js';
import {
  assertNikiGenerationAllowed,
  NikiQuotaExceededError,
} from './niki-quota.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterMediaRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids' | 'media' | 'appConfig' | 'orbit' | 'nativeDialogs' | 'projectStore' | 'projectFiles' | 'conversations' | 'research'> {}

function mediaTaskFailure(err: any): {
  message: string;
  status: number;
  code?: string;
  name: string;
} {
  const message = String(err?.message ?? err);
  const causeMessage = typeof err?.cause?.message === 'string'
    ? err.cause.message
    : undefined;
  const code = typeof err?.code === 'string'
    ? err.code
    : typeof err?.cause?.code === 'string'
      ? err.cause.code
      : undefined;
  const isNetworkFailure = err instanceof TypeError && message === 'fetch failed';
  return {
    message: causeMessage && causeMessage !== message
      ? `${message}: ${causeMessage}`
      : message,
    status: typeof err?.status === 'number' ? err.status : (isNetworkFailure ? 502 : 400),
    ...(code ? { code } : {}),
    name: typeof err?.name === 'string' ? err.name : 'Error',
  };
}

function oneLine(value: string, limit = 300): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

interface MediaTaskAdmissionTask {
  id: string;
  projectId: string;
  status: string;
  startedAt?: number;
}

export function resolveMediaGenerationTaskAdmission<T extends MediaTaskAdmissionTask>(options: {
  clientRequestId: unknown;
  projectId: string;
  getTask: (taskId: string) => T | null;
  randomUUID: () => string;
}): { taskId: string; existingTask: T | null } {
  if (options.clientRequestId === undefined || options.clientRequestId === null) {
    return { taskId: options.randomUUID(), existingTask: null };
  }
  if (
    typeof options.clientRequestId !== 'string'
    || !/^[A-Za-z0-9:_-]{1,160}$/.test(options.clientRequestId)
  ) {
    const error = new Error('clientRequestId must be 1-160 safe identifier characters');
    Object.assign(error, { status: 400, code: 'invalid_client_request_id' });
    throw error;
  }
  const existingTask = options.getTask(options.clientRequestId);
  if (existingTask && existingTask.projectId !== options.projectId) {
    const error = new Error('clientRequestId already belongs to another project');
    Object.assign(error, { status: 409, code: 'client_request_id_conflict' });
    throw error;
  }
  return {
    taskId: options.clientRequestId,
    existingTask,
  };
}

export function registerMediaRoutes(app: Express, ctx: RegisterMediaRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, requireLocalDaemonRequest, isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const { PROJECT_ROOT, PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;
  const { MEDIA_PROVIDERS, IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS_BY_KIND, MEDIA_ASPECTS, VIDEO_LENGTHS_SEC, AUDIO_DURATIONS_SEC, readMaskedConfig, writeConfig, generateMedia, createMediaTask, persistMediaTask, appendTaskProgress, notifyTaskWaiters, getLiveMediaTask, mediaTaskSnapshot, listMediaTasksByProject, reconcileDirectLoanPosterProject, listElevenLabsVoiceOptions } = ctx.media;
  const { readAppConfig, writeAppConfig } = ctx.appConfig;
  const { orbitService } = ctx.orbit;
  const { openNativeFolderDialog } = ctx.nativeDialogs;
  const { getProject } = ctx.projectStore;
  const { writeProjectFile } = ctx.projectFiles;
  const { insertConversation, upsertMessage } = ctx.conversations;
  const { searchResearch, ResearchError } = ctx.research;
  const getResolvedPort = () => resolvedPortRef.current;
  app.get('/api/media/models', (_req, res) => {
    res.json({
      providers: MEDIA_PROVIDERS,
      image: IMAGE_MODELS,
      video: VIDEO_MODELS,
      audio: AUDIO_MODELS_BY_KIND,
      aspects: MEDIA_ASPECTS,
      videoLengthsSec: VIDEO_LENGTHS_SEC,
      audioDurationsSec: AUDIO_DURATIONS_SEC,
    });
  });

  app.get('/api/media/config', async (_req, res) => {
    try {
      const cfg = await readMaskedConfig(PROJECT_ROOT);
      res.json(cfg);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/media/config', async (req, res) => {
    try {
      const cfg = await writeConfig(PROJECT_ROOT, req.body);
      res.json(cfg);
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      res
        .status(status)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/media/providers/elevenlabs/voices', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const voices = await listElevenLabsVoiceOptions(PROJECT_ROOT, { limit });
      res.json({ voices });
    } catch (err: any) {
      const message = String(err && err.message ? err.message : err);
      const status = message.includes('no ElevenLabs API key') ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      res.json({ config });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await writeAppConfig(RUNTIME_DATA_DIR, req.body);
      orbitService.configure(config.orbit);
      res.json({ config });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/orbit/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      res.json(await orbitService.status());
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/orbit/run', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      res.json(await orbitService.start('manual'));
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // Native OS folder picker dialog. Returns { path: string | null }.
  app.post('/api/dialog/open-folder', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const selected = await openNativeFolderDialog();
      res.json({ path: selected });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/projects/:id/media/generate', async (req, res) => {
    // Niki's authenticated web UI may run inside an embedded webview that
    // omits the Origin header. The auth middleware has already resolved the
    // session and project ownership before this route runs, so an authenticated
    // Niki user is allowed here. Auth-disabled daemon installs retain the
    // original local UI / CLI restriction.
    if (!currentNikiUser() && !isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: media generation is restricted to the local UI / CLI',
      });
    }

    try {
      const projectId = req.params.id;
      const project = getProject(db, projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });
      const nikiUser = currentNikiUser();
      if (nikiUser) {
        await assertNikiGenerationAllowed(
          db,
          PROJECTS_DIR,
          nikiUser.id,
        );
      }
      // Resolve immediately before the synchronous insert. This keeps two
      // concurrent retries from both observing a missing task across the
      // asynchronous quota check above.
      const admission = resolveMediaGenerationTaskAdmission({
        clientRequestId: req.body?.clientRequestId,
        projectId,
        getTask: getLiveMediaTask,
        randomUUID,
      });
      if (admission.existingTask) {
        return res.status(202).json({
          taskId: admission.existingTask.id,
          status: admission.existingTask.status,
          startedAt: admission.existingTask.startedAt,
          idempotentReplay: true,
        });
      }

      const taskId = admission.taskId;
      const task = createMediaTask(taskId, projectId, {
        surface: req.body?.surface,
        model: req.body?.model,
      });
      console.error(
        `[task ${taskId.slice(0, 8)}] stage=queued startedAt=${new Date(task.startedAt).toISOString()} ` +
          `model=${req.body?.model} ` +
          `surface=${req.body?.surface} ` +
          `image=${req.body?.image ? 'yes' : 'no'} ` +
          `compositionDir=${req.body?.compositionDir ? 'yes' : 'no'}`,
      );

      task.status = 'running';
      persistMediaTask(task);
      generateMedia({
        projectRoot: PROJECT_ROOT,
        projectsRoot: PROJECTS_DIR,
        projectId,
        surface: req.body?.surface,
        model: req.body?.model,
        prompt: req.body?.prompt,
        output: req.body?.output,
        aspect: req.body?.aspect,
        quality: req.body?.quality,
        loanPosterOutput:
          project.metadata?.directGeneration?.kind === 'loan-poster',
        length:
          typeof req.body?.length === 'number' ? req.body.length : undefined,
        duration:
          typeof req.body?.duration === 'number'
            ? req.body.duration
            : undefined,
        voice: req.body?.voice,
        audioKind: req.body?.audioKind,
        language: typeof req.body?.language === 'string' ? req.body.language : undefined,
        loop: typeof req.body?.loop === 'boolean' ? req.body.loop : undefined,
        promptInfluence: typeof req.body?.promptInfluence === 'number'
          ? req.body.promptInfluence
          : undefined,
        compositionDir: req.body?.compositionDir,
        image: req.body?.image,
        overlayZ: req.body?.overlayZ,
        overlayLogo: req.body?.overlayLogo,
        overlayLogoAnchor: req.body?.overlayLogoAnchor,
        foregroundPrompt: req.body?.foregroundPrompt,
        posterHeadline: req.body?.posterHeadline,
        posterSubtitle: req.body?.posterSubtitle,
        posterTextAnchor: req.body?.posterTextAnchor,
        onProgress: (line: any) => appendTaskProgress(task, line),
      })
        .then((meta: any) => {
          task.status = 'done';
          task.file = meta;
          task.endedAt = Date.now();
          persistMediaTask(task);
          reconcileDirectLoanPosterProject(projectId);
          notifyTaskWaiters(task);
          // Drop generated images onto the project canvas. The canvas store
          // emits a `node-added` SSE event so an open canvas surface shows the
          // image live; if the canvas isn't open the node is simply persisted
          // and appears next time the canvas is opened.
          try {
            const kind = typeof meta?.kind === 'string' ? meta.kind : '';
            const mime = typeof meta?.mime === 'string' ? meta.mime : '';
            const name = typeof meta?.name === 'string' ? meta.name : '';
            const isImage = kind === 'image' || mime.startsWith('image/');
            if (isImage && name) {
              const src = `/api/projects/${encodeURIComponent(projectId)}/files/${name
                .split('/')
                .map((seg: string) => encodeURIComponent(seg))
                .join('/')}`;
              appendImageNodes(db, projectId, [{ src, alt: name }]);
            }
          } catch (canvasErr) {
            console.error(
              `[task ${taskId.slice(0, 8)}] canvas append skipped: ${String(canvasErr)}`,
            );
          }
          console.error(
            `[task ${taskId.slice(0, 8)}] stage=done size=${meta?.size} mime=${meta?.mime} ` +
              `provider=${meta?.providerId || 'unknown'} elapsedMs=${task.endedAt - task.startedAt}`,
          );
        })
        .catch((err: any) => {
          const failure = mediaTaskFailure(err);
          task.status = 'failed';
          task.error = {
            message: failure.message,
            status: failure.status,
            code: failure.code,
          };
          task.endedAt = Date.now();
          persistMediaTask(task);
          reconcileDirectLoanPosterProject(projectId);
          notifyTaskWaiters(task);
          console.error(
            `[task ${taskId.slice(0, 8)}] stage=failed elapsedMs=${task.endedAt - task.startedAt} ` +
              `status=${task.error.status} errorName=${failure.name} ` +
              `code=${failure.code || 'none'} message=${oneLine(task.error.message || '')}`,
          );
        });

      res.status(202).json({
        taskId,
        status: task.status,
        startedAt: task.startedAt,
      });
    } catch (err: any) {
      if (err instanceof NikiQuotaExceededError) {
        return res.status(err.status).json({
          error: err.message,
          code: err.code,
          quota: err.statusBody,
        });
      }
      const status = typeof err?.status === 'number' ? err.status : 400;
      const code = err?.code;
      const body: any = { error: String(err && err.message ? err.message : err) };
      if (code) body.code = code;
      res.status(status).json(body);
    }
  });

  app.post('/api/research/search', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: research search is restricted to the local UI / CLI',
      });
    }

    try {
      const result = await searchResearch({
        projectRoot: PROJECT_ROOT,
        query: req.body?.query,
        maxSources:
          typeof req.body?.maxSources === 'number'
            ? req.body.maxSources
            : undefined,
        providers: Array.isArray(req.body?.providers)
          ? req.body.providers
          : undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof ResearchError) {
        return res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
      }
      res.status(500).json({
        error: {
          code: 'RESEARCH_FAILED',
          message: String(err && err.message ? err.message : err),
        },
      });
    }
  });

  app.post('/api/media/tasks/:id/wait', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const taskId = req.params.id;
    const task = getLiveMediaTask(taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const since = Number.isFinite(req.body?.since) ? Number(req.body.since) : 0;
    const requestedTimeout = Number.isFinite(req.body?.timeoutMs)
      ? Number(req.body.timeoutMs)
      : 25_000;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 0), 25_000);

    const respond = () => {
      if (res.writableEnded) return;
      res.json(mediaTaskSnapshot(task, since));
    };

    if (
      task.status === 'done' ||
      task.status === 'failed' ||
      task.status === 'interrupted' ||
      task.progress.length > since
    ) {
      return respond();
    }

    let resolved = false;
    const wake = () => {
      if (resolved) return;
      resolved = true;
      task.waiters.delete(wake);
      clearTimeout(timer);
      respond();
    };
    task.waiters.add(wake);
    const timer = setTimeout(wake, timeoutMs);
    res.on('close', wake);
  });

  app.get('/api/projects/:id/media/tasks', (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const projectId = req.params.id;
    const includeDone =
      req.query.includeDone === '1' || req.query.includeDone === 'true';
    const tasks = listMediaTasksByProject(db, projectId, {
      includeTerminal: includeDone,
    }).map((t: any) => ({
        taskId: t.id,
        status: t.status,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        elapsed: Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 1000),
        surface: t.surface,
        model: t.model,
        progress: t.progress.slice(-3),
        progressCount: t.progress.length,
        ...(t.status === 'done' ? { file: t.file } : {}),
        ...(t.status === 'failed' || t.status === 'interrupted' ? { error: t.error } : {}),
      }));
    res.json({ tasks });
  });

  // Multi-file upload that the chat composer uses for paste/drop/picker.
  // Files land flat in the project folder; the response carries the same
  // metadata as listFiles so the client can stage them as ChatAttachments
  // without a separate refetch.

}
