'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  PRESENTATION_LAYOUTS,
  type PresentationJob,
  type PresentationListResponse,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import { projectFileDownloadUrl, projectFileUrl } from '../providers/registry';
import {
  PanelsTopLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';
import { PresentationComposer } from './PresentationComposer';
import { PresentationProgress } from './PresentationProgress';
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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<'create' | 'deck' | 'history'>('create');
  const [inspector, setInspector] = useState<'edit' | 'source'>('edit');
  const mounted = useRef(true);
  const selection = useRef<string | null>(null);
  const submittedProject = useRef<string | null>(null);
  const userNavigated = useRef(false);
  const running = job?.status === 'generating' || job?.status === 'rendering';
  const refreshHistory = useCallback(async () => {
    const result =
      await request<PresentationListResponse>('/api/presentations');
    if (mounted.current) {
      setHistory(result.presentations);
      setHistoryLoading(false);
    }
    return result.presentations;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshHistory()
      .then((items) => {
        if (mounted.current && !userNavigated.current && items[0]) {
          selection.current = items[0].projectId;
          setSelectedId(items[0].projectId);
          if (['generating', 'rendering'].includes(items[0].status))
            setView('deck');
        }
      })
      .catch((e: Error) => {
        if (mounted.current) {
          setError(e.message);
          setHistoryLoading(false);
        }
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
        if (controller.signal.aborted || selection.current !== selectedId)
          return;
        setJob(next);
        setError('');
        if (next.status === 'generating' || next.status === 'rendering')
          timer = setTimeout(() => void poll(), 2000);
        else void refreshHistory().catch(() => {});
      } catch (e) {
        if (controller.signal.aborted || selection.current !== selectedId)
          return;
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
  function chooseFile(next: File | null) {
    if (!next) {
      setFile(null);
      setError('');
      return;
    }
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
    userNavigated.current = true;
    selection.current = null;
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
      selection.current = next.projectId;
      submittedProject.current = next.projectId;
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
  const locked = busy || running || saving || !!draft;
  const current = job?.deck?.slides[index];
  // Only the selected job may render or publish poll results.
  const visibleJob = job?.projectId === selectedId ? job : null;
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  useEffect(() => {
    if (view !== 'deck' || !visibleJob?.deck || draft || saving || running)
      return;
    const count = visibleJob.deck.slides.length;
    const navigate = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="menu"]',
          ))
      )
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setIndex((value) =>
        Math.max(
          0,
          Math.min(count - 1, value + (event.key === 'ArrowRight' ? 1 : -1)),
        ),
      );
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [view, visibleJob, draft, saving, running]);
  const label = (layout: PresentationSlide['layout']) =>
    zh ? LAYOUT_LABELS[layout] : layout;
  const openJob = (id: string) => {
    userNavigated.current = true;
    selection.current = id;
    if (id !== selectedId) {
      setJob(null);
      setIndex(0);
      setPanelOpen(false);
    }
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
      aria-label={zh ? 'PPT 创作工作台' : 'Presentation studio'}
    >
      <header className="ppt-workbench__bar">
        <div className="ppt-workbench__brand">
          <span className="ppt-workbench__mark">
            <PanelsTopLeft size={21} />
          </span>
          <div>
            <strong>{zh ? '演示文稿' : 'Presentations'}</strong>
            <span>{zh ? '文档 → 演示文稿' : 'Document → Presentation'}</span>
          </div>
        </div>
        <nav aria-label={zh ? 'PPT 工作区' : 'Presentation workspace'}>
          <button
            type="button"
            aria-current={view === 'create' ? 'page' : undefined}
            disabled={locked}
            onClick={() => {
              userNavigated.current = true;
              setView('create');
            }}
          >
            {zh ? '开始创作' : 'Create'}
          </button>
          {(selectedId || busy || job) && (
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
              userNavigated.current = true;
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
        <PresentationComposer
          file={file}
          options={options}
          locked={locked}
          busy={busy}
          zh={zh}
          onFile={chooseFile}
          onOptions={setOptions}
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !locked) {
              void start(event);
              setView('deck');
            }
          }}
        />
      )}
      {view === 'history' && (
        <div className="ppt-workbench__library">
          <header>
            <h1>{zh ? '我的文稿' : 'My presentations'}</h1>
            <p>
              {zh
                ? '继续审阅、修改，或下载已有文稿。'
                : 'Continue reviewing, editing or exporting your work.'}
            </p>
          </header>
          {historyLoading ? (
            <p role="status">
              {zh ? '正在加载文稿…' : 'Loading presentations…'}
            </p>
          ) : history.length ? (
            <div>
              {history.map((item) => (
                <button
                  type="button"
                  key={item.projectId}
                  onClick={() => openJob(item.projectId)}
                >
                  <span className="ppt-workbench__history-icon">
                    <FileText size={27} strokeWidth={1.5} />
                  </span>
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
          {!visibleJob || busy || running || visibleJob.status === 'failed' ? (
            <PresentationProgress
              job={visibleJob}
              busy={busy}
              saving={saving}
              fileName={busy ? file?.name : undefined}
              loadError={!!error && !visibleJob && !busy}
              zh={zh}
              onRetry={() => void retryLayout()}
              onBack={() => {
                if (visibleJob?.status === 'failed') {
                  setOptions(visibleJob.options);
                  if (submittedProject.current !== visibleJob.projectId)
                    setFile(null);
                }
                setView('create');
              }}
            />
          ) : (
            current &&
            job?.deck && (
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
                    {job.html && !draft && !saving && (
                      <a
                        className="od-button od-button--secondary od-button--default"
                        href={projectFileUrl(job.projectId, job.html)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={16} />
                        {zh ? '演示' : 'Present'}
                      </a>
                    )}
                    {job.pptx && !draft && !saving && (
                      <a
                        className="od-button od-button--primary od-button--default"
                        href={projectFileDownloadUrl(job.projectId, job.pptx)}
                      >
                        <Download size={16} />
                        {zh ? '下载 PPTX' : 'Download PPTX'}
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
                {draft && (
                  <div className="ppt-workbench__draft-notice" role="status">
                    {zh
                      ? '本页有未保存的修改。保存或取消后，可以切换页面与导出。'
                      : 'This slide has unsaved changes. Save or cancel before changing slides or exporting.'}
                  </div>
                )}
                <div
                  className={`ppt-workbench__editor ${panelOpen ? 'has-inspector' : ''}`}
                >
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
                              job.previews?.[i] ?? '',
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
                      <Button
                        size="compact"
                        aria-pressed={panelOpen}
                        aria-controls="ppt-inspector"
                        disabled={saving || !!draft}
                        onClick={() => setPanelOpen(!panelOpen)}
                      >
                        <PanelRight size={16} />
                        {zh ? '编辑与原文' : 'Edit & source'}
                      </Button>
                      <div>
                        <button
                          type="button"
                          disabled={!!draft || saving || index === 0}
                          onClick={() => setPage(index - 1)}
                          aria-label={zh ? '上一页' : 'Previous'}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <span>
                          {index + 1} / {job.deck.slides.length}
                        </span>
                        <button
                          type="button"
                          disabled={
                            !!draft ||
                            saving ||
                            index === job.deck.slides.length - 1
                          }
                          onClick={() => setPage(index + 1)}
                          aria-label={zh ? '下一页' : 'Next'}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="ppt-workbench__stage">
                      <img
                        key={`${job.revision}-${index}`}
                        src={projectFileUrl(
                          job.projectId,
                          job.previews?.[index] ?? '',
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
                  <aside
                    id="ppt-inspector"
                    className="ppt-workbench__inspector"
                    aria-label={zh ? '编辑与原文' : 'Edit and source'}
                    hidden={!panelOpen}
                  >
                    <nav aria-label={zh ? '审阅面板' : 'Review panel'}>
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
                      <Button
                        variant="ghost"
                        size="compact"
                        aria-label={zh ? '收起面板' : 'Close panel'}
                        disabled={saving || !!draft}
                        onClick={() => setPanelOpen(false)}
                      >
                        <X size={16} />
                      </Button>
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
          {visibleJob?.usage && job?.usage && (
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
          <Button type="button" onClick={onEdit}>
            {zh ? '编辑本页' : 'Edit slide'} ↗
          </Button>
        )}
      </div>
      <fieldset disabled={!editing || saving}>
        <SelectField
          label={zh ? '版式' : 'Layout'}
          value={slide.layout}
          disabled={!editing || saving}
          options={PRESENTATION_LAYOUTS.map((value) => ({
            value,
            label: zh ? LAYOUT_LABELS[value] : value,
          }))}
          onChange={(value) =>
            onChange({ ...slide, layout: value as PresentationSlide['layout'] })
          }
        />
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
              <Button
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
              </Button>
            )}
          </div>
        ))}
        {editing && (
          <Button
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
          </Button>
        )}
        <details>
          <summary>
            {zh ? '连接关系' : 'Connections'} ({slide.edges.length})
          </summary>
          {slide.edges.map((edge, i) => (
            <div className="ppt-workbench__edge-form" key={i}>
              {(['from', 'to'] as const).map((k) => (
                <SelectField
                  key={k}
                  label={
                    k === 'from' ? (zh ? '起点' : 'From') : zh ? '终点' : 'To'
                  }
                  disabled={!editing || saving}
                  value={edge[k]}
                  options={slide.items.map((item) => ({
                    value: item.id,
                    label: item.title,
                  }))}
                  onChange={(value) =>
                    onChange({
                      ...slide,
                      edges: slide.edges.map((item, j) =>
                        j === i ? { ...item, [k]: value } : item,
                      ),
                    })
                  }
                />
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
                <Button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...slide,
                      edges: slide.edges.filter((_, j) => j !== i),
                    })
                  }
                >
                  {zh ? '移除连接' : 'Remove'}
                </Button>
              )}
            </div>
          ))}
          {editing && (
            <Button
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
            </Button>
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
          <Button type="button" disabled={saving} onClick={onCancel}>
            {zh ? '取消' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
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
          </Button>
        </footer>
      )}
    </div>
  );
}
