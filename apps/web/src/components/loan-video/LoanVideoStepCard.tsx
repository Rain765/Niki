import { useEffect, useState, type ChangeEvent } from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { ScreenshotTapPicker } from './ScreenshotTapPicker';
import type { LoanVideoStepDraft } from './types';

interface Props {
  step: LoanVideoStepDraft;
  index: number;
  count: number;
  narration: boolean;
  onChange: (update: Partial<LoanVideoStepDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function LoanVideoStepCard({
  step,
  index,
  count,
  narration,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const t = useT();
  const previewUrl = useObjectUrl(step.screenshot);

  const selectScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const screenshot = event.target.files?.[0] ?? null;
    onChange({ screenshot, tap: null });
    event.target.value = '';
  };

  return (
    <article className="loan-video-step" data-testid={`loan-video-step-${index + 1}`}>
      <div className="loan-video-step__toolbar">
        <span className="loan-video-step__number">{index + 1}</span>
        <strong>{t('loanVideo.step', { n: index + 1 })}</strong>
        <div className="loan-video-step__actions">
          <button
            type="button"
            className="icon-btn"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={t('loanVideo.moveUp')}
          >
            <Icon name="arrow-up" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={t('loanVideo.moveDown')}
          >
            <Icon name="chevron-down" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRemove}
            aria-label={t('common.delete')}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div className="loan-video-step__body">
        <div className="loan-video-screenshot">
          {previewUrl ? (
            <ScreenshotTapPicker
              src={previewUrl}
              alt={step.screenshot?.name ?? t('loanVideo.screenshot')}
              testId={`loan-video-tap-picker-${index + 1}`}
              tap={step.tap}
              onChange={(tap) => onChange({ tap })}
            />
          ) : (
            <div className="loan-video-screenshot__empty">
              <Icon name="image" size={24} />
              <span>{t('loanVideo.screenshot')}</span>
              <small>{t('loanVideo.screenshotHint')}</small>
            </div>
          )}
          <label className="loan-video-screenshot__upload">
            <input
              type="file"
              accept="image/*"
              data-testid={`loan-video-screenshot-${index + 1}`}
              onChange={selectScreenshot}
            />
            <Icon name="upload" size={15} />
            {previewUrl ? t('loanVideo.replaceScreenshot') : t('loanVideo.uploadScreenshot')}
          </label>
          {previewUrl ? (
            <small className="loan-video-screenshot__tap-hint">
              {step.tap ? t('loanVideo.tapMarked') : t('loanVideo.tapHint')}
            </small>
          ) : null}
        </div>

        <div className="loan-video-step__fields">
          <label className="loan-video-field">
            <span>{t('loanVideo.caption')}</span>
            <input
              data-testid={`loan-video-caption-${index + 1}`}
              value={step.caption}
              placeholder={t('loanVideo.captionPlaceholder')}
              onChange={(event) => onChange({ caption: event.target.value })}
            />
          </label>
          {narration ? (
            <label className="loan-video-field">
              <span>{t('loanVideo.voiceover')}</span>
              <textarea
                data-testid={`loan-video-voiceover-${index + 1}`}
                value={step.voiceover}
                placeholder={t('loanVideo.voiceoverPlaceholder')}
                onChange={(event) => onChange({ voiceover: event.target.value })}
              />
            </label>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}
