import {
  autoPosterBrandLabel,
  autoPosterUsesZReference,
  buildLoanPosterScenePrompts,
  LOAN_POSTER_SKILL_ID,
  loadZamloanLogo,
  loadZambiaPosterReference,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
} from './zambia-posters';
import type { DirectLoanPosterBatch } from '@open-design/contracts';
import type { Project, ProjectMetadata } from '../../types';
import { fetchProjectFiles } from '../../providers/registry';
import { listProjects, patchProject } from '../../state/projects';

const IMAGE_MODEL = 'gpt-image-2';

interface DirectLoanPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
  sessionScope?: string;
}

interface CreatedProject {
  project: Project;
}

interface UploadedFile {
  path: string;
}

type DirectLoanPosterStage = 'create-project' | 'upload-reference' | 'start-generation';

const NEW_CHAT_SESSION = '__new__';
const LAST_PROJECT_STORAGE_KEY = 'niki:direct-loan-poster:last-project';

function lastProjectStorageKey(sessionScope?: string): string {
  const scope = sessionScope?.trim();
  return scope
    ? `${LAST_PROJECT_STORAGE_KEY}:${encodeURIComponent(scope)}`
    : LAST_PROJECT_STORAGE_KEY;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compactDateKey(dateKey: string): string {
  return dateKey.replaceAll('-', '');
}

function directGenerationMetadata(
  metadata: ProjectMetadata,
): NonNullable<ProjectMetadata['directGeneration']> {
  if (!metadata.directGeneration) {
    throw new Error('Direct loan-poster metadata is missing.');
  }
  return metadata.directGeneration;
}

/**
 * Starts a fresh project on the next one-click generation. Reloads and later
 * days keep using the last chat; only the visible "New chat" action resets it.
 */
export function resetDirectLoanPosterSession(sessionScope?: string): void {
  if (typeof window === 'undefined') return;
  if (sessionScope) {
    window.localStorage.setItem(lastProjectStorageKey(sessionScope), NEW_CHAT_SESSION);
    return;
  }
  window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, NEW_CHAT_SESSION);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(`${LAST_PROJECT_STORAGE_KEY}:`)) {
      window.localStorage.setItem(key, NEW_CHAT_SESSION);
    }
  }
}

export class DirectLoanPosterRequestError extends Error {
  readonly stage: DirectLoanPosterStage;
  readonly status: number;
  readonly code: string | null;
  readonly detail: string | null;

  constructor(options: {
    stage: DirectLoanPosterStage;
    status: number;
    code?: string | null;
    detail?: string | null;
  }) {
    const stageLabel = {
      'create-project': '创建海报项目',
      'upload-reference': '上传品牌参考图',
      'start-generation': '启动图片生成',
    }[options.stage];
    const detail = options.detail?.trim();
    super(`${stageLabel}失败（HTTP ${options.status}）${detail ? `：${detail}` : '。'}`);
    this.name = 'DirectLoanPosterRequestError';
    this.stage = options.stage;
    this.status = options.status;
    this.code = options.code ?? null;
    this.detail = detail || null;
  }
}

export function isDirectLoanPosterAuthenticationError(
  reason: unknown,
): reason is DirectLoanPosterRequestError {
  return (
    reason instanceof DirectLoanPosterRequestError
    && (reason.status === 401 || reason.code === 'authentication_required')
  );
}

/**
 * Creates the poster project and starts provider image jobs immediately.
 * The full Home uses this path so one-click generation never needs a second
 * lightweight Home or a planning-agent round trip.
 */
