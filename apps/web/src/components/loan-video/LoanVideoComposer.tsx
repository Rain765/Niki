import { useCallback, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { CustomSelect } from '../CustomSelect';
import { Icon } from '../Icon';
import { Toast } from '../Toast';
import { LoanVideoSelect } from './LoanVideoSelect';
import { LoanVideoUploadDrawer } from './LoanVideoUploadDrawer';
import {
  createLoanVideoStep,
  invalidateChangedLoanVideoTapTargets,
  loanVideoBrandLabel,
  loanVideoLanguageLabel,
  validateLoanVideoDraft,
} from './loan-video';
import {
  LOAN_VIDEO_ASPECT_RATIOS,
  LOAN_VIDEO_BRANDS,
  LOAN_VIDEO_DURATIONS,
  LOAN_VIDEO_LANGUAGES,
  LOAN_VIDEO_PURPOSES,
  loanVideoPresetKey,
  type LoanVideoDraft,
  type LoanVideoQuickOptions,
  type LoanVideoStepDraft,
  type LoanVideoValidationError,
} from './types';

interface Props {
  onSubmit: (draft: LoanVideoDraft) => void;
  onQuickGenerate?: (options: LoanVideoQuickOptions) => void;
  configuredPresetKeys?: readonly string[];
  disabled?: boolean;
}

const INITIAL_STEP_COUNT = 3;
const BRAND_OPTIONS = LOAN_VIDEO_BRANDS.map((brand) => ({
  label: loanVideoBrandLabel(brand),
  value: brand,
}));
const LANGUAGE_OPTIONS = LOAN_VIDEO_LANGUAGES.map((language) => ({
  label: loanVideoLanguageLabel(language),
  value: language,
}));
const ASPECT_RATIO_OPTIONS = LOAN_VIDEO_ASPECT_RATIOS.map((aspectRatio) => ({
  label: aspectRatio,
  value: aspectRatio,
}));
const DURATION_OPTIONS = LOAN_VIDEO_DURATIONS.map((duration) => ({
  label: `${duration}s`,
  value: String(duration),
}));

function initialDraft(): LoanVideoDraft {
  return {
    title: '',
    brand: 'zamloan',
    purpose: 'tutorial',
    language: 'en',
    aspectRatio: '9:16',
    durationSeconds: 30,
    intro: null,
    background: null,
    outro: null,
    steps: Array.from({ length: INITIAL_STEP_COUNT }, (_, index) => (
      createLoanVideoStep(`step-${index + 1}`)
    )),
  };
}

export function LoanVideoComposer({
  onSubmit,
  onQuickGenerate,
  configuredPresetKeys = [],
  disabled = false,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState<LoanVideoDraft>(initialDraft);
  const [mode, setMode] = useState<'quick' | 'editor'>('quick');
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<LoanVideoValidationError[]>([]);
  const purposeOptions = LOAN_VIDEO_PURPOSES.map((purpose) => ({
    label: t(`loanVideo.purpose.${purpose}`),
    value: purpose,
  }));
  const nextStepIdRef = useRef(INITIAL_STEP_COUNT + 1);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const completedScreenshotCount = draft.steps.filter((step) => step.screenshot).length
    + [draft.intro, draft.background, draft.outro].filter(Boolean).length;
  const totalAssetCount = draft.steps.length + 3;
  const presetConfigured = configuredPresetKeys.includes(
    loanVideoPresetKey(draft.brand, draft.purpose),
  );

  const updateStep = (stepId: string, update: Partial<LoanVideoStepDraft>) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (
        step.id === stepId ? { ...step, ...update } : step
      )),
    }));
  };

  const addStep = () => {
    const id = `step-${nextStepIdRef.current}`;
    nextStepIdRef.current += 1;
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, createLoanVideoStep(id)],
    }));
  };

  const removeStep = (stepId: string) => {
    setDraft((current) => {
      const steps = current.steps.filter((step) => step.id !== stepId);
      return {
        ...current,
        steps: invalidateChangedLoanVideoTapTargets(current.steps, steps),
      };
    });
  };

  const moveStep = (stepId: string, direction: -1 | 1) => {
    setDraft((current) => {
      const from = current.steps.findIndex((step) => step.id === stepId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.steps.length) return current;
      const steps = [...current.steps];
      const [step] = steps.splice(from, 1);
      if (!step) return current;
      steps.splice(to, 0, step);
      return {
        ...current,
        steps: invalidateChangedLoanVideoTapTargets(current.steps, steps),
      };
    });
  };

  const submit = () => {
    const errors = validateLoanVideoDraft(draft);
    setValidationErrors(errors);
    if (errors.includes('title-required')) {
      setUploadDrawerOpen(false);
      window.setTimeout(() => titleInputRef.current?.focus({ preventScroll: false }), 0);
      return;
    }
    if (errors.length > 0) {
      setUploadDrawerOpen(true);
      return;
    }
    if (disabled) return;
    setUploadDrawerOpen(false);
    onSubmit(draft);
    setMode('quick');
  };

  const closeUploadDrawer = useCallback(() => {
    setUploadDrawerOpen(false);
  }, []);

  return (
    <section className="home-hero loan-video-hero" data-testid="loan-video-composer">
      <div className="home-hero__backdrop" aria-hidden>
        <span className="home-hero__backdrop-grid" />
        <span className="home-hero__backdrop-scan" />
      </div>

      <div className="loan-video-composer">
        <header className="loan-video-composer__header">
          <div>
            <span className="loan-video-composer__eyebrow">{t('loanVideo.eyebrow')}</span>
            <h1>{mode === 'quick' ? t('loanVideo.quickTitle') : t('loanVideo.title')}</h1>
            <p>{mode === 'quick' ? t('loanVideo.quickSubtitle') : t('loanVideo.subtitle')}</p>
          </div>
          <button
            type="button"
            className="ghost loan-video-composer__mode"
            data-testid="loan-video-editor-mode"
            aria-pressed={mode === 'editor'}
            onClick={() => {
              setValidationErrors([]);
              setQuickNotice(null);
              setMode((current) => current === 'quick' ? 'editor' : 'quick');
            }}
          >
            <Icon name={mode === 'quick' ? 'edit' : 'arrow-left'} size={16} />
            {mode === 'quick' ? t('loanVideo.editorMode') : t('loanVideo.backToQuick')}
          </button>
        </header>

        {mode === 'quick' ? (
          <div
            className="poster-app__generator loan-video-quick"
            data-testid="loan-video-quick-mode"
          >
            <div className="poster-app__field">
              <span>{t('loanVideo.product')}</span>
              <CustomSelect
                ariaLabel={t('loanVideo.product')}
                className="poster-app__select"
                disabled={disabled}
                menuClassName="poster-app__select-menu"
                menuGap={8}
                menuMinWidth={224}
                menuPlacement="bottom"
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  brand: value as LoanVideoDraft['brand'],
                }))}
                options={BRAND_OPTIONS}
                testId="loan-video-quick-brand"
                triggerClassName="poster-app__select-trigger"
                value={draft.brand}
              />
            </div>

            <div className="poster-app__field">
              <span>{t('loanVideo.purpose')}</span>
              <CustomSelect
                ariaLabel={t('loanVideo.purpose')}
                className="poster-app__select"
                disabled={disabled}
                menuClassName="poster-app__select-menu"
                menuGap={8}
                menuMinWidth={240}
                menuPlacement="bottom"
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  purpose: value as LoanVideoDraft['purpose'],
                }))}
                options={purposeOptions}
                testId="loan-video-quick-purpose"
                triggerClassName="poster-app__select-trigger"
                value={draft.purpose}
              />
            </div>

            <div className="poster-app__field">
              <span>{t('loanVideo.aspectRatio')}</span>
              <CustomSelect
                ariaLabel={t('loanVideo.aspectRatio')}
                className="poster-app__select"
                disabled={disabled}
                menuClassName="poster-app__select-menu"
                menuGap={8}
                menuMinWidth={224}
                menuPlacement="bottom"
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  aspectRatio: value as LoanVideoDraft['aspectRatio'],
                }))}
                options={ASPECT_RATIO_OPTIONS}
                testId="loan-video-quick-aspect"
                triggerClassName="poster-app__select-trigger"
                value={draft.aspectRatio}
              />
            </div>

            <button
              type="button"
              className="poster-app__generate loan-video-quick__generate"
              data-testid="loan-video-quick-generate"
              disabled={disabled || !onQuickGenerate}
              onClick={() => {
                if (!presetConfigured) {
                  setQuickNotice(t('loanVideo.presetRequiredHint'));
                  setMode('editor');
                  return;
                }
                onQuickGenerate?.({
                  brand: draft.brand,
                  purpose: draft.purpose,
                  aspectRatio: draft.aspectRatio,
                });
              }}
            >
              <Icon name={disabled ? 'spinner' : 'play'} size={17} />
              {disabled ? t('loanVideo.generating') : t('loanVideo.quickGenerate')}
            </button>
          </div>
        ) : (
          <>
        <div className="loan-video-composer__settings" data-testid="loan-video-editor-settings">
          <label className="loan-video-field loan-video-field--wide">
            <span>{t('loanVideo.videoTitle')}</span>
            <input
              ref={titleInputRef}
              data-testid="loan-video-title"
              value={draft.title}
              aria-invalid={validationErrors.includes('title-required') || undefined}
              placeholder={t('loanVideo.videoTitlePlaceholder')}
              onChange={(event) => setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))}
            />
          </label>

          <LoanVideoSelect
            label={t('loanVideo.product')}
            testId="loan-video-brand"
            value={draft.brand}
            options={BRAND_OPTIONS}
            onChange={(value) => setDraft((current) => ({
                ...current,
                brand: value as LoanVideoDraft['brand'],
              }))}
          />

          <LoanVideoSelect
            label={t('loanVideo.purpose')}
            testId="loan-video-purpose"
            value={draft.purpose}
            options={purposeOptions}
            onChange={(value) => setDraft((current) => ({
                ...current,
                purpose: value as LoanVideoDraft['purpose'],
              }))}
          />

          <LoanVideoSelect
            label={t('loanVideo.language')}
            testId="loan-video-language"
            value={draft.language}
            options={LANGUAGE_OPTIONS}
            onChange={(value) => setDraft((current) => ({
                ...current,
                language: value as LoanVideoDraft['language'],
              }))}
          />

          <LoanVideoSelect
            label={t('loanVideo.aspectRatio')}
            testId="loan-video-aspect"
            value={draft.aspectRatio}
            options={ASPECT_RATIO_OPTIONS}
            onChange={(value) => setDraft((current) => ({
                ...current,
                aspectRatio: value as LoanVideoDraft['aspectRatio'],
              }))}
          />

          <LoanVideoSelect
            label={t('loanVideo.duration')}
            testId="loan-video-duration"
            value={String(draft.durationSeconds)}
            options={DURATION_OPTIONS}
            onChange={(value) => setDraft((current) => ({
                ...current,
                durationSeconds: Number(value) as LoanVideoDraft['durationSeconds'],
              }))}
          />
        </div>

        <section className="loan-video-steps" aria-labelledby="loan-video-steps-title">
          <div className="loan-video-steps__heading">
            <div>
              <h2 id="loan-video-steps-title">{t('loanVideo.steps')}</h2>
              <p>{t('loanVideo.stepsHint')}</p>
            </div>
            <button
              type="button"
              className="ghost loan-video-steps__manage"
              onClick={() => setUploadDrawerOpen(true)}
              data-testid="loan-video-manage-steps"
              aria-haspopup="dialog"
              aria-expanded={uploadDrawerOpen}
              aria-controls="loan-video-upload-drawer"
            >
              <Icon name="upload" size={16} />
              <span>{t('loanVideo.manageSteps')}</span>
              <span
                className="loan-video-steps__count"
                aria-label={`${completedScreenshotCount}/${totalAssetCount}`}
              >
                {completedScreenshotCount}/{totalAssetCount}
              </span>
            </button>
          </div>
        </section>

        {validationErrors.length > 0 && !uploadDrawerOpen ? (
          <div className="loan-video-errors" role="alert" data-testid="loan-video-errors">
            <strong>{t('loanVideo.fixBeforeGenerate')}</strong>
            <ul>
              {validationErrors.map((error) => (
                <li key={error}>{validationMessage(error, t)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <LoanVideoUploadDrawer
          disabled={disabled}
          open={uploadDrawerOpen}
          outputHint={t('loanVideo.outputHint', { n: draft.steps.length })}
          intro={draft.intro}
          background={draft.background}
          outro={draft.outro}
          steps={draft.steps}
          onAddStep={addStep}
          onChangeStep={updateStep}
          onClose={closeUploadDrawer}
          onChangeIntro={(intro) => setDraft((current) => ({ ...current, intro }))}
          onChangeBackground={(background) => setDraft((current) => ({ ...current, background }))}
          onChangeOutro={(outro) => setDraft((current) => ({ ...current, outro }))}
          onGenerate={submit}
          onMoveStep={moveStep}
          onRemoveStep={removeStep}
          validationMessages={validationErrors.map((error) => validationMessage(error, t))}
        />
          </>
        )}
        {quickNotice ? (
          <Toast
            message={quickNotice}
            onDismiss={() => setQuickNotice(null)}
            role="alert"
          />
        ) : null}
      </div>
    </section>
  );
}

function validationMessage(
  error: LoanVideoValidationError,
  t: ReturnType<typeof useT>,
): string {
  const keys: Record<LoanVideoValidationError, Parameters<typeof t>[0]> = {
    'title-required': 'loanVideo.errorTitle',
    'intro-required': 'loanVideo.errorIntro',
    'background-required': 'loanVideo.errorBackground',
    'outro-required': 'loanVideo.errorOutro',
    'step-required': 'loanVideo.errorStep',
    'text-required': 'loanVideo.errorText',
    'screenshot-required': 'loanVideo.errorScreenshot',
    'interaction-text-required': 'loanVideo.errorInteractionText',
    'interaction-target-required': 'loanVideo.errorInteractionTarget',
    'tap-required': 'loanVideo.errorTap',
  };
  return t(keys[error]);
}
