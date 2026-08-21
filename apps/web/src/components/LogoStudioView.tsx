import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  LogoArchitecture,
  LogoBriefRequest,
  LogoBriefResponse,
  MediaTaskSnapshot,
  Project,
  ProjectFile,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listProjectMediaTasks, startProjectMediaTask, waitForMediaTask } from '../providers/media';
import { fetchProjectFiles, projectFileUrl } from '../providers/registry';
import { createProject, listProjects } from '../state/projects';
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

type LogoHistoryStatus = 'working' | 'complete' | 'failed' | 'incomplete';

interface LogoHistoryEntry {
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: LogoHistoryStatus;
  completedCount: number;
  taskCount: number;
  files: ProjectFile[];
  error?: string;
}

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
    previewHint: 'A structural reference for the brief. Generated directions appear in history below.',
    generatingPreview: 'Generating 4 directions',
    generatingHint: 'Creating distinct logo concepts and production-ready files. This can take a few minutes.',
    history: 'Generation history',
    historyEyebrow: 'Saved work',
    historyLoading: 'Loading saved logo generations…',
    historyEmpty: 'Generated logo directions will appear here.',
    historyBatches: 'batches',
    historyImages: 'images',
    historyComplete: 'Complete',
    historyWorking: 'Generating',
    historyFailed: 'Failed',
    historyIncomplete: 'Incomplete',
    direction: 'Direction',
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
    previewHint: '这里仅作为简报的结构参考，生成结果会保存在下方记录中。',
    generatingPreview: '正在生成 4 个方向',
    generatingHint: '正在创建不同的 Logo 概念与可交付文件，可能需要几分钟。',
    history: '生成记录',
    historyEyebrow: '已保存作品',
    historyLoading: '正在加载历史生成记录……',
    historyEmpty: '生成的 Logo 方向会保存在这里。',
    historyBatches: '批',
    historyImages: '张图片',
    historyComplete: '已完成',
    historyWorking: '生成中',
    historyFailed: '生成失败',
    historyIncomplete: '结果不完整',
    direction: '方向',
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

function historyEntryFromProject(
  project: Project,
  tasks: MediaTaskSnapshot[],
  files: ProjectFile[],
): LogoHistoryEntry | null {
  const logoTasks = tasks.filter((task) => (
    'surface' in task && 'model' in task
      ? task.surface === 'image' && task.model === IMAGE_MODEL
      : true
  ));
  const resultFiles = logoResultFiles(files);
  if (logoTasks.length === 0 && resultFiles.length === 0) return null;

  const active = logoTasks.some((task) => task.status === 'queued' || task.status === 'running');
  const failedTask = logoTasks.find((task) => (
    task.status === 'failed' || task.status === 'interrupted'
  ));
  const status: LogoHistoryStatus = resultFiles.length === LOGO_OUTPUTS.length
    ? 'complete'
    : active
      ? 'working'
      : failedTask
        ? 'failed'
        : 'incomplete';

  return {
    projectId: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    status,
    completedCount: Math.min(LOGO_OUTPUTS.length, Math.max(
      resultFiles.length,
      logoTasks.filter((task) => task.status === 'done').length,
    )),
    taskCount: LOGO_OUTPUTS.length,
    files: resultFiles,
    ...(failedTask?.error?.message ? { error: failedTask.error.message } : {}),
  };
}

