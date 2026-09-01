'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNikiAuth } from '../auth/NikiAuth';
import { PasswordAccountManager } from '../auth/PasswordAccountManager';
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
import { CustomSelect } from '../components/CustomSelect';
import { Icon } from '../components/Icon';
import { LogoStudioView } from '../components/LogoStudioView';
import {
  resolveDirectLoanPosterProject,
  startDirectLoanPosterProject,
} from '../components/home-hero/direct-loan-posters';
import {
  AUTO_POSTER_DEFAULT_BRAND,
  isLoanPosterOutputName,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  type AutoPosterPurpose,
} from '../components/home-hero/zambia-posters';
import { copyToClipboard } from '../lib/copy-to-clipboard';
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

type Notice = { message: string; tone: 'info' | 'error' };
type PreparedPreviewImage = { file: File; key: string };
type CreationMode = 'poster' | 'video' | 'documents' | 'english' | 'logo';

const STATUS_AUTO_DISMISS_MS = 10_000;
const POSTER_APP_DEFAULT_PURPOSE: AutoPosterPurpose = 'anti-fraud';
const POSTER_PRODUCT_OPTIONS = [
  { value: 'zamloan', label: 'Zamloan' },
  { value: 'biumoney', label: 'Biumoney' },
];
const POSTER_TYPE_OPTIONS = [
  { value: 'acquisition', label: '引流' },
  { value: 'anti-fraud', label: '防欺诈' },
];
const POSTER_QUANTITY_OPTIONS = [1, 2, 3, 4].map((value) => ({
  value: String(value),
  label: String(value),
}));
const POSTER_RATIO_OPTIONS = ['3:4', '1:1', '16:9'].map((value) => ({
  value,
  label: value,
}));

function initialCreationMode(): CreationMode {
  if (typeof window === 'undefined') return 'poster';
  if (window.location.pathname === '/logo') return 'logo';
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'documents' || mode === 'english' ? mode : 'poster';
}

function updateCreationModeUrl(mode: CreationMode): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = mode === 'logo' ? '/logo' : '/';
  if (mode === 'documents' || mode === 'english') url.searchParams.set('mode', mode);
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

function generationCopy(batch: DirectPosterBatchView | null): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  if (!batch) {
    return { state: 'idle', title: 'Ready to generate', detail: 'Choose a quantity and ratio, then generate.' };
  }
  const fileCount = batch.files.length;
  const expected = Math.max(fileCount, batch.expectedCount ?? 0);
  if (batch.status === 'failed' || batch.status === 'interrupted') {
    return {
      state: 'failed',
      title: 'This batch did not finish',
      detail: batch.lastError ?? 'The generation service did not finish. Please try again.',
    };
  }
  if (batch.status === 'complete') {
    return {
      state: 'complete',
      title: fileCount > 0
        ? `${fileCount} ${fileCount === 1 ? 'poster' : 'posters'} generated in this batch`
        : 'Images from this batch were deleted',
      detail: fileCount > 0
        ? 'The latest images are pinned above for preview, download, copy, or sharing.'
        : 'Generate a new batch whenever you are ready.',
    };
  }
  return {
    state: 'working',
    title: fileCount > 0 ? `Generating · ${fileCount}/${expected}` : 'Generating posters',
    detail: 'The task is running. Finished images will appear here automatically.',
  };
}

