'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNikiAuth } from '../auth/NikiAuth';
import { PasswordAccountManager } from '../auth/PasswordAccountManager';
import {
  buildDirectPosterBatches,
  type DirectPosterBatchView,
} from '../components/direct-poster-batches';
import {
  resolveDirectLoanPosterProject,
  startDirectLoanPosterProject,
} from '../components/home-hero/direct-loan-posters';
import {
  AUTO_POSTER_DEFAULT_BRAND,
  isLoanPosterOutputName,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
} from '../components/home-hero/zambia-posters';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import {
  canSharePreparedImageFile,
  copyOrSharePreparedImageFile,
  prepareImageFile,
  savePreparedImageFile,
  sharePreparedImageFile,
} from '../lib/image-file-actions';
import type { Project, ProjectFile } from '../types';

type Notice = { message: string; tone: 'info' | 'error' };
type PreparedPreviewImage = { file: File; key: string };

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
  if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
  const body = await response.json() as { files?: ProjectFile[] };
  return body.files ?? [];
}

function generationCopy(batch: DirectPosterBatchView | null): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  if (!batch) {
    return { state: 'idle', title: '准备生成', detail: '选择数量和比例，然后点击一次生成。' };
  }
  const fileCount = batch.files.length;
  const expected = Math.max(fileCount, batch.expectedCount ?? 0);
  if (batch.status === 'failed' || batch.status === 'interrupted') {
    return {
      state: 'failed',
      title: '本批生成未完成',
      detail: batch.lastError ?? '生成服务未完成任务，请重新生成。',
    };
  }
  if (batch.status === 'complete') {
    return {
      state: 'complete',
      title: fileCount > 0 ? `本批已生成 ${fileCount} 张海报` : '本批图片已删除',
      detail: fileCount > 0
        ? '最新图片已置顶，可以预览、下载、复制或分享。'
        : '可以点击一键生成新的海报。',
    };
  }
  return {
    state: 'working',
    title: fileCount > 0 ? `正在生成 · ${fileCount}/${expected} 张` : '正在生成海报',
    detail: '任务已提交。可以停留在本页，图片完成后会自动出现。',
  };
}

