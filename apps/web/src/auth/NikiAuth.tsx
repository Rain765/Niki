'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  NikiAuthConfigResponse,
  NikiAuthMeResponse,
  NikiAuthUser,
} from '@open-design/contracts';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n';

const AUTH_COPY = {
  en: {
    configFailed: 'Could not load sign-in configuration',
    statusFailed: 'Could not load sign-in status',
    timeout: 'Connection timed out. Check your network and try again.',
    unavailable: 'Niki is temporarily unavailable',
    credentialsRequired: 'Enter your username and password',
    loginFailed: 'Sign-in failed. Please try again.',
    loadingTitle: 'Niki Posters',
    loginTitle: 'Sign in to Niki',
    connecting: 'Connecting to Niki…',
    reconnect: 'Reconnect',
    notConfigured: 'Feishu sign-in has not been configured on the server.',
    configureHint: 'Add the App ID and App Secret on the Mac mini first.',
    passwordIntro: 'Sign in with the Niki account created for you by an administrator.',
    feishuIntro: 'Sign in with your company Feishu identity. Each user has separate projects and images.',
    feishuFailed: 'Feishu sign-in did not finish. Please try again.',
    username: 'Username',
    password: 'Password',
    hidePassword: 'Hide password',
    showPassword: 'Show password',
    signingIn: 'Signing in…',
    signIn: 'Sign in',
    backToFeishu: 'Back to Feishu sign-in',
    openingFeishu: 'Opening Feishu…',
    feishuSignIn: 'Sign in with Feishu',
    passwordSignIn: 'Sign in with username and password',
  },
  zh: {
    configFailed: '无法读取登录配置',
    statusFailed: '无法读取登录状态',
    timeout: '连接超时，请检查网络后重试',
    unavailable: 'Niki 暂时无法连接',
    credentialsRequired: '请输入用户名和密码',
    loginFailed: '登录失败，请重试',
    loadingTitle: 'Niki 海报',
    loginTitle: '登录 Niki',
    connecting: '正在连接 Niki…',
    reconnect: '重新连接',
    notConfigured: '服务器尚未完成飞书登录配置。',
    configureHint: '请先在 Mac mini 写入 App ID 和 App Secret。',
    passwordIntro: '使用管理员为你创建的 Niki 账号登录。',
    feishuIntro: '使用公司飞书身份登录。每位用户拥有独立的项目和图片。',
    feishuFailed: '飞书登录未完成，请重试。',
    username: '用户名',
    password: '密码',
    hidePassword: '隐藏密码',
    showPassword: '显示密码',
    signingIn: '正在登录…',
    signIn: '登录',
    backToFeishu: '返回飞书登录',
    openingFeishu: '正在前往飞书…',
    feishuSignIn: '使用飞书登录',
    passwordSignIn: '账号密码登录',
  },
} as const;

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
const AUTH_BOOTSTRAP_RETRY_MS = 350;

class RetryableAuthBootstrapError extends Error {}

function waitForAuthRetry(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, AUTH_BOOTSTRAP_RETRY_MS));
}

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
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale === 'zh-CN' ? 'zh' : 'en'];
  const copyRef = useRef(copy);
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);
    try {
      while (!controller.signal.aborted) {
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
          if (!configResponse.ok) {
            if (configResponse.status >= 500) throw new RetryableAuthBootstrapError();
            throw new Error(copyRef.current.configFailed);
          }
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
          if (!meResponse.ok) {
            if (meResponse.status >= 500) throw new RetryableAuthBootstrapError();
            throw new Error(copyRef.current.statusFailed);
          }
          const me = await meResponse.json() as NikiAuthMeResponse;
          clearAuthErrorFromLocation();
          setState({ status: 'authenticated', enabled: true, user: me.user });
          return;
        } catch (error) {
          if (controller.signal.aborted) throw error;
          if (!(error instanceof RetryableAuthBootstrapError) && !(error instanceof TypeError)) {
            throw error;
          }
          await waitForAuthRetry();
        }
      }
      throw new DOMException('Auth bootstrap timed out', 'AbortError');
    } catch (error) {
      setState({
        status: 'error',
        message: controller.signal.aborted
          ? copyRef.current.timeout
          : error instanceof Error
            ? error.message
            : copyRef.current.unavailable,
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
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale === 'zh-CN' ? 'zh' : 'en'];
  const [passwordMode, setPasswordMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feishuSubmitting, setFeishuSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const passwordInputId = useId();
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
      setPasswordError(copy.credentialsRequired);
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
        throw new Error(body.error || copy.loginFailed);
      }
      clearAuthErrorFromLocation();
      setPassword('');
      setPasswordVisible(false);
      await onRetry();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : copy.loginFailed);
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
        <h1>{state.status === 'loading' ? copy.loadingTitle : copy.loginTitle}</h1>
        {state.status === 'loading' ? (
          <div className="niki-auth__loading">
            <span className="niki-auth__spinner" aria-hidden />
            <span>{copy.connecting}</span>
          </div>
        ) : state.status === 'error' ? (
          <>
            <p>{state.message}</p>
            <button type="button" onClick={() => void onRetry()}>{copy.reconnect}</button>
          </>
        ) : !state.ready ? (
          <>
            <p>{copy.notConfigured}</p>
            <p className="niki-auth__hint">{copy.configureHint}</p>
          </>
        ) : (
          <>
            <p>
              {passwordMode
                ? copy.passwordIntro
                : copy.feishuIntro}
            </p>
            {authError ? (
              <div className="niki-auth__error">
                {copy.feishuFailed}
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
                  <span>{copy.username}</span>
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={submitting}
                  />
                </label>
                <div className="niki-auth__password-field">
                  <label htmlFor={passwordInputId}>{copy.password}</label>
                  <div className="niki-auth__password-control">
                    <input
                      id={passwordInputId}
                      type={passwordVisible ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="niki-auth__password-visibility"
                      disabled={submitting}
                      aria-label={passwordVisible ? copy.hidePassword : copy.showPassword}
                      aria-pressed={passwordVisible}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      <Icon name={passwordVisible ? 'eye' : 'eye-off'} size={18} />
                    </button>
                  </div>
                </div>
                {passwordError ? (
                  <div className="niki-auth__error">{passwordError}</div>
                ) : null}
                <button type="submit" disabled={submitting}>
                  {submitting ? copy.signingIn : copy.signIn}
                </button>
                <button
                  type="button"
                  className="niki-auth__text-button"
                  onClick={() => {
                    clearAuthErrorFromLocation();
                    setPasswordMode(false);
                    setPasswordVisible(false);
                    setPasswordError('');
                  }}
                  disabled={submitting}
                >
                  {copy.backToFeishu}
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
                      <span>{copy.openingFeishu}</span>
                    </>
                  ) : copy.feishuSignIn}
                </button>
                <button
                  type="button"
                  className="niki-auth__text-button"
                  onClick={() => {
                    clearAuthErrorFromLocation();
                    setPasswordVisible(false);
                    setPasswordMode(true);
                  }}
                  disabled={feishuSubmitting}
                >
                  {copy.passwordSignIn}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
