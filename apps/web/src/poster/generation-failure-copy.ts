/** Internal diagnostics stay in task metadata, never in the poster-page toast. */
export function posterLayoutFailureCopy(detail: string | undefined, locale: 'en' | 'zh'): string | undefined {
  if (!detail || !/Anti-fraud hand layout:|Poster layout not accepted;/i.test(detail)) return undefined;
  return locale === 'zh'
    ? '本次画面未能完成，请重新生成；已完成的海报已保留。'
    : 'We could not complete this poster. Please generate again; completed posters are kept.';
}
