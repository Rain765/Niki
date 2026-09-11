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
  style: 'swiss',
  density: 'complete',
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
  editorial: '编辑式正文',
  table: '规格与信息表',
  metrics: '关键数据',
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
        if (mounted.current && items[0]) {
          setSelectedId(items[0].projectId);
          if (['generating', 'rendering'].includes(items[0].status))
            setView('deck');
        }
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
    setSelectedId(null);
    setJob(null);
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
      if (mounted.current) {
        setError((e as Error).message);
        setView('create');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function retryLayout() {
    if (!job?.deck?.slides[0] || saving) return;
    setSaving(true);
    setError('');
    try {
      const next = await request<PresentationJob>(statusUrl(job.projectId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: job.revision,
          slideIndex: 0,
          slide: job.deck.slides[0],
        }),
      });
      if (mounted.current) {
        setJob(next);
        void refreshHistory().catch(() => {});
      }
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      if (mounted.current) setSaving(false);
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
  const [view, setView] = useState<'create' | 'deck' | 'history'>('create');
  const [inspector, setInspector] = useState<'edit' | 'source'>('edit');
  const locked = busy || running || saving || !!draft;
  const current = job?.deck?.slides[index];
  const pageLabel = (value: (typeof PRESENTATION_PAGE_COUNTS)[number]) =>
    value === 'auto'
      ? zh
        ? '按内容自动'
        : 'Fit content'
      : `${value}${zh ? ' 页' : ' slides'}`;
  const label = (layout: PresentationSlide['layout']) =>
    zh ? LAYOUT_LABELS[layout] : layout;
  const openJob = (id: string) => {
    setSelectedId(id);
    setView('deck');
    setError('');
  };
  const setPage = (page: number) => {
    if (!draft && !saving) setIndex(page);
  };
  return (
    <section
      className="ppt-workbench"
      style={
        {
          '--ppt-theme': `var(--presentation-${options.palette})`,
        } as CSSProperties
      }
      aria-label={zh ? 'PPT 创作工作台' : 'Presentation studio'}
    >
      <header className="ppt-workbench__bar">
        <div className="ppt-workbench__brand">
          <span className="ppt-workbench__mark">P</span>
          <div>
            <strong>{zh ? '演示文稿' : 'Presentations'}</strong>
            <span>PRESENTATION STUDIO</span>
          </div>
        </div>
        <nav aria-label={zh ? 'PPT 工作区' : 'Presentation workspace'}>
          <button
            type="button"
            aria-current={view === 'create' ? 'page' : undefined}
            disabled={locked}
            onClick={() => setView('create')}
          >
            {zh ? '开始创作' : 'Create'}
          </button>
          {job && (
            <button
              type="button"
              aria-current={view === 'deck' ? 'page' : undefined}
              onClick={() => setView('deck')}
            >
              {zh ? '当前文稿' : 'Current deck'}
            </button>
          )}
          <button
            type="button"
            aria-current={view === 'history' ? 'page' : undefined}
            disabled={busy || saving || !!draft}
            onClick={() => {
              setView('history');
              void refreshHistory().catch(() => {});
            }}
          >
            {zh ? '我的文稿' : 'My presentations'}
            <span>{history.length}</span>
          </button>
        </nav>
      </header>
      {error && (
        <div className="ppt-workbench__notice is-error" role="alert">
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
      {view === 'create' && (
        <>
          <header className="ppt-workbench__intro">
            <span>FROM DOCUMENT TO DESIGN</span>
            <h1>
              {zh ? (
                <>
                  信息完整，
                  <br />
                  表达有序。
                </>
              ) : (
                <>
                  Keep the detail.
                  <br />
                  Find the structure.
                </>
              )}
            </h1>
            <p>
              {zh
                ? '从一份文档出发，用清晰的版式讲清楚你的内容。'
                : 'Give your document a clear structure and a considered visual language.'}
            </p>
            <div>
              <span>01 / {zh ? '导入文档' : 'Import'}</span>
              <span>02 / {zh ? '选择表达' : 'Design'}</span>
              <span>03 / {zh ? '审阅与导出' : 'Review'}</span>
            </div>
          </header>
          <form
            className="ppt-workbench__composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (file && !locked) {
                void start(e);
                setView('deck');
              }
            }}
          >
            <div className="ppt-workbench__compose-main">
              <section className="ppt-workbench__source-upload">
                <div className="ppt-workbench__section-label">
                  <span>01</span>
                  <h2>{zh ? '你的内容' : 'Your source'}</h2>
                  <small>PDF · DOCX · MD · TXT</small>
                </div>
                <input
                  className="ppt-workbench__hidden"
                  ref={chooser}
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  disabled={locked}
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className={`ppt-workbench__drop ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
                  disabled={locked}
                  onClick={() => chooser.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!locked) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!locked) chooseFile(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="ppt-workbench__file-symbol">↥</span>
                  <strong>
                    {file
                      ? file.name
                      : zh
                        ? '拖入文档，或点击上传'
                        : 'Drop a document, or browse'}
                  </strong>
                  <span>
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB · ${zh ? '点击替换' : 'Click to replace'}`
                      : zh
                        ? '最大 10 MB · 扫描件需先识别文字'
                        : 'Up to 10 MB · Scans need OCR first'}
                  </span>
                </button>
                <label className="ppt-workbench__brief">
                  {zh
                    ? '这份 PPT 要讲给谁听？'
                    : 'Who is this presentation for?'}
                  <span>{zh ? '选填' : 'Optional'}</span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    disabled={locked}
                    value={options.prompt}
                    onChange={(e) =>
                      setOptions({ ...options, prompt: e.target.value })
                    }
                    placeholder={
                      zh
                        ? '例如：面向业务团队讲解方案，保留流程、关键数据和异常处理。'
                        : 'For example: Explain the proposal to the team, retaining data, process and exceptions.'
                    }
                  />
                </label>
              </section>
              <section>
                <div className="ppt-workbench__section-label">
                  <span>02</span>
                  <h2>{zh ? '选择表达方式' : 'Choose a visual direction'}</h2>
                </div>
                <div className="ppt-workbench__styles">
                  {(['swiss', 'editorial'] as const).map((style) => (
                    <button
                      className={`ppt-workbench__style ${style}`}
                      type="button"
                      key={style}
                      disabled={locked}
                      aria-pressed={(options.style ?? 'swiss') === style}
                      onClick={() => setOptions({ ...options, style })}
                    >
                      <img
                        src={`/api/presentations/styles/${style}?palette=${options.palette}`}
                        alt={
                          style === 'swiss'
                            ? zh
                              ? '瑞士网格版式示例'
                              : 'Swiss grid layout sample'
                            : zh
                              ? '编辑式版式示例'
                              : 'Editorial layout sample'
                        }
                      />
                      <span>
                        <strong>
                          {style === 'swiss'
                            ? zh
                              ? '瑞士网格'
                              : 'Swiss grid'
                            : zh
                              ? '编辑式报告'
                              : 'Editorial report'}
                        </strong>
                        <i>
                          {(options.style ?? 'swiss') === style ? '✓' : '○'}
                        </i>
                      </span>
                      <small>
                        {style === 'swiss'
                          ? zh
                            ? '清晰对齐 · 图形结构 · 数据表达'
                            : 'Precise grids · Systems · Data'
                          : zh
                            ? '文字层次 · 完整论述 · 阅读节奏'
                            : 'Typography · Detail · Reading rhythm'}
                      </small>
                    </button>
                  ))}
                </div>
                <fieldset className="ppt-workbench__palette">
                  <legend>
                    {zh ? '主题色' : 'Color'}
                    <span>
                      {
                        PRESENTATION_PALETTES[options.palette][
                          zh ? 'zh' : 'name'
                        ]
                      }
                    </span>
                  </legend>
                  <div>
                    {Object.entries(PRESENTATION_PALETTES).map(
                      ([key, value]) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={value[zh ? 'zh' : 'name']}
                          title={value[zh ? 'zh' : 'name']}
                          disabled={locked}
                          aria-pressed={options.palette === key}
                          onClick={() =>
                            setOptions({
                              ...options,
                              palette: key as PresentationOptions['palette'],
                            })
                          }
                          style={
                            {
                              '--ppt-swatch': `var(--presentation-${key})`,
                            } as CSSProperties
                          }
                        >
                          <span />
                        </button>
                      ),
                    )}
                  </div>
                </fieldset>
              </section>
            </div>
            <footer className="ppt-workbench__settings">
              <label>
                {zh ? '画布比例' : 'Canvas'}
                <select
                  disabled={locked}
                  value={options.ratio}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      ratio: e.target.value as PresentationOptions['ratio'],
                    })
                  }
                >
                  {PRESENTATION_RATIOS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                {zh ? '页数' : 'Length'}
                <select
                  disabled={locked}
                  value={options.pageCount}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      pageCount:
                        e.target.value === 'auto'
                          ? 'auto'
                          : (Number(
                              e.target.value,
                            ) as PresentationOptions['pageCount']),
                    })
                  }
                >
                  {PRESENTATION_PAGE_COUNTS.map((x) => (
                    <option key={x} value={x}>
                      {pageLabel(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {zh ? '信息密度' : 'Content depth'}
                <select
                  disabled={locked}
                  value={options.density ?? 'complete'}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      density: e.target.value as PresentationOptions['density'],
                    })
                  }
                >
                  <option value="complete">
                    {zh ? '完整讲解' : 'Full detail'}
                  </option>
                  <option value="brief">
                    {zh ? '重点摘要' : 'Brief summary'}
                  </option>
                </select>
              </label>
              <button
                type="submit"
                className="ppt-workbench__primary"
                disabled={!file || locked}
              >
                {busy || running
                  ? zh
                    ? '生成中…'
                    : 'Creating…'
                  : zh
                    ? '生成演示文稿'
                    : 'Create presentation'}{' '}
                <span>↗</span>
              </button>
            </footer>
            <p className="ppt-workbench__footnote">
              {options.pageCount === 'auto'
                ? zh
                  ? '按内容安排 5–30 页。默认保留重要论点、数据、条件与步骤，生成后可逐页对照原文。'
                  : 'Automatically plans 5–30 slides. Review source passages alongside each slide.'
                : zh
                  ? '页数包含封面与结尾。长文档指定较少页数会压缩表达空间，建议选择「按内容自动」。'
                  : 'Length includes cover and closing. Choose automatic length to give longer documents more room.'}
            </p>
          </form>
        </>
      )}
      {view === 'history' && (
        <div className="ppt-workbench__library">
          <header>
            <span>YOUR COLLECTION</span>
            <h1>{zh ? '我的文稿' : 'My presentations'}</h1>
            <p>
              {zh
                ? '继续审阅、修改，或下载已有文稿。'
                : 'Continue reviewing, editing or exporting your work.'}
            </p>
          </header>
          {history.length ? (
            <div>
              {history.map((item) => (
                <button
                  type="button"
                  key={item.projectId}
                  onClick={() => openJob(item.projectId)}
                >
                  <span className="ppt-workbench__history-icon">P</span>
                  <strong>{item.title}</strong>
                  <small>{item.sourceName}</small>
                  <footer>
                    <time>
                      {new Date(item.createdAt).toLocaleDateString(
                        zh ? 'zh-CN' : 'en',
                      )}
                    </time>
                    <span>
                      {item.status === 'complete'
                        ? zh
                          ? '打开文稿 ↗'
                          : 'Open ↗'
                        : item.status === 'failed'
                          ? zh
                            ? '生成未完成'
                            : 'Failed'
                          : zh
                            ? '生成中'
                            : 'Generating'}
                    </span>
                  </footer>
                </button>
              ))}
            </div>
          ) : (
            <p>
              {zh
                ? '还没有文稿，从上传第一份文档开始。'
                : 'Upload your first document to get started.'}
            </p>
          )}
        </div>
      )}
      {view === 'deck' && (
        <>
          {!job || busy || running || job.status === 'failed' ? (
            <div className="ppt-workbench__progress">
              <span className={running || busy ? 'is-working' : ''}>P</span>
              <h1>
                {job?.status === 'failed'
                  ? zh
                    ? '这次生成未完成'
                    : 'Could not finish this deck'
                  : zh
                    ? '正在组织内容与版式'
                    : 'Organizing content and layouts'}
              </h1>
              <p>
                {job?.status === 'failed'
                  ? job.error
                  : zh
                    ? '保留原文细节，编排页面，再生成可编辑文件。文档越长，需要的时间越多。'
                    : 'Preserving detail, composing slides and building editable files. Longer documents take more time.'}
              </p>
              {job?.status === 'failed' && job.deck && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void retryLayout()}
                >
                  {saving
                    ? zh
                      ? '排版中…'
                      : 'Rendering…'
                    : zh
                      ? '重试排版 · 不调用模型'
                      : 'Retry layout · no model call'}
                </button>
              )}
              {job?.status === 'failed' && (
                <button type="button" onClick={() => setView('create')}>
                  {zh ? '返回调整' : 'Back to settings'}
                </button>
              )}
            </div>
          ) : (
            current &&
            job.deck && (
              <>
                <header className="ppt-workbench__document-bar">
                  <div>
                    <h1>{job.deck.title}</h1>
                    <p>
                      {job.sourceName}{' '}
                      <span>
                        · {job.deck.slides.length} {zh ? '页' : 'slides'} ·{' '}
                        {job.options.ratio}
                      </span>
                    </p>
                  </div>
                  <div>
                    {job.html && (
                      <a
                        href={projectFileUrl(job.projectId, job.html)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {zh ? '打开演示 ↗' : 'Present ↗'}
                      </a>
                    )}
                    {job.pptx && (
                      <a
                        className="ppt-workbench__primary"
                        href={projectFileDownloadUrl(job.projectId, job.pptx)}
                      >
                        {zh ? '下载 PPTX ↓' : 'Download PPTX ↓'}
                      </a>
                    )}
                  </div>
                </header>
                {!!job.deck.warnings?.length && (
                  <div className="ppt-workbench__notice">
                    {job.deck.warnings.map((w, i) => (
                      <p key={i}>
                        {zh ? w.split(' / ')[0] : (w.split(' / ')[1] ?? w)}
                      </p>
                    ))}
                  </div>
                )}
                <div className="ppt-workbench__editor">
                  <aside
                    className="ppt-workbench__filmstrip"
                    aria-label={zh ? '页面列表' : 'Slides'}
                  >
                    {job.deck.slides.map((s, i) => (
                      <button
                        type="button"
                        key={i}
                        disabled={!!draft || saving}
                        aria-current={i === index ? 'true' : undefined}
                        onClick={() => setPage(i)}
                      >
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <img
                            loading="lazy"
                            src={projectFileUrl(
                              job.projectId,
                              job.previews![i]!,
                            )}
                            alt={s.title}
                          />
                          <strong>{s.title}</strong>
                        </div>
                      </button>
                    ))}
                  </aside>
                  <div className="ppt-workbench__canvas">
                    <div className="ppt-workbench__canvas-toolbar">
                      <span>{label(current.layout)}</span>
                      <div>
                        <button
                          type="button"
                          disabled={!!draft || index === 0}
                          onClick={() => setPage(index - 1)}
                          aria-label={zh ? '上一页' : 'Previous'}
                        >
                          ←
                        </button>
                        <span>
                          {index + 1} / {job.deck.slides.length}
                        </span>
                        <button
                          type="button"
                          disabled={
                            !!draft || index === job.deck.slides.length - 1
                          }
                          onClick={() => setPage(index + 1)}
                          aria-label={zh ? '下一页' : 'Next'}
                        >
                          →
                        </button>
                      </div>
                    </div>
                    <div className="ppt-workbench__stage">
                      <img
                        key={`${job.revision}-${index}`}
                        src={projectFileUrl(
                          job.projectId,
                          job.previews![index]!,
                        )}
                        alt={current.title}
                      />
                    </div>
                    <p>
                      {zh
                        ? '文字、图形与连接线均可在下载后的 PowerPoint 中继续编辑。'
                        : 'Text, shapes and connections remain editable in PowerPoint.'}
                    </p>
                  </div>
                  <aside className="ppt-workbench__inspector">
                    <nav>
                      <button
                        type="button"
                        aria-pressed={inspector === 'edit'}
                        onClick={() => setInspector('edit')}
                      >
                        {zh ? '页面内容' : 'Content'}
                      </button>
                      <button
                        type="button"
                        aria-pressed={inspector === 'source'}
                        onClick={() => setInspector('source')}
                      >
                        {zh ? '对照原文' : 'Source'}
                      </button>
                    </nav>
                    {inspector === 'source' ? (
                      <div className="ppt-workbench__source-panel">
                        <p>
                          {zh
                            ? '以下为原始文档段落。引用标记仅说明来源关联，不代表全部信息已呈现在页面。'
                            : 'Original passages. A reference indicates association, not proof that every detail is on the slide.'}
                        </p>
                        {job.deck.sourceBlocks?.length ? (
                          job.deck.sourceBlocks.map((block, i) => (
                            <details
                              key={i}
                              open={current.sourceRefs?.includes(i + 1)}
                            >
                              <summary>
                                {zh ? '原文' : 'Passage'} {i + 1}
                                {current.sourceRefs?.includes(i + 1)
                                  ? zh
                                    ? ' · 本页引用'
                                    : ' · Cited here'
                                  : ''}
                              </summary>
                              <pre>{block}</pre>
                            </details>
                          ))
                        ) : (
                          <p>
                            {zh
                              ? '旧版文稿未保存逐页原文引用。重新生成后可使用此功能。'
                              : 'Source references are available for newly generated presentations.'}
                          </p>
                        )}
                      </div>
                    ) : (
                      <SlideEditor
                        slide={draft ?? current}
                        editing={!!draft}
                        saving={saving}
                        zh={zh}
                        onChange={setDraft}
                        onEdit={() => setDraft(structuredClone(current))}
                        onCancel={() => setDraft(null)}
                        onSave={() => void saveSlide()}
                      />
                    )}
                  </aside>
                </div>
              </>
            )
          )}
          {job?.usage && (
            <p className="ppt-workbench__usage">
              {job.usage.model} · {job.usage.inputTokens.toLocaleString()}{' '}
              {zh ? '输入' : 'input'} /{' '}
              {job.usage.outputTokens.toLocaleString()}{' '}
              {zh ? '输出 Token' : 'output tokens'}
              {job.usage.estimatedUsd != null
                ? ` · $${job.usage.estimatedUsd.toFixed(4)} USD`
                : ''}
              <span>
                {zh
                  ? '含推理与自动重试，费用为估算，以账单为准。手动修改不消耗模型 Token。'
                  : 'Includes reasoning and retries; billing may differ. Manual editing uses no model tokens.'}
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SlideEditor({
  slide,
  editing,
  saving,
  zh,
  onChange,
  onEdit,
  onCancel,
  onSave,
}: {
  slide: PresentationSlide;
  editing: boolean;
  saving: boolean;
  zh: boolean;
  onChange: (s: PresentationSlide) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="ppt-workbench__slide-form">
      <div className="ppt-workbench__edit-heading">
        <span>{zh ? '逐页审阅' : 'Review slide'}</span>
        {!editing && (
          <button type="button" onClick={onEdit}>
            {zh ? '编辑本页' : 'Edit slide'} ↗
          </button>
        )}
      </div>
      <fieldset disabled={!editing || saving}>
        <label>
          {zh ? '版式' : 'Layout'}
          <select
            value={slide.layout}
            onChange={(e) =>
              onChange({
                ...slide,
                layout: e.target.value as PresentationSlide['layout'],
              })
            }
          >
            {PRESENTATION_LAYOUTS.map((x) => (
              <option value={x} key={x}>
                {zh ? LAYOUT_LABELS[x] : x}
              </option>
            ))}
          </select>
        </label>
        <label>
          {zh ? '标题' : 'Title'}
          <textarea
            rows={2}
            maxLength={100}
            value={slide.title}
            onChange={(e) => onChange({ ...slide, title: e.target.value })}
          />
        </label>
        <label>
          {zh ? '引导文字' : 'Lead'}
          <textarea
            rows={3}
            maxLength={400}
            value={slide.subtitle}
            onChange={(e) => onChange({ ...slide, subtitle: e.target.value })}
          />
        </label>
        {slide.items.map((item, i) => (
          <div className="ppt-workbench__item-form" key={item.id}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <label>
              {zh ? '小标题' : 'Heading'}
              <input
                maxLength={80}
                value={item.title}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    items: slide.items.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              {zh ? '完整说明' : 'Description'}
              <textarea
                rows={5}
                maxLength={600}
                value={item.body}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    items: slide.items.map((x, j) =>
                      j === i ? { ...x, body: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            {editing && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...slide,
                    items: slide.items.filter((_, j) => j !== i),
                    edges: slide.edges.filter(
                      (e) => e.from !== item.id && e.to !== item.id,
                    ),
                  })
                }
              >
                {zh ? '移除内容块' : 'Remove block'}
              </button>
            )}
          </div>
        ))}
        {editing && (
          <button
            type="button"
            disabled={slide.items.length >= 12}
            onClick={() =>
              onChange({
                ...slide,
                items: [
                  ...slide.items,
                  {
                    id: crypto.randomUUID().slice(0, 18),
                    title: zh ? '新内容' : 'New section',
                    body: '',
                  },
                ],
              })
            }
          >
            ＋ {zh ? '添加内容块' : 'Add content block'}
          </button>
        )}
        <details>
          <summary>
            {zh ? '连接关系' : 'Connections'} ({slide.edges.length})
          </summary>
          {slide.edges.map((edge, i) => (
            <div className="ppt-workbench__edge-form" key={i}>
              {(['from', 'to'] as const).map((k) => (
                <label key={k}>
                  {k === 'from' ? (zh ? '起点' : 'From') : zh ? '终点' : 'To'}
                  <select
                    value={edge[k]}
                    onChange={(e) =>
                      onChange({
                        ...slide,
                        edges: slide.edges.map((x, j) =>
                          j === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {slide.items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <input
                aria-label={zh ? '连线说明' : 'Connection label'}
                maxLength={12}
                value={edge.label}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    edges: slide.edges.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              {editing && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...slide,
                      edges: slide.edges.filter((_, j) => j !== i),
                    })
                  }
                >
                  {zh ? '移除连接' : 'Remove'}
                </button>
              )}
            </div>
          ))}
          {editing && (
            <button
              type="button"
              disabled={slide.items.length < 2 || slide.edges.length >= 16}
              onClick={() =>
                onChange({
                  ...slide,
                  edges: [
                    ...slide.edges,
                    {
                      from: slide.items[0]!.id,
                      to: slide.items[1]!.id,
                      label: '',
                    },
                  ],
                })
              }
            >
              ＋ {zh ? '添加连接' : 'Add connection'}
            </button>
          )}
        </details>
        <label>
          {zh ? '演讲备注' : 'Speaker notes'}
          <textarea
            rows={5}
            maxLength={6000}
            value={slide.notes}
            onChange={(e) => onChange({ ...slide, notes: e.target.value })}
          />
        </label>
      </fieldset>
      {editing && (
        <footer>
          <button type="button" disabled={saving} onClick={onCancel}>
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            className="ppt-workbench__primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving
              ? zh
                ? '保存中…'
                : 'Saving…'
              : zh
                ? '保存并更新版式'
                : 'Save changes'}
          </button>
        </footer>
      )}
    </div>
  );
}