export async function startDirectLoanPosterProject(
  options: DirectLoanPosterOptions,
  onProjectCreated?: (project: Project) => void,
): Promise<{ projectId: string }> {
  const startedAt = performance.now();
  const logStage = (stage: string, projectId?: string) => {
    console.info(
      `[direct-loan-poster] stage=${stage} elapsedMs=${Math.round(performance.now() - startedAt)}` +
        `${projectId ? ` projectId=${projectId}` : ''}`,
    );
  };
  const brandLabel = autoPosterBrandLabel(options.brand);
  const dateKey = localDateKey();
  const storageKey = lastProjectStorageKey(options.sessionScope);
  const storedProjectId = window.localStorage.getItem(storageKey);
  const projects = await listProjects();
  let reusableProject = storedProjectId === NEW_CHAT_SESSION
    ? null
    : projects.find((project) => (
      project.id === storedProjectId
      && project.metadata?.directGeneration?.kind === 'loan-poster'
    )) ?? (
      storedProjectId === null && !options.sessionScope
        ? [...projects]
          .filter((project) => project.metadata?.directGeneration?.kind === 'loan-poster')
          .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
        : null
    );
  const prefix = `${options.brand}-poster`;
  let project: Project | null = null;
  let existingFiles: Awaited<ReturnType<typeof fetchProjectFiles>> = [];
  let previousDirect = reusableProject?.metadata?.directGeneration;
  let outputPrefixes = Array.from(new Set([
    ...(previousDirect?.outputPrefixes ?? [previousDirect?.outputPrefix ?? prefix]),
    prefix,
  ]));
  // Metadata gives us a cheap provisional count. Historical files can be
  // numerous, so never block navigation and the preparing state on a full
  // file scan.
  let completedOutputCount = Math.max(0, previousDirect?.expectedOutputs ?? 0);
  let previousAcceptedBatchCount = previousDirect?.status === 'failed'
    ? Math.max(0, (previousDirect.batchCount ?? 1) - 1)
    : previousDirect?.batchCount ?? (completedOutputCount > 0 ? 1 : 0);
  const requestedAt = Date.now();
  const batchId = browserUuid();
  const preparingBatch: DirectLoanPosterBatch = {
    id: batchId,
    status: 'preparing',
    requestedAt,
    expectedOutputs: options.count,
    outputNames: [],
    brand: options.brand,
    aspectRatio: options.aspectRatio,
  };
  const previousBatches = previousDirect?.batches ?? [];
  let preparingMetadata: ProjectMetadata = {
    ...(reusableProject?.metadata ?? {}),
    kind: 'image' as const,
    imageModel: IMAGE_MODEL,
    imageAspect: options.aspectRatio,
    directGeneration: {
      kind: 'loan-poster' as const,
      // Files are the durable source of truth. A previous setup may have
      // failed after reserving an expected count but before queuing a task.
      expectedOutputs: completedOutputCount,
      outputPrefix: previousDirect?.outputPrefix ?? prefix,
      outputPrefixes,
      sessionDate: dateKey,
      batchCount: previousAcceptedBatchCount,
      status: 'preparing' as const,
      requestedAt,
      activeBatchId: batchId,
      batches: [...previousBatches, preparingBatch],
      lastError: undefined,
      failedAt: undefined,
    },
  };

  if (reusableProject) {
    const patched = await patchProject(reusableProject.id, {
      metadata: preparingMetadata,
      updatedAt: requestedAt,
    });
    if (patched) {
      project = patched;
      logStage('project-reused', project.id);
    } else {
      // Reusing the previous chat is an optimization, not a prerequisite for
      // image generation. Legacy projects can be visible but no longer
      // writable by the current account, so fall back to a fresh project.
      logStage('project-reuse-rejected', reusableProject.id);
      window.localStorage.removeItem(storageKey);
      reusableProject = null;
      existingFiles = [];
      previousDirect = undefined;
      outputPrefixes = [prefix];
      completedOutputCount = 0;
      previousAcceptedBatchCount = 0;
      preparingMetadata = {
        kind: 'image' as const,
        imageModel: IMAGE_MODEL,
        imageAspect: options.aspectRatio,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 0,
          outputPrefix: prefix,
          outputPrefixes,
          sessionDate: dateKey,
          batchCount: 0,
          status: 'preparing' as const,
          requestedAt,
          activeBatchId: batchId,
          batches: [preparingBatch],
          lastError: undefined,
          failedAt: undefined,
        },
      };
    }
  }

  if (!project) {
    const projectId = browserUuid();
    const createResponse = await fetch('/api/projects', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: `${brandLabel} 贷款海报 · ${dateKey}`,
        skillId: LOAN_POSTER_SKILL_ID,
        designSystemId: null,
        metadata: {
          ...preparingMetadata,
        },
      }),
    });
    await assertApiResponse(createResponse, 'create-project');
    const created = (await createResponse.json()) as CreatedProject;
    project = {
      ...created.project,
      metadata: created.project.metadata ?? preparingMetadata,
    };
    existingFiles = [];
    logStage('project-created', project.id);
  }

  // Surface the selected chat immediately. Upload and generation continue
  // while the destination shows the real preparing state.
  window.localStorage.setItem(storageKey, project.id);
  onProjectCreated?.(project);

  let committedProject: Project;
  let batchOutputNames: string[] = [];
  try {
    if (reusableProject) {
      try {
        existingFiles = await fetchProjectFiles(project.id);
        completedOutputCount = existingFiles.filter((file) => (
          file.kind === 'image'
          && outputPrefixes.some((outputPrefix) => file.name.startsWith(outputPrefix))
        )).length;
        previousAcceptedBatchCount = previousDirect?.status === 'failed'
          ? Math.max(0, (previousDirect.batchCount ?? 1) - 1)
          : previousDirect?.batchCount ?? (completedOutputCount > 0 ? 1 : 0);
        preparingMetadata = {
          ...preparingMetadata,
          directGeneration: {
            ...directGenerationMetadata(preparingMetadata),
            expectedOutputs: completedOutputCount,
            batchCount: previousAcceptedBatchCount,
          },
        };
        logStage('project-files-loaded', project.id);
      } catch (reason) {
        console.warn('[direct-loan-poster] historical file scan failed; continuing', reason);
        logStage('project-files-unavailable', project.id);
      }
    }

    let referencePath: string | undefined;
    let logoPath: string | undefined;
    if (autoPosterUsesZReference(options.brand)) {
      const referenceFile = await loadZambiaPosterReference();
      const form = new FormData();
      form.append('files', referenceFile);
      const uploadResponse = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/upload?visibility=internal`,
        { method: 'POST', credentials: 'include', body: form },
      );
      await assertApiResponse(uploadResponse, 'upload-reference');
      const uploaded = (await uploadResponse.json()) as { files?: UploadedFile[] };
      referencePath = uploaded.files?.[0]?.path;
      if (!referencePath) throw new Error('Brand reference path is missing.');
      logStage('reference-uploaded', project.id);

      const logoFile = await loadZamloanLogo();
      const logoForm = new FormData();
      logoForm.append('files', logoFile);
      const logoResponse = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/upload?visibility=internal`,
        { method: 'POST', credentials: 'include', body: logoForm },
      );
      await assertApiResponse(logoResponse, 'upload-reference');
      const uploadedLogo = (await logoResponse.json()) as { files?: UploadedFile[] };
      logoPath = uploadedLogo.files?.[0]?.path;
      if (!logoPath) throw new Error('Zamloan logo path is missing.');
      logStage('logo-uploaded', project.id);
    }

    const datedOutputPrefix = `${prefix}-${compactDateKey(dateKey)}`;
    const highestExistingOutputNumber = existingFiles.reduce((maximum, file) => {
      const match = file.name.match(
        new RegExp(`^${datedOutputPrefix}-(\\d+)\\.png$`, 'i'),
      );
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
    const nextOutputNumber = Math.max(
      highestExistingOutputNumber,
      previousDirect?.expectedOutputs ?? 0,
    ) + 1;
    const prompts = buildLoanPosterScenePrompts({
      ...options,
      variationSeed: project.id,
      variationOffset: nextOutputNumber - 1,
    });
    batchOutputNames = prompts.map((_, index) => (
      `${datedOutputPrefix}-${String(nextOutputNumber + index).padStart(3, '0')}.png`
    ));
    const queuedAt = Date.now();
    const queuedBatches = (directGenerationMetadata(preparingMetadata).batches ?? []).map((batch) => (
      batch.id === batchId
        ? {
          ...batch,
          status: 'queued' as const,
          queuedAt,
          expectedOutputs: batchOutputNames.length,
          outputNames: batchOutputNames,
        }
        : batch
    ));
    const committed = await patchProject(project.id, {
      metadata: {
        ...preparingMetadata,
        directGeneration: {
          ...directGenerationMetadata(preparingMetadata),
          expectedOutputs: completedOutputCount + batchOutputNames.length,
          batchCount: previousAcceptedBatchCount + 1,
          status: 'queued',
          queuedAt,
          activeBatchId: batchId,
          batches: queuedBatches,
        },
      },
      updatedAt: queuedAt,
    });
    if (!committed) {
      throw new DirectLoanPosterRequestError({
        stage: 'start-generation',
        status: 500,
        detail: '无法保存生成批次，图片任务尚未提交。',
      });
    }
    committedProject = committed;

    const responses = await Promise.all(
      prompts.map((prompt, index) => fetch(
        `/api/projects/${encodeURIComponent(project.id)}/media/generate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            surface: 'image',
            model: IMAGE_MODEL,
            quality: 'low',
            aspect: options.aspectRatio,
            ...(referencePath ? { image: referencePath } : {}),
            ...(logoPath ? { overlayLogo: logoPath } : {}),
            output: batchOutputNames[index],
            prompt,
          }),
        },
      )),
    );
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      await assertApiResponse(failed, 'start-generation');
    }
    logStage('generation-queued', project.id);
  } catch (reason) {
    const failureDetail = reason instanceof DirectLoanPosterRequestError
      ? reason.detail ?? reason.message
      : reason instanceof Error
        ? reason.message
        : '未知错误';
    const failedAt = Date.now();
    const failedBatches = (directGenerationMetadata(preparingMetadata).batches ?? []).map((batch) => (
      batch.id === batchId
        ? {
          ...batch,
          status: 'failed' as const,
          failedAt,
          expectedOutputs: batchOutputNames.length || batch.expectedOutputs,
          outputNames: batchOutputNames,
          lastError: failureDetail,
        }
        : batch
    ));
    const failedProject = await patchProject(project.id, {
      metadata: {
        ...preparingMetadata,
        directGeneration: {
          ...directGenerationMetadata(preparingMetadata),
          status: 'failed',
          failedAt,
          lastError: failureDetail,
          activeBatchId: batchId,
          batches: failedBatches,
        },
      },
      updatedAt: failedAt,
    }).catch(() => null);
    if (failedProject) onProjectCreated?.(failedProject);
    throw reason;
  }

  window.localStorage.setItem(storageKey, project.id);
  onProjectCreated?.(committedProject);

  return { projectId: project.id };
}

async function assertApiResponse(
  response: Response,
  stage: DirectLoanPosterStage,
): Promise<void> {
  if (response.ok) return;

  const raw = await response.text().catch(() => '');
  let code: string | null = null;
  let detail = raw.trim();
  if (raw) {
    try {
      const payload = JSON.parse(raw) as {
        error?: unknown;
        message?: unknown;
      };
      if (typeof payload.error === 'string') code = payload.error;
      const payloadDetail = typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : null;
      if (payloadDetail) detail = payloadDetail;
    } catch {
      // Keep the plain-text response as the diagnostic detail.
    }
  }

  throw new DirectLoanPosterRequestError({
    stage,
    status: response.status,
    code,
    detail,
  });
}

function browserUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
