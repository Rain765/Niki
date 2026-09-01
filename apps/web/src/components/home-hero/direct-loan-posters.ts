import {
  autoPosterBrandLabel,
  buildLoanPosterScenePlans,
  LOAN_POSTER_SKILL_ID,
  loadZamloanLogo,
  loadZamloanSafeScreen,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  type AutoPosterPurpose,
} from './zambia-posters';
import type { DirectLoanPosterBatch } from '@open-design/contracts';
import type { Project, ProjectMetadata } from '../../types';
import { fetchProjectFiles } from '../../providers/registry';
import { getProject, listProjects, patchProject } from '../../state/projects';

const IMAGE_MODEL = 'gpt-image-2';

interface DirectLoanPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
  purpose?: AutoPosterPurpose;
  sessionScope?: string;
}

interface CreatedProject {
  project: Project;
}

interface UploadedFile {
  path: string;
}

type DirectLoanPosterStage =
  | 'create-project'
  | 'upload-z-reference'
  | 'upload-logo'
  | 'upload-phone-screen'
  | 'start-generation';

const NEW_CHAT_SESSION = '__new__';
const LAST_PROJECT_STORAGE_KEY = 'niki:direct-loan-poster:last-project';
const UPLOAD_RETRY_DELAYS_MS = [250, 750] as const;
const RETRYABLE_UPLOAD_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const POSTER_REQUEST_TIMEOUT_MS = 15_000;

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

export function getDirectLoanPosterProjectId(sessionScope?: string): string | null {
  if (typeof window === 'undefined') return null;
  const projectId = window.localStorage.getItem(lastProjectStorageKey(sessionScope));
  return projectId && projectId !== NEW_CHAT_SESSION ? projectId : null;
}

/**
 * Resolves the current user's durable poster project across browsers and
 * devices. localStorage is only a fast pointer; SQLite-backed project state
 * remains the source of truth when a Feishu webview has an empty or stale
 * storage partition.
 */
