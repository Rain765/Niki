// Canonical transient feedback surface. Success and informational messages
// dismiss on a short timer; errors, in-progress work, and manual-copy content
// remain until the caller clears or dismisses them.

import { useEffect } from 'react';
import { Icon } from './Icon';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastProps {
  message: string;
  details?: string | null;
  // Optional code/preformatted body. When present the toast pins
  // itself open (no auto-dismiss) so the user has time to manually
  // copy the content. Used for the clipboard-failure recovery path
  // in Continue in CLI: when copyToClipboard returns false the
  // prepared prompt is rendered here so the user can select-and-copy
  // it manually.
  code?: string | null;
  ttlMs?: number;
  onDismiss?: () => void;
  tone?: ToastTone;
  persistent?: boolean;
  dismissible?: boolean;
  dismissLabel?: string;
  testId?: string;
  /** ARIA role. Use "alert" for error messages (announced immediately),
   *  "status" (default) for non-urgent confirmations. */
  role?: 'status' | 'alert';
}

const DEFAULT_TTL: Record<ToastTone, number> = {
  info: 4_000,
  success: 3_000,
  error: 0,
};

export function Toast({
  message,
  details,
  code,
  ttlMs,
  onDismiss,
  tone = 'info',
  persistent = false,
  dismissible = false,
  dismissLabel = 'Dismiss',
  testId,
  role = tone === 'error' ? 'alert' : 'status',
}: ToastProps) {
  // When code is present the toast is a manual-action surface; never
  // auto-dismiss it out from under the user mid-copy.
  const effectiveTtl = code || persistent ? 0 : (ttlMs ?? DEFAULT_TTL[tone]);
  const showDismiss = Boolean(onDismiss) && (dismissible || Boolean(code));

  useEffect(() => {
    if (!onDismiss || !Number.isFinite(effectiveTtl) || effectiveTtl <= 0) return;
    const id = window.setTimeout(() => {
      onDismiss();
    }, effectiveTtl);
    return () => window.clearTimeout(id);
  }, [message, details, code, effectiveTtl, onDismiss]);

  return (
    <div
      className={`od-toast od-toast--${tone}${persistent ? ' is-persistent' : ''}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-testid={testId}
    >
      <div className="od-toast-content">
        <div className="od-toast-message">{message}</div>
        {details ? <div className="od-toast-details">{details}</div> : null}
        {code ? (
          <pre className="od-toast-code">{code}</pre>
        ) : null}
      </div>
      {showDismiss ? (
        <button
          type="button"
          className="od-toast-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
