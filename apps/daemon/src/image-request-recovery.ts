import { randomUUID } from 'node:crypto';
import { IMAGE_GENERATION_PROGRESS } from '@open-design/contracts';

export function imageRequestTimeoutMs(value = process.env.OD_OPENAI_IMAGE_TIMEOUT_MS): number {
  const configured = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(configured)
    ? Math.min(600_000, Math.max(30_000, Math.floor(configured))) : 360_000;
}

export function isRecoverableImageRequestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string; status?: number; code?: string; cause?: { code?: string } };
  if (e.name === 'AbortError') return false;
  if (e.code === 'image_provider_quota_exhausted' || /insufficient_quota|credit_balance_too_low|no credits remaining|billing_hard_limit_reached/i.test(e.message ?? '')) return false;
  return e.name === 'TimeoutError'
    || e.code === 'image_request_timeout' || e.code === 'image_recovery_exhausted' || e.code === 'poster_checkpoint_missing'
    || [408, 429, 500, 502, 503, 504].includes(e.status ?? 0)
    || (e.name === 'TypeError' && e.message === 'fetch failed')
    || /^(?:UND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|SOCKET)|ECONNRESET|ETIMEDOUT|EAI_AGAIN)$/.test(e.cause?.code ?? e.code ?? '');
}

function timeoutError(): Error {
  return Object.assign(new Error('Image service request timed out'), { code: 'image_request_timeout', status: 504 });
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** A single image output owns this budget; layout corrections cannot reset it. */
export function createImageRequestRecovery(options: {
  signal?: AbortSignal | undefined;
  onProgress?: ((message: string) => void) | undefined;
  poster?: boolean;
}) {
  const id = randomUUID().slice(0, 8);
  const started = Date.now();
  const poster = options.poster !== false;
  const deadline = started + (poster ? 720_000 : imageRequestTimeoutMs());
  let calls = 0;
  let retries = 0;
  const progress = (state: keyof typeof IMAGE_GENERATION_PROGRESS) => options.onProgress?.(IMAGE_GENERATION_PROGRESS[state]);
  return {
    async run<T>(operation: (signal: AbortSignal, stage: (name: string) => void) => Promise<T>): Promise<T> {
      for (;;) {
        options.signal?.throwIfAborted();
        const remaining = deadline - Date.now();
        if (calls >= (poster ? 3 : 1) || remaining <= 0 || (calls > 0 && remaining < 30_000)) {
          throw Object.assign(new Error('Image recovery budget exhausted'), { code: 'image_recovery_exhausted', status: 504 });
        }
        calls += 1;
        const controller = new AbortController();
        const abort = () => controller.abort(options.signal?.reason);
        options.signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException('Image request deadline reached', 'TimeoutError')), Math.min(imageRequestTimeoutMs(), remaining));
        const slow = setTimeout(() => progress('slow'), 60_000);
        const stage = (name: string) => console.info(`[image ${id}] attempt=${calls} stage=${name} elapsedMs=${Date.now() - started}`);
        stage('request');
        progress(calls === 1 ? 'generating' : 'correcting');
        try {
          const result = await operation(controller.signal, stage);
          controller.signal.throwIfAborted();
          stage('received');
          progress('processing');
          return result;
        } catch (error) {
          options.signal?.throwIfAborted();
          const failure = controller.signal.aborted ? controller.signal.reason : error;
          const timedOut = failure instanceof Error && failure.name === 'TimeoutError';
          stage(timedOut ? 'timeout' : 'failed');
          if (!poster || retries >= 1 || calls >= 3 || !isRecoverableImageRequestError(failure)) {
            throw timedOut ? timeoutError() : failure;
          }
          const retryAfter = (failure as { retryAfterMs?: number }).retryAfterMs;
          const backoff = Number.isFinite(retryAfter) ? Math.max(2_000, retryAfter!) : 2_000;
          // Never retry earlier than Retry-After, or without useful time remaining.
          if (backoff > 30_000 || deadline - Date.now() < backoff + 30_000) {
            throw timedOut ? timeoutError() : failure;
          }
          retries += 1;
          clearTimeout(timer);
          clearTimeout(slow);
          progress('retrying');
          await waitForRetry(backoff, options.signal);
        } finally {
          clearTimeout(timer);
          clearTimeout(slow);
          options.signal?.removeEventListener('abort', abort);
        }
      }
    },
  };
}
