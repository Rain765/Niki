'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { NikiPasswordChangeResponse } from '@open-design/contracts';

export function PasswordChangeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const close = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setError('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 10 || newPassword.length > 128) {
      setError('新密码需为 10–128 个字符');
      return;
    }
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({})) as
        Partial<NikiPasswordChangeResponse> & { error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error || '修改密码失败');
      }
      close();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '修改密码失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="niki-account-manager" role="presentation" onMouseDown={close}>
      <section
        className="niki-account-manager__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="niki-password-change-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="niki-account-manager__eyebrow">账号安全</span>
            <h2 id="niki-password-change-title">修改密码</h2>
          </div>
          <button type="button" aria-label="关闭修改密码" onClick={close}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
        </header>
        <form className="niki-account-manager__form" onSubmit={submit}>
          <label>
            <span>当前密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            <span>再次输入新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? '正在保存…' : '保存新密码'}
          </button>
        </form>
        {error ? <div className="niki-account-manager__error">{error}</div> : null}
      </section>
    </div>
  );
}
