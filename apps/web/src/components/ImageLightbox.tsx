import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useT } from '../i18n';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import {
  copyImageBlobToClipboard,
  downloadImageBlob,
} from '../lib/image-file-actions';
import {
  projectImagePreviewUrl,
  projectRawUrl,
} from '../providers/registry';
import type { ProjectFile } from '../types';
import { Icon } from './Icon';
import { Toast } from './Toast';

interface Props {
  projectId: string;
  images: ProjectFile[];
  activeName: string;
  onActiveNameChange: (name: string) => void;
  onClose: () => void;
  onDelete?: (name: string) => Promise<boolean>;
}

interface Point {
  x: number;
  y: number;
}

interface GestureState {
  initialDistance: number;
  initialScale: number;
  lastPoint: Point | null;
  swipeStartX: number | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SWIPE_THRESHOLD = 64;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function pointDistance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function ImageLightbox({
  projectId,
  images,
  activeName,
  onActiveNameChange,
  onClose,
  onDelete,
}: Props) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<GestureState>({
    initialDistance: 0,
    initialScale: 1,
    lastPoint: null,
    swipeStartX: null,
  });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [imageRetry, setImageRetry] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    role: 'status' | 'alert';
  } | null>(null);

  const activeIndex = Math.max(
    0,
    images.findIndex((image) => image.name === activeName),
  );
  const activeFile = images[activeIndex] ?? null;
  const previousImage = images[(activeIndex - 1 + images.length) % images.length];
  const nextImage = images[(activeIndex + 1) % images.length];
  const absoluteRawUrl = activeFile && typeof window !== 'undefined'
    ? new URL(
      projectRawUrl(projectId, activeFile.name),
      window.location.href,
    ).href
    : '';

  const selectRelativeImage = useCallback((delta: number) => {
    if (images.length < 2) return;
    const nextIndex = (activeIndex + delta + images.length) % images.length;
    const nextImage = images[nextIndex];
    if (nextImage) onActiveNameChange(nextImage.name);
  }, [activeIndex, images, onActiveNameChange]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setShareFallbackOpen(false);
    setImageState('loading');
    setImageRetry(0);
    pointersRef.current.clear();
  }, [activeName]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        const focusable = dialog
          ? [...dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )]
          : [];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialog?.focus({ preventScroll: true });
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (
          !event.shiftKey
          && (document.activeElement === last || !dialog?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectRelativeImage(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectRelativeImage(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectRelativeImage]);

  if (!activeFile) return null;

  const resetTransform = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const updateScale = (nextScale: number) => {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      gestureRef.current.lastPoint = point;
      gestureRef.current.swipeStartX = point.x;
    } else if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      gestureRef.current.initialDistance = pointDistance(first!, second!);
      gestureRef.current.initialScale = scale;
      gestureRef.current.swipeStartX = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const nextPoint = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, nextPoint);
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = pointDistance(first!, second!);
      if (gestureRef.current.initialDistance > 0) {
        updateScale(
          gestureRef.current.initialScale
            * (distance / gestureRef.current.initialDistance),
        );
      }
      return;
    }
    if (scale <= 1 || !gestureRef.current.lastPoint) return;
    const lastPoint = gestureRef.current.lastPoint;
    setOffset((current) => ({
      x: current.x + nextPoint.x - lastPoint.x,
      y: current.y + nextPoint.y - lastPoint.y,
    }));
    gestureRef.current.lastPoint = nextPoint;
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const finalPoint = pointersRef.current.get(event.pointerId);
    const swipeStartX = gestureRef.current.swipeStartX;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (
      pointersRef.current.size === 0
      && scale <= 1.01
      && finalPoint
      && swipeStartX !== null
    ) {
      const delta = finalPoint.x - swipeStartX;
      if (Math.abs(delta) >= SWIPE_THRESHOLD) {
        selectRelativeImage(delta > 0 ? -1 : 1);
      }
    }
    const remainingPoint = pointersRef.current.values().next().value as Point | undefined;
    gestureRef.current.lastPoint = remainingPoint ?? null;
    gestureRef.current.swipeStartX = remainingPoint?.x ?? null;
    gestureRef.current.initialDistance = 0;
    gestureRef.current.initialScale = scale;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? 0.25 : -0.25));
  };

  const showShareFallback = async () => {
    setShareFallbackOpen(true);
    const copied = await copyToClipboard(absoluteRawUrl);
    setNotice({
      message: t(copied ? 'imageViewer.linkCopied' : 'imageViewer.actionFailed'),
      role: copied ? 'status' : 'alert',
    });
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (typeof navigator.share !== 'function') {
        await showShareFallback();
        return;
      }

      const response = await fetch(projectRawUrl(projectId, activeFile.name));
      if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], activeFile.name, {
        type: activeFile.mime || blob.type || 'application/octet-stream',
      });
      const fileShare = { files: [file], title: activeFile.name };
      if (typeof navigator.canShare === 'function' && navigator.canShare(fileShare)) {
        await navigator.share(fileShare);
      } else {
        await navigator.share({ title: activeFile.name, url: absoluteRawUrl });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await showShareFallback();
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    const copied = await copyToClipboard(absoluteRawUrl);
    setNotice({
      message: t(copied ? 'imageViewer.linkCopied' : 'imageViewer.actionFailed'),
      role: copied ? 'status' : 'alert',
    });
  };

  const handleCopyImage = async () => {
    try {
      await copyImageBlobToClipboard(
        projectRawUrl(projectId, activeFile.name),
        activeFile.mime || 'image/png',
      );
      setNotice({ message: t('imageViewer.imageCopied'), role: 'status' });
    } catch {
      setNotice({ message: t('imageViewer.actionFailed'), role: 'alert' });
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadImageBlob(
        projectRawUrl(projectId, activeFile.name),
        activeFile.name,
      );
      setNotice({ message: t('imageViewer.downloadStarted'), role: 'status' });
    } catch {
      setNotice({ message: t('imageViewer.actionFailed'), role: 'alert' });
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    if (!window.confirm(t('workspace.deleteFileConfirm', { name: activeFile.name }))) {
      return;
    }
    setDeleting(true);
    const deleted = await onDelete(activeFile.name).catch(() => false);
    setDeleting(false);
    if (deleted) {
      onClose();
    } else {
      setNotice({ message: t('imageViewer.deleteFailed'), role: 'alert' });
    }
  };

  return (
    <div
      ref={dialogRef}
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('common.preview')} ${activeFile.name}`}
      tabIndex={-1}
      data-testid="image-lightbox"
    >
      <header className="image-lightbox__header">
        <button
          type="button"
          className="image-lightbox__round-action"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <Icon name="close" size={24} />
        </button>
        <span className="image-lightbox__counter" aria-live="polite">
          {images.length > 1 ? `${activeIndex + 1} / ${images.length}` : activeFile.name}
        </span>
        <button
          type="button"
          className="image-lightbox__share-action"
          disabled={sharing}
          aria-label={t('common.share')}
          title={t('common.share')}
          onClick={() => void handleShare()}
        >
          <Icon name={sharing ? 'spinner' : 'share'} size={22} />
        </button>
      </header>

      <div
        className={`image-lightbox__stage${scale > 1 ? ' is-zoomed' : ''}${
          imageState === 'loaded' ? ' is-image-ready' : ''
        }${imageState === 'failed' ? ' is-image-failed' : ''}`}
        onDoubleClick={() => {
          if (scale > 1) resetTransform();
          else updateScale(2);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <span
          className={`image-lightbox__image-skeleton${imageState === 'loaded' ? ' is-hidden' : ''}${
            imageState === 'failed' ? ' is-failed' : ''
          }`}
          role={imageState === 'failed' ? 'alert' : undefined}
          data-testid="image-lightbox-image-skeleton"
        >
          {imageState === 'failed' ? '图片加载失败，请点击重试' : '图片加载中…'}
        </span>
        <picture key={`${activeFile.name}:${activeFile.mtime}:${imageRetry}`}>
          <source
            media="(max-width: 900px)"
            srcSet={projectImagePreviewUrl(
              projectId,
              activeFile.name,
              'mobile',
              activeFile.mtime + imageRetry,
            )}
          />
          <img
            src={projectImagePreviewUrl(
              projectId,
              activeFile.name,
              'preview',
              activeFile.mtime + imageRetry,
            )}
            alt={activeFile.name}
            draggable={false}
            onLoad={() => setImageState('loaded')}
            onError={() => setImageState('failed')}
            onClick={() => {
              if (imageState === 'failed') {
                setImageState('loading');
                setImageRetry((value) => value + 1);
              }
            }}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            }}
            data-testid="image-lightbox-image"
          />
        </picture>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="image-lightbox__nav is-previous"
              onClick={() => selectRelativeImage(-1)}
              aria-label={`${t('common.preview')} ${previousImage?.name ?? ''} ←`}
              data-testid="image-lightbox-previous"
            >
              <Icon name="chevron-left" size={24} />
            </button>
            <button
              type="button"
              className="image-lightbox__nav is-next"
              onClick={() => selectRelativeImage(1)}
              aria-label={`${t('common.preview')} ${nextImage?.name ?? ''} →`}
              data-testid="image-lightbox-next"
            >
              <Icon name="chevron-right" size={24} />
            </button>
          </>
        ) : null}
      </div>

      <footer className="image-lightbox__footer">
        <button
          type="button"
          className="image-lightbox__footer-action"
          aria-label={t('designFiles.download')}
          title={t('designFiles.download')}
          data-testid="image-lightbox-footer-download"
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          <span className="image-lightbox__tool-icon">
            <Icon name={downloading ? 'spinner' : 'download'} size={23} />
          </span>
        </button>
        <button
          type="button"
          className="image-lightbox__footer-action"
          aria-label={t('designFiles.copy')}
          title={t('designFiles.copy')}
          data-testid="image-lightbox-footer-copy"
          onClick={() => void handleCopyImage()}
        >
          <span className="image-lightbox__tool-icon">
            <Icon name="copy" size={23} />
          </span>
        </button>
        {onDelete ? (
          <button
            type="button"
            className="image-lightbox__footer-action is-danger"
            disabled={deleting}
            aria-label={t('designFiles.delete')}
            title={t('designFiles.delete')}
            onClick={() => void handleDelete()}
          >
            <span className="image-lightbox__tool-icon">
              <Icon name={deleting ? 'spinner' : 'trash'} size={23} />
            </span>
          </button>
        ) : null}
      </footer>

      {notice ? (
        <div className="image-lightbox__toast">
          <Toast
            message={notice.message}
            role={notice.role}
            ttlMs={2600}
            onDismiss={() => setNotice(null)}
          />
        </div>
      ) : null}

      {shareFallbackOpen ? (
        <div
          className="image-lightbox__share-fallback"
          role="dialog"
          aria-modal="true"
          aria-label={t('common.share')}
          data-testid="image-lightbox-share-fallback"
        >
          <div className="image-lightbox__share-fallback-card">
            <strong>{t('common.share')}</strong>
            <p>系统分享不可用，可以复制图片链接分享。</p>
            <input
              readOnly
              value={absoluteRawUrl}
              aria-label="分享链接"
              data-testid="image-lightbox-share-url"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="image-lightbox__share-fallback-actions">
              <button type="button" onClick={() => setShareFallbackOpen(false)}>
                {t('common.close')}
              </button>
              <button type="button" onClick={() => void handleCopyLink()}>
                {t('designFiles.copy')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
