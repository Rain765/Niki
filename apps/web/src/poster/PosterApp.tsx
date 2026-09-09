'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useNikiAuth } from '../auth/NikiAuth';
import { PasswordAccountManager } from '../auth/PasswordAccountManager';
import { Button } from '../components/Button';
import { LoanVideoComposer } from '../components/loan-video/LoanVideoComposer';
import {
  type LoanVideoGenerationPhase,
  useLoanVideoGeneration,
} from '../components/loan-video/useLoanVideoGeneration';
import type {
  LoanVideoAspectRatio,
  LoanVideoDraft,
} from '../components/loan-video/types';
import {
  buildDirectPosterBatches,
  type DirectPosterBatchView,
} from '../components/direct-poster-batches';
import { Icon } from '../components/Icon';
import { LogoStudioView } from '../components/LogoStudioView';
import { SelectField } from '../components/SelectField';
import { Toast } from '../components/Toast';
import {
  resolveDirectLoanPosterProject,
  startDirectLoanPosterProject,
} from '../components/home-hero/direct-loan-posters';
import {
  AUTO_POSTER_BRANDS,
  AUTO_POSTER_DEFAULT_BRAND,
  autoPosterBrandLabel,
  isLoanPosterOutputName,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  type AutoPosterPurpose,
} from '../components/home-hero/zambia-posters';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { useI18n } from '../i18n';
import { DocumentSearch } from './DocumentSearch';
import { EnglishPractice } from './EnglishPractice';
import {
  canSharePreparedImageFile,
  copyOrSharePreparedImageFile,
  prepareImageFile,
  savePreparedImageFile,
  sharePreparedImageFile,
} from '../lib/image-file-actions';
import { projectFileDownloadUrl, projectFileUrl } from '../providers/registry';
import type { Project, ProjectFile } from '../types';
import { useRuntimeReleaseRefresh } from './useRuntimeReleaseRefresh';

type Notice = { message: string; tone: 'info' | 'error' };
type PreparedPreviewImage = { file: File; key: string };
type CreationMode = 'poster' | 'video' | 'documents' | 'english' | 'logo';
type PosterResultTab = 'latest' | 'history';
type GenerationFeedback = {
  id: number;
  batchId: string | null;
  message: string;
  state: 'working' | 'complete' | 'failed';
};

const POSTER_APP_DEFAULT_PURPOSE: AutoPosterPurpose = 'anti-fraud';
const POSTER_PRODUCT_OPTIONS = AUTO_POSTER_BRANDS.map((value) => ({
  value,
  // Preserve the established poster-page spelling while sourcing the option
  // values from the shared brand registry.
  label: value === 'biumoney' ? 'Biumoney' : autoPosterBrandLabel(value),
}));
const POSTER_QUANTITY_OPTIONS = [1, 2, 3, 4].map((value) => ({
  value: String(value),
  label: String(value),
}));
const POSTER_RATIO_OPTIONS = ['3:4', '1:1', '16:9'].map((value) => ({
  value,
  label: value,
}));

