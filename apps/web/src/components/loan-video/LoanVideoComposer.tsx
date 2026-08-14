import { useCallback, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { LoanVideoUploadDrawer } from './LoanVideoUploadDrawer';
import {
  createLoanVideoStep,
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

function initialDraft(): LoanVideoDraft {
  return {
    title: '',
    brand: 'zamloan',
    language: 'en',
    aspectRatio: '9:16',
    durationSeconds: 30,
    narration: true,
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
  const completedScreenshotCount = draft.steps.filter((step) => step.screenshot).length;

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
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== stepId),
    }));
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
      return { ...current, steps };
    });
  };

  const submit = () => {
    const errors = validateLoanVideoDraft(draft);
    setValidationErrors(errors);
    if (errors.some((error) => (
      error === 'step-required'
      || error === 'caption-required'
      || error === 'screenshot-required'
    ))) {
      setUploadDrawerOpen(true);
    }
    if (errors.length > 0 || disabled) return;
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
              data-testid="loan-video-title"
              value={draft.title}
              placeholder={t('loanVideo.videoTitlePlaceholder')}
              onChange={(event) => setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))}
            />
          </label>

          <label className="loan-video-field">
            <span>{t('loanVideo.product')}</span>
            <select
              data-testid="loan-video-brand"
              value={draft.brand}
              onChange={(event) => setDraft((current) => ({
                ...current,
                brand: event.target.value as LoanVideoDraft['brand'],
              }))}
            >
              {LOAN_VIDEO_BRANDS.map((brand) => (
                <option key={brand} value={brand}>{loanVideoBrandLabel(brand)}</option>
              ))}
            </select>
          </label>

          <label className="loan-video-field">
            <span>{t('loanVideo.language')}</span>
            <select
              data-testid="loan-video-language"
              value={draft.language}
              onChange={(event) => setDraft((current) => ({
                ...current,
                language: event.target.value as LoanVideoDraft['language'],
              }))}
            >
              {LOAN_VIDEO_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {loanVideoLanguageLabel(language)}
                </option>
              ))}
            </select>
          </label>

          <label className="loan-video-field">
            <span>{t('loanVideo.aspectRatio')}</span>
            <select
              data-testid="loan-video-aspect"
              value={draft.aspectRatio}
              onChange={(event) => setDraft((current) => ({
                ...current,
                aspectRatio: event.target.value as LoanVideoDraft['aspectRatio'],
              }))}
            >
              {LOAN_VIDEO_ASPECT_RATIOS.map((aspectRatio) => (
                <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
              ))}
            </select>
          </label>

          <label className="loan-video-field">
            <span>{t('loanVideo.duration')}</span>
            <select
              data-testid="loan-video-duration"
              value={draft.durationSeconds}
              onChange={(event) => setDraft((current) => ({
                ...current,
                durationSeconds: Number(event.target.value) as LoanVideoDraft['durationSeconds'],
              }))}
            >
              {LOAN_VIDEO_DURATIONS.map((duration) => (
                <option key={duration} value={duration}>{duration}s</option>
              ))}
            </select>
          </label>
        </div>

        <label className="loan-video-narration">
          <input
            data-testid="loan-video-narration"
            type="checkbox"
            checked={draft.narration}
            onChange={(event) => setDraft((current) => ({
              ...current,
              narration: event.target.checked,
            }))}
          />
          <span>
            <strong>{t('loanVideo.narration')}</strong>
            <small>{t('loanVideo.narrationHint')}</small>
          </span>
        </label>

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
                aria-label={`${completedScreenshotCount}/${draft.steps.length}`}
              >
                {completedScreenshotCount}/{draft.steps.length}
              </span>
            </button>
          </div>
        </section>

        {validationErrors.length > 0 ? (
          <div className="loan-video-errors" role="alert" data-testid="loan-video-errors">
            <strong>{t('loanVideo.fixBeforeGenerate')}</strong>
            <ul>
              {validationErrors.map((error) => (
                <li key={error}>{validationMessage(error, t)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="loan-video-composer__footer">
          <span>{t('loanVideo.outputHint', { n: draft.steps.length })}</span>
          <button
            type="button"
            className="primary loan-video-generate"
            data-testid="loan-video-generate"
            disabled={disabled}
            onClick={submit}
          >
            <Icon name="play" size={16} />
            {t('loanVideo.generate')}
          </button>
        </footer>

        <LoanVideoUploadDrawer
          open={uploadDrawerOpen}
          steps={draft.steps}
          narration={draft.narration}
          onAddStep={addStep}
          onChangeStep={updateStep}
          onClose={closeUploadDrawer}
          onMoveStep={moveStep}
          onRemoveStep={removeStep}
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
    'step-required': 'loanVideo.errorStep',
    'caption-required': 'loanVideo.errorCaption',
    'screenshot-required': 'loanVideo.errorScreenshot',
  };
  return t(keys[error]);
}