export function PosterApp() {
  const { user, logout } = useNikiAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [brand, setBrand] = useState<AutoPosterBrand>(AUTO_POSTER_DEFAULT_BRAND);
  const [aspectRatio, setAspectRatio] = useState<AutoPosterAspectRatio>('16:9');
  const [count, setCount] = useState(2);
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
  const [preparedPreviewImage, setPreparedPreviewImage] = useState<PreparedPreviewImage | null>(null);
  const [failedPreviewKey, setFailedPreviewKey] = useState<string | null>(null);
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const latestBatchRef = useRef<HTMLElement | null>(null);
  const observedBatchIdRef = useRef<string | null>(null);
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
      setPreviewNotice({ message: '原图准备失败，请点击重试', tone: 'error' });
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
          message: error instanceof Error ? error.message : '海报读取失败',
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
          message: error instanceof Error ? error.message : '最近海报读取失败',
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
        message: error instanceof Error ? error.message : '生成任务提交失败',
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const download = async (file: File) => {
    if (activeAction) return;
    setActiveAction('download');
    try {
      const result = await savePreparedImageFile(file);
      setPreviewNotice({
        message: result === 'shared'
          ? '请在系统菜单选择“存储到照片”或“存储到文件”'
          : '图片下载已开始',
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('[poster-preview] save failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          fileName: file.name,
        });
        setPreviewNotice({ message: '图片保存失败，请重试', tone: 'error' });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const copyImage = async (file: File) => {
    if (activeAction) return;
    setActiveAction('copy');
    setPreviewNotice({
      message: '正在复制原图；若出现系统菜单，请选择“拷贝”',
      tone: 'info',
    });
    try {
      const result = await copyOrSharePreparedImageFile(file);
      setPreviewNotice({
        message: result === 'copied' ? '图片已复制' : '系统图片操作已完成',
        tone: 'info',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setPreviewNotice({
          message: '当前飞书版本不支持复制图片，请使用“保存图片”',
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
        message: copied ? '系统分享不可用，图片链接已复制' : '分享失败',
        tone: copied ? 'info' : 'error',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const remove = async (file: ProjectFile) => {
    if (!projectId || !window.confirm(`删除 ${file.name}？`)) return;
    const response = await fetch(rawUrl(projectId, file.name), {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!response?.ok) {
      setNotice({ message: '图片删除失败', tone: 'error' });
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
    const aspectClass = options.aspectRatio === '1:1' ? 'is-square' : 'is-landscape';
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
    <main className="poster-app">
      <header className="poster-app__header">
        <div>
          <span className="poster-app__eyebrow">NIKI POSTER</span>
          <h1>一键生成贷款海报</h1>
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
                账号管理
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
              退出登录
            </button>
          </div>
        </div>
      </header>

      <PasswordAccountManager
        open={accountManagerOpen}
        onClose={() => setAccountManagerOpen(false)}
      />

      <section className="poster-app__generator" aria-label="海报生成设置">
        <div className="poster-app__field">
          <span>品牌</span>
          <div className="poster-app__segmented">
            {(['zamloan', 'biumoney'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={brand === value ? 'is-active' : ''}
                onClick={() => setBrand(value)}
              >
                {value === 'zamloan' ? 'Zamloan' : 'Biumoney'}
              </button>
            ))}
          </div>
        </div>
        <div className="poster-app__field">
          <span>数量</span>
          <div className="poster-app__segmented">
            {[1, 2, 3, 4].map((value) => (
              <button
                key={value}
                type="button"
                className={count === value ? 'is-active' : ''}
                onClick={() => setCount(value)}
              >
                {value} 张
              </button>
            ))}
          </div>
        </div>
        <div className="poster-app__field">
          <span>比例</span>
          <div className="poster-app__segmented">
            {(['16:9', '1:1'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={aspectRatio === value ? 'is-active' : ''}
                onClick={() => setAspectRatio(value)}
              >
                {value === '16:9' ? '横版 16:9' : '方形 1:1'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="poster-app__generate"
          disabled={generating}
          onClick={() => void generate()}
        >
          {generating ? '正在提交…' : '一键生成海报'}
        </button>
      </section>

      <section className={`poster-app__status is-${status.state}`} aria-live="polite">
        <span className="poster-app__status-mark" aria-hidden="true" />
        <div>
          <strong>{loadingProject ? '正在读取海报…' : status.title}</strong>
          <p>{status.detail}</p>
        </div>
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
        aria-label="本次生成"
        tabIndex={-1}
      >
        <header className="poster-app__section-header">
          <div>
            <h2>本次生成</h2>
            <span>{latestBatch?.aspectRatio ?? aspectRatio}</span>
          </div>
          {latestBatch?.files.length ? <span>{latestBatch.files.length} 张</span> : null}
        </header>
        <div className="poster-app__gallery">
          {latestBatch?.files.map((file, index) => renderPoster(file, {
            aspectRatio: latestBatch.aspectRatio,
            eager: true,
            index,
          }))}
          {loadingProject || status.state === 'working' ? (
            <div className={`poster-app__poster-skeleton${(
              latestBatch?.aspectRatio ?? aspectRatio
            ) === '1:1' ? ' is-square' : ''}`}>
              <span>{loadingProject ? '正在读取最近海报…' : '图片生成中…'}</span>
            </div>
          ) : null}
        </div>
      </section>

      {historyFiles.length > 0 ? (
        <section className="poster-app__batch-section poster-app__history" aria-label="历史海报">
          <button
            type="button"
            className="poster-app__history-toggle"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((current) => !current)}
          >
            <span>历史海报（{historyFiles.length} 张）</span>
            <span aria-hidden="true">{showHistory ? '收起' : '展开'}</span>
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
            <button type="button" onClick={() => setPreviewName(null)} aria-label="关闭">×</button>
            <button
              type="button"
              disabled={activeAction !== null || preparedPreviewFile === null}
              onClick={() => preparedPreviewFile && void share(previewFile, preparedPreviewFile)}
            >
              {activeAction === 'share' ? '分享中…' : preparedPreviewFile ? '分享' : '准备中…'}
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
            <picture className={previewAspectRatio === '1:1' ? 'is-square' : 'is-landscape'}>
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
                    setPreviewNotice({ message: '原图加载失败，请稍后重试', tone: 'error' });
                  }
                }}
              />
            </picture>
          </div>
          <footer className="poster-preview__footer">
            <button
              type="button"
              disabled={activeAction !== null || previewFilePreparing}
              onClick={() => {
                if (preparedPreviewFile) {
                  void download(preparedPreviewFile);
                  return;
                }
                setPreviewNotice({ message: '正在重新准备原图…', tone: 'info' });
                setPrepareAttempt((current) => current + 1);
              }}
            >
              {activeAction === 'download'
                ? '保存中…'
                : preparedPreviewFile
                  ? '保存图片'
                  : failedPreviewKey === previewFileKey
                    ? '重新准备'
                    : '正在准备原图…'}
            </button>
            <button
              type="button"
              disabled={activeAction !== null || preparedPreviewFile === null}
              onClick={() => preparedPreviewFile && void copyImage(preparedPreviewFile)}
            >
              {activeAction === 'copy' ? '复制中…' : '复制图片'}
            </button>
            <button
              type="button"
              disabled={activeAction !== null}
              onClick={() => setPreviewNotice({ message: '图片编辑功能即将上线', tone: 'info' })}
            >
              编辑
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={activeAction !== null}
              onClick={() => void remove(previewFile)}
            >
              删除
            </button>
          </footer>
        </div>
      ) : null}
    </main>
  );
}