export async function resolveDirectLoanPosterProject(
  sessionScope?: string,
): Promise<Project | null> {
  const storageKey = lastProjectStorageKey(sessionScope);
  const storedProjectId = window.localStorage.getItem(storageKey);
  if (storedProjectId === NEW_CHAT_SESSION) return null;

  const [storedProject, projects] = await Promise.all([
    storedProjectId ? getProject(storedProjectId) : Promise.resolve(null),
    listProjects(),
  ]);
  const candidates = [...projects];
  if (
    storedProject?.metadata?.directGeneration?.kind === 'loan-poster'
    && !candidates.some((project) => project.id === storedProject.id)
  ) {
    candidates.push(storedProject);
  }
  const latestProject = candidates
    .filter((project) => project.metadata?.directGeneration?.kind === 'loan-poster')
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  if (latestProject) {
    window.localStorage.setItem(storageKey, latestProject.id);
  } else if (storedProjectId) {
    window.localStorage.removeItem(storageKey);
  }
  return latestProject;
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
    const failureLabel = {
      'create-project': '创建海报项目失败',
      'upload-z-reference': '上传 Z 参考图失败',
      'upload-logo': '上传 Zamloan Logo 失败',
      'upload-phone-screen': '上传 Zamloan 官网安全页失败',
      'start-generation': '启动图片生成失败',
    }[options.stage];
    const detail = options.detail?.trim();
    const statusLabel = options.status > 0 ? `（HTTP ${options.status}）` : '';
    super(`${failureLabel}${statusLabel}${detail ? `：${detail}` : '。'}`);
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
  let reusableProject = await resolveDirectLoanPosterProject(options.sessionScope);
  const [bundledLogo, bundledPhoneScreen] = await Promise.all([
    options.brand === 'zamloan' ? loadZamloanLogo() : null,
    options.brand === 'zamloan' && options.purpose === 'anti-fraud'
      ? loadZamloanSafeScreen()
      : null,
  ]);
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
    purpose: options.purpose ?? 'acquisition',
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

    let logoPath: string | undefined;
    if (bundledLogo) {
      logoPath = await uploadPosterAsset(project.id, bundledLogo, 'upload-logo');
      logStage('logo-uploaded', project.id);
    }
    let phoneScreenPath: string | undefined;
    if (bundledPhoneScreen) {
      phoneScreenPath = await uploadPosterAsset(
        project.id,
        bundledPhoneScreen,
        'upload-phone-screen',
      );
      logStage('phone-screen-uploaded', project.id);
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
    const scenePlans = buildLoanPosterScenePlans({
      ...options,
      variationSeed: project.id,
      variationOffset: nextOutputNumber - 1,
    });
    batchOutputNames = scenePlans.map((_, index) => (
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
      scenePlans.map((scenePlan, index) => submitMediaGeneration(
        project.id,
        {
          clientRequestId: `loan-poster:${batchId}:${index}`,
          surface: 'image',
          model: IMAGE_MODEL,
          quality: options.purpose === 'anti-fraud' ? 'medium' : 'low',
          aspect: options.aspectRatio,
          ...(logoPath
            ? {
              overlayLogo: logoPath,
              overlayLogoAnchor: scenePlan.logoAnchor,
            }
            : {}),
          ...(scenePlan.headline && scenePlan.subtitle && scenePlan.textAnchor
            ? {
              posterHeadline: scenePlan.headline,
              posterSubtitle: scenePlan.subtitle,
              posterTextAnchor: scenePlan.textAnchor,
              posterCopyStyle: 'anti-fraud' as const,
            }
            : {}),
          ...(phoneScreenPath ? { overlayPhoneScreen: phoneScreenPath } : {}),
          output: batchOutputNames[index],
          prompt: scenePlan.prompt,
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

async function uploadPosterAsset(
  projectId: string,
  file: File,
  stage: 'upload-z-reference' | 'upload-logo' | 'upload-phone-screen',
): Promise<string> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/upload?visibility=internal`;

  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response;
    try {
      const form = new FormData();
      form.append('files', file);
      response = await fetchWithTimeout(url, {
        method: 'POST',
        credentials: 'include',
        body: form,
        keepalive: true,
      }, POSTER_REQUEST_TIMEOUT_MS);
    } catch (reason) {
      if (attempt >= UPLOAD_RETRY_DELAYS_MS.length) {
        throw new DirectLoanPosterRequestError({
          stage,
          status: 0,
          detail: reason instanceof Error ? reason.message : '网络连接中断。',
        });
      }
      console.warn(
        `[direct-loan-poster] stage=${stage} retry=${attempt + 1}`,
        reason,
      );
      await waitForUploadRetry(UPLOAD_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    if (!response.ok) {
      const canRetry = RETRYABLE_UPLOAD_STATUSES.has(response.status)
        && attempt < UPLOAD_RETRY_DELAYS_MS.length;
      if (!canRetry) await assertApiResponse(response, stage);
      console.warn(
        `[direct-loan-poster] stage=${stage} retry=${attempt + 1} status=${response.status}`,
      );
      await waitForUploadRetry(UPLOAD_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    const uploaded = (await response.json()) as { files?: UploadedFile[] };
    const path = uploaded.files?.[0]?.path;
    if (!path) {
      throw new DirectLoanPosterRequestError({
        stage,
        status: 502,
        code: 'missing_upload_path',
        detail: '上传响应缺少文件路径。',
      });
    }
    return path;
  }

  throw new DirectLoanPosterRequestError({
    stage,
    status: 0,
    detail: '上传重试已用尽。',
  });
}

async function submitMediaGeneration(
  projectId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/media/generate`;
  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }, POSTER_REQUEST_TIMEOUT_MS);
    } catch (reason) {
      if (attempt >= UPLOAD_RETRY_DELAYS_MS.length) {
        throw new DirectLoanPosterRequestError({
          stage: 'start-generation',
          status: 0,
          detail: reason instanceof Error ? reason.message : '网络连接中断。',
        });
      }
      console.warn(
        `[direct-loan-poster] stage=start-generation retry=${attempt + 1}`,
        reason,
      );
      await waitForUploadRetry(UPLOAD_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    const canRetry = RETRYABLE_UPLOAD_STATUSES.has(response.status)
      && attempt < UPLOAD_RETRY_DELAYS_MS.length;
    if (!canRetry) return response;
    console.warn(
      `[direct-loan-poster] stage=start-generation retry=${attempt + 1} status=${response.status}`,
    );
    await waitForUploadRetry(UPLOAD_RETRY_DELAYS_MS[attempt]!);
  }

  throw new DirectLoanPosterRequestError({
    stage: 'start-generation',
    status: 0,
    detail: '任务提交重试已用尽。',
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(new DOMException('请求超时。', 'TimeoutError'));
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function waitForUploadRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
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
