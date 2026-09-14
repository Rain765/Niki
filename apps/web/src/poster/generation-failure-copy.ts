import { IMAGE_GENERATION_PROGRESS, type ProjectMediaTaskSummary } from '@open-design/contracts';

/** Internal diagnostics stay in task metadata, never in the poster-page toast. */
export function posterLayoutFailureCopy(detail: string | undefined, locale: 'en' | 'zh'): string | undefined {
  if (detail && /timeout|timed out|image recovery budget exhausted|fetch failed|\b(?:openai|custom image) (?:408|429|500|502|503|504)\b/i.test(detail)) {
    return locale === 'zh'
      ? '图像服务暂未完成，本轮自动恢复已结束；请稍后重试，已完成的海报已保留。'
      : 'The image service could not finish after automatic recovery. Try again later; completed posters are kept.';
  }
  if (!detail || !/Anti-fraud hand layout:|Poster layout not accepted;/i.test(detail)) return undefined;
  return locale === 'zh'
    ? '本次画面未能完成，请重新生成；已完成的海报已保留。'
    : 'We could not complete this poster. Please generate again; completed posters are kept.';
}

/** Only live tasks from this batch may describe its recovery progress. */
export function posterRequestProgress(tasks: ProjectMediaTaskSummary[], batchId: string, locale: 'en' | 'zh'): string | null {
  const states = tasks.filter(task => task.taskId.startsWith(`loan-poster:${batchId}:`) && task.status === 'running')
    .map(task => task.progress.filter(line => line.startsWith('image:')).at(-1));
  if (states.includes(IMAGE_GENERATION_PROGRESS.retrying)) return locale === 'zh' ? '图像请求暂时中断，正在自动重试…' : 'The image request was interrupted. Retrying automatically…';
  if (states.includes(IMAGE_GENERATION_PROGRESS.slow)) return locale === 'zh' ? '生成耗时较长，仍在处理中…' : 'Generation is taking longer, but is still processing…';
  if (states.includes(IMAGE_GENERATION_PROGRESS.processing)) return locale === 'zh' ? '图片已返回，正在检查并完成海报…' : 'Image received. Checking and finishing the poster…';
  return null;
}
