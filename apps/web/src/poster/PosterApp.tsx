'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNikiAuth } from '../auth/NikiAuth';
import {
  getDirectLoanPosterProjectId,
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
  copyImageBlobToClipboard,
  downloadImageBlob,
  fetchImageBlob,
} from '../lib/image-file-actions';
import type { Project, ProjectFile } from '../types';

type Notice = { message: string; tone: 'info' | 'error' };

function rawUrl(projectId: string, name: string): string {
  const safeName = name.split('/').map(encodeURIComponent).join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/raw/${safeName}`;
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

function generationCopy(project: Project | null, fileCount: number): {
  detail: string;
  state: 'idle' | 'working' | 'complete' | 'failed';
  title: string;
} {
  const generation = project?.metadata?.directGeneration;
  if (!generation) {
    return { state: 'idle', title: '准备生成', detail: '选择数量和比例，然后点击一次生成。' };
  }
  const expected = Math.max(fileCount, generation.expectedOutputs ?? 0);
  if (generation.status === 'failed' || generation.status === 'interrupted') {
    return {
      state: 'failed',
      title: '本批生成未完成',
      detail: generation.lastError ?? '生成服务未完成任务，请重新生成。',
    };
  }
  if (generation.status === 'complete') {
    return {
      state: 'complete',
      title: `已生成 ${fileCount} 张海报`,
      detail: '图片已保存，可以预览、下载、复制或分享。',
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
  const [brand, setBrand] = useState<AutoPosterBrand>(AUTO_POSTER_DEFAULT_BRAND);
  const [aspectRatio, setAspectRatio] = useState<AutoPosterAspectRatio>('16:9');
  const [count, setCount] = useState(2);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const posterFiles = useMemo(
    () => files
      .filter((file) => file.kind === 'image' && isLoanPosterOutputName(file.name))
      .sort((left, right) => left.mtime - right.mtime),
    [files],
  );
  const previewFile = previewName
    ? posterFiles.find((file) => file.name === previewName) ?? null
    : null;
  const status = generationCopy(project, posterFiles.length);

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
    const restoredProjectId = getDirectLoanPosterProjectId(user.id);
    if (!restoredProjectId) return;
    setProjectId(restoredProjectId);
    void refreshProject(restoredProjectId);
  }, [refreshProject, user.id]);

  useEffect(() => {
    if (!projectId) return undefined;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshProject(projectId, true);
      }
    }, status.state === 'working' ? 1_500 : 5_000);
    return () => window.clearInterval(intervalId);
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

  const download = async (file: ProjectFile) => {
    if (!projectId) return;
    try {
      await downloadImageBlob(rawUrl(projectId, file.name), file.name);
      setNotice({ message: '图片下载已开始', tone: 'info' });
    } catch {
      setNotice({ message: '图片下载失败', tone: 'error' });
    }
  };

  const copyImage = async (file: ProjectFile) => {
    if (!projectId) return;
    try {
      await copyImageBlobToClipboard(rawUrl(projectId, file.name), file.mime || 'image/png');
      setNotice({ message: '图片已复制', tone: 'info' });
    } catch {
      setNotice({ message: '当前环境无法复制图片', tone: 'error' });
    }
  };

  const share = async (file: ProjectFile) => {
    if (!projectId) return;
    const absoluteUrl = new URL(rawUrl(projectId, file.name), window.location.href).href;
    try {
      if (typeof navigator.share !== 'function') throw new Error('share unavailable');
      const blob = await fetchImageBlob(rawUrl(projectId, file.name));
      const image = new File([blob], file.name, { type: file.mime || blob.type || 'image/png' });
      const shareData = { files: [image], title: file.name };
      if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.share({ title: file.name, url: absoluteUrl });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const copied = await copyToClipboard(absoluteUrl);
      setNotice({
        message: copied ? '系统分享不可用，图片链接已复制' : '分享失败',
        tone: copied ? 'info' : 'error',
      });
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

  return (
    <main className="poster-app">
      <header className="poster-app__header">
        <div>
          <span className="poster-app__eyebrow">NIKI POSTER</span>
          <h1>一键生成贷款海报</h1>
        </div>
        <button type="button" className="poster-app__account" onClick={() => void logout()}>
          {user.name}
        </button>
      </header>

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

      <section className="poster-app__gallery" aria-label="生成的海报">
        {posterFiles.map((file) => (
          <button
            type="button"
            className="poster-app__poster"
            key={`${file.name}:${file.mtime}`}
            onClick={() => setPreviewName(file.name)}
          >
            <picture>
              <source media="(max-width: 900px)" srcSet={previewUrl(projectId!, file, 'mobile')} />
              <img
                src={previewUrl(projectId!, file, 'preview')}
                alt={file.name}
                loading="lazy"
                onLoad={(event) => {
                  event.currentTarget.closest('.poster-app__poster')?.classList.add('is-loaded');
                }}
              />
            </picture>
          </button>
        ))}
        {status.state === 'working' ? (
          <div className={`poster-app__poster-skeleton${aspectRatio === '1:1' ? ' is-square' : ''}`}>
            <span>图片生成中…</span>
          </div>
        ) : null}
      </section>

      {previewFile && projectId ? (
        <div className="poster-preview" role="dialog" aria-modal="true" aria-label={previewFile.name}>
          <header className="poster-preview__header">
            <button type="button" onClick={() => setPreviewName(null)} aria-label="关闭">×</button>
            <button type="button" onClick={() => void share(previewFile)}>分享</button>
          </header>
          <div className="poster-preview__stage">
            <picture>
              <source media="(max-width: 900px)" srcSet={previewUrl(projectId, previewFile, 'mobile')} />
              <img src={previewUrl(projectId, previewFile, 'preview')} alt={previewFile.name} />
            </picture>
          </div>
          <footer className="poster-preview__footer">
            <button type="button" onClick={() => void download(previewFile)}>下载</button>
            <button type="button" onClick={() => void copyImage(previewFile)}>复制图片</button>
            <button
              type="button"
              onClick={() => setNotice({ message: '图片编辑功能即将上线', tone: 'info' })}
            >
              编辑
            </button>
            <button type="button" className="is-danger" onClick={() => void remove(previewFile)}>删除</button>
          </footer>
        </div>
      ) : null}
    </main>
  );
}
