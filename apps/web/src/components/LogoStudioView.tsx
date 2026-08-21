import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  LogoArchitecture,
  LogoBriefRequest,
  LogoBriefResponse,
  MediaTaskSnapshot,
  ProjectFile,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listProjectMediaTasks, startProjectMediaTask, waitForMediaTask } from '../providers/media';
import { fetchProjectFiles, projectFileUrl } from '../providers/registry';
import { createProject } from '../state/projects';
import { randomUUID } from '../utils/uuid';
import { Icon } from './Icon';
import { LogoColorPicker } from './LogoColorPicker';

const PERSONALITIES = ['precise', 'warm', 'bold', 'playful', 'premium', 'organic'] as const;
const APPLICATIONS = ['web', 'favicon', 'social', 'app-icon', 'print'] as const;
const ARCHITECTURES: LogoArchitecture[] = ['combination', 'symbol', 'wordmark', 'monogram'];
const PREPARE_TIMEOUT_MS = 30_000;
const IMAGE_MODEL = 'gpt-image-2';
const LAST_LOGO_PROJECT_STORAGE_KEY = 'niki:logo-studio:last-project';
const LOGO_DIRECTIONS = [
  'Iconic geometry: a bold, reduced silhouette built from simple original shapes and strong negative space.',
  'Letter-derived idea: transform a distinctive letter or word rhythm into an ownable brand signature.',
  'Modular system: construct the mark from repeatable parts that can expand into a flexible identity language.',
  'Expressive abstraction: use an unexpected but controlled visual metaphor with a clearly different silhouette.',
] as const;
const LOGO_OUTPUTS = LOGO_DIRECTIONS.map((_, index) => (
  `logo-direction-${String(index + 1).padStart(2, '0')}.png`
));

const COPY = {
  en: {
    brief: 'Brand brief',
    brand: 'Brand name',
    brandPlaceholder: 'e.g. Northstar',
    industry: 'Industry',
    industryPlaceholder: 'e.g. Climate analytics',
    audience: 'Audience',
    audiencePlaceholder: 'Who needs to trust or remember this brand?',
    architecture: 'Logo architecture',
    personality: 'Personality',
    palette: 'Starting palette',
    applications: 'Primary applications',
    avoid: 'Avoid',
    avoidPlaceholder: 'Competitor tropes, symbols, colors…',
    notes: 'Anything else?',
    notesPlaceholder: 'Origin story, naming meaning, cultural context, hard constraints…',
    submit: 'Generate 4 directions',
    submitting: 'Preparing studio…',
    generatingButton: 'Generating…',
    preview: 'Preview',
    previewHint: 'A structural reference for the brief. Generated directions replace this state.',
    generatingPreview: 'Generating 4 directions',
    generatingHint: 'Creating distinct logo concepts and production-ready files. This can take a few minutes.',
    results: 'Generated directions',
    resultCount: '4 images',
    required: 'Add a brand name and industry to continue.',
    failed: 'Could not generate the logo directions. Please try again.',
    incomplete: 'Generation finished without four image files. Please try again.',
    timeout: 'Starting the generation timed out. Please try again.',
    started: 'Generation started. Four directions are being prepared in the background.',
    completed: 'Generation complete. Four images are ready.',
    architectureLabels: {
      combination: 'Symbol + name',
      symbol: 'Symbol',
      wordmark: 'Wordmark',
      monogram: 'Monogram',
    },
  },
  zh: {
    brief: '品牌简报',
    brand: '品牌名称',
    brandPlaceholder: '例如：北辰',
    industry: '行业 / 品类',
    industryPlaceholder: '例如：气候数据分析',
    audience: '目标受众',
    audiencePlaceholder: '谁需要信任并记住这个品牌？',
    architecture: 'Logo 架构',
    personality: '品牌气质',
    palette: '起始色板',
    applications: '主要使用场景',
    avoid: '需要避开',
    avoidPlaceholder: '竞品套路、禁用符号、颜色或表达……',
    notes: '补充说明',
    notesPlaceholder: '品牌故事、命名含义、文化语境、硬性限制……',
    submit: '生成 4 个方向',
    submitting: '正在准备工作台……',
    generatingButton: '生成中…',
    preview: '预览',
    previewHint: '这里仅作为简报的结构参考，生成后会进入正式创意阶段。',
    generatingPreview: '正在生成 4 个方向',
    generatingHint: '正在创建不同的 Logo 概念与可交付文件，可能需要几分钟。',
    results: '生成结果',
    resultCount: '4 张图片',
    required: '请先填写品牌名称和行业。',
    failed: 'Logo 图片生成失败，请重试。',
    incomplete: '生成任务没有产出完整的 4 张图片，请重试。',
    timeout: '启动生成任务超时，请重试。',
    started: '生成任务已启动，系统正在后台准备四个方向。',
    completed: '生成完成，4 张图片已经准备好。',
    architectureLabels: {
      combination: '图形 + 字标',
      symbol: '独立图形',
      wordmark: '纯字标',
      monogram: '首字母组合',
    },
  },
} as const;

