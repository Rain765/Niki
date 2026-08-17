import type {
  MediaGenerationRequest,
  MediaTaskAcceptedResponse,
  MediaTaskSnapshot,
  ProjectMediaTasksResponse,
} from '@open-design/contracts';

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
