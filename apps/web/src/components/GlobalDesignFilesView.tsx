import { useEffect, useMemo, useState } from 'react';
import type { Project, ProjectFile } from '../types';
import { useI18n } from '../i18n';
import {
  deleteProjectFile,
  fetchProjectFiles,
  projectFileDownloadUrl,
  projectRawUrl,
} from '../providers/registry';
import { Icon } from './Icon';

const PROJECT_BATCH_SIZE = 8;

interface GlobalImage {
  project: Project;
  file: ProjectFile;
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedTime(mtime: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(mtime));
}

async function copyImageToClipboard(projectId: string, fileName: string): Promise<void> {
  const url = projectRawUrl(projectId, fileName);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load ${fileName}`);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      return;
    }
    await navigator.clipboard?.writeText(url);
  } catch {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  }
}

export function GlobalDesignFilesView({
  projects,
}: {
  projects: Project[];
}) {
  const { locale, t } = useI18n();
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );
  const [visibleProjectCount, setVisibleProjectCount] = useState(PROJECT_BATCH_SIZE);
  const [filesByProject, setFilesByProject] = useState<Record<string, ProjectFile[]>>({});
  const [loadingProjectIds, setLoadingProjectIds] = useState<string[]>([]);
  const [deletingFileKey, setDeletingFileKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GlobalImage | null>(null);

  useEffect(() => {
    setVisibleProjectCount(PROJECT_BATCH_SIZE);
    setFilesByProject({});
  }, [projects]);

  useEffect(() => {
    const visibleProjects = sortedProjects.slice(0, visibleProjectCount);
    const missing = visibleProjects.filter((project) => filesByProject[project.id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoadingProjectIds(missing.map((project) => project.id));
    void Promise.all(missing.map(async (project) => ({
      projectId: project.id,
      files: await fetchProjectFiles(project.id),
    }))).then((results) => {
      if (cancelled) return;
      setFilesByProject((current) => {
        const next = { ...current };
        for (const result of results) next[result.projectId] = result.files;
        return next;
      });
      setLoadingProjectIds([]);
    });
    return () => {
      cancelled = true;
    };
  }, [filesByProject, sortedProjects, visibleProjectCount]);

  const images = useMemo<GlobalImage[]>(() => (
    sortedProjects
      .slice(0, visibleProjectCount)
      .flatMap((project) => (filesByProject[project.id] ?? [])
        .filter((file) => file.kind === 'image')
        .map((file) => ({ project, file })))
      .sort((a, b) => b.file.mtime - a.file.mtime)
  ), [filesByProject, sortedProjects, visibleProjectCount]);
  const loading = loadingProjectIds.length > 0;
  const hasMoreProjects = visibleProjectCount < sortedProjects.length;

  useEffect(() => {
    if (!previewImage) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewImage(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewImage]);

  async function deleteImage(image: GlobalImage): Promise<void> {
    const { project, file } = image;
    const fileKey = `${project.id}:${file.name}`;
    if (!window.confirm(t('workspace.deleteFileConfirm', { name: file.name }))) return;
    setDeletingFileKey(fileKey);
    try {
      const deleted = await deleteProjectFile(project.id, file.name);
      if (!deleted) return;
      setFilesByProject((current) => ({
        ...current,
        [project.id]: (current[project.id] ?? []).filter(
          (candidate) => candidate.name !== file.name,
        ),
      }));
      setPreviewImage((current) => (
        current?.project.id === project.id && current.file.name === file.name
          ? null
          : current
      ));
    } finally {
      setDeletingFileKey(null);
    }
  }

  return (
    <section className="global-design-files" data-testid="global-design-files">
      <header className="global-design-files__header">
        <div>
          <span className="global-design-files__eyebrow">NIKI LIBRARY</span>
          <h1>{t('workspace.designFiles')}</h1>
        </div>
        <span className="global-design-files__count">{images.length}</span>
      </header>

      {images.length > 0 ? (
        <div
          className="global-design-files__list"
          data-testid="global-design-files-list"
          role="list"
        >
          {images.map(({ project, file }, index) => {
            const fileKey = `${project.id}:${file.name}`;
            return (
              <div
                className="global-design-files__row"
                key={fileKey}
                role="listitem"
              >
                <button
                  type="button"
                  className="global-design-files__open"
                  aria-label={file.name}
                  onClick={() => setPreviewImage({ project, file })}
                >
                  <span
                    className="global-design-files__ordinal"
                    aria-label={`#${String(index + 1).padStart(3, '0')}`}
                  >
                    {String(index + 1).padStart(3, '0')}
                  </span>
                  <span className="global-design-files__thumb">
                    <img
                      src={`${projectRawUrl(project.id, file.name)}?v=${Math.round(file.mtime)}`}
                      alt={file.name}
                      loading="lazy"
                      draggable={false}
                    />
                  </span>
                  <span className="global-design-files__meta">
                    <strong>{file.name}</strong>
                    <small>{project.name}</small>
                  </span>
                  <span className="global-design-files__details">
                    {t('designFiles.modified', {
                      time: formatModifiedTime(file.mtime, locale),
                      size: humanBytes(file.size),
                    })}
                  </span>
                </button>
                <span className="global-design-files__actions">
                  <a
                    href={projectFileDownloadUrl(project.id, file.name)}
                    download
                    title={t('designFiles.download')}
                    aria-label={`${t('designFiles.download')} ${file.name}`}
                  >
                    <Icon name="download" size={16} />
                  </a>
                  <button
                    type="button"
                    title={t('designFiles.copy')}
                    aria-label={`${t('designFiles.copy')} ${file.name}`}
                    onClick={() => void copyImageToClipboard(project.id, file.name)}
                  >
                    <Icon name="copy" size={16} />
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={deletingFileKey === fileKey}
                    title={t('designFiles.delete')}
                    aria-label={`${t('designFiles.delete')} ${file.name}`}
                    onClick={() => void deleteImage({ project, file })}
                  >
                    <Icon
                      name={deletingFileKey === fileKey ? 'spinner' : 'trash'}
                      size={16}
                    />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <div className="global-design-files__empty">
          <Icon name="spinner" size={20} className="global-design-files__spinner" />
          <span>{t('common.loading')}</span>
        </div>
      ) : (
        <div className="global-design-files__empty">
          <Icon name="image" size={22} />
          <span>{t('designFiles.empty')}</span>
        </div>
      )}

      {hasMoreProjects ? (
        <button
          type="button"
          className="global-design-files__more"
          disabled={loading}
          onClick={() => setVisibleProjectCount((count) => count + PROJECT_BATCH_SIZE)}
        >
          {loading
            ? t('common.loading')
            : t('designFiles.showMore', {
              n: Math.min(PROJECT_BATCH_SIZE, sortedProjects.length - visibleProjectCount),
            })}
        </button>
      ) : null}

      {previewImage ? (
        <div
          className="global-design-files__preview"
          role="dialog"
          aria-modal="true"
          aria-label={`${t('common.preview')} ${previewImage.file.name}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewImage(null);
          }}
        >
          <div className="global-design-files__preview-card">
            <header className="global-design-files__preview-header">
              <div>
                <strong>{previewImage.file.name}</strong>
                <small>{previewImage.project.name}</small>
              </div>
              <button
                type="button"
                className="global-design-files__preview-close"
                aria-label={t('common.close')}
                title={t('common.close')}
                onClick={() => setPreviewImage(null)}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="global-design-files__preview-stage">
              <img
                src={`${projectRawUrl(
                  previewImage.project.id,
                  previewImage.file.name,
                )}?v=${Math.round(previewImage.file.mtime)}`}
                alt={previewImage.file.name}
                data-testid="global-design-files-preview-image"
              />
            </div>
            <footer className="global-design-files__preview-actions">
              <a
                href={projectFileDownloadUrl(
                  previewImage.project.id,
                  previewImage.file.name,
                )}
                download
                aria-label={`${t('designFiles.download')} ${previewImage.file.name}`}
              >
                <Icon name="download" size={17} />
                <span>{t('designFiles.download')}</span>
              </a>
              <button
                type="button"
                aria-label={`${t('designFiles.copy')} ${previewImage.file.name}`}
                onClick={() => void copyImageToClipboard(
                  previewImage.project.id,
                  previewImage.file.name,
                )}
              >
                <Icon name="copy" size={17} />
                <span>{t('designFiles.copy')}</span>
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={
                  deletingFileKey === `${previewImage.project.id}:${previewImage.file.name}`
                }
                aria-label={`${t('designFiles.delete')} ${previewImage.file.name}`}
                onClick={() => void deleteImage(previewImage)}
              >
                <Icon
                  name={
                    deletingFileKey
                      === `${previewImage.project.id}:${previewImage.file.name}`
                      ? 'spinner'
                      : 'trash'
                  }
                  size={17}
                />
                <span>{t('designFiles.delete')}</span>
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