const POSTER_COPY = {
  en: {
    settings: 'Poster generation settings',
    product: 'Product',
    type: 'Type',
    quantity: 'Quantity',
    ratio: 'Ratio',
    acquisition: 'Acquisition',
    antiFraud: 'Anti-fraud',
    submitting: 'Submitting…',
    generatePosters: 'Generate posters',
    generatingPosters: 'Generating posters…',
    generated: (count: number) => `${count} ${count === 1 ? 'poster' : 'posters'} generated`,
    generationFailed: (detail?: string) => `Generation failed${detail ? `: ${detail}` : ''}`,
    generationSubmitFailed: 'Could not submit the generation task',
    refreshingVersion: 'A new version is available. Refreshing…',
    readyToGenerate: 'Ready to generate',
    readyPosterDetail: 'Choose a quantity and ratio, then generate.',
    batchFailed: 'This batch did not finish',
    batchFailedDetail: 'The generation service did not finish. Please try again.',
    batchDeleted: 'Images from this batch were deleted',
    latestPinned: 'The latest images are pinned above for preview, download, copy, or sharing.',
    generateAgain: 'Generate a new batch whenever you are ready.',
    generatingProgress: (count: number, expected: number) => `Generating · ${count}/${expected}`,
    generationRunning: 'The task is running. Finished images will appear here automatically.',
    closeStatus: 'Close status',
    latestBatch: 'Latest batch',
    loadingRecentPosters: 'Loading recent posters…',
    generatingImage: 'Generating image…',
    posterResults: 'Poster results',
    posterHistory: 'History',
    noPosterHistory: 'No previous generations yet.',
    close: 'Close',
    share: 'Share',
    sharing: 'Sharing…',
    preparing: 'Preparing…',
    saving: 'Saving…',
    saveImage: 'Save image',
    prepareAgain: 'Prepare again',
    preparingOriginal: 'Preparing original…',
    copying: 'Copying…',
    copyImage: 'Copy image',
    delete: 'Delete',
    deleting: 'Deleting…',
    prepareOriginalFailed: 'Could not prepare the original image. Tap to retry.',
    loadOriginalFailed: 'Could not load the original image. Please try again.',
    preparingAgain: 'Preparing the original again…',
    loadPostersFailed: 'Could not load posters',
    saveMenuHint: 'Choose Save to Photos or Save to Files in the system menu.',
    imageDownloadStarted: 'Image download started',
    saveImageFailed: 'Could not save the image. Please try again.',
    copyingHint: 'Copying the original image. Choose Copy if a system menu appears.',
    imageCopied: 'Image copied',
    imageActionComplete: 'Image action completed',
    copyUnsupported: 'This Feishu version cannot copy images. Use Save image instead.',
    shareLinkCopied: 'System sharing is unavailable. Image link copied.',
    shareFailed: 'Could not share image',
    deleteImageFailed: 'Could not delete the image',
    deleteConfirm: (name: string) => `Delete ${name}?`,
    tutorialGenerator: 'Tutorial video generator',
    closeVideoStatus: 'Close video status',
    latestVideo: 'Latest video',
    downloadVideo: 'Download video',
    elapsed: (value: string) => `Elapsed ${value}`,
    videoHistory: 'Video history',
    expandVideoHistory: 'Expand video history',
    collapseVideoHistory: 'Collapse video history',
    download: 'Download',
    videoDeleted: 'Video deleted',
    videoDeleteFailed: 'Could not delete the video',
    videoFailed: 'Video generation did not finish',
    videoRetry: 'Submit the same tutorial again to retry.',
    videoGenerated: 'Tutorial video generated',
    videoGeneratedDetail: 'The latest MP4 is ready to preview or download below.',
    videoRestoring: ['Loading recent video…', 'Checking the latest project and run.'],
    videoPreparing: ['Preparing video project', 'Creating a durable project for this tutorial.'],
    videoUploading: ['Uploading screenshots', 'Adding the ordered screenshots to the project.'],
    videoQueued: ['Video generation queued', 'The rendering task will start shortly.'],
    videoRunning: ['Generating tutorial video', 'The task is running. The MP4 will appear here automatically.'],
    videoFinishing: ['Finishing tutorial video', 'The run finished. Waiting for the MP4 to appear.'],
    readyVideoDetail: 'Choose a product, purpose, and ratio, then generate an MP4.',
  },
  zh: {
    settings: '海报生成设置',
    product: '产品',
    type: '类型',
    quantity: '数量',
    ratio: '比例',
    acquisition: '获客引流',
    antiFraud: '防欺诈',
    submitting: '正在提交…',
    generatePosters: '生成海报',
    generatingPosters: '正在生成海报…',
    generated: (count: number) => `已生成 ${count} 张海报`,
    generationFailed: (detail?: string) => `生成失败${detail ? `：${detail}` : ''}`,
    generationSubmitFailed: '无法提交生成任务',
    refreshingVersion: '发现新版本，正在更新…',
    readyToGenerate: '可以开始生成',
    readyPosterDetail: '选择数量和比例后即可生成。',
    batchFailed: '本批次未能完成',
    batchFailedDetail: '生成服务未能完成任务，请重试。',
    batchDeleted: '本批次图片已删除',
    latestPinned: '最新图片已置顶，可预览、下载、复制或分享。',
    generateAgain: '准备好后可随时生成新批次。',
    generatingProgress: (count: number, expected: number) => `正在生成 · ${count}/${expected}`,
    generationRunning: '任务正在运行，完成的图片会自动显示在这里。',
    closeStatus: '关闭状态提示',
    latestBatch: '最新一批',
    loadingRecentPosters: '正在加载最近海报…',
    generatingImage: '正在生成图片…',
    posterResults: '海报结果',
    posterHistory: '历史生成',
    noPosterHistory: '暂无历史生成记录。',
    close: '关闭',
    share: '分享',
    sharing: '正在分享…',
    preparing: '正在准备…',
    saving: '正在保存…',
    saveImage: '保存图片',
    prepareAgain: '重新准备',
    preparingOriginal: '正在准备原图…',
    copying: '正在复制…',
    copyImage: '复制图片',
    delete: '删除',
    deleting: '正在删除…',
    prepareOriginalFailed: '无法准备原图，点击重试。',
    loadOriginalFailed: '无法加载原图，请重试。',
    preparingAgain: '正在重新准备原图…',
    loadPostersFailed: '无法加载海报',
    saveMenuHint: '请在系统菜单中选择“存储到照片”或“存储到文件”。',
    imageDownloadStarted: '图片下载已开始',
    saveImageFailed: '无法保存图片，请重试。',
    copyingHint: '正在复制原图；如果出现系统菜单，请选择“复制”。',
    imageCopied: '图片已复制',
    imageActionComplete: '图片操作已完成',
    copyUnsupported: '当前飞书版本无法复制图片，请改用“保存图片”。',
    shareLinkCopied: '系统分享不可用，图片链接已复制。',
    shareFailed: '无法分享图片',
    deleteImageFailed: '无法删除图片',
    deleteConfirm: (name: string) => `确定删除 ${name} 吗？`,
    tutorialGenerator: '教学视频生成器',
    closeVideoStatus: '关闭视频状态提示',
    latestVideo: '最新视频',
    downloadVideo: '下载视频',
    elapsed: (value: string) => `已用时 ${value}`,
    videoHistory: '视频历史',
    expandVideoHistory: '展开视频历史',
    collapseVideoHistory: '收起视频历史',
    download: '下载',
    videoDeleted: '视频已删除',
    videoDeleteFailed: '无法删除视频',
    videoFailed: '视频生成未能完成',
    videoRetry: '请重新提交同一份教程以重试。',
    videoGenerated: '教学视频已生成',
    videoGeneratedDetail: '最新 MP4 已可在下方预览或下载。',
    videoRestoring: ['正在加载最近视频…', '正在检查最新项目和任务。'],
    videoPreparing: ['正在准备视频项目', '正在为本教程创建可持续使用的项目。'],
    videoUploading: ['正在上传截图', '正在按顺序把截图添加到项目中。'],
    videoQueued: ['视频生成已排队', '渲染任务即将开始。'],
    videoRunning: ['正在生成教学视频', '任务正在运行，MP4 完成后会自动显示在这里。'],
    videoFinishing: ['正在完成教学视频', '任务已结束，正在等待 MP4 文件。'],
    readyVideoDetail: '选择产品、用途和比例后即可生成 MP4。',
  },
} as const;

type PosterCopy = (typeof POSTER_COPY)[keyof typeof POSTER_COPY];

function initialCreationMode(): CreationMode {
  if (typeof window === 'undefined') return 'poster';
  if (window.location.pathname === '/logo') return 'logo';
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'video' || mode === 'documents' || mode === 'english' ? mode : 'poster';
}

function updateCreationModeUrl(mode: CreationMode): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = mode === 'logo' ? '/logo' : '/';
  if (mode === 'video' || mode === 'documents' || mode === 'english') url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  window.history.replaceState(window.history.state, '', url);
}

