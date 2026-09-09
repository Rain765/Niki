import type {
  LoanVideoRestoreResponse,
  MediaGenerationRequest,
  MediaTaskAcceptedResponse,
  MediaTaskSnapshot,
  ProjectMediaTasksResponse,
} from '@open-design/contracts';

interface RestoreLoanVideoPointer {
  projectId: string;
  taskId?: string;
}

async function responseError(response: Response): Promise<Error> {
  const raw = await response.text().catch(() => '');
  if (raw) {
    try {
      const body = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const message = typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : raw;
      return new Error(message);
    } catch {
      return new Error(raw);
    }
  }
  return new Error(`Media request failed with HTTP ${response.status}.`);
}

export async function startProjectMediaTask(
  projectId: string,
  request: MediaGenerationRequest,
): Promise<MediaTaskAcceptedResponse> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/media/generate`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<MediaTaskAcceptedResponse>;
}

export async function waitForMediaTask(
  taskId: string,
  since: number,
  signal?: AbortSignal,
): Promise<MediaTaskSnapshot> {
  const response = await fetch(
    `/api/media/tasks/${encodeURIComponent(taskId)}/wait`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since, timeoutMs: 25_000 }),
      signal,
    },
  );
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<MediaTaskSnapshot>;
}

export async function listProjectMediaTasks(
  projectId: string,
  includeDone = true,
): Promise<ProjectMediaTasksResponse> {
  const query = includeDone ? '?includeDone=1' : '';
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/media/tasks${query}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<ProjectMediaTasksResponse>;
}

export async function restoreLoanVideo(
  pointer: RestoreLoanVideoPointer | null,
): Promise<LoanVideoRestoreResponse> {
  const query = new URLSearchParams();
  if (pointer?.projectId) query.set('projectId', pointer.projectId);
  if (pointer?.taskId) query.set('taskId', pointer.taskId);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await fetch(`/api/media/loan-video/restore${suffix}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<LoanVideoRestoreResponse>;
}