const PERSONALITY_LABELS: Record<(typeof PERSONALITIES)[number], { en: string; zh: string }> = {
  precise: { en: 'Precise', zh: '精准' },
  warm: { en: 'Warm', zh: '亲和' },
  bold: { en: 'Bold', zh: '大胆' },
  playful: { en: 'Playful', zh: '有趣' },
  premium: { en: 'Premium', zh: '高端' },
  organic: { en: 'Organic', zh: '自然' },
};

const APPLICATION_LABELS: Record<(typeof APPLICATIONS)[number], { en: string; zh: string }> = {
  web: { en: 'Web header', zh: '网页页头' },
  favicon: { en: 'Favicon', zh: '网站图标' },
  social: { en: 'Social avatar', zh: '社交头像' },
  'app-icon': { en: 'App icon', zh: '应用图标' },
  print: { en: 'Print', zh: '印刷物' },
};

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function splitList(value: string): string[] {
  return value.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean);
}

function logoResultFiles(files: ProjectFile[]): ProjectFile[] {
  const outputOrder = new Map(LOGO_OUTPUTS.map((name, index) => [name, index]));
  return files
    .filter((file) => outputOrder.has(file.name) && file.kind === 'image' && file.size > 0)
    .sort((left, right) => outputOrder.get(left.name)! - outputOrder.get(right.name)!);
}

async function waitForCompletedLogoTask(
  taskId: string,
  signal: AbortSignal,
): Promise<MediaTaskSnapshot> {
  let since = 0;
  while (!signal.aborted) {
    const task = await waitForMediaTask(taskId, since, signal);
    since = task.nextSince;
    if (task.status === 'queued' || task.status === 'running') continue;
    if (task.status === 'failed' || task.status === 'interrupted') {
      throw new Error(task.error?.message || 'Logo image generation failed.');
    }
    if (!task.file?.name || task.file.size === 0) {
      throw new Error('Logo image generation finished without a file.');
    }
    return task;
  }
  throw new DOMException('Logo image generation was canceled.', 'AbortError');
}

async function fetchCompletedLogoFiles(
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectFile[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const files = logoResultFiles(await fetchProjectFiles(projectId));
    if (files.length === LOGO_OUTPUTS.length) return files;
    if (attempt < 4) {
      await new Promise<void>((resolve, reject) => {
        const handleAbort = () => {
          window.clearTimeout(timeoutId);
          reject(new DOMException('Logo image generation was canceled.', 'AbortError'));
        };
        const timeoutId = window.setTimeout(() => {
          signal.removeEventListener('abort', handleAbort);
          resolve();
        }, 400);
        signal.addEventListener('abort', handleAbort, { once: true });
      });
    }
  }
  return [];
}

