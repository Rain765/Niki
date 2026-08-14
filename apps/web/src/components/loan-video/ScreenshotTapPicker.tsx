import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';

import type { LoanVideoTapPoint } from './types';

interface Props {
  src: string;
  alt: string;
  testId: string;
  tap: LoanVideoTapPoint | null;
  interactive: boolean;
  onChange: (tap: LoanVideoTapPoint) => void;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

interface ImageSize {
  width: number;
  height: number;
}

interface ContainedImageBox extends ImageSize {
  left: number;
  top: number;
}

export function ScreenshotTapPicker({
  src,
  alt,
  testId,
  tap,
  interactive,
  onChange,
  onAspectRatioChange,
}: Props) {
  const pickerRef = useRef<HTMLButtonElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [contentBox, setContentBox] = useState<ContainedImageBox | null>(null);

  const measureContentBox = useCallback(() => {
    const picker = pickerRef.current;
    if (!picker || !imageSize) return;
    const rect = picker.getBoundingClientRect();
    const viewport = pickerViewport(picker, rect);
    setContentBox(containedImageBox(viewport.width, viewport.height, imageSize));
  }, [imageSize]);

  useEffect(() => {
    measureContentBox();
    const picker = pickerRef.current;
    if (!picker) return undefined;

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureContentBox);
    resizeObserver?.observe(picker);
    window.addEventListener('resize', measureContentBox);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureContentBox);
    };
  }, [measureContentBox]);

  const readImageSize = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;
    setImageSize({ width: naturalWidth, height: naturalHeight });
    onAspectRatioChange?.(naturalWidth / naturalHeight);
  };

  const setTap = (event: MouseEvent<HTMLButtonElement>) => {
    if (!interactive || !imageSize) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const viewport = pickerViewport(event.currentTarget, rect);
    const box = containedImageBox(viewport.width, viewport.height, imageSize);
    if (!box) return;
    const localX = event.clientX - viewport.left;
    const localY = event.clientY - viewport.top;
    if (
      localX < box.left
      || localX > box.left + box.width
      || localY < box.top
      || localY > box.top + box.height
    ) return;
    onChange({
      x: clampCoordinate((localX - box.left) / box.width),
      y: clampCoordinate((localY - box.top) / box.height),
    });
  };

  return (
    <button
      type="button"
      ref={pickerRef}
      className="loan-video-tap-picker"
      data-testid={testId}
      onClick={setTap}
      aria-label={alt}
      aria-disabled={!interactive}
      disabled={!interactive}
    >
      <img src={src} alt={alt} onLoad={readImageSize} />
      {tap && contentBox ? (
        <span
          className="loan-video-tap-picker__marker"
          style={{
            left: `${contentBox.left + tap.x * contentBox.width}px`,
            top: `${contentBox.top + tap.y * contentBox.height}px`,
          }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function pickerViewport(
  picker: HTMLButtonElement,
  rect: DOMRect,
): ContainedImageBox {
  const hasClientBox = picker.clientWidth > 0 && picker.clientHeight > 0;
  return {
    left: rect.left + (hasClientBox ? picker.clientLeft : 0),
    top: rect.top + (hasClientBox ? picker.clientTop : 0),
    width: hasClientBox ? picker.clientWidth : rect.width,
    height: hasClientBox ? picker.clientHeight : rect.height,
  };
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

function clampCoordinate(value: number): number {
  return Math.min(1, Math.max(0, value));
}
