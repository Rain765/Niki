import type { MouseEvent } from 'react';

import type { LoanVideoTapPoint } from './types';

interface Props {
  src: string;
  alt: string;
  testId: string;
  tap: LoanVideoTapPoint | null;
  onChange: (tap: LoanVideoTapPoint) => void;
}

export function ScreenshotTapPicker({
  src,
  alt,
  testId,
  tap,
  onChange,
}: Props) {
  const setTap = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    onChange({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  };

  return (
    <button
      type="button"
      className="loan-video-tap-picker"
      data-testid={testId}
      onClick={setTap}
      aria-label={alt}
    >
      <img src={src} alt={alt} />
      {tap ? (
        <span
          className="loan-video-tap-picker__marker"
          style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}
