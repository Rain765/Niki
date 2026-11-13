import type {
  AgentInfo,
  LogoFinalization,
  LogoFinalizationsResponse,
  LogoFinalizeRequest,
  LogoFinalizeResponse,
  LogoFinalizationStatus,
} from '@open-design/contracts';
import { streamViaDaemon } from './daemon';
import { fetchAgents } from './registry';
import { randomUUID } from '../utils/uuid';

const FINALIZATION_POST_RUN_POLL_ATTEMPTS = 12;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;

export interface FinalizeLogoDirectionOptions {
  signal?: AbortSignal;
  onStatus?: (status: LogoFinalizationStatus) => void;
  onProgress?: (finalization: LogoFinalization) => void;
}

function preferredLogoAgent(agents: AgentInfo[]): AgentInfo | null {
  const available = agents.filter((agent) => agent.available);
  return available.find((agent) => agent.id === 'codex')
    ?? available.find((agent) => agent.id === 'claude')
    ?? available[0]
    ?? null;
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const data = await response.json().catch(() => null) as {
    error?: { message?: string } | string;
    message?: string;
  } | null;
  const message = typeof data?.error === 'string'
    ? data.error
    : data?.error?.message ?? data?.message ?? fallback;
  return new Error(message);
}

export async function fetchLogoFinalizations(
  projectId: string,
  signal?: AbortSignal,
): Promise<LogoFinalizationsResponse> {
  const response = await fetch(
    `/api/logo/projects/${encodeURIComponent(projectId)}/finalizations`,
    { signal },
  );
  if (!response.ok) throw await apiError(response, 'Could not load logo refinements.');
  return await response.json() as LogoFinalizationsResponse;
}

async function waitForPoll(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Logo refinement was canceled.', 'AbortError'));
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Logo refinement was canceled.', 'AbortError'));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, FINALIZATION_POLL_INTERVAL_MS);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function monitorFinalization(
  projectId: string,
  finalizationId: string,
  agentRun: Promise<void>,
  options: FinalizeLogoDirectionOptions,
): Promise<LogoFinalization> {
  let agentFinished = false;
  let agentError: unknown;
  let postRunPolls = 0;
  void agentRun.then(
    () => { agentFinished = true; },
    (error: unknown) => {
      agentFinished = true;
      agentError = error;
    },
  );

  while (!options.signal?.aborted) {
    const response = await fetchLogoFinalizations(projectId, options.signal);
    const finalization = response.finalizations.find((item) => item.id === finalizationId);
    if (finalization) {
      options.onStatus?.(finalization.status);
      options.onProgress?.(finalization);
      if (finalization.status === 'complete') return finalization;
      if (finalization.status === 'failed') {
        throw new Error(finalization.error || 'Logo refinement did not create a complete brand kit.');
      }
    }

    if (agentError) throw agentError;
    if (agentFinished) {
      postRunPolls += 1;
      if (postRunPolls >= FINALIZATION_POST_RUN_POLL_ATTEMPTS) break;
    }
    await waitForPoll(options.signal);
  }
  if (options.signal?.aborted) {
    throw new DOMException('Logo refinement was canceled.', 'AbortError');
  }
  throw new Error('Logo refinement finished without the complete brand-kit file set.');
}

export async function finalizeLogoDirection(
  input: LogoFinalizeRequest,
  options: FinalizeLogoDirectionOptions = {},
): Promise<LogoFinalization> {
  const preparedResponse = await fetch('/api/logo/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!preparedResponse.ok) {
    throw await apiError(preparedResponse, 'Could not prepare logo refinement.');
  }
  const prepared = await preparedResponse.json() as LogoFinalizeResponse;
  options.onStatus?.('prepared');
  options.onProgress?.(prepared.finalization);
  if (prepared.finalization.status === 'complete') return prepared.finalization;
  if (prepared.finalization.mode === 'faithful') {
    throw new Error('Faithful vectorization did not return a completed validated SVG.');
  }

  const agent = preferredLogoAgent(await fetchAgents({ throwOnError: true, signal: options.signal }));
  if (!agent) {
    throw new Error('No local coding agent is available to build the brand kit.');
  }

  options.onStatus?.('queued');
  const agentRun = new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    void streamViaDaemon({
      agentId: agent.id,
      history: [{
        id: prepared.finalization.clientRequestId,
        role: 'user',
        content: prepared.prompt,
        createdAt: Date.now(),
      }],
      signal: options.signal ?? new AbortController().signal,
      projectId: prepared.finalization.projectId,
      conversationId: prepared.finalization.conversationId,
      assistantMessageId: randomUUID(),
      clientRequestId: prepared.finalization.clientRequestId,
      skillId: 'logo-generator',
      attachments: [prepared.finalization.sourceFile],
      onRunStatus: (status) => {
        if (status === 'queued' || status === 'running') options.onStatus?.(status);
      },
      handlers: {
        onDelta: () => {},
        onAgentEvent: () => {},
        onDone: () => settle(resolve),
        onError: (error) => settle(() => reject(error)),
      },
    }).catch((error) => settle(() => reject(error)));
  });

  return await monitorFinalization(
    prepared.finalization.projectId,
    prepared.finalization.id,
    agentRun,
    options,
  );
}
