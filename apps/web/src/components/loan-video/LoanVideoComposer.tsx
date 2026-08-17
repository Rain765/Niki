import { useCallback, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
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
  type LoanVideoDraft,
  type LoanVideoStepDraft,
  type LoanVideoValidationError,
} from './types';

interface Props {
  onSubmit: (draft: LoanVideoDraft) => void;
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

export function LoanVideoComposer({ onSubmit, disabled = false }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<LoanVideoDraft>(initialDraft);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<LoanVideoValidationError[]>([]);
  const nextStepIdRef = useRef(INITIAL_STEP_COUNT + 1);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const completedScreenshotCount = draft.steps.filter((step) => step.screenshot).length
    + [draft.intro, draft.background, draft.outro].filter(Boolean).length;
  const totalAssetCount = draft.steps.length + 3;

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
            <h1>{t('loanVideo.title')}</h1>
            <p>{t('loanVideo.subtitle')}</p>
          </div>
          <span className="loan-video-composer__format">MP4 · HyperFrames</span>
        </header>

        <div className="loan-video-composer__settings">
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
    'tap-required': 'loanVideo.errorTap',
  };
  return t(keys[error]);
}
