'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  NikiPasswordAccount,
  NikiPasswordAccountCreateResponse,
  NikiPasswordAccountListResponse,
  NikiPasswordAccountPasswordUpdateResponse,
} from '@open-design/contracts';

function passwordValidationError(password: string, confirmation: string): string {
  if (password.length < 4 || password.length > 128) {
    return '密码需为 4–128 个字符';
  }
  if (password !== confirmation) return '两次输入的密码不一致';
  return '';
}

export function PasswordAccountManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<NikiPasswordAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPasswordId, setUpdatingPasswordId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [editingPasswordId, setEditingPasswordId] = useState('');
  const [replacementPassword, setReplacementPassword] = useState('');
  const [confirmReplacementPassword, setConfirmReplacementPassword] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/password-users', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('无法读取账号列表');
      const body = await response.json() as NikiPasswordAccountListResponse;
      setAccounts(body.accounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取账号列表');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadAccounts();
  }, [loadAccounts, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = passwordValidationError(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      setNotice('');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/password-users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password }),
      });
      const body = await response.json().catch(() => ({})) as
        Partial<NikiPasswordAccountCreateResponse> & { error?: string };
      if (!response.ok || !body.account) {
        throw new Error(body.error || '创建账号失败');
      }
      setAccounts((current) => [body.account as NikiPasswordAccount, ...current]);
      setUsername('');
      setName('');
      setPassword('');
      setConfirmPassword('');
      setNotice(`${body.account.username} 已创建`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建账号失败');
    } finally {
      setSubmitting(false);
    }
  };

  const startPasswordUpdate = (account: NikiPasswordAccount) => {
    setEditingPasswordId(account.user.id);
    setReplacementPassword('');
    setConfirmReplacementPassword('');
    setError('');
    setNotice('');
  };

  const cancelPasswordUpdate = () => {
    setEditingPasswordId('');
    setReplacementPassword('');
    setConfirmReplacementPassword('');
  };

  const updateAccountPassword = async (
    event: FormEvent,
    account: NikiPasswordAccount,
  ) => {
    event.preventDefault();
    const validationError = passwordValidationError(
      replacementPassword,
      confirmReplacementPassword,
    );
    if (validationError) {
      setError(validationError);
      setNotice('');
      return;
    }
    setUpdatingPasswordId(account.user.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/auth/password-users/${encodeURIComponent(account.user.id)}/password`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: replacementPassword }),
        },
      );
      const body = await response.json().catch(() => ({})) as
        Partial<NikiPasswordAccountPasswordUpdateResponse> & { error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '更新密码失败');
      setNotice(`${account.username} 的密码已更新`);
      cancelPasswordUpdate();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新密码失败');
    } finally {
      setUpdatingPasswordId('');
    }
  };

  const disableAccount = async (account: NikiPasswordAccount) => {
    if (!window.confirm(`确定停用账号“${account.username}”吗？该账号会立即退出登录。`)) {
      return;
    }
    setError('');
    setNotice('');
    const response = await fetch(
      `/api/auth/password-users/${encodeURIComponent(account.user.id)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setError(body.error || '停用账号失败');
      return;
    }
    setAccounts((current) => current.map((item) => (
      item.user.id === account.user.id ? { ...item, isActive: false } : item
    )));
  };

  return (
    <div className="niki-account-manager" role="presentation" onMouseDown={onClose}>
      <section
        className="niki-account-manager__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="niki-account-manager-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="niki-account-manager__eyebrow">管理员</span>
            <h2 id="niki-account-manager-title">账号管理</h2>
          </div>
          <button type="button" aria-label="关闭账号管理" onClick={onClose}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
        </header>

        <form className="niki-account-manager__form" onSubmit={createAccount}>
          <label>
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例如 friend.one"
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="用户在 Niki 中看到的名称"
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>初始密码</span>
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 4 个字符"
              autoComplete="new-password"
              minLength={4}
              maxLength={128}
              spellCheck={false}
              required
            />
          </label>
          <label>
            <span>再次输入密码</span>
            <input
              type="text"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入相同密码"
              autoComplete="new-password"
              minLength={4}
              maxLength={128}
              spellCheck={false}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? '正在创建…' : '创建账号'}
          </button>
        </form>

        {error ? <div className="niki-account-manager__error">{error}</div> : null}
        {notice ? <div className="niki-account-manager__notice">{notice}</div> : null}

        <div className="niki-account-manager__list">
          <div className="niki-account-manager__list-head">
            <span>账号</span>
            <span>{accounts.length} 个</span>
          </div>
          {loading ? (
            <div className="niki-account-manager__empty">正在加载…</div>
          ) : accounts.length === 0 ? (
            <div className="niki-account-manager__empty">尚未创建账号密码用户</div>
          ) : accounts.map((account) => (
            <article className="niki-account-manager__account" key={account.user.id}>
              <div className="niki-account-manager__row">
                <div>
                  <strong>{account.user.name}</strong>
                  <span>@{account.username}</span>
                </div>
                <span className={account.isActive ? 'is-active' : 'is-disabled'}>
                  {account.isActive ? '可登录' : '已停用'}
                </span>
                <button
                  type="button"
                  className="is-secondary"
                  aria-label={`修改 ${account.username} 的密码`}
                  onClick={() => startPasswordUpdate(account)}
                >
                  修改密码
                </button>
                {account.isActive ? (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => void disableAccount(account)}
                  >
                    停用
                  </button>
                ) : null}
              </div>
              {editingPasswordId === account.user.id ? (
                <form
                  className="niki-account-manager__password-reset"
                  onSubmit={(event) => void updateAccountPassword(event, account)}
                >
                  <label>
                    <span>新密码</span>
                    <input
                      type="text"
                      value={replacementPassword}
                      onChange={(event) => setReplacementPassword(event.target.value)}
                      minLength={4}
                      maxLength={128}
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <label>
                    <span>再次输入新密码</span>
                    <input
                      type="text"
                      value={confirmReplacementPassword}
                      onChange={(event) => setConfirmReplacementPassword(event.target.value)}
                      minLength={4}
                      maxLength={128}
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <div>
                    <button type="button" onClick={cancelPasswordUpdate}>取消</button>
                    <button
                      type="submit"
                      disabled={updatingPasswordId === account.user.id}
                    >
                      {updatingPasswordId === account.user.id ? '正在保存…' : '保存密码'}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
