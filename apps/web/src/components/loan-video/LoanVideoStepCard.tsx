import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { ScreenshotTapPicker } from './ScreenshotTapPicker';
import { LoanVideoTransitionPreview } from './LoanVideoTransitionPreview';
import type { LoanVideoStepDraft } from './types';

interface Props {
  step: LoanVideoStepDraft;
  nextStep: LoanVideoStepDraft | null;
  index: number;
  count: number;
  onChange: (update: Partial<LoanVideoStepDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function LoanVideoStepCard({
  step,
  nextStep,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const t = useT();
  const previewUrl = useObjectUrl(step.screenshot);
  const nextPreviewUrl = useObjectUrl(nextStep?.screenshot ?? null);
  const [screenshotAspectRatio, setScreenshotAspectRatio] = useState<number | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const hasNextStep = index < count - 1;
  const collectsTap = hasNextStep && step.advance === 'tap';

  const selectScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const screenshot = event.target.files?.[0] ?? null;
    setScreenshotAspectRatio(null);
    onChange({ screenshot, tap: null });
    event.target.value = '';
  };

  const openScreenshotPicker = () => {
    screenshotInputRef.current?.click();
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
        <div
          className="loan-video-screenshot"
          data-image-orientation={screenshotAspectRatio === null
            ? undefined
            : screenshotAspectRatio >= 1 ? 'landscape' : 'portrait'}
          style={screenshotAspectRatio === null
            ? undefined
            : ({
                '--loan-video-screenshot-aspect': String(screenshotAspectRatio),
              } as CSSProperties)}
        >
          <div className="loan-video-screenshot__media">
            {previewUrl ? (
              <ScreenshotTapPicker
                key={previewUrl}
                src={previewUrl}
                alt={step.screenshot?.name ?? t('loanVideo.screenshot')}
                testId={`loan-video-tap-picker-${index + 1}`}
                tap={collectsTap ? step.tap : null}
                interactive={collectsTap}
                onChange={(tap) => onChange({ tap })}
                onAspectRatioChange={setScreenshotAspectRatio}
              />
            ) : (
              <button
                type="button"
                className="loan-video-screenshot__empty"
                data-testid={`loan-video-upload-surface-${index + 1}`}
                onClick={openScreenshotPicker}
              >
                <Icon name="image" size={24} />
                <span>{t('loanVideo.screenshot')}</span>
                <small>{t('loanVideo.screenshotHint')}</small>
                <span className="loan-video-screenshot__upload-prompt">
                  <Icon name="upload" size={15} />
                  {t('loanVideo.uploadScreenshot')}
                </span>
              </button>
            )}
            {previewUrl ? (
              <button
                type="button"
                className="loan-video-screenshot__upload"
                data-testid={`loan-video-replace-screenshot-${index + 1}`}
                onClick={openScreenshotPicker}
              >
                <Icon name="upload" size={15} />
                {t('loanVideo.replaceScreenshot')}
              </button>
            ) : null}
          </div>
          <input
            ref={screenshotInputRef}
            hidden
            type="file"
            accept="image/*"
            data-testid={`loan-video-screenshot-${index + 1}`}
            onChange={selectScreenshot}
          />
          {previewUrl && collectsTap ? (
            <small className="loan-video-screenshot__tap-hint">
              {step.tap ? t('loanVideo.tapMarked') : t('loanVideo.tapHint')}
            </small>
          ) : null}
        </div>

        <div className="loan-video-step__fields">
          <label className="loan-video-field">
            <span>{t('loanVideo.stepText')}</span>
            <input
              data-testid={`loan-video-text-${index + 1}`}
              value={step.text}
              placeholder={t('loanVideo.stepTextPlaceholder')}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </label>
          <div className="loan-video-step__delivery">
            <label className="loan-video-step__toggle">
              <input
                type="checkbox"
                role="switch"
                data-testid={`loan-video-caption-enabled-${index + 1}`}
                checked={step.captionEnabled}
                onChange={(event) => onChange({ captionEnabled: event.target.checked })}
              />
              <span>{t('loanVideo.caption')}</span>
            </label>
            <label className="loan-video-step__toggle">
              <input
                type="checkbox"
                role="switch"
                data-testid={`loan-video-voiceover-enabled-${index + 1}`}
                checked={step.voiceoverEnabled}
                onChange={(event) => onChange({ voiceoverEnabled: event.target.checked })}
              />
              <span>{t('loanVideo.voiceover')}</span>
            </label>
          </div>
          {hasNextStep ? (
            <div
              className="loan-video-step__transition"
              data-testid={`loan-video-transition-${index + 1}`}
            >
              <strong>
                {t('loanVideo.transition', { from: index + 1, to: index + 2 })}
              </strong>
              <div
                className="loan-video-step__advance-options"
                role="group"
                aria-label={t('loanVideo.transition', { from: index + 1, to: index + 2 })}
              >
                <button
                  type="button"
                  className={step.advance === 'tap' ? 'is-active' : ''}
                  data-testid={`loan-video-advance-tap-${index + 1}`}
                  aria-pressed={step.advance === 'tap'}
                  onClick={() => onChange({ advance: 'tap' })}
                >
                  {t('loanVideo.advanceTap')}
                </button>
                <button
                  type="button"
                  className={step.advance === 'auto' ? 'is-active' : ''}
                  data-testid={`loan-video-advance-auto-${index + 1}`}
                  aria-pressed={step.advance === 'auto'}
                  onClick={() => onChange({ advance: 'auto', tap: null })}
                >
                  {t('loanVideo.advanceAuto')}
                </button>
              </div>
              <small>
                {step.advance === 'tap'
                  ? t('loanVideo.advanceTapHint')
                  : t('loanVideo.advanceAutoHint')}
              </small>
              <LoanVideoTransitionPreview
                key={`${step.id}:${nextStep?.id ?? 'end'}`}
                currentSrc={previewUrl}
                nextSrc={nextPreviewUrl}
                fromStep={index + 1}
                toStep={index + 2}
                advance={step.advance}
                tap={step.tap}
                caption={step.text}
                captionEnabled={step.captionEnabled}
                nextCaption={nextStep?.text ?? ''}
                nextCaptionEnabled={nextStep?.captionEnabled ?? false}
              />
            </div>
          ) : (
            <div
              className="loan-video-step__end"
              data-testid={`loan-video-end-${index + 1}`}
            >
              <span aria-hidden>✓</span>
              {t('loanVideo.end')}
            </div>
          )}
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
