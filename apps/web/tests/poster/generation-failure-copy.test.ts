import { describe, expect, it } from 'vitest';
import { posterLayoutFailureCopy, posterRequestProgress } from '../../src/poster/generation-failure-copy';
import type { ProjectMediaTaskSummary } from '@open-design/contracts';

describe('poster layout recovery feedback', () => {
  it('distinguishes exhausted credits from transient rate limits and timeouts', () => {
    expect(posterLayoutFailureCopy('Image provider quota exhausted: restore API credits', 'zh')).toContain('API 额度不足');
    expect(posterLayoutFailureCopy('openai 429: insufficient_quota', 'en')).toContain('no credits remaining');
  });
  it.each(['The operation was aborted due to timeout', 'Image service request timed out', 'Image recovery budget exhausted', 'openai 429: busy'])('hides transient provider diagnostics: %s', detail => {
    expect(posterLayoutFailureCopy(detail, 'zh')).toContain('自动恢复已结束');
    expect(posterLayoutFailureCopy(detail, 'en')).not.toContain(detail);
  });
  it('uses the latest live progress from this batch only', () => {
    const task: ProjectMediaTaskSummary = { taskId: 'loan-poster:current:0', status: 'running', startedAt: 1, elapsed: 60, nextSince: 2, progressCount: 2, progress: ['image:retrying', 'image:processing'] };
    expect(posterRequestProgress([task], 'current', 'zh')).toContain('图片已返回');
    expect(posterRequestProgress([task], 'older', 'zh')).toBeNull();
    expect(posterRequestProgress([{ ...task, status: 'failed' }], 'current', 'zh')).toBeNull();
    expect(posterRequestProgress([{ ...task, progress: ['image:slow'] }], 'current', 'en')).toContain('taking longer');
    expect(posterRequestProgress([{ ...task, progress: ['image:retrying'] }], 'current', 'zh')).toContain('正在自动重试');
    expect(posterRequestProgress([{ ...task, progress: ['image:hand-review', 'image:correcting'] }], 'current', 'zh')).toContain('重新生成画面');
    expect(posterRequestProgress([{ ...task, progress: ['image:hand-review'] }], 'current', 'zh')).toContain('复核人物和手部');
    expect(posterRequestProgress([{ ...task, progress: ['image:preflight', 'image:generating'] }], 'current', 'zh')).toContain('正在生成海报画面');
  });
  it.each(['Anti-fraud hand layout: exactly two hands', 'Poster layout not accepted; base image saved as private/draft.png'])('hides diagnostics in both locales: %s', (detail) => {
    expect(posterLayoutFailureCopy(detail, 'zh')).toBe('本次画面未能完成，请重新生成；已完成的海报已保留。');
    expect(posterLayoutFailureCopy(detail, 'en')).toBe('We could not complete this poster. Please generate again; completed posters are kept.');
  });
  it.each([undefined, '', 'Provider unavailable', 'AUTH_REQUIRED'])('does not relabel other errors: %s', (detail) => {
    expect(posterLayoutFailureCopy(detail, 'en')).toBeUndefined();
  });
});