function rawUrl(projectId: string, name: string, version?: number): string {
  const safeName = name.split('/').map(encodeURIComponent).join('/');
  const versionQuery = typeof version === 'number' && Number.isFinite(version)
    ? `?v=${Math.round(version)}`
    : '';
  return `/api/projects/${encodeURIComponent(projectId)}/raw/${safeName}${versionQuery}`;
}

function previewUrl(projectId: string, file: ProjectFile, variant: 'mobile' | 'preview'): string {
  const safeName = file.name.split('/').map(encodeURIComponent).join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/image-preview/${safeName}`
    + `?variant=${variant}&v=${Math.round(file.mtime)}`;
}

async function fetchPosterProject(projectId: string): Promise<Project | null> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  if (!response.ok) return null;
  const body = await response.json() as { project?: Project };
  return body.project ?? null;
}

async function fetchPosterFiles(projectId: string): Promise<ProjectFile[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  if (!response.ok) throw new Error(`Could not load images (HTTP ${response.status})`);
  const body = await response.json() as { files?: ProjectFile[] };
  return body.files ?? [];
}

function generationCopy(batch: DirectPosterBatchView | null, copy: PosterCopy): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  if (!batch) {
    return { state: 'idle', title: copy.readyToGenerate, detail: copy.readyPosterDetail };
  }
  const fileCount = batch.files.length;
  const expected = Math.max(fileCount, batch.expectedCount ?? 0);
  if (batch.status === 'failed' || batch.status === 'interrupted') {
    return {
      state: 'failed',
      title: copy.batchFailed,
      detail: batch.lastError ?? copy.batchFailedDetail,
    };
  }
  if (batch.status === 'complete') {
    return {
      state: 'complete',
      title: fileCount > 0
        ? copy.generated(fileCount)
        : copy.batchDeleted,
      detail: fileCount > 0
        ? copy.latestPinned
        : copy.generateAgain,
    };
  }
  return {
    state: 'working',
    title: fileCount > 0 ? copy.generatingProgress(fileCount, expected) : copy.generatingPosters,
    detail: copy.generationRunning,
  };
}

function videoGenerationCopy(
  phase: LoanVideoGenerationPhase,
  hasVideo: boolean,
  error: string | null,
  copy: PosterCopy,
): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  if (phase === 'failed') {
    return {
      state: 'failed',
      title: copy.videoFailed,
      detail: error ?? copy.videoRetry,
    };
  }
  if (phase === 'succeeded' && hasVideo) {
    return {
      state: 'complete',
      title: copy.videoGenerated,
      detail: copy.videoGeneratedDetail,
    };
  }
  const workingCopy: Partial<Record<LoanVideoGenerationPhase, readonly [string, string]>> = {
    restoring: copy.videoRestoring,
    preparing: copy.videoPreparing,
    uploading: copy.videoUploading,
    queued: copy.videoQueued,
    running: copy.videoRunning,
    succeeded: copy.videoFinishing,
  };
  const phaseCopy = workingCopy[phase];
  if (phaseCopy) return { state: 'working', title: phaseCopy[0], detail: phaseCopy[1] };
  return {
    state: 'idle',
    title: copy.readyToGenerate,
    detail: copy.readyVideoDetail,
  };
}

function videoAspectClass(aspectRatio: LoanVideoAspectRatio): string {
  if (aspectRatio === '1:1') return 'is-square';
  if (aspectRatio === '3:4') return 'is-portrait';
  if (aspectRatio === '9:16') return 'is-mobile-portrait';
  return 'is-landscape';
}

function formatVideoElapsed(requestedAt: number | null, now: number): string {
  if (requestedAt === null) return '0s';
  const totalSeconds = Math.max(0, Math.floor((now - requestedAt) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function useVideoElapsed(running: boolean, requestedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [requestedAt, running]);

  return formatVideoElapsed(requestedAt, now);
}

export function PosterApp({ initialMode }: { initialMode?: CreationMode } = {}) {
  const { user, logout } = useNikiAuth();
  const { locale, setLocale, t } = useI18n();
  const copy = POSTER_COPY[locale === 'zh-CN' ? 'zh' : 'en'];
  const posterTypeOptions = useMemo(() => [
    { value: 'acquisition', label: copy.acquisition },
    { value: 'anti-fraud', label: copy.antiFraud },
  ], [copy]);
  const [creationMode, setCreationMode] = useState<CreationMode>(
    () => initialMode ?? initialCreationMode(),
  );
  const videoGeneration = useLoanVideoGeneration(user.id, creationMode === 'video');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [brand, setBrand] = useState<AutoPosterBrand>(AUTO_POSTER_DEFAULT_BRAND);
  const [purpose, setPurpose] = useState<AutoPosterPurpose>(POSTER_APP_DEFAULT_PURPOSE);
  const [aspectRatio, setAspectRatio] = useState<AutoPosterAspectRatio>('3:4');
  const [count, setCount] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [previewNotice, setPreviewNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<'copy' | 'download' | 'share' | null>(null);
  const [rawFallbackNames, setRawFallbackNames] = useState<Set<string>>(() => new Set());
  const [posterResultTab, setPosterResultTab] = useState<PosterResultTab>('latest');
  const [showVideoHistory, setShowVideoHistory] = useState(false);
  const [generationFeedback, setGenerationFeedback] = useState<GenerationFeedback | null>(null);
  const [dismissedStatusKey, setDismissedStatusKey] = useState<string | null>(null);
  const [dismissedVideoStatusKey, setDismissedVideoStatusKey] = useState<string | null>(null);
  const [preparedPreviewImage, setPreparedPreviewImage] = useState<PreparedPreviewImage | null>(null);
  const [failedPreviewKey, setFailedPreviewKey] = useState<string | null>(null);
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [deletingVideoName, setDeletingVideoName] = useState<string | null>(null);
  const latestBatchRef = useRef<HTMLElement | null>(null);
  const restoredPosterUserRef = useRef<string | null>(null);
  const observedBatchIdRef = useRef<string | null>(null);
  const generationFeedbackIdRef = useRef(0);
  const videoGenerationStartedRef = useRef(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const dismissMenu = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const dismissMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('pointerdown', dismissMenu);
    window.addEventListener('keydown', dismissMenuWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', dismissMenu);
      window.removeEventListener('keydown', dismissMenuWithKeyboard);
    };
  }, [accountMenuOpen]);

  const posterFiles = useMemo(
    () => files
      .filter((file) => file.kind === 'image' && isLoanPosterOutputName(file.name))
      .sort((left, right) => right.mtime - left.mtime),
    [files],
  );
  const batches = useMemo(
    () => project
      ? buildDirectPosterBatches(
        posterFiles,
        project.metadata?.directGeneration ?? null,
      )
      : [],
    [posterFiles, project?.metadata?.directGeneration],
  );
  const latestBatch = batches.at(-1) ?? null;
  const latestBatchAspectRatio = latestBatch?.aspectRatio ?? aspectRatio;
  const latestBatchCount = latestBatch?.files.length ?? count;
  const historyBatches = useMemo(
    () => batches.slice(0, -1).reverse(),
    [batches],
  );
  const historyFiles = useMemo(
    () => historyBatches
      .flatMap((batch) => batch.files.map((file) => ({
        aspectRatio: batch.aspectRatio,
        file,
      })))
      .sort((left, right) => right.file.mtime - left.file.mtime),
    [historyBatches],
  );
  const aspectRatioByFile = useMemo(() => new Map(
    batches.flatMap((batch) => batch.files.map((file) => [file.name, batch.aspectRatio] as const)),
  ), [batches]);
  const previewFile = previewName
    ? posterFiles.find((file) => file.name === previewName) ?? null
    : null;
  const previewFileKey = previewFile && projectId
    ? `${projectId}:${previewFile.name}:${previewFile.mtime}`
    : null;
  const preparedPreviewFile = preparedPreviewImage?.key === previewFileKey
    ? preparedPreviewImage.file
    : null;
  const previewFilePreparing = previewFileKey !== null
    && preparedPreviewFile === null
    && failedPreviewKey !== previewFileKey;
  const previewAspectRatio = previewFile ? aspectRatioByFile.get(previewFile.name) : undefined;
  const status = generationCopy(latestBatch, copy);
  const generationFeedbackKey = generationFeedback
    ? `${generationFeedback.id}:${generationFeedback.state}:${generationFeedback.message}`
    : null;
  const statusDismissed = generationFeedbackKey !== null
    && dismissedStatusKey === generationFeedbackKey;
  const videoStatus = videoGenerationCopy(
    videoGeneration.state.phase,
    videoGeneration.latestVideo !== null,
    videoGeneration.state.error,
    copy,
  );
  const videoWorking = videoStatus.state === 'working'
    && videoGeneration.state.requestedAt !== null;
  const showRuntimeReloading = useCallback(() => {
    setNotice({ message: copy.refreshingVersion, tone: 'info' });
  }, [copy.refreshingVersion]);
  useRuntimeReleaseRefresh({
    blocked: generating || videoWorking,
    onReloading: showRuntimeReloading,
  });
  const videoElapsed = useVideoElapsed(videoWorking, videoGeneration.state.requestedAt);
  const videoResultAvailable = videoGeneration.latestVideo !== null
    && videoGeneration.state.projectId !== null;
  const videoStatusKey = [
    videoStatus.state,
    videoGeneration.state.projectId ?? 'none',
    videoGeneration.state.taskId ?? 'none',
    videoGeneration.latestVideo?.name ?? 'none',
    videoGeneration.latestVideo?.mtime ?? 0,
    videoStatus.title,
    videoStatus.detail,
  ].join(':');
  const videoStatusDismissed = dismissedVideoStatusKey === videoStatusKey;
  const videoHistory = videoGeneration.videos.slice(1);

  useEffect(() => {
    if (
      !generationFeedback
      || generationFeedback.state !== 'working'
      || !generationFeedback.batchId
      || latestBatch?.id !== generationFeedback.batchId
    ) {
      return;
    }
    if (latestBatch.status === 'complete') {
      const fileCount = latestBatch.files.length;
      const generatedCount = Math.max(fileCount, latestBatch.expectedCount ?? 0);
      setGenerationFeedback({
        ...generationFeedback,
        state: 'complete',
        message: copy.generated(generatedCount),
      });
      return;
    }
    if (latestBatch.status === 'failed' || latestBatch.status === 'interrupted') {
      const failureDetail = latestBatch.lastError?.trim();
      setGenerationFeedback({
        ...generationFeedback,
        state: 'failed',
        message: copy.generationFailed(failureDetail),
      });
    }
  }, [copy, generationFeedback, latestBatch]);

  useEffect(() => {
    if (!previewFile || !projectId || !previewFileKey) return undefined;
    if (preparedPreviewImage?.key === previewFileKey) return undefined;
    let cancelled = false;
    const fileName = previewFile.name;
    setFailedPreviewKey(null);
    void prepareImageFile(
      rawUrl(projectId, fileName, previewFile.mtime),
      fileName,
      previewFile.mime || 'image/png',
    ).then((file) => {
      if (cancelled) return;
      setPreparedPreviewImage({ file, key: previewFileKey });
    }).catch((error) => {
      if (cancelled) return;
      setFailedPreviewKey(previewFileKey);
      console.error('[poster-preview] original image preparation failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        fileName,
      });
      setPreviewNotice({ message: copy.prepareOriginalFailed, tone: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [copy, prepareAttempt, previewFileKey]);

  useEffect(() => {
    const batchId = latestBatch?.id ?? null;
    if (!batchId) return;
    if (observedBatchIdRef.current === null) {
      observedBatchIdRef.current = batchId;
      return;
    }
    if (observedBatchIdRef.current === batchId) return;
    observedBatchIdRef.current = batchId;
    setPosterResultTab('latest');
    const timer = window.setTimeout(() => {
      const section = latestBatchRef.current;
      if (!section) return;
      section.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      section.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [latestBatch?.id]);

  const refreshProject = useCallback(async (id: string, quiet = false) => {
    try {
      const [nextProject, nextFiles] = await Promise.all([
        fetchPosterProject(id),
        fetchPosterFiles(id),
      ]);
      if (!nextProject) return;
      setProject(nextProject);
      setFiles(nextFiles);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        window.location.reload();
        return;
      }
      if (!quiet) {
        setNotice({
          message: error instanceof Error ? error.message : copy.loadPostersFailed,
          tone: 'error',
        });
      }
    }
  }, [copy.loadPostersFailed]);

  useEffect(() => {
    if (creationMode !== 'poster') return undefined;
    if (restoredPosterUserRef.current === user.id) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const restoredProject = await resolveDirectLoanPosterProject(user.id);
        if (cancelled) return;
        if (!restoredProject) {
          restoredPosterUserRef.current = user.id;
          setProjectId(null);
          setProject(null);
          setFiles([]);
          return;
        }
        setProjectId(restoredProject.id);
        setProject(restoredProject);
        const restoredFiles = await fetchPosterFiles(restoredProject.id);
        if (!cancelled) {
          restoredPosterUserRef.current = user.id;
          setFiles(restoredFiles);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
          window.location.reload();
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creationMode, user.id]);

  useEffect(() => {
    if (creationMode !== 'poster' || !projectId) return undefined;
    const reconcile = () => {
      if (document.visibilityState === 'visible') {
        void refreshProject(projectId, true);
      }
    };
    const intervalId = window.setInterval(() => {
      reconcile();
    }, status.state === 'working' ? 1_500 : 5_000);
    const onVisibilityChange = () => reconcile();
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      window.removeEventListener('pageshow', reconcile);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [creationMode, projectId, refreshProject, status.state]);

  const generate = async () => {
    if (generating) return;
    const feedbackId = generationFeedbackIdRef.current + 1;
    generationFeedbackIdRef.current = feedbackId;
    setPosterResultTab('latest');
    setGenerating(true);
    setNotice(null);
    setDismissedStatusKey(null);
    setGenerationFeedback({
      id: feedbackId,
      batchId: null,
      message: copy.generatingPosters,
      state: 'working',
    });
    try {
      const result = await startDirectLoanPosterProject({
        brand,
        purpose,
        aspectRatio,
        count,
        sessionScope: user.id,
      }, (createdProject) => {
        setProjectId(createdProject.id);
        setProject(createdProject);
        const batchId = createdProject.metadata?.directGeneration?.activeBatchId ?? null;
        setGenerationFeedback((current) => (
          current?.id === feedbackId
            ? { ...current, batchId: batchId ?? current.batchId }
            : current
        ));
      });
      setProjectId(result.projectId);
      await refreshProject(result.projectId, true);
    } catch (error) {
      const failureDetail = error instanceof Error
        ? error.message
        : copy.generationSubmitFailed;
      setGenerationFeedback((current) => (
        current?.id === feedbackId
          ? {
            ...current,
            state: 'failed',
            message: copy.generationFailed(failureDetail),
          }
          : current
      ));
    } finally {
      setGenerating(false);
    }
  };

  const handlePosterResultTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab: PosterResultTab = event.key === 'Home'
      ? 'latest'
      : event.key === 'End'
        ? 'history'
        : posterResultTab === 'latest'
          ? 'history'
          : 'latest';
    setPosterResultTab(nextTab);
    document.getElementById(`poster-result-tab-${nextTab}`)?.focus();
  };

  const generateVideo = (draft: LoanVideoDraft) => {
    videoGenerationStartedRef.current = true;
    setDismissedVideoStatusKey(null);
    void videoGeneration.start(draft);
  };

  const removeVideo = async (file: ProjectFile) => {
    if (deletingVideoName || !window.confirm(copy.deleteConfirm(file.name))) return;
    setDeletingVideoName(file.name);
    try {
      const deleted = await videoGeneration.removeVideo(file);
      setNotice({
        message: deleted ? copy.videoDeleted : copy.videoDeleteFailed,
        tone: deleted ? 'info' : 'error',
      });
    } finally {
      setDeletingVideoName(null);
    }
  };

  const download = async (file: File) => {
    if (activeAction) return;
    setActiveAction('download');
    try {
      const result = await savePreparedImageFile(file);
      setPreviewNotice({
        message: result === 'shared'
          ? copy.saveMenuHint
          : copy.imageDownloadStarted,
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('[poster-preview] save failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          fileName: file.name,
        });
        setPreviewNotice({ message: copy.saveImageFailed, tone: 'error' });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const copyImage = async (file: File) => {
    if (activeAction) return;
    setActiveAction('copy');
    setPreviewNotice({
      message: copy.copyingHint,
      tone: 'info',
    });
    try {
      const result = await copyOrSharePreparedImageFile(file);
      setPreviewNotice({
        message: result === 'copied' ? copy.imageCopied : copy.imageActionComplete,
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setPreviewNotice({
          message: copy.copyUnsupported,
          tone: 'error',
        });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const share = async (file: ProjectFile, preparedFile: File) => {
    if (!projectId || activeAction) return;
    setActiveAction('share');
    const absoluteUrl = new URL(
      rawUrl(projectId, file.name, file.mtime),
      window.location.href,
    ).href;
    try {
      if (typeof navigator.share !== 'function') throw new Error('share unavailable');
      if (canSharePreparedImageFile(preparedFile)) {
        await sharePreparedImageFile(preparedFile);
      } else {
        await navigator.share({ title: file.name, url: absoluteUrl });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const copied = await copyToClipboard(absoluteUrl);
      setPreviewNotice({
        message: copied ? copy.shareLinkCopied : copy.shareFailed,
        tone: copied ? 'info' : 'error',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const remove = async (file: ProjectFile) => {
    if (!projectId || !window.confirm(copy.deleteConfirm(file.name))) return;
    const response = await fetch(rawUrl(projectId, file.name), {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!response?.ok) {
      setNotice({ message: copy.deleteImageFailed, tone: 'error' });
      return;
    }
    setPreviewName(null);
    await refreshProject(projectId, true);
  };

  const renderPoster = (
    file: ProjectFile,
    options: { aspectRatio?: string; eager: boolean; index: number },
  ) => {
    if (!projectId) return null;
    const useRawImage = rawFallbackNames.has(file.name);
    const aspectClass = options.aspectRatio === '1:1'
      ? 'is-square'
      : options.aspectRatio === '3:4'
        ? 'is-portrait'
        : 'is-landscape';
    return (
      <button
        type="button"
        className={`poster-app__poster ${aspectClass}`}
        key={`${file.name}:${file.mtime}`}
        onClick={() => {
          setPreviewNotice(null);
          setPreviewName(file.name);
        }}
      >
        <picture>
          {!useRawImage ? (
            <source media="(max-width: 900px)" srcSet={previewUrl(projectId, file, 'mobile')} />
          ) : null}
          <img
            src={useRawImage
              ? rawUrl(projectId, file.name)
              : previewUrl(projectId, file, 'preview')}
            alt={file.name}
            loading={options.eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={options.eager && options.index < 2 ? 'high' : 'auto'}
            onLoad={(event) => {
              event.currentTarget.closest('.poster-app__poster')?.classList.add('is-loaded');
            }}
            onError={(event) => {
              if (useRawImage) {
                event.currentTarget.closest('.poster-app__poster')?.classList.add('is-error');
                return;
              }
              setRawFallbackNames((current) => new Set(current).add(file.name));
            }}
          />
        </picture>
      </button>
    );
  };

  return (
    <main className={`poster-app${creationMode === 'documents' ? ' is-documents' : ''}${creationMode === 'english' ? ' is-english' : ''}${creationMode === 'logo' ? ' is-logo' : ''}`}>
      <header className="poster-app__topbar">
        <div className="poster-app__topbar-inner">
          <button
            type="button"
            className="poster-app__brand"
            aria-label={t('app.brand')}
            onClick={() => {
              setCreationMode('poster');
              updateCreationModeUrl('poster');
            }}
          >
            <img src="/logo.svg" alt="" />
            <span>{t('app.brand')}</span>
          </button>
          <nav className="poster-app__primary-nav" aria-label={t('posterNav.primary')}>
            {([
              ['poster', 'posterNav.poster'],
              ['video', 'posterNav.video'],
              ['documents', 'posterNav.documents'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={creationMode === mode ? 'is-active' : undefined}
                aria-current={creationMode === mode ? 'page' : undefined}
                onClick={() => {
                  setCreationMode(mode);
                  updateCreationModeUrl(mode);
                }}
              >
                {t(label)}
              </button>
            ))}
            <button
              type="button"
              className={creationMode === 'logo' ? 'is-active' : undefined}
              aria-current={creationMode === 'logo' ? 'page' : undefined}
              onClick={() => {
                setCreationMode('logo');
                updateCreationModeUrl('logo');
              }}
            >
              {t('posterNav.logo')}
            </button>
            <button
              type="button"
              className={creationMode === 'english' ? 'is-active' : undefined}
              aria-current={creationMode === 'english' ? 'page' : undefined}
              onClick={() => {
                setCreationMode('english');
                updateCreationModeUrl('english');
              }}
            >
              {t('posterNav.english')}
            </button>
          </nav>
          <div className="poster-app__topbar-actions">
            <div
              className="poster-app__language-switch"
              role="group"
              aria-label={t('posterNav.language')}
            >
              <button
                type="button"
                aria-pressed={locale === 'zh-CN'}
                onClick={() => setLocale('zh-CN')}
              >
                中文
              </button>
              <button
                type="button"
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                English
              </button>
            </div>
            <div className="poster-app__account-wrap" ref={accountMenuRef}>
              <button
                type="button"
                className="poster-app__account"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                {user.name}
                <Icon name="chevron-down" size={16} />
              </button>
              <div
                className={`poster-app__account-menu${accountMenuOpen ? ' is-open' : ''}`}
                role="menu"
                aria-hidden={!accountMenuOpen}
              >
                {user.role === 'admin' ? (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={accountMenuOpen ? 0 : -1}
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setAccountManagerOpen(true);
                    }}
                  >
                    {t('posterNav.account')}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={accountMenuOpen ? 0 : -1}
                  className="is-danger"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void logout();
                  }}
                >
                  {t('posterNav.signOut')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <PasswordAccountManager
        open={accountManagerOpen}
        onClose={() => setAccountManagerOpen(false)}
      />

      <div className="poster-app__content">
      {creationMode === 'poster' ? (
        <>
      <section
        className="od-generation-toolbar od-filter-grid"
        aria-label={copy.settings}
      >
        <SelectField
          label={copy.product}
          value={brand}
          options={POSTER_PRODUCT_OPTIONS}
          disabled={generating}
          onChange={(value) => setBrand(value as AutoPosterBrand)}
        />
        <SelectField
          label={copy.type}
          value={purpose}
          options={posterTypeOptions}
          disabled={generating}
          onChange={(value) => setPurpose(value as AutoPosterPurpose)}
        />
        <SelectField
          label={copy.quantity}
          value={String(count)}
          options={POSTER_QUANTITY_OPTIONS}
          disabled={generating}
          onChange={(value) => setCount(Number(value))}
        />
        <SelectField
          label={copy.ratio}
          value={aspectRatio}
          options={POSTER_RATIO_OPTIONS}
          disabled={generating}
          onChange={(value) => setAspectRatio(value as AutoPosterAspectRatio)}
        />
        <Button
          variant="primary"
          loading={generating}
          onClick={() => void generate()}
        >
          {generating ? copy.submitting : copy.generatePosters}
        </Button>
      </section>

      {generationFeedback && generationFeedbackKey && !statusDismissed ? (
        <Toast
          testId="poster-app-generation-status"
          message={generationFeedback.message}
          tone={generationFeedback.state === 'complete'
            ? 'success'
            : generationFeedback.state === 'failed'
              ? 'error'
              : 'info'}
          persistent={generationFeedback.state !== 'complete'}
          dismissible
          dismissLabel={copy.closeStatus}
          onDismiss={() => setDismissedStatusKey(generationFeedbackKey)}
        />
      ) : null}

      {notice ? (
        <button
          type="button"
          className={`poster-app__notice is-${notice.tone}`}
          onClick={() => setNotice(null)}
        >
          {notice.message}
        </button>
      ) : null}

      <div className="poster-app__result-tabs" role="tablist" aria-label={copy.posterResults}>
        <button
          id="poster-result-tab-latest"
          type="button"
          role="tab"
          className={posterResultTab === 'latest' ? 'is-active' : undefined}
          aria-controls="poster-result-panel-latest"
          aria-selected={posterResultTab === 'latest'}
          tabIndex={posterResultTab === 'latest' ? 0 : -1}
          onClick={() => setPosterResultTab('latest')}
          onKeyDown={handlePosterResultTabKeyDown}
        >
          <span>{copy.latestBatch}</span>
          <small>{latestBatchAspectRatio} × {latestBatchCount}</small>
        </button>
        <button
          id="poster-result-tab-history"
          type="button"
          role="tab"
          className={posterResultTab === 'history' ? 'is-active' : undefined}
          aria-controls="poster-result-panel-history"
          aria-selected={posterResultTab === 'history'}
          tabIndex={posterResultTab === 'history' ? 0 : -1}
          onClick={() => setPosterResultTab('history')}
          onKeyDown={handlePosterResultTabKeyDown}
        >
          <span>{copy.posterHistory}</span>
          <small>{historyFiles.length}</small>
        </button>
      </div>

      <section
        id="poster-result-panel-latest"
        ref={latestBatchRef}
        className="poster-app__batch-section poster-app__result-panel"
        role="tabpanel"
        aria-labelledby="poster-result-tab-latest"
        hidden={posterResultTab !== 'latest'}
        tabIndex={-1}
      >
        <div className="poster-app__gallery">
          {latestBatch?.files.map((file, index) => renderPoster(file, {
            aspectRatio: latestBatch.aspectRatio,
            eager: true,
            index,
          }))}
          {status.state === 'working' ? (
            <div className={`poster-app__poster-skeleton${latestBatchAspectRatio === '1:1'
              ? ' is-square'
              : latestBatchAspectRatio === '3:4'
                ? ' is-portrait'
                : ''}`}>
              <span>{copy.generatingImage}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="poster-result-panel-history"
        className="poster-app__batch-section poster-app__result-panel"
        role="tabpanel"
        aria-labelledby="poster-result-tab-history"
        hidden={posterResultTab !== 'history'}
        tabIndex={0}
      >
        {historyFiles.length > 0 ? (
          <div className="poster-app__gallery poster-app__history-gallery">
            {historyFiles.map(({ aspectRatio: fileAspectRatio, file }, index) => renderPoster(file, {
              aspectRatio: fileAspectRatio,
              eager: false,
              index,
            }))}
          </div>
        ) : (
          <div className="poster-app__history-empty">{copy.noPosterHistory}</div>
        )}
      </section>

      {previewFile && projectId ? (
        <div className="poster-preview" role="dialog" aria-modal="true" aria-label={previewFile.name}>
          <header className="poster-preview__header">
            <button
              type="button"
              onClick={() => setPreviewName(null)}
              aria-label={copy.close}
              title={copy.close}
            >
              <Icon name="close" size={24} />
            </button>
            <button
              type="button"
              disabled={activeAction !== null || preparedPreviewFile === null}
              aria-label={activeAction === 'share'
                ? copy.sharing
                : preparedPreviewFile
                  ? copy.share
                  : copy.preparing}
              title={copy.share}
              onClick={() => preparedPreviewFile && void share(previewFile, preparedPreviewFile)}
            >
              <Icon
                name={activeAction === 'share' || preparedPreviewFile === null ? 'spinner' : 'share'}
                size={22}
              />
            </button>
          </header>
          {previewNotice ? (
            <button
              type="button"
              className={`poster-preview__notice is-${previewNotice.tone}`}
              aria-live="polite"
              onClick={() => setPreviewNotice(null)}
            >
              {previewNotice.message}
            </button>
          ) : null}
          <div className="poster-preview__stage">
            <picture className={previewAspectRatio === '1:1'
              ? 'is-square'
              : previewAspectRatio === '3:4'
                ? 'is-portrait'
                : 'is-landscape'}>
              {!rawFallbackNames.has(previewFile.name) ? (
                <source media="(max-width: 900px)" srcSet={previewUrl(projectId, previewFile, 'mobile')} />
              ) : null}
              <img
                src={rawFallbackNames.has(previewFile.name)
                  ? rawUrl(projectId, previewFile.name)
                  : previewUrl(projectId, previewFile, 'preview')}
                alt={previewFile.name}
                onError={() => {
                  if (!rawFallbackNames.has(previewFile.name)) {
                    setRawFallbackNames((current) => new Set(current).add(previewFile.name));
                  } else {
                    setPreviewNotice({ message: copy.loadOriginalFailed, tone: 'error' });
                  }
                }}
              />
            </picture>
          </div>
          <footer className="poster-preview__footer">
            <button
              type="button"
              disabled={activeAction !== null || previewFilePreparing}
              aria-label={activeAction === 'download'
                ? copy.saving
                : preparedPreviewFile
                  ? copy.saveImage
                  : failedPreviewKey === previewFileKey
                    ? copy.prepareAgain
                    : copy.preparingOriginal}
              title={copy.saveImage}
              onClick={() => {
                if (preparedPreviewFile) {
                  void download(preparedPreviewFile);
                  return;
                }
                setPreviewNotice({ message: copy.preparingAgain, tone: 'info' });
                setPrepareAttempt((current) => current + 1);
              }}
            >
              <Icon
                name={activeAction === 'download' || (previewFilePreparing && preparedPreviewFile === null)
                  ? 'spinner'
                  : 'download'}
                size={23}
              />
            </button>
            <button
              type="button"
              disabled={activeAction !== null || preparedPreviewFile === null}
              aria-label={activeAction === 'copy' ? copy.copying : copy.copyImage}
              title={copy.copyImage}
              onClick={() => preparedPreviewFile && void copyImage(preparedPreviewFile)}
            >
              <Icon name={activeAction === 'copy' ? 'spinner' : 'copy'} size={23} />
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={activeAction !== null}
              aria-label={copy.delete}
              title={copy.delete}
              onClick={() => void remove(previewFile)}
            >
              <Icon name="trash" size={23} />
            </button>
          </footer>
        </div>
      ) : null}
        </>
      ) : creationMode === 'video' ? (
        <section className="poster-app__video" aria-label={copy.tutorialGenerator}>
          <LoanVideoComposer
            onSubmit={generateVideo}
            onQuickGenerate={(options) => {
              videoGenerationStartedRef.current = true;
              setDismissedVideoStatusKey(null);
              void videoGeneration.regenerate(options);
            }}
            configuredPresetKeys={videoGeneration.state.configuredPresetKeys}
            disabled={videoGeneration.active}
            restoring={videoGeneration.restoring}
          />

          {(videoGenerationStartedRef.current || videoStatus.state === 'failed')
            && videoStatus.state !== 'idle'
            && !videoStatusDismissed ? (
            <Toast
              testId="poster-app-video-generation-status"
              message={videoStatus.title}
              details={videoStatus.detail}
              tone={videoStatus.state === 'complete'
                ? 'success'
                : videoStatus.state === 'failed'
                  ? 'error'
                  : 'info'}
              persistent={videoStatus.state !== 'complete'}
              dismissible
              dismissLabel={copy.closeVideoStatus}
              onDismiss={() => setDismissedVideoStatusKey(videoStatusKey)}
            />
          ) : null}

          {videoWorking || videoResultAvailable ? (
            <section
              className="poster-app__batch-section poster-app__latest-batch"
              aria-label={copy.latestVideo}
            >
              <header className="poster-app__section-header">
                <div className="poster-app__section-heading">
                  <h2>{copy.latestVideo}</h2>
                  <span className="poster-app__section-meta">
                    {videoGeneration.state.aspectRatio} · MP4
                  </span>
                </div>
                {videoResultAvailable ? (
                  <div className="poster-app__video-actions">
                    <a
                      className="poster-app__video-action"
                      href={projectFileDownloadUrl(
                        videoGeneration.state.projectId!,
                        videoGeneration.latestVideo!.name,
                      )}
                      download
                    >
                      {copy.downloadVideo}
                    </a>
                    <button
                      type="button"
                      className="poster-app__video-action is-danger"
                      disabled={deletingVideoName !== null}
                      onClick={() => void removeVideo(videoGeneration.latestVideo!)}
                    >
                      {deletingVideoName === videoGeneration.latestVideo!.name ? copy.deleting : copy.delete}
                    </button>
                  </div>
                ) : null}
              </header>
              {videoWorking ? (
                <div
                  className={[
                    'poster-app__poster-skeleton',
                    'poster-app__video-loading',
                    videoAspectClass(videoGeneration.state.aspectRatio),
                  ].join(' ')}
                  data-aspect-ratio={videoGeneration.state.aspectRatio}
                  data-testid="poster-app-video-loading"
                  role="status"
                  aria-live="polite"
                >
                  <span className="poster-app__video-loading-copy">
                    <strong>{videoStatus.title}</strong>
                    <span>{videoStatus.detail}</span>
                    <time>{copy.elapsed(videoElapsed)}</time>
                  </span>
                </div>
              ) : videoResultAvailable ? (
                <video
                  key={`${videoGeneration.latestVideo!.name}:${videoGeneration.latestVideo!.mtime}`}
                  data-testid="poster-app-video-result"
                  src={projectFileUrl(
                    videoGeneration.state.projectId!,
                    videoGeneration.latestVideo!.name,
                  )}
                  controls
                  playsInline
                  preload="metadata"
                  className="poster-app__video-result"
                />
              ) : null}
            </section>
          ) : null}

          {videoHistory.length > 0 && videoGeneration.state.projectId ? (
            <section className="poster-app__batch-section poster-app__history" aria-label={copy.videoHistory}>
              <button
                type="button"
                className="poster-app__history-toggle"
                aria-expanded={showVideoHistory}
                aria-label={showVideoHistory ? copy.collapseVideoHistory : copy.expandVideoHistory}
                onClick={() => setShowVideoHistory((current) => !current)}
              >
                <span className="poster-app__section-heading">
                  <span className="poster-app__section-title">{copy.videoHistory}</span>
                  <span className="poster-app__section-meta">({videoHistory.length})</span>
                </span>
                <span className="poster-app__history-toggle-icon" aria-hidden="true">
                  <Icon
                    name="chevron-down"
                    size={18}
                    className={showVideoHistory ? 'is-expanded' : undefined}
                  />
                </span>
              </button>
              {showVideoHistory ? (
                <div className="poster-app__video-history-grid">
                  {videoHistory.map((file) => (
                    <article className="poster-app__video-card" key={`${file.name}:${file.mtime}`}>
                      <video
                        src={projectFileUrl(videoGeneration.state.projectId!, file.name)}
                        controls
                        playsInline
                        preload="metadata"
                      />
                      <footer>
                        <span title={file.name}>{file.name}</span>
                        <a
                          className="poster-app__video-action"
                          href={projectFileDownloadUrl(videoGeneration.state.projectId!, file.name)}
                          download
                        >
                          {copy.download}
                        </a>
                        <button
                          type="button"
                          className="poster-app__video-action is-danger"
                          disabled={deletingVideoName !== null}
                          onClick={() => void removeVideo(file)}
                        >
                          {deletingVideoName === file.name ? copy.deleting : copy.delete}
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : creationMode === 'documents' ? (
        <DocumentSearch />
      ) : creationMode === 'english' ? (
        <EnglishPractice />
      ) : (
        <LogoStudioView />
      )}
      </div>
    </main>
  );
}