function upsertHistoryEntry(
  entries: LogoHistoryEntry[],
  next: LogoHistoryEntry,
): LogoHistoryEntry[] {
  return [next, ...entries.filter((entry) => entry.projectId !== next.projectId)]
    .sort((left, right) => right.createdAt - left.createdAt);
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
  const [historyEntries, setHistoryEntries] = useState<LogoHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
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

  const refreshHistory = useCallback(async (
    signal?: AbortSignal,
    showLoading = false,
  ) => {
    if (showLoading) setHistoryLoading(true);
    const projects = (await listProjects())
      .filter((project) => project.skillId === 'logo-generator')
      .sort((left, right) => right.createdAt - left.createdAt);
    const entries = await Promise.all(projects.map(async (project) => {
      try {
        const [files, response] = await Promise.all([
          fetchProjectFiles(project.id),
          listProjectMediaTasks(project.id).catch(() => ({ tasks: [] })),
        ]);
        return historyEntryFromProject(project, response.tasks, files);
      } catch {
        return null;
      }
    }));
    if (signal?.aborted) return;
    setHistoryEntries(entries.filter((entry): entry is LogoHistoryEntry => Boolean(entry)));
    setHistoryLoading(false);
  }, []);

  useEffect(() => () => {
    clearPrepareTimeout();
    runAbortRef.current?.abort();
    runAbortRef.current = null;
  }, [clearPrepareTimeout]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshHistory(controller.signal, true);
    return () => controller.abort();
  }, [refreshHistory]);

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
        setCompletedCount(LOGO_OUTPUTS.length);
        setGenerating(false);
        setSuccess(copy.completed);
        await refreshHistory(controller.signal);
      } catch (restoreError) {
        if (controller.signal.aborted) return;
        setGenerating(false);
        setError(restoreError instanceof Error ? restoreError.message : copy.failed);
        await refreshHistory(controller.signal);
      } finally {
        if (runAbortRef.current === controller) runAbortRef.current = null;
      }
    })();
    return () => controller.abort();
  }, [copy.completed, copy.failed, copy.incomplete, copy.started, refreshHistory]);

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
    setError('');
    setSuccess('');
    runAbortRef.current?.abort();
    clearPrepareTimeout();
    const controller = new AbortController();
    let activeProjectId: string | null = null;
    let activeProjectName = `${brandName.trim()} Logo`;
    let activeProjectCreatedAt = Date.now();
    const markActiveHistoryFailed = (message: string) => {
      if (!activeProjectId) return;
      setHistoryEntries((current) => {
        const existing = current.find((entry) => entry.projectId === activeProjectId);
        if (!existing) return current;
        return upsertHistoryEntry(current, {
          ...existing,
          status: 'failed',
          updatedAt: Date.now(),
          error: message,
        });
      });
    };
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
      markActiveHistoryFailed(copy.timeout);
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
      activeProjectId = projectId;
      activeProjectName = created.project.name || project.name;
      activeProjectCreatedAt = created.project.createdAt || Date.now();
      setHistoryEntries((current) => upsertHistoryEntry(current, {
        projectId,
        name: activeProjectName,
        createdAt: activeProjectCreatedAt,
        updatedAt: created.project.updatedAt || activeProjectCreatedAt,
        status: 'working',
        completedCount: 0,
        taskCount: LOGO_OUTPUTS.length,
        files: [],
      }));
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
          setHistoryEntries((current) => current.map((entry) => (
            entry.projectId === projectId
              ? {
                  ...entry,
                  completedCount: Math.min(LOGO_OUTPUTS.length, entry.completedCount + 1),
                  updatedAt: Date.now(),
                }
              : entry
          )));
        }
      }));
      if (runAbortRef.current !== controller) return;

      const files = await fetchCompletedLogoFiles(projectId, controller.signal);
      if (files.length !== LOGO_OUTPUTS.length) throw new Error(copy.incomplete);
      setHistoryEntries((current) => upsertHistoryEntry(current, {
        projectId,
        name: activeProjectName,
        createdAt: activeProjectCreatedAt,
        updatedAt: Date.now(),
        status: 'complete',
        completedCount: LOGO_OUTPUTS.length,
        taskCount: LOGO_OUTPUTS.length,
        files,
      }));
      setCompletedCount(LOGO_OUTPUTS.length);
      setGenerating(false);
      setSuccess(copy.completed);
      runAbortRef.current = null;
    } catch (submitError) {
      if (runAbortRef.current !== controller) return;
      clearPrepareTimeout();
      runAbortRef.current = null;
      const message = submitError instanceof Error ? submitError.message : copy.failed;
      setError(message);
      markActiveHistoryFailed(message);
      setSubmitting(false);
      setGenerating(false);
      setCompletedCount(0);
    }
  }

  const previewLabel = generating ? copy.generatingPreview : copy.preview;
  const historyImageCount = historyEntries.reduce((total, entry) => total + entry.files.length, 0);

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
            <span>{generating ? `${completedCount}/4` : '1:1'}</span>
          </div>
          <div
            className={`logo-studio__preview-stage${generating ? ' is-generating' : ''}`}
            style={generating ? undefined : { backgroundColor: paperColor, color: inkColor }}
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
          {generating ? null : (
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

      <section className="logo-studio__history" aria-label={copy.history}>
        <header className="logo-studio__history-head">
          <div>
            <span>{copy.historyEyebrow}</span>
            <strong>{copy.history}</strong>
          </div>
          <p>
            {historyEntries.length} {copy.historyBatches} · {historyImageCount} {copy.historyImages}
          </p>
        </header>

        {historyLoading ? (
          <div className="logo-studio__history-empty" role="status">{copy.historyLoading}</div>
        ) : historyEntries.length === 0 ? (
          <div className="logo-studio__history-empty">{copy.historyEmpty}</div>
        ) : (
          <div className="logo-studio__history-list">
            {historyEntries.map((entry) => (
              <LogoHistoryBatch
                copy={copy}
                entry={entry}
                language={language}
                key={entry.projectId}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function LogoHistoryBatch({
  copy,
  entry,
  language,
}: {
  copy: (typeof COPY)[keyof typeof COPY];
  entry: LogoHistoryEntry;
  language: keyof typeof COPY;
}) {
  const statusLabel = {
    complete: copy.historyComplete,
    working: copy.historyWorking,
    failed: copy.historyFailed,
    incomplete: copy.historyIncomplete,
  }[entry.status];
  const formattedDate = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(entry.createdAt));

  return (
    <article className="logo-studio__history-batch">
      <header className="logo-studio__history-batch-head">
        <div>
          <strong>{entry.name}</strong>
          <time dateTime={new Date(entry.createdAt).toISOString()}>{formattedDate}</time>
        </div>
        <span className={`logo-studio__history-status is-${entry.status}`}>
          {statusLabel} · {entry.completedCount}/{entry.taskCount}
        </span>
      </header>
      <div className="logo-studio__history-grid">
        {LOGO_OUTPUTS.map((output, index) => {
          const file = entry.files.find((candidate) => candidate.name === output);
          return file ? (
            <a
              className="logo-studio__history-image"
              href={projectFileUrl(entry.projectId, file.name)}
              key={output}
              target="_blank"
              rel="noreferrer"
              aria-label={`${entry.name} ${copy.direction} ${index + 1}`}
            >
              <img
                src={`${projectFileUrl(entry.projectId, file.name)}?v=${Math.round(file.mtime)}`}
                alt={`${entry.name} direction ${index + 1}`}
              />
              <span>{String.fromCharCode(65 + index)}</span>
            </a>
          ) : (
            <div className={`logo-studio__history-placeholder is-${entry.status}`} key={output}>
              <span>{String.fromCharCode(65 + index)}</span>
              <small>{statusLabel}</small>
            </div>
          );
        })}
      </div>
      {entry.error ? <p className="logo-studio__history-error">{entry.error}</p> : null}
    </article>
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
