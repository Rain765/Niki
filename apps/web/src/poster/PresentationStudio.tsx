'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  PRESENTATION_LAYOUTS,
  PRESENTATION_PAGE_COUNTS,
  PRESENTATION_PALETTES,
  PRESENTATION_RATIOS,
  type PresentationJob,
  type PresentationListResponse,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import { projectFileDownloadUrl, projectFileUrl } from '../providers/registry';
import './presentation-studio.css';

const INITIAL_OPTIONS: PresentationOptions = {
  palette: 'emerald',
  ratio: '16:9',
  pageCount: 'auto',
  prompt: '',
};
const LAYOUT_LABELS = {
  cover: '封面',
  overview: '要点概览',
  steps: '步骤',
  timeline: '时间线',
  architecture: '架构',
  flow: '流程',
  comparison: '对比',
  matrix: '矩阵',
  cycle: '循环',
  closing: '结语',
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}
const statusUrl = (id: string) =>
  `/api/projects/${encodeURIComponent(id)}/presentation`;

export function PresentationStudio() {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [options, setOptions] = useState<PresentationOptions>(INITIAL_OPTIONS);
  const [file, setFile] = useState<File | null>(null);
  const [history, setHistory] = useState<
    PresentationListResponse['presentations']
  >([]);
  const [job, setJob] = useState<PresentationJob | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<PresentationSlide | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const mounted = useRef(true);
  const chooser = useRef<HTMLInputElement>(null);
  const running = job?.status === 'generating' || job?.status === 'rendering';
  const refreshHistory = useCallback(async () => {
    const result =
      await request<PresentationListResponse>('/api/presentations');
    if (mounted.current) setHistory(result.presentations);
    return result.presentations;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshHistory()
      .then((items) => {
        if (mounted.current && items[0]) setSelectedId(items[0].projectId);
      })
      .catch((e: Error) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
    };
  }, [refreshHistory]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDraft(null);
    setIndex(0);
    const poll = async () => {
      try {
        const next = await request<PresentationJob>(statusUrl(selectedId), {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setJob(next);
        if (next.status === 'generating' || next.status === 'rendering')
          timer = setTimeout(() => void poll(), 2000);
        else void refreshHistory().catch(() => {});
      } catch (e) {
        if (controller.signal.aborted) return;
        setError((e as Error).message);
        timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, refreshHistory]);
  function chooseFile(next: File | undefined) {
    if (!next) return;
    if (
      !/\.(pdf|docx|md|txt)$/i.test(next.name) ||
      next.size > 10 * 1024 * 1024 ||
      next.size === 0
    ) {
      setError(
        zh
          ? '请选择 10 MB 以内的 PDF、DOCX、Markdown 或 TXT 文档。'
          : 'Choose a PDF, DOCX, Markdown or TXT document up to 10 MB.',
      );
      return;
    }
    setFile(next);
    setError('');
  }
  async function start(event: FormEvent) {
    event.preventDefault();
    if (!file || busy || running || !!draft) return;
    setBusy(true);
    setError('');
    setDraft(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('options', JSON.stringify(options));
      const next = await request<PresentationJob>('/api/presentations', {
        method: 'POST',
        body,
      });
      if (!mounted.current) return;
      setJob(next);
      setSelectedId(next.projectId);
      setIndex(0);
      void refreshHistory().catch(() => {});
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function saveSlide() {
    if (!job || !draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const next = await request<PresentationJob>(statusUrl(job.projectId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: job.revision,
          slideIndex: index,
          slide: draft,
        }),
      });
      if (!mounted.current) return;
      setJob(next);
      setDraft(null);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  const pageLabel = (value: (typeof PRESENTATION_PAGE_COUNTS)[number]) =>
    value === 'auto' ? (zh ? '自动' : 'Auto') : `${value}${zh ? ' 页' : ''}`;
  const statusLabel = (status: PresentationJob['status']) =>
    ({
      generating: zh ? '正在提炼内容与编排页面' : 'Organizing your content',
      rendering: zh ? '正在生成预览与 PPTX' : 'Building previews and PPTX',
      complete: zh ? '已完成' : 'Complete',
      failed: zh ? '生成未完成' : 'Generation failed',
    })[status];
  return (
    <section
      className="ppt-studio"
      style={
        {
          '--ppt-theme': `var(--presentation-${options.palette})`,
        } as CSSProperties
      }
      aria-label={zh ? '文档转 PPT' : 'Document to PPT'}
    >
      <header className="ppt-studio__heading">
        <div>
          <span className="ppt-studio__eyebrow">DOCUMENT TO PRESENTATION</span>
          <h1>{zh ? '文档转 PPT' : 'Document to PPT'}</h1>
          <p>
            {zh
              ? '上传文档，让内容有条理，让观点更清晰。'
              : 'Turn your document into a clear, well-designed presentation.'}
          </p>
        </div>
        <span className="ppt-studio__format">
          {zh ? '可编辑 PPTX' : 'Editable PPTX'}
        </span>
      </header>
      <div className="ppt-studio__workspace">
        <form
          className="ppt-studio__controls"
          onSubmit={(event) => void start(event)}
        >
          <input
            ref={chooser}
            type="file"
            accept=".pdf,.docx,.md,.txt"
            className="ppt-studio__file-input"
            aria-label={zh ? '上传文档' : 'Upload document'}
            onChange={(event) => chooseFile(event.target.files?.[0])}
            disabled={busy || running || !!draft}
          />
          <button
            type="button"
            className={`ppt-studio__upload${dragging ? ' is-dragging' : ''}`}
            disabled={busy || running || !!draft}
            onClick={() => chooser.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!busy && !running) chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="ppt-studio__upload-icon" aria-hidden="true">
              ↑
            </span>
            <strong>
              {file?.name ||
                (zh ? '点击或拖入文档' : 'Click or drop a document')}
            </strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(0)} KB · ${zh ? '点击更换' : 'Click to replace'}`
                : 'PDF · DOCX · Markdown · TXT'}
            </span>
            <small>
              {zh
                ? '最大 10 MB，8 万字符以内；扫描件请先转为文字'
                : 'Up to 10 MB / 80,000 characters. OCR scanned files first.'}
            </small>
          </button>
          <fieldset disabled={busy || running || !!draft}>
            <legend>
              {zh ? '主题颜色' : 'Theme color'}
              <span>
                {zh
                  ? PRESENTATION_PALETTES[options.palette].zh
                  : PRESENTATION_PALETTES[options.palette].name}
              </span>
            </legend>
            <div className="ppt-studio__swatches">
              {Object.entries(PRESENTATION_PALETTES).map(([key, palette]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={zh ? palette.zh : palette.name}
                  title={zh ? palette.zh : palette.name}
                  aria-pressed={options.palette === key}
                  style={
                    {
                      '--ppt-swatch': `var(--presentation-${key})`,
                    } as CSSProperties
                  }
                  onClick={() =>
                    setOptions({
                      ...options,
                      palette: key as PresentationOptions['palette'],
                    })
                  }
                >
                  <span />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy || running || !!draft}>
            <legend>{zh ? '画幅比例' : 'Aspect ratio'}</legend>
            <div className="ppt-studio__segments">
              {PRESENTATION_RATIOS.map((ratio) => (
                <button
                  type="button"
                  key={ratio}
                  aria-pressed={options.ratio === ratio}
                  onClick={() => setOptions({ ...options, ratio })}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy || running || !!draft}>
            <legend>
              {zh ? '页数' : 'Slide count'}
              <span>{zh ? '含封面与结语' : 'Includes cover and closing'}</span>
            </legend>
            <div className="ppt-studio__segments">
              {PRESENTATION_PAGE_COUNTS.map((pageCount) => (
                <button
                  type="button"
                  key={pageCount}
                  aria-pressed={options.pageCount === pageCount}
                  onClick={() => setOptions({ ...options, pageCount })}
                >
                  {pageLabel(pageCount)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="ppt-studio__brief">
            {zh ? '补充要求' : 'Additional brief'}
            <span>{zh ? '选填' : 'Optional'}</span>
            <textarea
              value={options.prompt}
              maxLength={2000}
              rows={3}
              disabled={busy || running || !!draft}
              placeholder={
                zh
                  ? '例如：面向管理层，重点呈现系统架构和执行流程。'
                  : 'For example: explain the architecture and workflow to management.'
              }
              onChange={(event) =>
                setOptions({ ...options, prompt: event.target.value })
              }
            />
          </label>
          <button
            className="ppt-studio__primary"
            type="submit"
            disabled={!file || busy || running || !!draft}
          >
            {busy
              ? zh
                ? '正在读取文档…'
                : 'Reading document…'
              : running
                ? zh
                  ? '生成中…'
                  : 'Generating…'
                : zh
                  ? '生成 PPT'
                  : 'Generate PPT'}
          </button>
          <p className="ppt-studio__hint">
            {zh
              ? '按内容自动选择版式，支持架构、流程、时间线与对比。'
              : 'Layouts adapt to your content: architecture, flow, timeline and comparison.'}
          </p>
        </form>
        <div className="ppt-studio__output">
          <div className="ppt-studio__toolbar">
            <h2>{zh ? '演示文稿' : 'Presentation'}</h2>
            <select
              aria-label={zh ? '历史记录' : 'History'}
              value={selectedId ?? ''}
              disabled={busy || saving || !!draft}
              onChange={(event) => {
                setJob(null);
                setSelectedId(event.target.value);
                setError('');
              }}
            >
              <option value="" disabled>
                {zh ? '历史记录' : 'History'}
              </option>
              {history.map((item) => (
                <option key={item.projectId} value={item.projectId}>
                  {item.title} · {new Date(item.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div className="ppt-studio__error" role="alert">
              {error}
              <button
                type="button"
                onClick={() => setError('')}
                aria-label={zh ? '关闭提示' : 'Dismiss'}
              >
                ×
              </button>
            </div>
          )}
          {job && (running || job.status === 'failed') ? (
            <div className="ppt-studio__status" role="status">
              <span
                className={running ? 'ppt-studio__spinner' : ''}
                aria-hidden="true"
              />
              <h3>{statusLabel(job.status)}</h3>
              <p>
                {job.error ||
                  (zh
                    ? '通常需要 1–3 分钟。可以离开此页，稍后从历史记录查看。'
                    : 'Usually 1–3 minutes. You can return later from History.')}
              </p>
            </div>
          ) : null}
          {job?.status === 'complete' &&
          job.deck &&
          job.previews &&
          job.pptx ? (
            <>
              <div className="ppt-studio__preview">
                <img
                  key={`${job.projectId}-${job.revision}-${index}`}
                  src={projectFileUrl(job.projectId, job.previews[index]!)}
                  alt={job.deck.slides[index]?.title ?? ''}
                />
              </div>
              <div className="ppt-studio__slide-actions">
                <div>
                  <button
                    type="button"
                    disabled={index === 0 || !!draft}
                    onClick={() => setIndex(index - 1)}
                    aria-label={zh ? '上一页' : 'Previous slide'}
                  >
                    ←
                  </button>
                  <span>
                    {index + 1} / {job.deck.slides.length}
                  </span>
                  <button
                    type="button"
                    disabled={index === job.deck.slides.length - 1 || !!draft}
                    onClick={() => setIndex(index + 1)}
                    aria-label={zh ? '下一页' : 'Next slide'}
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!!draft}
                  onClick={() =>
                    setDraft(structuredClone(job.deck!.slides[index]!))
                  }
                >
                  {zh ? '编辑此页' : 'Edit slide'}
                </button>
                <a
                  className="ppt-studio__download"
                  href={projectFileDownloadUrl(job.projectId, job.pptx)}
                  download
                >
                  {zh ? '下载 PPTX' : 'Download PPTX'}
                </a>
              </div>
              <div
                className="ppt-studio__thumbnails"
                aria-label={zh ? '全部页面' : 'All slides'}
              >
                {job.previews.map((preview, i) => (
                  <button
                    key={preview}
                    type="button"
                    disabled={!!draft}
                    aria-label={`${i + 1}. ${job.deck!.slides[i]!.title}`}
                    aria-pressed={index === i}
                    onClick={() => setIndex(i)}
                  >
                    <img
                      loading="lazy"
                      src={projectFileUrl(job.projectId, preview)}
                      alt=""
                    />
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
              {draft && (
                <div className="ppt-studio__editor">
                  <h3>
                    {zh ? `编辑第 ${index + 1} 页` : `Edit slide ${index + 1}`}
                  </h3>
                  <label>
                    {zh ? '版式' : 'Layout'}
                    <select
                      value={draft.layout}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          layout: event.target
                            .value as PresentationSlide['layout'],
                        })
                      }
                    >
                      {PRESENTATION_LAYOUTS.map((layout) => (
                        <option value={layout} key={layout}>
                          {zh ? LAYOUT_LABELS[layout] : layout}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {zh ? '标题' : 'Title'}
                    <input
                      value={draft.title}
                      maxLength={64}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    {zh ? '说明' : 'Subtitle'}
                    <textarea
                      value={draft.subtitle}
                      maxLength={160}
                      rows={2}
                      onChange={(event) =>
                        setDraft({ ...draft, subtitle: event.target.value })
                      }
                    />
                  </label>
                  {draft.items.map((item, i) => (
                    <div className="ppt-studio__edit-item" key={item.id}>
                      <span>{i + 1}</span>
                      <label>
                        {zh ? '要点标题' : 'Item title'}
                        <input
                          maxLength={32}
                          value={item.title}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              items: draft.items.map((entry, j) =>
                                j === i
                                  ? { ...entry, title: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        {zh ? '要点内容' : 'Item body'}
                        <textarea
                          maxLength={100}
                          value={item.body}
                          rows={2}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              items: draft.items.map((entry, j) =>
                                j === i
                                  ? { ...entry, body: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  <details>
                    <summary>
                      {zh
                        ? '连接关系与演讲备注'
                        : 'Connections and speaker notes'}
                    </summary>
                    {draft.edges.map((edge, i) => (
                      <div className="ppt-studio__edge" key={i}>
                        {(['from', 'to'] as const).map((direction) => (
                          <label key={direction}>
                            {direction === 'from'
                              ? zh
                                ? '起点'
                                : 'From'
                              : zh
                                ? '终点'
                                : 'To'}
                            <select
                              value={edge[direction]}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  edges: draft.edges.map((entry, j) =>
                                    j === i
                                      ? {
                                          ...entry,
                                          [direction]: event.target.value,
                                        }
                                      : entry,
                                  ),
                                })
                              }
                            >
                              {draft.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <input
                          aria-label={zh ? '连线说明' : 'Connection label'}
                          maxLength={4}
                          value={edge.label}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              edges: draft.edges.map((entry, j) =>
                                j === i
                                  ? { ...entry, label: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              edges: draft.edges.filter((_, j) => j !== i),
                            })
                          }
                        >
                          {zh ? '移除' : 'Remove'}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={
                        draft.items.length < 2 || draft.edges.length >= 8
                      }
                      onClick={() =>
                        setDraft({
                          ...draft,
                          edges: [
                            ...draft.edges,
                            {
                              from: draft.items[0]!.id,
                              to: draft.items[1]!.id,
                              label: '',
                            },
                          ],
                        })
                      }
                    >
                      {zh ? '添加连接' : 'Add connection'}
                    </button>
                    <label>
                      {zh ? '演讲备注' : 'Speaker notes'}
                      <textarea
                        rows={4}
                        value={draft.notes}
                        maxLength={2400}
                        onChange={(event) =>
                          setDraft({ ...draft, notes: event.target.value })
                        }
                      />
                    </label>
                  </details>
                  <div className="ppt-studio__edit-actions">
                    <span>
                      {zh
                        ? '修改不消耗模型 Token'
                        : 'Editing uses no model tokens'}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setDraft(null)}
                    >
                      {zh ? '取消' : 'Cancel'}
                    </button>
                    <button
                      className="ppt-studio__primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void saveSlide()}
                    >
                      {saving
                        ? zh
                          ? '保存中…'
                          : 'Saving…'
                        : zh
                          ? '保存修改'
                          : 'Save changes'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : !job ? (
            <div className="ppt-studio__empty">
              <div className="ppt-studio__sample" aria-hidden="true">
                <span>01</span>
                <strong>{zh ? '清晰的结构' : 'A clear structure'}</strong>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <p>
                  {zh
                    ? '内容提炼　·　图形编排　·　统一配色'
                    : 'Clear content. Thoughtful layouts.'}
                </p>
              </div>
              <h3>{zh ? '从一份文档开始' : 'Start with a document'}</h3>
              <p>
                {zh
                  ? '生成后可逐页预览、修改文字与版式，下载后继续编辑。'
                  : 'Preview every slide, edit text and layouts, then download to keep editing.'}
              </p>
            </div>
          ) : null}
          {job?.usage && (
            <p className="ppt-studio__usage">
              {job.usage.model} · {job.usage.inputTokens.toLocaleString()}{' '}
              {zh ? '输入' : 'input'} /{' '}
              {job.usage.outputTokens.toLocaleString()}{' '}
              {zh ? '输出 Token' : 'output tokens'}
              {job.usage.estimatedUsd !== null
                ? ` · ${zh ? 'API 费用估算' : 'Estimated API cost'} $${job.usage.estimatedUsd.toFixed(4)} USD`
                : ''}
              <span>
                {zh
                  ? '含推理与自动重试，按记录时的标准价格估算，以账单为准。'
                  : 'Includes reasoning and retries. Standard-price estimate; actual billing may differ.'}
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
