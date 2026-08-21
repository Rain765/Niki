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

const FINALIZATION_POLL_ATTEMPTS = 12;

export interface FinalizeLogoDirectionOptions {
  signal?: AbortSignal;
  onStatus?: (status: LogoFinalizationStatus) => void;
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

async function waitForCompletedFinalization(
  projectId: string,
  finalizationId: string,
  options: FinalizeLogoDirectionOptions,
): Promise<LogoFinalization> {
  for (let attempt = 0; attempt < FINALIZATION_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetchLogoFinalizations(projectId, options.signal);
    const finalization = response.finalizations.find((item) => item.id === finalizationId);
    if (finalization) {
      options.onStatus?.(finalization.status);
      if (finalization.status === 'complete') return finalization;
      if (finalization.status === 'failed') {
        throw new Error(finalization.error || 'Logo refinement did not create a complete brand kit.');
      }
    }
    if (attempt < FINALIZATION_POLL_ATTEMPTS - 1) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, 500);
        options.signal?.addEventListener('abort', () => {
          window.clearTimeout(timeout);
          reject(new DOMException('Logo refinement was canceled.', 'AbortError'));
        }, { once: true });
      });
    }
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

  const agent = preferredLogoAgent(await fetchAgents({ throwOnError: true, signal: options.signal }));
  if (!agent) {
    throw new Error('No local coding agent is available to build the brand kit.');
  }

  options.onStatus?.('queued');
  await new Promise<void>((resolve, reject) => {
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

  return await waitForCompletedFinalization(
    prepared.finalization.projectId,
    prepared.finalization.id,
    options,
  );
}
