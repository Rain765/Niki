'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  NikiManagedUser,
  NikiManagedUserListResponse,
  NikiPasswordAccountCreateResponse,
  NikiPasswordAccountPasswordUpdateResponse,
} from '@open-design/contracts';
import { useI18n } from '../i18n';

const ACCOUNT_COPY = {
  en: {
    passwordLength: 'Password must be 8–128 characters',
    passwordMismatch: 'Passwords do not match',
    loadFailed: 'Could not load accounts',
    createFailed: 'Could not create account',
    created: (username: string) => `${username} was created`,
    updatePasswordFailed: 'Could not update password',
    passwordUpdated: (username: string) => `Password updated for ${username}`,
    disableConfirm: (username: string) => `Disable “${username}”? This account will be signed out immediately.`,
    disableFailed: 'Could not disable account',
    quotaInvalid: 'Storage quota and daily generation limit must be positive numbers',
    quotaFailed: 'Could not update quota',
    quotaUpdated: (name: string) => `Quota updated for ${name}`,
    admin: 'Administrator',
    title: 'Account management',
    close: 'Close account management',
    username: 'Username',
    usernamePlaceholder: 'For example, friend.one',
    displayName: 'Display name',
    displayNamePlaceholder: 'Name shown in Niki',
    initialPassword: 'Initial password',
    passwordPlaceholder: 'At least 8 characters',
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: 'Enter the same password again',
    creating: 'Creating…',
    create: 'Create account',
    accounts: 'Accounts',
    accountCount: (count: number) => `${count}`,
    loading: 'Loading…',
    empty: 'No users yet',
    feishuAdmin: 'Feishu account · Administrator',
    feishu: 'Feishu account',
    usage: (storage: number, quota: number, used: number, limit: number) => `Storage ${storage}MB / ${quota}GB · Generations ${used}/${limit}`,
    active: 'Can sign in',
    disabled: 'Disabled',
    editQuota: 'Edit quota',
    editPasswordLabel: (username: string) => `Change password for ${username}`,
    editPassword: 'Change password',
    disable: 'Disable',
    storageQuota: 'Storage quota (GB)',
    dailyGenerations: 'Generations per 24 hours',
    cancel: 'Cancel',
    saveQuota: 'Save quota',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    saving: 'Saving…',
    savePassword: 'Save password',
  },
  zh: {
    passwordLength: '密码需为 8–128 个字符',
    passwordMismatch: '两次输入的密码不一致',
    loadFailed: '无法读取账号列表',
    createFailed: '创建账号失败',
    created: (username: string) => `${username} 已创建`,
    updatePasswordFailed: '更新密码失败',
    passwordUpdated: (username: string) => `${username} 的密码已更新`,
    disableConfirm: (username: string) => `确定停用账号“${username}”吗？该账号会立即退出登录。`,
    disableFailed: '停用账号失败',
    quotaInvalid: '存储额度和每日生成次数必须为正数',
    quotaFailed: '更新额度失败',
    quotaUpdated: (name: string) => `${name} 的额度已更新`,
    admin: '管理员',
    title: '账号管理',
    close: '关闭账号管理',
    username: '用户名',
    usernamePlaceholder: '例如 friend.one',
    displayName: '显示名称',
    displayNamePlaceholder: '用户在 Niki 中看到的名称',
    initialPassword: '初始密码',
    passwordPlaceholder: '至少 8 个字符',
    confirmPassword: '再次输入密码',
    confirmPasswordPlaceholder: '再次输入相同密码',
    creating: '正在创建…',
    create: '创建账号',
    accounts: '账号',
    accountCount: (count: number) => `${count} 个`,
    loading: '正在加载…',
    empty: '尚无用户',
    feishuAdmin: '飞书账号 · 管理员',
    feishu: '飞书账号',
    usage: (storage: number, quota: number, used: number, limit: number) => `存储 ${storage}MB / ${quota}GB · 生成 ${used}/${limit}`,
    active: '可登录',
    disabled: '已停用',
    editQuota: '修改额度',
    editPasswordLabel: (username: string) => `修改 ${username} 的密码`,
    editPassword: '修改密码',
    disable: '停用',
    storageQuota: '存储额度（GB）',
    dailyGenerations: '24 小时生成次数',
    cancel: '取消',
    saveQuota: '保存额度',
    newPassword: '新密码',
    confirmNewPassword: '再次输入新密码',
    saving: '正在保存…',
    savePassword: '保存密码',
  },
} as const;

type AccountCopy = (typeof ACCOUNT_COPY)[keyof typeof ACCOUNT_COPY];

function passwordValidationError(password: string, confirmation: string, copy: AccountCopy): string {
  if (password.length < 8 || password.length > 128) {
    return copy.passwordLength;
  }
  if (password !== confirmation) return copy.passwordMismatch;
  return '';
}

