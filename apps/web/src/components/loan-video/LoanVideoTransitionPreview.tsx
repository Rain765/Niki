import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type {
  LoanVideoAdvanceType,
  LoanVideoTapPoint,
} from './types';

interface Props {
  currentSrc: string | null;
  nextSrc: string | null;
  fromStep: number;
  toStep: number;
  advance: LoanVideoAdvanceType;
  tap: LoanVideoTapPoint | null;
  caption: string;
  captionEnabled: boolean;
  nextCaption?: string;
  nextCaptionEnabled?: boolean;
}

interface ImageSize {
  width: number;
  height: number;
}

interface ContainedImageBox extends ImageSize {
  left: number;
  top: number;
}

export function LoanVideoTransitionPreview({
  currentSrc,
  nextSrc,
  fromStep,
  toStep,
  advance,
  tap,
  caption,
  captionEnabled,
  nextCaption = '',
  nextCaptionEnabled = false,
}: Props) {
  const t = useT();
  const panelId = useId();
  const [opened, setOpened] = useState(false);
  const [replay, setReplay] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const ready = Boolean(currentSrc && nextSrc);

  const showPreview = () => {
    if (!ready) return;
    setOpened(true);
    setReplay((current) => current + 1);
  };

  const availableLabel = opened
    ? t('loanVideo.replayTransition')
    : t('loanVideo.previewTransition');
  const buttonLabel = ready
    ? availableLabel
    : t('loanVideo.previewUnavailable');

  return (
    <div className="loan-video-transition-preview">
      <button
        type="button"
        className="loan-video-transition-preview__toggle"
        data-testid={`loan-video-transition-preview-${fromStep}`}
        disabled={!ready}
        aria-label={buttonLabel}
        aria-expanded={opened}
        aria-controls={ready ? panelId : undefined}
        title={ready ? undefined : buttonLabel}
        onClick={showPreview}
      >
        <Icon name={opened ? 'refresh' : 'play'} size={13} />
        {availableLabel}
      </button>

      {currentSrc && nextSrc ? (
        <div
          id={panelId}
          className={`accordion-collapsible loan-video-transition-preview__collapsible${opened ? ' open' : ''}`}
          data-testid={`loan-video-transition-preview-panel-${fromStep}`}
          aria-hidden={!opened}
        >
          <div className="accordion-collapsible-inner">
            <TransitionStage
              key={replay}
              currentSrc={currentSrc}
              nextSrc={nextSrc}
              fromStep={fromStep}
              toStep={toStep}
              advance={advance}
              tap={tap}
              caption={caption}
              captionEnabled={captionEnabled}
              nextCaption={nextCaption}
              nextCaptionEnabled={nextCaptionEnabled}
              playing={opened}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TransitionStage({
  currentSrc,
  nextSrc,
  fromStep,
  toStep,
  advance,
  tap,
  caption,
  captionEnabled,
  nextCaption,
  nextCaptionEnabled,
  playing,
  reducedMotion,
}: {
  currentSrc: string;
  nextSrc: string;
  fromStep: number;
  toStep: number;
  advance: LoanVideoAdvanceType;
  tap: LoanVideoTapPoint | null;
  caption: string;
  captionEnabled: boolean;
  nextCaption: string;
  nextCaptionEnabled: boolean;
  playing: boolean;
  reducedMotion: boolean;
}) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [contentBox, setContentBox] = useState<ContainedImageBox | null>(null);

  const measureContentBox = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !imageSize) return;
    const rect = stage.getBoundingClientRect();
    const width = stage.clientWidth > 0 ? stage.clientWidth : rect.width;
    const height = stage.clientHeight > 0 ? stage.clientHeight : rect.height;
    setContentBox(containedImageBox(width, height, imageSize));
  }, [imageSize]);

  useEffect(() => {
    measureContentBox();
    const stage = stageRef.current;
    if (!stage) return undefined;
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureContentBox);
    observer?.observe(stage);
    window.addEventListener('resize', measureContentBox);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureContentBox);
    };
  }, [measureContentBox]);

  const readCurrentImageSize = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;
    setImageSize({ width: naturalWidth, height: naturalHeight });
  };

  const tapPosition = advance !== 'auto' && tap && contentBox
    ? {
        left: contentBox.left + tap.x * contentBox.width,
        top: contentBox.top + tap.y * contentBox.height,
      }
    : null;
  const currentStyle = tapPosition
    ? ({ transformOrigin: `${tapPosition.left}px ${tapPosition.top}px` } satisfies CSSProperties)
    : undefined;
  const stageClassName = [
    'loan-video-transition-preview__stage',
    playing && !reducedMotion ? 'is-animating' : '',
    reducedMotion ? 'is-reduced-motion' : '',
    advance !== 'auto' ? 'is-tap' : 'is-auto',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={stageRef}
      className={stageClassName}
      data-testid={`loan-video-transition-preview-stage-${fromStep}`}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      role="group"
      aria-label={t('loanVideo.previewAria', { from: fromStep, to: toStep })}
    >
      <img
        className="loan-video-transition-preview__background is-current"
        src={currentSrc}
        alt=""
      />
      <img
        className="loan-video-transition-preview__background is-next"
        src={nextSrc}
        alt=""
      />
      <span className="loan-video-transition-preview__shade" aria-hidden />

      <div
        className="loan-video-transition-preview__canvas is-current"
        data-testid={`loan-video-transition-preview-current-${fromStep}`}
        style={currentStyle}
      >
        <img
          src={currentSrc}
          alt={t('loanVideo.stepCanvas', { n: fromStep })}
          onLoad={readCurrentImageSize}
        />
      </div>
      <div className="loan-video-transition-preview__canvas is-next">
        <img src={nextSrc} alt={t('loanVideo.stepCanvas', { n: toStep })} />
      </div>

      {tapPosition ? (
        <span
          className="loan-video-transition-preview__tap"
          data-testid={`loan-video-transition-preview-tap-${fromStep}`}
          style={{ left: tapPosition.left, top: tapPosition.top }}
          aria-hidden
        />
      ) : null}

      {captionEnabled && caption.trim() ? (
        <p className="loan-video-transition-preview__caption is-current">
          {caption.trim()}
        </p>
      ) : null}
      {nextCaptionEnabled && nextCaption.trim() ? (
        <p className="loan-video-transition-preview__caption is-next">
          {nextCaption.trim()}
        </p>
      ) : null}
    </div>
  );
}

function containedImageBox(
  containerWidth: number,
  containerHeight: number,
  imageSize: ImageSize,
): ContainedImageBox | null {
  if (
    containerWidth <= 0
    || containerHeight <= 0
    || imageSize.width <= 0
    || imageSize.height <= 0
  ) return null;

  const scale = Math.min(
    containerWidth / imageSize.width,
    containerHeight / imageSize.height,
  );
  const width = imageSize.width * scale;
  const height = imageSize.height * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reducedMotion;
}
