import { describe, expect, it } from 'vitest';
import { posterLayoutFailureCopy } from '../../src/poster/generation-failure-copy';

describe('poster layout recovery feedback', () => {
  it.each(['Anti-fraud hand layout: exactly two hands', 'Poster layout not accepted; base image saved as private/draft.png'])('hides diagnostics in both locales: %s', (detail) => {
    expect(posterLayoutFailureCopy(detail, 'zh')).toBe('本次画面未能完成，请重新生成；已完成的海报已保留。');
    expect(posterLayoutFailureCopy(detail, 'en')).toBe('We could not complete this poster. Please generate again; completed posters are kept.');
  });
  it.each([undefined, '', 'Provider unavailable', 'AUTH_REQUIRED'])('does not relabel other errors: %s', (detail) => {
    expect(posterLayoutFailureCopy(detail, 'en')).toBeUndefined();
  });
});
