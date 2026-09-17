import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageRequestRecovery, imageRequestTimeoutMs } from '../src/image-request-recovery.js';

afterEach(() => vi.useRealTimers());
describe('image request recovery budget', () => {
  it('announces each provider request rather than leaving the previous local-review message active', async () => {
    const progress = vi.fn();
    const recovery = createImageRequestRecovery({ onProgress: progress });
    await recovery.run(async () => 'first');
    await recovery.run(async () => 'corrected');
    expect(progress.mock.calls.map(([state]) => state)).toEqual([
      'image:generating', 'image:processing', 'image:correcting', 'image:processing',
    ]);
  });
  it('defaults to six minutes and clamps overrides', () => {
    expect(imageRequestTimeoutMs()).toBe(360_000);
    expect(imageRequestTimeoutMs('')).toBe(360_000);
    expect(imageRequestTimeoutMs('99999999')).toBe(600_000);
  });
  it('recovers one timeout without changing the operation', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const recovery = createImageRequestRecovery({ onProgress: progress });
    const operation = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValue('image');
    const result = recovery.run(operation);
    await vi.runAllTimersAsync();
    expect(await result).toBe('image');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith('image:retrying');
  });
  it('shares three calls and only one transport retry across layout corrections', async () => {
    vi.useFakeTimers();
    const recovery = createImageRequestRecovery({});
    const ok = vi.fn().mockResolvedValue('image');
    await recovery.run(ok);
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue('corrected');
    const result = recovery.run(flaky);
    await vi.runAllTimersAsync();
    expect(await result).toBe('corrected');
    await expect(recovery.run(ok)).rejects.toMatchObject({ code: 'image_recovery_exhausted' });
    expect(ok).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403])('never retries HTTP %s', async (status) => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error('invalid'), { status }));
    await expect(createImageRequestRecovery({}).run(operation)).rejects.toMatchObject({ status });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it.each([
    { code: 'image_provider_quota_exhausted', message: 'Image provider quota exhausted' },
    { code: 'insufficient_quota', message: 'openai 429: no credits remaining' },
  ])('does not retry exhausted billing quota: $code', async ({ code, message }) => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error(message), { status: 429, code }));
    await expect(createImageRequestRecovery({}).run(operation)).rejects.toMatchObject({ code });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('honors a short Retry-After and cancels during backoff', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error('busy'), { status: 429, retryAfterMs: 5_000 }));
    const result = createImageRequestRecovery({ signal: controller.signal }).run(operation);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(operation).toHaveBeenCalledTimes(1);
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not retry earlier than an excessive Retry-After', async () => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error('busy'), { status: 429, retryAfterMs: 60_000 }));
    await expect(createImageRequestRecovery({}).run(operation)).rejects.toMatchObject({ status: 429 });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('cancels the pending request without retrying', async () => {
    const controller = new AbortController();
    const operation = vi.fn((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const result = createImageRequestRecovery({ signal: controller.signal }).run(operation);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('bounds total elapsed time, exposes slow progress, and stops after one retry', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const operation = vi.fn((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const result = createImageRequestRecovery({ onProgress: progress }).run(operation);
    const assertion = expect(result).rejects.toMatchObject({ code: 'image_request_timeout', status: 504 });
    await vi.advanceTimersByTimeAsync(720_001);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith('image:slow');
    expect(vi.getTimerCount()).toBe(0);
  });
});
