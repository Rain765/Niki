import {
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { LoanVideoStepCard } from './LoanVideoStepCard';
import type { LoanVideoStepDraft } from './types';

interface Props {
  disabled: boolean;
  open: boolean;
  outputHint: string;
  steps: LoanVideoStepDraft[];
  onAddStep: () => void;
  onChangeStep: (stepId: string, update: Partial<LoanVideoStepDraft>) => void;
  onClose: () => void;
  onGenerate: () => void;
  onMoveStep: (stepId: string, direction: -1 | 1) => void;
  onRemoveStep: (stepId: string) => void;
  validationMessages: string[];
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function LoanVideoUploadDrawer({
  disabled,
  open,
  outputHint,
  steps,
  onAddStep,
  onChangeStep,
  onClose,
  onGenerate,
  onMoveStep,
  onRemoveStep,
  validationMessages,
}: Props) {
  const t = useT();
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    drawerRef.current?.toggleAttribute('inert', !open);
  }, [open]);

  useDrawerInteraction({
    open,
    drawerRef,
    closeButtonRef,
    returnFocusRef,
    onClose,
  });

  return (
    <div
      className={`loan-video-drawer-root${open ? ' is-open' : ''}`}
      data-testid="loan-video-upload-drawer-root"
    >
      <div
        className="loan-video-drawer__backdrop"
        data-testid="loan-video-upload-drawer-backdrop"
        aria-hidden="true"
        onPointerDown={onClose}
      />
      <aside
        id="loan-video-upload-drawer"
        ref={drawerRef}
        className="loan-video-drawer"
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
        aria-labelledby="loan-video-upload-drawer-title"
        tabIndex={-1}
        data-testid="loan-video-upload-drawer"
      >
        <header className="loan-video-drawer__header">
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-btn loan-video-drawer__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={18} />
          </button>
          <div className="loan-video-drawer__title">
            <h2 id="loan-video-upload-drawer-title">{t('loanVideo.steps')}</h2>
            <p>{t('loanVideo.stepsHint')}</p>
          </div>
          <button
            type="button"
            className="ghost loan-video-drawer__add"
            onClick={onAddStep}
            data-testid="loan-video-add-step"
          >
            <Icon name="plus" size={16} />
            {t('loanVideo.addStep')}
          </button>
        </header>

        <div className="loan-video-drawer__body">
          <div className="loan-video-steps__list loan-video-drawer__steps">
            {steps.map((step, index) => (
              <LoanVideoStepCard
                key={step.id}
                step={step}
                nextStep={steps[index + 1] ?? null}
                index={index}
                count={steps.length}
                onChange={(update) => onChangeStep(step.id, update)}
                onRemove={() => onRemoveStep(step.id)}
                onMove={(direction) => onMoveStep(step.id, direction)}
              />
            ))}
          </div>
        </div>

        <footer className="loan-video-drawer__footer">
          {open && validationMessages.length > 0 ? (
            <div className="loan-video-errors" role="alert" data-testid="loan-video-errors">
              <strong>{t('loanVideo.fixBeforeGenerate')}</strong>
              <ul>
                {validationMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="loan-video-drawer__footer-actions">
            <span>{outputHint}</span>
            <button
              type="button"
              className="primary loan-video-generate"
              data-testid="loan-video-generate"
              disabled={disabled}
              onClick={onGenerate}
            >
              <Icon name="play" size={16} />
              {t('loanVideo.generate')}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function useDrawerInteraction({
  open,
  drawerRef,
  closeButtonRef,
  returnFocusRef,
  onClose,
}: {
  open: boolean;
  drawerRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  returnFocusRef: MutableRefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    };
  }, [closeButtonRef, drawerRef, onClose, open, returnFocusRef]);
}