export function LogoStudioView() {
  const { locale } = useI18n();
  const language = locale.startsWith('zh') ? 'zh' : 'en';
  const copy = COPY[language];
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [architecture, setArchitecture] = useState<LogoArchitecture>('combination');
  const [personality, setPersonality] = useState<Array<(typeof PERSONALITIES)[number]>>([
    'precise',
    'bold',
  ]);
  const [applications, setApplications] = useState<Array<(typeof APPLICATIONS)[number]>>([
    'web',
    'favicon',
  ]);
  const [palette, setPalette] = useState(['#FF5A1F', '#151719', '#F4F1EA']);
  const [openPaletteIndex, setOpenPaletteIndex] = useState<number | null>(null);
  const [avoid, setAvoid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [resultFiles, setResultFiles] = useState<ProjectFile[]>([]);
  const [resultProjectId, setResultProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const paletteButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const runAbortRef = useRef<AbortController | null>(null);
  const prepareTimeoutRef = useRef<number | null>(null);
  const closeColorPicker = useCallback(() => setOpenPaletteIndex(null), []);

  const clearPrepareTimeout = useCallback(() => {
    if (prepareTimeoutRef.current !== null) {
      window.clearTimeout(prepareTimeoutRef.current);
      prepareTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearPrepareTimeout();
    runAbortRef.current?.abort();
    runAbortRef.current = null;
  }, [clearPrepareTimeout]);

  useEffect(() => {
    const projectId = window.localStorage.getItem(LAST_LOGO_PROJECT_STORAGE_KEY);
    if (!projectId) return undefined;
    const controller = new AbortController();
    runAbortRef.current = controller;
    void (async () => {
      try {
        const restored = logoResultFiles(await fetchProjectFiles(projectId));
        if (controller.signal.aborted) return;
        if (restored.length === LOGO_OUTPUTS.length) {
          setResultProjectId(projectId);
          setResultFiles(restored);
          setCompletedCount(LOGO_OUTPUTS.length);
          setSuccess(copy.completed);
          return;
        }

        const response = await listProjectMediaTasks(projectId);
        const tasks = response.tasks.filter((task) => (
          task.surface === 'image' && task.model === IMAGE_MODEL
        ));
        if (tasks.length === 0 || controller.signal.aborted) return;
        const failedTask = tasks.find((task) => (
          task.status === 'failed' || task.status === 'interrupted'
        ));
        if (failedTask) throw new Error(failedTask.error?.message || copy.failed);

        const activeTasks = tasks.filter((task) => (
          task.status === 'queued' || task.status === 'running'
        ));
        setResultProjectId(projectId);
        setCompletedCount(tasks.filter((task) => task.status === 'done').length);
        setGenerating(true);
        setSuccess(copy.started);
        await Promise.all(activeTasks.map(async (task) => {
          await waitForCompletedLogoTask(task.taskId, controller.signal);
          if (!controller.signal.aborted) {
            setCompletedCount((current) => Math.min(LOGO_OUTPUTS.length, current + 1));
          }
        }));
        if (controller.signal.aborted) return;

        const files = await fetchCompletedLogoFiles(projectId, controller.signal);
        if (files.length !== LOGO_OUTPUTS.length) throw new Error(copy.incomplete);
        setResultFiles(files);
        setCompletedCount(LOGO_OUTPUTS.length);
        setGenerating(false);
        setSuccess(copy.completed);
      } catch (restoreError) {
        if (controller.signal.aborted) return;
        setGenerating(false);
        setError(restoreError instanceof Error ? restoreError.message : copy.failed);
      } finally {
        if (runAbortRef.current === controller) runAbortRef.current = null;
      }
    })();
    return () => controller.abort();
  }, []);

  const brandParts = brandName.trim().split(/\s+/u).filter(Boolean);
  const initials = brandParts.length === 0
    ? 'N'
    : brandParts.slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase();
  const primaryColor = palette[0] ?? '#FF5A1F';
  const inkColor = palette[1] ?? '#151719';
  const paperColor = palette[2] ?? '#F4F1EA';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brandName.trim() || !industry.trim()) {
      setError(copy.required);
      return;
    }
    setSubmitting(true);
    setGenerating(true);
    setCompletedCount(0);
    setResultFiles([]);
    setResultProjectId(null);
    setError('');
    setSuccess('');
    runAbortRef.current?.abort();
    clearPrepareTimeout();
    const controller = new AbortController();
    runAbortRef.current = controller;
    prepareTimeoutRef.current = window.setTimeout(() => {
      if (runAbortRef.current !== controller) return;
      controller.abort();
      runAbortRef.current = null;
      prepareTimeoutRef.current = null;
      setSubmitting(false);
      setGenerating(false);
      setCompletedCount(0);
      setError(copy.timeout);
    }, PREPARE_TIMEOUT_MS);
    const request: LogoBriefRequest = {
      brandName,
      industry,
      audience,
      architecture,
      personality,
      palette,
      applications,
      avoid: splitList(avoid),
      notes,
    };
    try {
      const response = await fetch('/api/logo/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`logo brief failed: ${response.status}`);
      const { project } = await response.json() as LogoBriefResponse;
      const runPrompt = project.pendingPrompt?.trim();
      if (!runPrompt) throw new Error('logo brief did not include a generation prompt');
      const created = await createProject({
        name: project.name,
        skillId: project.skillId ?? 'logo-generator',
        designSystemId: project.designSystemId ?? null,
        metadata: {
          ...(project.metadata ?? {}),
          kind: 'image',
          imageModel: IMAGE_MODEL,
          imageAspect: '1:1',
          skipDiscoveryBrief: true,
        },
        pendingPrompt: runPrompt,
        ...(project.pluginId ? { pluginId: project.pluginId } : {}),
        ...(project.pluginInputs ? { pluginInputs: project.pluginInputs } : {}),
      }, { signal: controller.signal });
      if (!created) throw new Error('logo project creation failed');
      const projectId = created.project.id;
      window.localStorage.setItem(LAST_LOGO_PROJECT_STORAGE_KEY, projectId);
      const batchId = randomUUID();
      const acceptedTasks = await Promise.all(LOGO_DIRECTIONS.map((direction, index) => (
        startProjectMediaTask(projectId, {
          clientRequestId: `logo:${batchId}:${index + 1}`,
          surface: 'image',
          model: IMAGE_MODEL,
          quality: 'medium',
          aspect: '1:1',
          output: LOGO_OUTPUTS[index],
          prompt: [
            runPrompt,
            '',
            `For this request, render only Direction ${index + 1} of 4: ${direction}`,
            'The image must contain exactly one finished logo direction, centered on a plain background. Do not create a four-up board, labels, captions, watermarks, stationery, devices, or lifestyle mockups.',
          ].join('\n'),
        })
      )));

      clearPrepareTimeout();
      setSubmitting(false);
      setSuccess(copy.started);
      await Promise.all(acceptedTasks.map(async (task) => {
        await waitForCompletedLogoTask(task.taskId, controller.signal);
        if (runAbortRef.current === controller) {
          setCompletedCount((current) => Math.min(LOGO_OUTPUTS.length, current + 1));
        }
      }));
      if (runAbortRef.current !== controller) return;

      const files = await fetchCompletedLogoFiles(projectId, controller.signal);
      if (files.length !== LOGO_OUTPUTS.length) throw new Error(copy.incomplete);
      setResultProjectId(projectId);
      setResultFiles(files);
      setCompletedCount(LOGO_OUTPUTS.length);
      setGenerating(false);
      setSuccess(copy.completed);
      runAbortRef.current = null;
    } catch (submitError) {
      if (runAbortRef.current !== controller) return;
      clearPrepareTimeout();
      runAbortRef.current = null;
      setError(submitError instanceof Error ? submitError.message : copy.failed);
      setSubmitting(false);
      setGenerating(false);
      setCompletedCount(0);
    }
  }

  const hasResults = Boolean(resultProjectId && resultFiles.length === LOGO_OUTPUTS.length);
  const previewLabel = generating ? copy.generatingPreview : hasResults ? copy.results : copy.preview;

  return (
    <section className="logo-studio" aria-label={copy.brief}>
      <form className="logo-studio__layout" onSubmit={submit}>
        <div className="logo-studio__form-card">
          <div className="logo-studio__section-head">
            <span>{copy.brief}</span>
            <span>4 directions · 1 system</span>
          </div>

          <div className="logo-studio__field-grid">
            <label className="logo-studio__field">
              <span>{copy.brand}</span>
              <input
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder={copy.brandPlaceholder}
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="logo-studio__field">
              <span>{copy.industry}</span>
              <input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder={copy.industryPlaceholder}
                maxLength={100}
              />
            </label>
          </div>

          <label className="logo-studio__field">
            <span>{copy.audience}</span>
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder={copy.audiencePlaceholder}
              maxLength={240}
            />
          </label>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.architecture}</legend>
            <div className="logo-studio__architecture-grid">
              {ARCHITECTURES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={architecture === item ? 'is-selected' : ''}
                  aria-pressed={architecture === item}
                  onClick={() => setArchitecture(item)}
                >
                  <LogoArchitectureGlyph architecture={item} />
                  <span>{copy.architectureLabels[item]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.personality}</legend>
            <div className="logo-studio__chips">
              {PERSONALITIES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={personality.includes(item) ? 'is-selected' : ''}
                  aria-pressed={personality.includes(item)}
                  onClick={() => setPersonality((current) => toggleValue(current, item))}
                >
                  {PERSONALITY_LABELS[item][language]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.palette}</legend>
            <div className="logo-studio__palette">
              {palette.map((color, index) => (
                <div className="logo-studio__palette-item" key={index}>
                  <button
                    ref={(node) => { paletteButtonRefs.current[index] = node; }}
                    type="button"
                    className={openPaletteIndex === index ? 'is-open' : ''}
                    aria-label={`${copy.palette} ${index + 1}`}
                    aria-haspopup="dialog"
                    aria-expanded={openPaletteIndex === index}
                    title={color}
                    onClick={() => setOpenPaletteIndex((current) => current === index ? null : index)}
                  >
                    <span className="logo-studio__palette-swatch" style={{ backgroundColor: color }} />
                    <span>{color}</span>
                  </button>
                  {openPaletteIndex === index ? (
                    <LogoColorPicker
                      anchor={paletteButtonRefs.current[index] ?? null}
                      label={`${copy.palette} ${index + 1}`}
                      language={language}
                      value={color}
                      onChange={(nextColor) => setPalette((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? nextColor : item
                      )))}
                      onClose={closeColorPicker}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.applications}</legend>
            <div className="logo-studio__chips">
              {APPLICATIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={applications.includes(item) ? 'is-selected' : ''}
                  aria-pressed={applications.includes(item)}
                  onClick={() => setApplications((current) => toggleValue(current, item))}
                >
                  {APPLICATION_LABELS[item][language]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="logo-studio__field-grid">
            <label className="logo-studio__field">
              <span>{copy.avoid}</span>
              <textarea
                value={avoid}
                onChange={(event) => setAvoid(event.target.value)}
                placeholder={copy.avoidPlaceholder}
                rows={3}
              />
            </label>
            <label className="logo-studio__field">
              <span>{copy.notes}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={copy.notesPlaceholder}
                rows={3}
              />
            </label>
          </div>

          {error ? <p className="logo-studio__error" role="alert">{error}</p> : null}
          {success ? <p className="logo-studio__success" role="status">{success}</p> : null}
          <button className="logo-studio__submit" type="submit" disabled={submitting || generating}>
            <span>{submitting ? copy.submitting : generating ? copy.generatingButton : copy.submit}</span>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>

        <aside
          className="logo-studio__preview-card"
          aria-label={previewLabel}
          aria-busy={generating}
        >
          <div className="logo-studio__preview-head">
            <span>{previewLabel}</span>
            <span>{generating ? `${completedCount}/4` : hasResults ? copy.resultCount : '1:1'}</span>
          </div>
          <div
            className={`logo-studio__preview-stage${generating ? ' is-generating' : ''}${hasResults ? ' has-results' : ''}`}
            style={generating || hasResults ? undefined : { backgroundColor: paperColor, color: inkColor }}
          >
            {generating ? (
              <div
                className="logo-studio__generation-skeleton"
                data-testid="logo-generation-skeleton"
                role="status"
                aria-live="polite"
              >
                <div className="logo-studio__generation-grid" aria-hidden="true">
                  {Array.from({ length: 4 }, (_, index) => (
                    <span className="logo-studio__generation-tile" key={index}>
                      <i />
                      <b />
                    </span>
                  ))}
                </div>
                <div className="logo-studio__generation-copy">
                  <strong>{copy.generatingPreview} · {completedCount}/4</strong>
                  <span>{copy.generatingHint}</span>
                </div>
              </div>
            ) : hasResults ? (
              <div className="logo-studio__result-grid" data-testid="logo-result-grid">
                {resultFiles.map((file, index) => (
                  <a
                    href={projectFileUrl(resultProjectId!, file.name)}
                    key={file.name}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${copy.results} ${index + 1}`}
                  >
                    <img
                      src={`${projectFileUrl(resultProjectId!, file.name)}?v=${Math.round(file.mtime)}`}
                      alt={`Logo direction ${index + 1}`}
                    />
                    <span>{String.fromCharCode(65 + index)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <LogoPreview
                architecture={architecture}
                brandName={brandName || copy.brandPlaceholder}
                initials={initials}
                primary={primaryColor}
                ink={inkColor}
              />
            )}
          </div>
          {generating || hasResults ? null : (
            <div className="logo-studio__preview-meta">
              <div className="logo-studio__mini-marks">
                <span style={{ backgroundColor: inkColor, color: paperColor }}>{initials}</span>
                <span style={{ backgroundColor: paperColor, color: inkColor }}>{initials}</span>
                <span style={{ backgroundColor: primaryColor, color: paperColor }}>{initials}</span>
              </div>
              <p>{copy.previewHint}</p>
            </div>
          )}
        </aside>
      </form>
    </section>
  );
}

function LogoArchitectureGlyph({ architecture }: { architecture: LogoArchitecture }) {
  if (architecture === 'wordmark') return <span className="logo-studio__glyph-word">Aa</span>;
  if (architecture === 'monogram') return <span className="logo-studio__glyph-mono">NN</span>;
  if (architecture === 'symbol') return <span className="logo-studio__glyph-symbol" />;
  return (
    <span className="logo-studio__glyph-combo">
      <i />
      <b />
    </span>
  );
}

function LogoPreview({
  architecture,
  brandName,
  initials,
  primary,
  ink,
}: {
  architecture: LogoArchitecture;
  brandName: string;
  initials: string;
  primary: string;
  ink: string;
}) {
  const showSymbol = architecture !== 'wordmark';
  const showName = architecture === 'combination' || architecture === 'wordmark';
  return (
    <div className={`logo-studio__logo-preview is-${architecture}`}>
      {showSymbol ? (
        <svg viewBox="0 0 120 120" role="img" aria-label={`${brandName} mark preview`}>
          <path d="M18 75 49 21h53L71 75Z" fill={primary} />
          <path d="m18 75 31 24h53L71 75Z" fill={ink} />
          {architecture === 'monogram' ? (
            <text x="60" y="73" textAnchor="middle" fill="white" fontSize="28" fontWeight="800">
              {initials}
            </text>
          ) : null}
        </svg>
      ) : null}
      {showName ? <strong>{brandName}</strong> : null}
    </div>
  );
}
