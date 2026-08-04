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
  wechatLinkAvailable: boolean;
  linkWechat: () => void;
}

const LOCAL_USER: NikiAuthUser = {
  id: 'local',
  name: 'niki',
  role: 'admin',
};

const LOCAL_AUTH_CONFIG: NikiAuthConfigResponse = {
  enabled: false,
  provider: null,
  ready: true,
  passwordLogin: false,
  providers: {
    feishu: { enabled: false, ready: false },
    wechat: {
      enabled: false,
      ready: false,
      website: false,
      officialAccount: false,
    },
  },
};

const NikiAuthContext = createContext<NikiAuthContextValue>({
  enabled: false,
  user: LOCAL_USER,
  logout: async () => {},
  wechatLinkAvailable: false,
  linkWechat: () => {},
});

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8_000;

function normalizeAuthConfig(config: NikiAuthConfigResponse): NikiAuthConfigResponse {
  if (config.providers) return config;
  return {
    ...config,
    passwordLogin: config.passwordLogin ?? config.enabled,
    providers: {
      feishu: {
        enabled: config.provider === 'feishu',
        ready: config.provider === 'feishu' && config.ready,
      },
      wechat: {
        enabled: config.provider === 'wechat',
        ready: config.provider === 'wechat' && config.ready,
        website: false,
        officialAccount: false,
      },
    },
  };
}

function wechatLoginContext(config: NikiAuthConfigResponse): {
  inWechat: boolean;
  available: boolean;
} {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const inWechat = /MicroMessenger/i.test(userAgent);
  const mobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  return {
    inWechat,
    available: inWechat
      ? config.providers.wechat.officialAccount
      : !mobileBrowser && config.providers.wechat.website,
  };
}

function authReturnTo(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('authError');
  return `${url.pathname}${url.search}${url.hash}`;
}

function clearAuthErrorFromLocation(): void {
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has('authError')
    && !url.searchParams.has('wechatLinked')
  ) return;
  url.searchParams.delete('authError');
  url.searchParams.delete('wechatLinked');
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated'; config: NikiAuthConfigResponse }
  | {
    status: 'authenticated';
    enabled: boolean;
    user: NikiAuthUser;
    config: NikiAuthConfigResponse;
  };

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
      const config = normalizeAuthConfig(
        await configResponse.json() as NikiAuthConfigResponse,
      );
      if (!config.enabled) {
        clearAuthErrorFromLocation();
        setState({
          status: 'authenticated',
          enabled: false,
          user: LOCAL_USER,
          config,
        });
        return;
      }
      if (!config.ready) {
        setState({ status: 'unauthenticated', config });
        return;
      }
      const meResult = await meRequest;
      if ('error' in meResult) throw meResult.error;
      const { response: meResponse } = meResult;
      if (meResponse.status === 401) {
        setState({ status: 'unauthenticated', config });
        return;
      }
      if (!meResponse.ok) throw new Error('无法读取登录状态');
      const me = await meResponse.json() as NikiAuthMeResponse;
      clearAuthErrorFromLocation();
      setState({
        status: 'authenticated',
        enabled: true,
        user: me.user,
        config,
      });
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
    setState((current) => ({
      status: 'unauthenticated',
      config: current.status === 'authenticated'
        ? current.config
        : LOCAL_AUTH_CONFIG,
    }));
  }, []);

  const linkWechat = useCallback(() => {
    const returnTo = authReturnTo();
    window.location.assign(
      `/api/auth/wechat/start?link=1&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, []);

  const contextValue = useMemo<NikiAuthContextValue | null>(() => (
    state.status === 'authenticated'
      ? {
        enabled: state.enabled,
        user: state.user,
        logout,
        wechatLinkAvailable: wechatLoginContext(state.config).available
          && !state.user.providers?.includes('wechat'),
        linkWechat,
      }
      : null
  ), [linkWechat, logout, state]);

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
  const [passwordError, setPasswordError] = useState('');
  const authError = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('authError') ?? '';
  const config = state.status === 'unauthenticated'
    ? state.config
    : LOCAL_AUTH_CONFIG;
  const {
    inWechat,
    available: wechatLoginAvailable,
  } = wechatLoginContext(config);
  const login = (provider: 'feishu' | 'wechat') => {
    const returnTo = authReturnTo();
    window.location.assign(
      `/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
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
        ) : !config.ready ? (
          <>
            <p>服务器尚未完成登录配置。</p>
            <p className="niki-auth__hint">请先配置飞书或微信 App ID 与 App Secret。</p>
          </>
        ) : (
          <>
            <p>
              {passwordMode
                ? '使用管理员为你创建的 Niki 账号登录。'
                : '选择快捷登录方式。每位用户拥有独立的项目和图片。'}
            </p>
            {authError ? (
              <div className="niki-auth__error">
                {authError === 'wechat_identity_conflict'
                  ? '这个微信已经绑定到另一个 Niki 账号。'
                  : '登录未完成，请重试。'}
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
                  返回其他登录方式
                </button>
              </form>
            ) : (
              <>
                {wechatLoginAvailable ? (
                  <button type="button" onClick={() => login('wechat')}>
                    {inWechat ? '微信快捷登录' : '微信扫码登录'}
                  </button>
                ) : null}
                {config.providers?.feishu.ready ? (
                  <button
                    type="button"
                    className={wechatLoginAvailable ? 'niki-auth__text-button' : undefined}
                    onClick={() => login('feishu')}
                  >
                    使用飞书登录
                  </button>
                ) : null}
                {config.passwordLogin ? (
                  <button
                    type="button"
                    className="niki-auth__text-button"
                    onClick={() => {
                      clearAuthErrorFromLocation();
                      setPasswordMode(true);
                    }}
                  >
                    账号密码登录
                  </button>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
