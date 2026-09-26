import {
  autoPosterBrandLabel,
  buildLoanPosterScenePrompts,
  LOAN_POSTER_SKILL_ID,
  loadZambiaPosterReference,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
} from './zambia-posters';
import type { Project } from '../../types';
import { fetchProjectFiles } from '../../providers/registry';
import { listProjects, patchProject } from '../../state/projects';

const IMAGE_MODEL = 'gpt-image-2';

interface DirectLoanPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
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

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compactDateKey(dateKey: string): string {
  return dateKey.replaceAll('-', '');
}

/**
 * Starts a fresh project on the next one-click generation. Reloads and later
 * days keep using the last chat; only the visible "New chat" action resets it.
 */
export function resetDirectLoanPosterSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, NEW_CHAT_SESSION);
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
  const storedProjectId = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  const projects = await listProjects();
  const reusableProject = storedProjectId === NEW_CHAT_SESSION
    ? null
    : projects.find((project) => (
      project.id === storedProjectId
      && project.metadata?.directGeneration?.kind === 'loan-poster'
    )) ?? (
      storedProjectId === null
        ? [...projects]
          .filter((project) => project.metadata?.directGeneration?.kind === 'loan-poster')
          .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
        : null
    );
  const prefix = `${options.brand}-poster`;
  let project: Project;
  let existingFiles = reusableProject
    ? await fetchProjectFiles(reusableProject.id)
    : [];
  const previousDirect = reusableProject?.metadata?.directGeneration;
  const outputPrefixes = Array.from(new Set([
    ...(previousDirect?.outputPrefixes ?? [previousDirect?.outputPrefix ?? prefix]),
    prefix,
  ]));
  const completedOutputCount = existingFiles.filter((file) => (
    file.kind === 'image'
    && outputPrefixes.some((outputPrefix) => file.name.startsWith(outputPrefix))
  )).length;
  const previousAcceptedBatchCount = previousDirect?.status === 'failed'
    ? Math.max(0, (previousDirect.batchCount ?? 1) - 1)
    : previousDirect?.batchCount ?? (completedOutputCount > 0 ? 1 : 0);
  const requestedAt = Date.now();
  const preparingMetadata = {
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
      referencePath: previousDirect?.referencePath,
      status: 'preparing' as const,
      requestedAt,
      lastError: undefined,
      failedAt: undefined,
    },
  };

  if (reusableProject) {
    const patched = await patchProject(reusableProject.id, {
      metadata: preparingMetadata,
      updatedAt: requestedAt,
    });
    if (!patched) {
      throw new DirectLoanPosterRequestError({
        stage: 'create-project',
        status: 500,
        detail: '无法更新今日海报项目。',
      });
    }
    project = patched;
    logStage('project-reused', project.id);
  } else {
    const projectId = browserUuid();
    const createResponse = await fetch('/api/projects', {
      method: 'POST',
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
    project = created.project;
    existingFiles = [];
    logStage('project-created', project.id);
  }

  let committedProject: Project;
  let referencePath = previousDirect?.referencePath;
  try {
    if (!referencePath) {
      const referenceFile = await loadZambiaPosterReference();
      const form = new FormData();
      form.append('files', referenceFile);
      const uploadResponse = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/upload?visibility=internal`,
        { method: 'POST', body: form },
      );
      await assertApiResponse(uploadResponse, 'upload-reference');
      const uploaded = (await uploadResponse.json()) as { files?: UploadedFile[] };
      referencePath = uploaded.files?.[0]?.path;
      if (!referencePath) throw new Error('Brand reference path is missing.');
      logStage('reference-uploaded', project.id);
    } else {
      logStage('reference-reused', project.id);
    }

    const datedOutputPrefix = `${prefix}-${compactDateKey(dateKey)}`;
    const nextOutputNumber = existingFiles.reduce((maximum, file) => {
      const match = file.name.match(
        new RegExp(`^${datedOutputPrefix}-(\\d+)\\.png$`, 'i'),
      );
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    const prompts = buildLoanPosterScenePrompts({
      ...options,
      variationSeed: project.id,
      variationOffset: nextOutputNumber - 1,
    });
    const responses = await Promise.all(
      prompts.map((prompt, index) => fetch(
        `/api/projects/${encodeURIComponent(project.id)}/media/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            surface: 'image',
            model: IMAGE_MODEL,
            quality: 'low',
            aspect: options.aspectRatio,
            image: referencePath,
            output: `${datedOutputPrefix}-${String(nextOutputNumber + index).padStart(3, '0')}.png`,
            prompt,
          }),
        },
      )),
    );
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      await assertApiResponse(failed, 'start-generation');
    }

    const queuedAt = Date.now();
    const committed = await patchProject(project.id, {
      metadata: {
        ...preparingMetadata,
        directGeneration: {
          ...preparingMetadata.directGeneration,
          expectedOutputs: completedOutputCount + options.count,
          batchCount: previousAcceptedBatchCount + 1,
          referencePath,
          status: 'queued',
          queuedAt,
        },
      },
      updatedAt: queuedAt,
    });
    if (!committed) {
      throw new DirectLoanPosterRequestError({
        stage: 'start-generation',
        status: 500,
        detail: '生成任务已提交，但无法保存项目状态。',
      });
    }
    committedProject = committed;
    logStage('generation-queued', project.id);
  } catch (reason) {
    const failureDetail = reason instanceof DirectLoanPosterRequestError
      ? reason.detail ?? reason.message
      : reason instanceof Error
        ? reason.message
        : '未知错误';
    const failedAt = Date.now();
    await patchProject(project.id, {
      metadata: {
        ...preparingMetadata,
        directGeneration: {
          ...preparingMetadata.directGeneration,
          referencePath,
          status: 'failed',
          failedAt,
          lastError: failureDetail,
        },
      },
      updatedAt: failedAt,
    });
    throw reason;
  }

  // Only expose/navigate to the project after every generation request has
  // been accepted. Opening it earlier hides setup failures when Home unmounts
  // and leaves the destination waiting forever for tasks that were never
  // queued.
  window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, project.id);
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
