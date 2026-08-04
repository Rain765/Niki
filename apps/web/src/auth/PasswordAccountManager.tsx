'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  NikiManagedUser,
  NikiManagedUserListResponse,
  NikiPasswordAccountCreateResponse,
  NikiPasswordAccountPasswordUpdateResponse,
} from '@open-design/contracts';

function passwordValidationError(password: string, confirmation: string): string {
  if (password.length < 4 || password.length > 128) {
    return '密码需为 4–128 个字符';
  }
  if (password !== confirmation) return '两次输入的密码不一致';
  return '';
}

function accountIdentityLabel(account: NikiManagedUser): string {
  const labels = account.providers.map((provider) => {
    if (provider === 'password') return account.username ? `@${account.username}` : '密码账号';
    if (provider === 'wechat') return '微信';
    return '飞书';
  });
  return labels.join(' · ') || account.provider;
}

export function PasswordAccountManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<NikiManagedUser[]>([]);
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
  const [editingQuotaId, setEditingQuotaId] = useState('');
  const [quotaStorageGb, setQuotaStorageGb] = useState('5');
  const [quotaDailyGenerations, setQuotaDailyGenerations] = useState('30');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/users', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('无法读取账号列表');
      const body = await response.json() as NikiManagedUserListResponse;
      setAccounts(body.users);
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
      setUsername('');
      setName('');
      setPassword('');
      setConfirmPassword('');
      await loadAccounts();
      setNotice(`${body.account.username} 已创建`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建账号失败');
    } finally {
      setSubmitting(false);
    }
  };

  const startPasswordUpdate = (account: NikiManagedUser) => {
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
    account: NikiManagedUser,
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
      setNotice(`${account.username ?? account.user.name} 的密码已更新`);
      cancelPasswordUpdate();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新密码失败');
    } finally {
      setUpdatingPasswordId('');
    }
  };

  const disableAccount = async (account: NikiManagedUser) => {
    if (!window.confirm(`确定停用账号“${account.username ?? account.user.name}”吗？该账号会立即退出登录。`)) {
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

  const startQuotaUpdate = (account: NikiManagedUser) => {
    setEditingQuotaId(account.user.id);
    setQuotaStorageGb(String(
      Math.round((account.quota.storageBytes / 1024 / 1024 / 1024) * 10) / 10,
    ));
    setQuotaDailyGenerations(String(account.quota.dailyGenerations));
    setError('');
    setNotice('');
  };

  const updateQuota = async (
    event: FormEvent,
    account: NikiManagedUser,
  ) => {
    event.preventDefault();
    const storageGb = Number(quotaStorageGb);
    const dailyGenerations = Number(quotaDailyGenerations);
    if (
      !Number.isFinite(storageGb)
      || storageGb <= 0
      || !Number.isSafeInteger(dailyGenerations)
      || dailyGenerations <= 0
    ) {
      setError('存储额度和每日生成次数必须为正数');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/auth/users/${encodeURIComponent(account.user.id)}/quota`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageBytes: Math.round(storageGb * 1024 * 1024 * 1024),
            dailyGenerations,
          }),
        },
      );
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || '更新额度失败');
      setEditingQuotaId('');
      await loadAccounts();
      setNotice(`${account.user.name} 的额度已更新`);
    } catch (quotaError) {
      setError(quotaError instanceof Error ? quotaError.message : '更新额度失败');
    } finally {
      setSubmitting(false);
    }
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
            <div className="niki-account-manager__empty">尚无用户</div>
          ) : accounts.map((account) => (
            <article className="niki-account-manager__account" key={account.user.id}>
              <div className="niki-account-manager__row">
                <div>
                  <strong>{account.user.name}</strong>
                  <span>
                    {accountIdentityLabel(account)}
                  </span>
                  <span>
                    存储 {Math.round(account.usage.storageBytes / 1024 / 1024)}MB /
                    {' '}{Math.round(account.quota.storageBytes / 1024 / 1024 / 1024 * 10) / 10}GB
                    {' · '}生成 {account.usage.dailyGenerations}/{account.quota.dailyGenerations}
                  </span>
                </div>
                <span className={account.isActive ? 'is-active' : 'is-disabled'}>
                  {account.isActive ? '可登录' : '已停用'}
                </span>
                <button
                  type="button"
                  className="is-secondary"
                  onClick={() => startQuotaUpdate(account)}
                >
                  修改额度
                </button>
                {account.provider === 'password' ? (
                  <button
                    type="button"
                    className="is-secondary"
                    aria-label={`修改 ${account.username} 的密码`}
                    onClick={() => startPasswordUpdate(account)}
                  >
                    修改密码
                  </button>
                ) : null}
                {account.provider === 'password' && account.isActive ? (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => void disableAccount(account)}
                  >
                    停用
                  </button>
                ) : null}
              </div>
              {editingQuotaId === account.user.id ? (
                <form
                  className="niki-account-manager__password-reset"
                  onSubmit={(event) => void updateQuota(event, account)}
                >
                  <label>
                    <span>存储额度（GB）</span>
                    <input
                      type="number"
                      min="0.1"
                      max="1024"
                      step="0.1"
                      value={quotaStorageGb}
                      onChange={(event) => setQuotaStorageGb(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>24 小时生成次数</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      value={quotaDailyGenerations}
                      onChange={(event) => setQuotaDailyGenerations(event.target.value)}
                      required
                    />
                  </label>
                  <div>
                    <button type="button" onClick={() => setEditingQuotaId('')}>
                      取消
                    </button>
                    <button type="submit" disabled={submitting}>保存额度</button>
                  </div>
                </form>
              ) : null}
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
