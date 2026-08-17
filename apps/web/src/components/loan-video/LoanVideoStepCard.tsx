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
  outro: File | null;
  onChange: (update: Partial<LoanVideoStepDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function LoanVideoStepCard({
  step,
  nextStep,
  index,
  count,
  outro,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const t = useT();
  const previewUrl = useObjectUrl(step.screenshot);
  const nextPreviewUrl = useObjectUrl(nextStep?.screenshot ?? outro);
  const [screenshotAspectRatio, setScreenshotAspectRatio] = useState<number | null>(null);
  const [targetMode, setTargetMode] = useState<'advance' | 'interaction'>('advance');
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const collectsAdvanceTap = step.advance !== 'auto';
  const collectsInteractionTap = step.interaction !== 'none';
  const effectiveTargetMode = targetMode === 'interaction' && collectsInteractionTap
    ? 'interaction'
    : 'advance';
  const collectsTap = effectiveTargetMode === 'interaction'
    ? collectsInteractionTap
    : collectsAdvanceTap;
  const selectedTap = effectiveTargetMode === 'interaction' ? step.interactionTap : step.tap;

  const selectScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const screenshot = event.target.files?.[0] ?? null;
    setScreenshotAspectRatio(null);
    onChange({ screenshot, tap: null, interactionTap: null });
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
                tap={collectsTap ? selectedTap : null}
                interactive={collectsTap}
                onChange={(tap) => onChange(effectiveTargetMode === 'interaction'
                  ? { interactionTap: tap }
                  : { tap })}
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
          {previewUrl && (collectsAdvanceTap || collectsInteractionTap) ? (
            <div className="loan-video-screenshot__target-tools">
              {collectsInteractionTap ? (
                <button
                  type="button"
                  className={effectiveTargetMode === 'interaction' ? 'is-active' : ''}
                  onClick={() => setTargetMode('interaction')}
                >
                  {t('loanVideo.markInteraction')}
                </button>
              ) : null}
              {collectsAdvanceTap ? (
                <button
                  type="button"
                  className={effectiveTargetMode === 'advance' ? 'is-active' : ''}
                  onClick={() => setTargetMode('advance')}
                >
                  {t('loanVideo.markAdvance')}
                </button>
              ) : null}
              <small className="loan-video-screenshot__tap-hint">
                {selectedTap ? t('loanVideo.tapMarked') : t('loanVideo.tapHint')}
              </small>
            </div>
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
          <div className="loan-video-step__interaction">
            <strong>{t('loanVideo.interaction')}</strong>
            <div
              className="loan-video-step__advance-options"
              role="group"
              aria-label={t('loanVideo.interaction')}
            >
              <button
                type="button"
                className={step.interaction === 'none' ? 'is-active' : ''}
                onClick={() => onChange({
                  interaction: 'none',
                  interactionText: '',
                  interactionTap: null,
                })}
              >
                {t('loanVideo.interactionNone')}
              </button>
              <button
                type="button"
                className={step.interaction === 'type' ? 'is-active' : ''}
                onClick={() => {
                  setTargetMode('interaction');
                  onChange({ interaction: 'type' });
                }}
              >
                {t('loanVideo.interactionType')}
              </button>
              <button
                type="button"
                className={step.interaction === 'otp' ? 'is-active' : ''}
                onClick={() => {
                  setTargetMode('interaction');
                  onChange({ interaction: 'otp' });
                }}
              >
                {t('loanVideo.interactionOtp')}
              </button>
            </div>
            {step.interaction !== 'none' ? (
              <label className="loan-video-field">
                <span>{t('loanVideo.interactionText')}</span>
                <input
                  value={step.interactionText}
                  inputMode={step.interaction === 'otp' ? 'numeric' : 'text'}
                  placeholder={step.interaction === 'otp' ? '2479' : '971 234 567'}
                  onChange={(event) => onChange({ interactionText: event.target.value })}
                />
              </label>
            ) : null}
            <small>{step.interaction === 'otp'
              ? t('loanVideo.interactionOtpHint')
              : step.interaction === 'type'
                ? t('loanVideo.interactionTypeHint')
                : t('loanVideo.interactionNoneHint')}</small>
          </div>
          <div
            className="loan-video-step__transition"
            data-testid={`loan-video-transition-${index + 1}`}
          >
            <strong>{nextStep
              ? t('loanVideo.transition', { from: index + 1, to: index + 2 })
              : t('loanVideo.transitionOutro', { from: index + 1 })}</strong>
            <div
              className="loan-video-step__advance-options"
              role="group"
              aria-label={nextStep
                ? t('loanVideo.transition', { from: index + 1, to: index + 2 })
                : t('loanVideo.transitionOutro', { from: index + 1 })}
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
                className={step.advance === 'open-modal' ? 'is-active' : ''}
                aria-pressed={step.advance === 'open-modal'}
                onClick={() => onChange({ advance: 'open-modal' })}
              >
                {t('loanVideo.advanceOpenModal')}
              </button>
              <button
                type="button"
                className={step.advance === 'close-modal' ? 'is-active' : ''}
                aria-pressed={step.advance === 'close-modal'}
                onClick={() => onChange({ advance: 'close-modal' })}
              >
                {t('loanVideo.advanceCloseModal')}
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
              {step.advance === 'auto'
                ? t('loanVideo.advanceAutoHint')
                : step.advance === 'open-modal'
                  ? t('loanVideo.advanceOpenModalHint')
                  : step.advance === 'close-modal'
                    ? t('loanVideo.advanceCloseModalHint')
                    : t('loanVideo.advanceTapHint')}
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