export function PasswordAccountManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const copy = ACCOUNT_COPY[locale === 'zh-CN' ? 'zh' : 'en'];
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
      if (!response.ok) throw new Error(copy.loadFailed);
      const body = await response.json() as NikiManagedUserListResponse;
      setAccounts(body.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed]);

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
    const validationError = passwordValidationError(password, confirmPassword, copy);
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
        throw new Error(body.error || copy.createFailed);
      }
      setUsername('');
      setName('');
      setPassword('');
      setConfirmPassword('');
      await loadAccounts();
      setNotice(copy.created(body.account.username));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : copy.createFailed);
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
      copy,
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
      if (!response.ok || !body.ok) throw new Error(body.error || copy.updatePasswordFailed);
      setNotice(copy.passwordUpdated(account.username ?? account.user.name));
      cancelPasswordUpdate();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : copy.updatePasswordFailed);
    } finally {
      setUpdatingPasswordId('');
    }
  };

  const disableAccount = async (account: NikiManagedUser) => {
    if (!window.confirm(copy.disableConfirm(account.username ?? account.user.name))) {
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
      setError(body.error || copy.disableFailed);
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
      setError(copy.quotaInvalid);
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
      if (!response.ok) throw new Error(body.error || copy.quotaFailed);
      setEditingQuotaId('');
      await loadAccounts();
      setNotice(copy.quotaUpdated(account.user.name));
    } catch (quotaError) {
      setError(quotaError instanceof Error ? quotaError.message : copy.quotaFailed);
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
            <span className="niki-account-manager__eyebrow">{copy.admin}</span>
            <h2 id="niki-account-manager-title">{copy.title}</h2>
          </div>
          <button type="button" aria-label={copy.close} onClick={onClose}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
        </header>

        <form className="niki-account-manager__form" onSubmit={createAccount}>
          <label>
            <span>{copy.username}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={copy.usernamePlaceholder}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>{copy.displayName}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.displayNamePlaceholder}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>{copy.initialPassword}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={copy.passwordPlaceholder}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              spellCheck={false}
              required
            />
          </label>
          <label>
            <span>{copy.confirmPassword}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={copy.confirmPasswordPlaceholder}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              spellCheck={false}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? copy.creating : copy.create}
          </button>
        </form>

        {error ? <div className="niki-account-manager__error">{error}</div> : null}
        {notice ? <div className="niki-account-manager__notice">{notice}</div> : null}

        <div className="niki-account-manager__list">
          <div className="niki-account-manager__list-head">
            <span>{copy.accounts}</span>
            <span>{copy.accountCount(accounts.length)}</span>
          </div>
          {loading ? (
            <div className="niki-account-manager__empty">{copy.loading}</div>
          ) : accounts.length === 0 ? (
            <div className="niki-account-manager__empty">{copy.empty}</div>
          ) : accounts.map((account) => (
            <article className="niki-account-manager__account" key={account.user.id}>
              <div className="niki-account-manager__row">
                <div>
                  <strong>{account.user.name}</strong>
                  <span>
                    {account.provider === 'password'
                      ? `@${account.username}`
                      : account.user.role === 'admin'
                        ? copy.feishuAdmin
                        : copy.feishu}
                  </span>
                  <span>
                    {copy.usage(
                      Math.round(account.usage.storageBytes / 1024 / 1024),
                      Math.round(account.quota.storageBytes / 1024 / 1024 / 1024 * 10) / 10,
                      account.usage.dailyGenerations,
                      account.quota.dailyGenerations,
                    )}
                  </span>
                </div>
                <span className={account.isActive ? 'is-active' : 'is-disabled'}>
                  {account.isActive ? copy.active : copy.disabled}
                </span>
                <button
                  type="button"
                  className="is-secondary"
                  onClick={() => startQuotaUpdate(account)}
                >
                  {copy.editQuota}
                </button>
                {account.provider === 'password' ? (
                  <button
                    type="button"
                    className="is-secondary"
                    aria-label={copy.editPasswordLabel(account.username ?? account.user.name)}
                    onClick={() => startPasswordUpdate(account)}
                  >
                    {copy.editPassword}
                  </button>
                ) : null}
                {account.provider === 'password' && account.isActive ? (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => void disableAccount(account)}
                  >
                    {copy.disable}
                  </button>
                ) : null}
              </div>
              {editingQuotaId === account.user.id ? (
                <form
                  className="niki-account-manager__password-reset"
                  onSubmit={(event) => void updateQuota(event, account)}
                >
                  <label>
                    <span>{copy.storageQuota}</span>
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
                    <span>{copy.dailyGenerations}</span>
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
                      {copy.cancel}
                    </button>
                    <button type="submit" disabled={submitting}>{copy.saveQuota}</button>
                  </div>
                </form>
              ) : null}
              {editingPasswordId === account.user.id ? (
                <form
                  className="niki-account-manager__password-reset"
                  onSubmit={(event) => void updateAccountPassword(event, account)}
                >
                  <label>
                    <span>{copy.newPassword}</span>
                    <input
                      type="password"
                      value={replacementPassword}
                      onChange={(event) => setReplacementPassword(event.target.value)}
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <label>
                    <span>{copy.confirmNewPassword}</span>
                    <input
                      type="password"
                      value={confirmReplacementPassword}
                      onChange={(event) => setConfirmReplacementPassword(event.target.value)}
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <div>
                    <button type="button" onClick={cancelPasswordUpdate}>{copy.cancel}</button>
                    <button
                      type="submit"
                      disabled={updatingPasswordId === account.user.id}
                    >
                      {updatingPasswordId === account.user.id ? copy.saving : copy.savePassword}
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
