import { Check, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { PresentationJob } from '@open-design/contracts';
import { Button } from '../components/Button';

export function PresentationProgress({
  job,
  busy,
  saving,
  fileName,
  loadError,
  zh,
  onRetry,
  onBack,
}: {
  job: PresentationJob | null;
  busy: boolean;
  saving: boolean;
  fileName?: string;
  loadError: boolean;
  zh: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const failed = job?.status === 'failed';
  const opening = !job && !busy;
  const rendering = job?.status === 'rendering' || saving;
  const stage = busy ? 0 : rendering ? 2 : 1;
  const title = failed
    ? zh
      ? '文稿生成遇到问题'
      : 'We could not finish this deck'
    : opening
      ? loadError
        ? zh
          ? '暂时无法打开文稿'
          : 'Unable to open this deck'
        : zh
          ? '正在打开文稿'
          : 'Opening your deck'
      : rendering
        ? zh
          ? '正在排版与导出'
          : 'Composing and exporting'
        : busy
          ? zh
            ? '正在上传并读取文档'
            : 'Uploading and reading'
          : zh
            ? '正在组织文稿内容'
            : 'Organizing your content';
  return (
    <section
      className={`ppt-workbench__progress ${failed ? 'has-error' : ''}`}
      aria-busy={!failed && !loadError}
    >
      <div
        className="ppt-workbench__progress-heading"
        role="status"
        aria-live="polite"
      >
        <span className="ppt-workbench__progress-icon">
          {failed || loadError ? (
            <TriangleAlert size={25} />
          ) : (
            <LoaderCircle className="is-working" size={25} />
          )}
        </span>
        <h1>{title}</h1>
        <p>
          {failed
            ? job.deck
              ? zh
                ? '内容草稿已保留，可以直接重试排版，无需重新生成内容。'
                : 'Your draft is saved. Retry the layout without generating the content again.'
              : zh
                ? '请查看错误详情，再调整文档或设置后重试。'
                : 'Review the error details, then adjust your document or settings and retry.'
            : opening
              ? loadError
                ? zh
                  ? '正在尝试重新连接，也可以先返回工作区。'
                  : 'Reconnecting. You can also return to the workspace.'
                : zh
                  ? '正在加载页面预览与内容。'
                  : 'Loading slide previews and content.'
              : busy
                ? zh
                  ? '正在提交文档，请稍候。提交完成后可在「我的文稿」中继续查看。'
                  : 'Please wait while your document uploads. Once submitted, you can return through My presentations.'
                : zh
                  ? '可以离开当前页面，稍后在「我的文稿」中继续查看。'
                  : 'You can leave this page and return through My presentations.'}
        </p>
      </div>
      {(job?.sourceName || fileName) && (
        <div className="ppt-workbench__progress-file">
          <FileText size={19} />
          <span>{job?.sourceName ?? fileName}</span>
          {job && (
            <small>
              {job.options.ratio} ·{' '}
              {job.options.pageCount === 'auto'
                ? zh
                  ? '自动页数'
                  : 'Automatic length'
                : `${job.options.pageCount} ${zh ? '页' : 'slides'}`}
            </small>
          )}
        </div>
      )}
      {!opening && !failed && (
        <ol className="ppt-workbench__steps">
          {(zh
            ? ['上传与读取', '内容规划', '排版与导出']
            : ['Read document', 'Plan content', 'Compose & export']
          ).map((step, i) => (
            <li
              key={step}
              aria-current={stage === i ? 'step' : undefined}
              className={stage > i ? 'is-done' : ''}
            >
              <span>{stage > i ? <Check size={16} /> : i + 1}</span>
              <strong>{step}</strong>
              <small>
                {stage > i
                  ? zh
                    ? '已完成'
                    : 'Done'
                  : stage === i
                    ? zh
                      ? '进行中'
                      : 'In progress'
                    : zh
                      ? '等待中'
                      : 'Waiting'}
              </small>
            </li>
          ))}
        </ol>
      )}
      {failed && (
        <>
          <div className="ppt-workbench__recovery-actions">
            {job.deck && (
              <Button variant="primary" loading={saving} onClick={onRetry}>
                {saving
                  ? zh
                    ? '正在重试排版…'
                    : 'Retrying…'
                  : zh
                    ? '重试排版'
                    : 'Retry layout'}
              </Button>
            )}
            <Button disabled={saving} onClick={onBack}>
              {zh ? '返回调整' : 'Back to settings'}
            </Button>
          </div>
          <details className="ppt-workbench__error-details">
            <summary>{zh ? '查看错误详情' : 'Error details'}</summary>
            <p>
              {job.error ?? (zh ? '未返回具体原因。' : 'No details available.')}
            </p>
          </details>
        </>
      )}
      {opening && loadError && (
        <Button onClick={onBack}>
          {zh ? '返回工作区' : 'Back to workspace'}
        </Button>
      )}
    </section>
  );
}
