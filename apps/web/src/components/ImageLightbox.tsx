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
  projectFileDownloadUrl,
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
  onEdit?: (file: ProjectFile) => void;
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
  onEdit,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
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
    setMoreOpen(false);
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

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    setMoreOpen(false);
    try {
      if (typeof navigator.share !== 'function') {
        const copied = await copyToClipboard(absoluteRawUrl);
        setNotice({
          message: t(copied ? 'imageViewer.linkCopied' : 'imageViewer.actionFailed'),
          role: copied ? 'status' : 'alert',
        });
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
      const copied = await copyToClipboard(absoluteRawUrl);
      setNotice({
        message: t(copied ? 'imageViewer.linkCopied' : 'imageViewer.actionFailed'),
        role: copied ? 'status' : 'alert',
      });
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    setMoreOpen(false);
    const copied = await copyToClipboard(absoluteRawUrl);
    setNotice({
      message: t(copied ? 'imageViewer.linkCopied' : 'imageViewer.actionFailed'),
      role: copied ? 'status' : 'alert',
    });
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    setMoreOpen(false);
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
        <div className="image-lightbox__header-actions">
          <div className="image-lightbox__more-wrap">
            <button
              type="button"
              className="image-lightbox__round-action"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-label={t('designs.menuMore')}
            >
              <Icon name="more-horizontal" size={22} />
            </button>
            {moreOpen ? (
              <div className="image-lightbox__menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void handleCopyLink()}>
                  <Icon name="copy" size={17} />
                  <span>{t('designFiles.copy')}</span>
                </button>
              </div>
            ) : null}
          </div>
          <a
            className="image-lightbox__round-action"
            href={projectFileDownloadUrl(projectId, activeFile.name)}
            download={activeFile.name}
            aria-label={t('designFiles.download')}
            title={t('designFiles.download')}
            onClick={() => {
              setMoreOpen(false);
              setNotice({
                message: t('imageViewer.downloadStarted'),
                role: 'status',
              });
            }}
          >
            <Icon name="download" size={22} />
          </a>
          <button
            type="button"
            className="image-lightbox__share-action"
            disabled={sharing}
            onClick={() => void handleShare()}
          >
            <Icon name={sharing ? 'spinner' : 'share'} size={19} />
            <span>{t('common.share')}</span>
          </button>
        </div>
      </header>

      <div
        className={`image-lightbox__stage${scale > 1 ? ' is-zoomed' : ''}`}
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
        <img
          key={`${activeFile.name}:${activeFile.mtime}`}
          src={`${projectRawUrl(projectId, activeFile.name)}?v=${Math.round(activeFile.mtime)}`}
          alt={activeFile.name}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
          data-testid="image-lightbox-image"
        />
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
        {onEdit ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(activeFile);
            }}
          >
            <span className="image-lightbox__tool-icon">
              <Icon name="edit" size={23} />
            </span>
            <span>{t('common.edit')}</span>
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="is-danger"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            <span className="image-lightbox__tool-icon">
              <Icon name={deleting ? 'spinner' : 'trash'} size={23} />
            </span>
            <span>{t('designFiles.delete')}</span>
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
    </div>
  );
}
