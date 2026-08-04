'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  NikiAuthConfigResponse,
  NikiAuthMeResponse,
  NikiAuthUser,
} from '@open-design/contracts';

interface NikiAuthContextValue {
  enabled: boolean;
  user: NikiAuthUser;
  logout: () => Promise<void>;
}

const LOCAL_USER: NikiAuthUser = {
  id: 'local',
  name: 'niki',
  role: 'admin',
};

const NikiAuthContext = createContext<NikiAuthContextValue>({
  enabled: false,
  user: LOCAL_USER,
  logout: async () => {},
});

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8_000;

function authReturnTo(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('authError');
  return `${url.pathname}${url.search}${url.hash}`;
}

function clearAuthErrorFromLocation(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('authError')) return;
  url.searchParams.delete('authError');
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated'; ready: boolean }
  | { status: 'authenticated'; enabled: boolean; user: NikiAuthUser };

export function NikiAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);
    try {
      const requestInit: RequestInit = {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      };
      const configRequest = fetch('/api/auth/config', requestInit);
      const meRequest = fetch('/api/auth/me', requestInit)
        .then((response) => ({ response }))
        .catch((error: unknown) => ({ error }));
      const configResponse = await configRequest;
      if (!configResponse.ok) throw new Error('无法读取登录配置');
      const config = await configResponse.json() as NikiAuthConfigResponse;
      if (!config.enabled) {
        clearAuthErrorFromLocation();
        setState({ status: 'authenticated', enabled: false, user: LOCAL_USER });
        return;
      }
      if (!config.ready) {
        setState({ status: 'unauthenticated', ready: false });
        return;
      }
      const meResult = await meRequest;
      if ('error' in meResult) throw meResult.error;
      const { response: meResponse } = meResult;
      if (meResponse.status === 401) {
        setState({ status: 'unauthenticated', ready: true });
        return;
      }
      if (!meResponse.ok) throw new Error('无法读取登录状态');
      const me = await meResponse.json() as NikiAuthMeResponse;
      clearAuthErrorFromLocation();
      setState({ status: 'authenticated', enabled: true, user: me.user });
    } catch (error) {
      setState({
        status: 'error',
        message: controller.signal.aborted
          ? '连接超时，请检查网络后重试'
          : error instanceof Error
            ? error.message
            : 'Niki 暂时无法连接',
      });
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setState({ status: 'unauthenticated', ready: true });
  }, []);

  const contextValue = useMemo<NikiAuthContextValue | null>(() => (
    state.status === 'authenticated'
      ? { enabled: state.enabled, user: state.user, logout }
      : null
  ), [logout, state]);

  if (!contextValue) {
    return (
      <NikiAuthScreen
        state={state as Exclude<AuthState, { status: 'authenticated' }>}
        onRetry={load}
      />
    );
  }

  return (
    <NikiAuthContext.Provider value={contextValue}>
      {children}
    </NikiAuthContext.Provider>
  );
}

export function useNikiAuth(): NikiAuthContextValue {
  return useContext(NikiAuthContext);
}

function NikiAuthScreen({
  state,
  onRetry,
}: {
  state: Exclude<AuthState, { status: 'authenticated' }>;
  onRetry: () => Promise<void>;
}) {
  const [passwordMode, setPasswordMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feishuSubmitting, setFeishuSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const authError = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('authError') ?? '';
  const login = () => {
    if (feishuSubmitting) return;
    setFeishuSubmitting(true);
    const returnTo = authReturnTo();
    const loginUrl = `/api/auth/feishu/start?returnTo=${encodeURIComponent(returnTo)}`;
    // Let React commit and paint the pressed/loading state before navigation
    // starts. This keeps the control responsive while the OAuth endpoint and
    // the Feishu webview are preparing the next page.
    window.requestAnimationFrame(() => {
      window.location.assign(loginUrl);
    });
  };
  const loginWithPassword = async () => {
    if (!username.trim() || !password) {
      setPasswordError('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    setPasswordError('');
    try {
      const response = await fetch('/api/auth/password/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || '登录失败，请重试');
      }
      clearAuthErrorFromLocation();
      setPassword('');
      await onRetry();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="niki-auth">
      <section className="niki-auth__card" aria-live="polite">
        <img
          src="/app-icon.svg?v=20260527"
          className="niki-auth__logo"
          alt=""
          draggable={false}
        />
        <h1>登录 Niki</h1>
        {state.status === 'loading' ? (
          <div className="niki-auth__loading">
            <span className="niki-auth__spinner" aria-hidden />
            <span>正在连接 Niki…</span>
          </div>
        ) : state.status === 'error' ? (
          <>
            <p>{state.message}</p>
            <button type="button" onClick={() => void onRetry()}>重新连接</button>
          </>
        ) : !state.ready ? (
          <>
            <p>服务器尚未完成飞书登录配置。</p>
            <p className="niki-auth__hint">请先在 Mac mini 写入 App ID 和 App Secret。</p>
          </>
        ) : (
          <>
            <p>
              {passwordMode
                ? '使用管理员为你创建的 Niki 账号登录。'
                : '使用公司飞书身份登录。每位用户拥有独立的项目和图片。'}
            </p>
            {authError ? (
              <div className="niki-auth__error">
                飞书登录未完成，请重试。
              </div>
            ) : null}
            {passwordMode ? (
              <form
                className="niki-auth__password-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loginWithPassword();
                }}
              >
                <label>
                  <span>用户名</span>
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={submitting}
                  />
                </label>
                <label>
                  <span>密码</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                  />
                </label>
                {passwordError ? (
                  <div className="niki-auth__error">{passwordError}</div>
                ) : null}
                <button type="submit" disabled={submitting}>
                  {submitting ? '正在登录…' : '登录'}
                </button>
                <button
                  type="button"
                  className="niki-auth__text-button"
                  onClick={() => {
                    clearAuthErrorFromLocation();
                    setPasswordMode(false);
                    setPasswordError('');
                  }}
                  disabled={submitting}
                >
                  返回飞书登录
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className={`niki-auth__primary-button${
                    feishuSubmitting ? ' is-loading' : ''
                  }`}
                  onClick={login}
                  disabled={feishuSubmitting}
                  aria-busy={feishuSubmitting}
                >
                  {feishuSubmitting ? (
                    <>
                      <span className="niki-auth__button-spinner" aria-hidden />
                      <span>正在前往飞书…</span>
                    </>
                  ) : '使用飞书登录'}
                </button>
                <button
                  type="button"
                  className="niki-auth__text-button"
                  onClick={() => {
                    clearAuthErrorFromLocation();
                    setPasswordMode(true);
                  }}
                  disabled={feishuSubmitting}
                >
                  账号密码登录
                </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