function videoGenerationCopy(
  phase: LoanVideoGenerationPhase,
  hasVideo: boolean,
  error: string | null,
): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  if (phase === 'failed') {
    return {
      state: 'failed',
      title: 'Video generation did not finish',
      detail: error ?? 'Submit the same tutorial again to retry.',
    };
  }
  if (phase === 'succeeded' && hasVideo) {
    return {
      state: 'complete',
      title: 'Tutorial video generated',
      detail: 'The latest MP4 is ready to preview or download below.',
    };
  }
  const workingCopy: Partial<Record<LoanVideoGenerationPhase, [string, string]>> = {
    restoring: ['Loading recent video…', 'Checking the latest project and run.'],
    preparing: ['Preparing video project', 'Creating a durable project for this tutorial.'],
    uploading: ['Uploading screenshots', 'Adding the ordered screenshots to the project.'],
    queued: ['Video generation queued', 'The rendering task will start shortly.'],
    running: ['Generating tutorial video', 'The task is running. The MP4 will appear here automatically.'],
    succeeded: ['Finishing tutorial video', 'The run finished. Waiting for the MP4 to appear.'],
  };
  const copy = workingCopy[phase];
  if (copy) return { state: 'working', title: copy[0], detail: copy[1] };
  return {
    state: 'idle',
    title: 'Ready to generate',
    detail: 'Complete the tutorial steps, then generate an MP4.',
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
  const [creationMode, setCreationMode] = useState<CreationMode>(
    () => initialMode ?? initialCreationMode(),
  );
  const videoGeneration = useLoanVideoGeneration(user.id, creationMode === 'video');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
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
  const [loadingProject, setLoadingProject] = useState(true);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [previewNotice, setPreviewNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<'copy' | 'download' | 'share' | null>(null);
  const [rawFallbackNames, setRawFallbackNames] = useState<Set<string>>(() => new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [showVideoHistory, setShowVideoHistory] = useState(false);
  const [dismissedStatusKey, setDismissedStatusKey] = useState<string | null>(null);
  const [dismissedVideoStatusKey, setDismissedVideoStatusKey] = useState<string | null>(null);
  const [preparedPreviewImage, setPreparedPreviewImage] = useState<PreparedPreviewImage | null>(null);
  const [failedPreviewKey, setFailedPreviewKey] = useState<string | null>(null);
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [deletingVideoName, setDeletingVideoName] = useState<string | null>(null);
  const latestBatchRef = useRef<HTMLElement | null>(null);
  const observedBatchIdRef = useRef<string | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const dismissMenu = (event: PointerEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    const dismissMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModeMenuOpen(false);
    };
    window.addEventListener('pointerdown', dismissMenu);
    window.addEventListener('keydown', dismissMenuWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', dismissMenu);
      window.removeEventListener('keydown', dismissMenuWithKeyboard);
    };
  }, [modeMenuOpen]);

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
  const status = generationCopy(latestBatch);
  const statusTitle = loadingProject ? 'Loading posters…' : status.title;
  const statusKey = [
    loadingProject ? 'loading' : status.state,
    latestBatch?.id ?? 'none',
    latestBatch?.files.length ?? 0,
    statusTitle,
    status.detail,
  ].join(':');
  const statusDismissed = dismissedStatusKey === statusKey;
  const videoStatus = videoGenerationCopy(
    videoGeneration.state.phase,
    videoGeneration.latestVideo !== null,
    videoGeneration.state.error,
  );
  const videoWorking = videoStatus.state === 'working'
    && videoGeneration.state.requestedAt !== null;
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
    if (status.state === 'working' || status.state === 'failed') return undefined;
    const timeout = window.setTimeout(() => {
      setDismissedStatusKey(statusKey);
    }, STATUS_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [status.state, statusKey]);

  useEffect(() => {
    if (videoStatus.state === 'working' || videoStatus.state === 'failed') return undefined;
    const timeout = window.setTimeout(() => {
      setDismissedVideoStatusKey(videoStatusKey);
    }, STATUS_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [videoStatus.state, videoStatusKey]);

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
      setPreviewNotice({ message: 'Could not prepare the original image. Tap to retry.', tone: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [prepareAttempt, previewFileKey]);

  useEffect(() => {
    const batchId = latestBatch?.id ?? null;
    if (!batchId) return;
    if (observedBatchIdRef.current === null) {
      observedBatchIdRef.current = batchId;
      return;
    }
    if (observedBatchIdRef.current === batchId) return;
    observedBatchIdRef.current = batchId;
    setShowHistory(false);
    const timer = window.setTimeout(() => {
      const section = latestBatchRef.current;
      if (!section) return;
      section.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      section.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [latestBatch?.id]);

  const refreshProject = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingProject(true);
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
          message: error instanceof Error ? error.message : 'Could not load posters',
          tone: 'error',
        });
      }
    } finally {
      if (!quiet) setLoadingProject(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingProject(true);
    void (async () => {
      try {
        const restoredProject = await resolveDirectLoanPosterProject(user.id);
        if (cancelled) return;
        if (!restoredProject) {
          setProjectId(null);
          setProject(null);
          setFiles([]);
          return;
        }
        setProjectId(restoredProject.id);
        setProject(restoredProject);
        const restoredFiles = await fetchPosterFiles(restoredProject.id);
        if (!cancelled) setFiles(restoredFiles);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
          window.location.reload();
          return;
        }
        setNotice({
          message: error instanceof Error ? error.message : 'Could not load recent posters',
          tone: 'error',
        });
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    if (!projectId) return undefined;
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
  }, [projectId, refreshProject, status.state]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setNotice(null);
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
      });
      setProjectId(result.projectId);
      await refreshProject(result.projectId, true);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : 'Could not submit the generation task',
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const generateVideo = (draft: LoanVideoDraft) => {
    void videoGeneration.start(draft);
  };

  const removeVideo = async (file: ProjectFile) => {
    if (deletingVideoName || !window.confirm(`Delete ${file.name}?`)) return;
    setDeletingVideoName(file.name);
    try {
      const deleted = await videoGeneration.removeVideo(file);
      setNotice({
        message: deleted ? 'Video deleted' : 'Could not delete the video',
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
          ? 'Choose Save to Photos or Save to Files in the system menu.'
          : 'Image download started',
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('[poster-preview] save failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          fileName: file.name,
        });
        setPreviewNotice({ message: 'Could not save the image. Please try again.', tone: 'error' });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const copyImage = async (file: File) => {
    if (activeAction) return;
    setActiveAction('copy');
    setPreviewNotice({
      message: 'Copying the original image. Choose Copy if a system menu appears.',
      tone: 'info',
    });
    try {
      const result = await copyOrSharePreparedImageFile(file);
      setPreviewNotice({
        message: result === 'copied' ? 'Image copied' : 'Image action completed',
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setPreviewNotice({
          message: 'This Feishu version cannot copy images. Use Save image instead.',
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
        message: copied ? 'System sharing is unavailable. Image link copied.' : 'Could not share image',
        tone: copied ? 'info' : 'error',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const remove = async (file: ProjectFile) => {
    if (!projectId || !window.confirm(`Delete ${file.name}?`)) return;
    const response = await fetch(rawUrl(projectId, file.name), {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!response?.ok) {
      setNotice({ message: 'Could not delete the image', tone: 'error' });
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
      <header className="poster-app__header">
        <div className="poster-app__mode-select" ref={modeMenuRef}>
          <span className="poster-app__eyebrow">
            {creationMode === 'poster'
              ? 'NIKI POSTER'
              : creationMode === 'video'
                ? 'NIKI VIDEO'
                : creationMode === 'documents'
                  ? 'NIKI DOCS'
                  : creationMode === 'english'
                    ? 'NIKI ENGLISH'
                    : 'NIKI LOGO'}
          </span>
          <button
            type="button"
            className="poster-app__mode-trigger"
            aria-haspopup="listbox"
            aria-expanded={modeMenuOpen}
            onClick={() => setModeMenuOpen((current) => !current)}
          >
            <span className="poster-app__mode-title" role="heading" aria-level={1}>
              {creationMode === 'poster'
                ? 'Generate Loan Posters'
                : creationMode === 'video'
                  ? 'Generate Tutorial Videos'
                  : creationMode === 'documents'
                    ? 'Document Search'
                    : creationMode === 'english'
                      ? 'Daily English Practice'
                      : 'Logo Studio'}
              <Icon name="chevron-down" size={24} />
            </span>
          </button>
          <div
            className={`poster-app__mode-menu${modeMenuOpen ? ' is-open' : ''}`}
            role="listbox"
            aria-label="Creation mode"
            aria-hidden={!modeMenuOpen}
          >
            {([
              { value: 'poster', title: 'Generate Loan Posters', description: 'Create ready-to-use loan campaign images', icon: 'image' },
              { value: 'video', title: 'Generate Tutorial Videos', description: 'Turn app screenshots into guided videos', icon: 'play' },
              { value: 'documents', title: 'Document Search', description: 'Search Feishu or open a document link', icon: 'search' },
              { value: 'english', title: 'Daily English Practice', description: 'Practice real-life English conversations', icon: 'languages' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={creationMode === option.value}
                tabIndex={modeMenuOpen ? 0 : -1}
                onClick={() => {
                  setCreationMode(option.value);
                  updateCreationModeUrl(option.value);
                  setModeMenuOpen(false);
                }}
              >
                <span className="poster-app__mode-option-icon"><Icon name={option.icon} size={18} /></span>
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                {creationMode === option.value ? <Icon name="check" size={19} /> : null}
              </button>
            ))}
            <Link
              href="/logo"
              prefetch={false}
              role="option"
              aria-selected={creationMode === 'logo'}
              tabIndex={modeMenuOpen ? 0 : -1}
              onClick={() => setModeMenuOpen(false)}
            >
              <span className="poster-app__mode-option-icon"><Icon name="sparkles" size={18} /></span>
              <span>
                <strong>Logo Studio</strong>
                <small>Create a focused identity system</small>
              </span>
              {creationMode === 'logo' ? <Icon name="check" size={19} /> : null}
            </Link>
          </div>
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
                Account
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
              Sign out
            </button>
          </div>
        </div>
      </header>

      <PasswordAccountManager
        open={accountManagerOpen}
        onClose={() => setAccountManagerOpen(false)}
      />

      {creationMode === 'poster' ? (
        <>
      <section className="poster-app__generator" aria-label="Poster generation settings">
        <div className="poster-app__field">
          <span>Product</span>
          <CustomSelect
            ariaLabel="Product"
            className="poster-app__select"
            value={brand}
            options={POSTER_PRODUCT_OPTIONS}
            disabled={generating}
            menuClassName="poster-app__select-menu"
            menuGap={8}
            menuMinWidth={224}
            menuPlacement="bottom"
            triggerClassName="poster-app__select-trigger"
            onChange={(value) => setBrand(value as AutoPosterBrand)}
          />
        </div>
        <div className="poster-app__field">
          <span>Type</span>
          <CustomSelect
            ariaLabel="Type"
            className="poster-app__select"
            value={purpose}
            options={POSTER_TYPE_OPTIONS}
            disabled={generating}
            menuClassName="poster-app__select-menu"
            menuGap={8}
            menuMinWidth={224}
            menuPlacement="bottom"
            triggerClassName="poster-app__select-trigger"
            onChange={(value) => setPurpose(value as AutoPosterPurpose)}
          />
        </div>
        <div className="poster-app__field">
          <span>Quantity</span>
          <CustomSelect
            ariaLabel="Quantity"
            className="poster-app__select"
            value={String(count)}
            options={POSTER_QUANTITY_OPTIONS}
            disabled={generating}
            menuClassName="poster-app__select-menu"
            menuGap={8}
            menuMinWidth={224}
            menuPlacement="bottom"
            triggerClassName="poster-app__select-trigger"
            onChange={(value) => setCount(Number(value))}
          />
        </div>
        <div className="poster-app__field">
          <span>Ratio</span>
          <CustomSelect
            ariaLabel="Ratio"
            className="poster-app__select"
            value={aspectRatio}
            options={POSTER_RATIO_OPTIONS}
            disabled={generating}
            menuClassName="poster-app__select-menu"
            menuGap={8}
            menuMinWidth={224}
            menuPlacement="bottom"
            triggerClassName="poster-app__select-trigger"
            onChange={(value) => setAspectRatio(value as AutoPosterAspectRatio)}
          />
        </div>
        <button
          type="button"
          className="poster-app__generate"
          disabled={generating}
          onClick={() => void generate()}
        >
          {generating ? 'Submitting…' : 'Generate posters'}
        </button>
      </section>

      <section
        className={`poster-app__status is-${status.state}${statusDismissed ? ' is-dismissed' : ''}`}
        role="status"
        aria-live="polite"
        aria-hidden={statusDismissed || undefined}
        data-testid="poster-app-generation-status"
      >
        <span className="poster-app__status-mark" aria-hidden="true" />
        <div className="poster-app__status-copy">
          <strong>{statusTitle}</strong>
          <p>{status.detail}</p>
        </div>
        <button
          type="button"
          className="poster-app__status-close"
          aria-label="Close status"
          title="Close status"
          tabIndex={statusDismissed ? -1 : 0}
          onClick={() => setDismissedStatusKey(statusKey)}
        >
          <Icon name="close" size={16} />
        </button>
      </section>

      {notice ? (
        <button
          type="button"
          className={`poster-app__notice is-${notice.tone}`}
          onClick={() => setNotice(null)}
        >
          {notice.message}
        </button>
      ) : null}

      <section
        ref={latestBatchRef}
        className="poster-app__batch-section poster-app__latest-batch"
        aria-label="Latest batch"
        tabIndex={-1}
      >
        <header className="poster-app__section-header">
          <div className="poster-app__section-heading">
            <h2>Latest batch</h2>
            <span className="poster-app__section-meta">
              {latestBatchAspectRatio} × {latestBatchCount}
            </span>
          </div>
        </header>
        <div className="poster-app__gallery">
          {latestBatch?.files.map((file, index) => renderPoster(file, {
            aspectRatio: latestBatch.aspectRatio,
            eager: true,
            index,
          }))}
          {loadingProject || status.state === 'working' ? (
            <div className={`poster-app__poster-skeleton${latestBatchAspectRatio === '1:1'
              ? ' is-square'
              : latestBatchAspectRatio === '3:4'
                ? ' is-portrait'
                : ''}`}>
              <span>{loadingProject ? 'Loading recent posters…' : 'Generating image…'}</span>
            </div>
          ) : null}
        </div>
      </section>

      {historyFiles.length > 0 ? (
        <section className="poster-app__batch-section poster-app__history" aria-label="Poster history">
          <button
            type="button"
            className="poster-app__history-toggle"
            aria-expanded={showHistory}
            aria-label={`${showHistory ? 'Collapse' : 'Expand'} poster history`}
            onClick={() => setShowHistory((current) => !current)}
          >
            <span className="poster-app__section-heading">
              <span className="poster-app__section-title">Poster history</span>
              <span className="poster-app__section-meta">({historyFiles.length})</span>
            </span>
            <span className="poster-app__history-toggle-icon" aria-hidden="true">
              <Icon
                name="chevron-down"
                size={18}
                className={showHistory ? 'is-expanded' : undefined}
              />
            </span>
          </button>
          {showHistory ? (
            <div className="poster-app__gallery poster-app__history-gallery">
              {historyFiles.map(({ aspectRatio: fileAspectRatio, file }, index) => renderPoster(file, {
                aspectRatio: fileAspectRatio,
                eager: false,
                index,
              }))}
            </div>
          ) : null}
        </section>
      ) : null}

      {previewFile && projectId ? (
        <div className="poster-preview" role="dialog" aria-modal="true" aria-label={previewFile.name}>
          <header className="poster-preview__header">
            <button
              type="button"
              onClick={() => setPreviewName(null)}
              aria-label="Close"
              title="Close"
            >
              <Icon name="close" size={24} />
            </button>
            <button
              type="button"
              disabled={activeAction !== null || preparedPreviewFile === null}
              aria-label={activeAction === 'share'
                ? 'Sharing…'
                : preparedPreviewFile
                  ? 'Share'
                  : 'Preparing…'}
              title="Share"
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
                    setPreviewNotice({ message: 'Could not load the original image. Please try again.', tone: 'error' });
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
                ? 'Saving…'
                : preparedPreviewFile
                  ? 'Save image'
                  : failedPreviewKey === previewFileKey
                    ? 'Prepare again'
                    : 'Preparing original…'}
              title="Save image"
              onClick={() => {
                if (preparedPreviewFile) {
                  void download(preparedPreviewFile);
                  return;
                }
                setPreviewNotice({ message: 'Preparing the original again…', tone: 'info' });
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
              aria-label={activeAction === 'copy' ? 'Copying…' : 'Copy image'}
              title="Copy image"
              onClick={() => preparedPreviewFile && void copyImage(preparedPreviewFile)}
            >
              <Icon name={activeAction === 'copy' ? 'spinner' : 'copy'} size={23} />
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={activeAction !== null}
              aria-label="Delete"
              title="Delete"
              onClick={() => void remove(previewFile)}
            >
              <Icon name="trash" size={23} />
            </button>
          </footer>
        </div>
      ) : null}
        </>
      ) : creationMode === 'video' ? (
        <section className="poster-app__video" aria-label="Tutorial video generator">
          <LoanVideoComposer onSubmit={generateVideo} disabled={videoGeneration.active} />

          <section
            className={`poster-app__status is-${videoStatus.state}${videoStatusDismissed ? ' is-dismissed' : ''}`}
            role="status"
            aria-live="polite"
            aria-hidden={videoStatusDismissed || undefined}
            data-testid="poster-app-video-generation-status"
          >
            <span className="poster-app__status-mark" aria-hidden="true" />
            <div className="poster-app__status-copy">
              <strong>{videoStatus.title}</strong>
              <p>{videoStatus.detail}</p>
            </div>
            <button
              type="button"
              className="poster-app__status-close"
              aria-label="Close video status"
              title="Close video status"
              tabIndex={videoStatusDismissed ? -1 : 0}
              onClick={() => setDismissedVideoStatusKey(videoStatusKey)}
            >
              <Icon name="close" size={16} />
            </button>
          </section>

          {videoWorking || videoResultAvailable ? (
            <section
              className="poster-app__batch-section poster-app__latest-batch"
              aria-label="Latest video"
            >
              <header className="poster-app__section-header">
                <div className="poster-app__section-heading">
                  <h2>Latest video</h2>
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
                      Download video
                    </a>
                    <button
                      type="button"
                      className="poster-app__video-action is-danger"
                      disabled={deletingVideoName !== null}
                      onClick={() => void removeVideo(videoGeneration.latestVideo!)}
                    >
                      {deletingVideoName === videoGeneration.latestVideo!.name ? 'Deleting…' : 'Delete'}
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
                    <time>Elapsed {videoElapsed}</time>
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
            <section className="poster-app__batch-section poster-app__history" aria-label="Video history">
              <button
                type="button"
                className="poster-app__history-toggle"
                aria-expanded={showVideoHistory}
                aria-label={`${showVideoHistory ? 'Collapse' : 'Expand'} video history`}
                onClick={() => setShowVideoHistory((current) => !current)}
              >
                <span className="poster-app__section-heading">
                  <span className="poster-app__section-title">Video history</span>
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
                          Download
                        </a>
                        <button
                          type="button"
                          className="poster-app__video-action is-danger"
                          disabled={deletingVideoName !== null}
                          onClick={() => void removeVideo(file)}
                        >
                          {deletingVideoName === file.name ? 'Deleting…' : 'Delete'}
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
    </main>
  );
}
