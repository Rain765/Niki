// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NikiAuthGate, useNikiAuth } from '../../src/auth/NikiAuth';

function UserProbe() {
  const { user } = useNikiAuth();
  return <div>signed in as {user.name}</div>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('NikiAuthGate', () => {
  it('starts the session lookup without waiting for auth config', async () => {
    let resolveConfig!: (response: Response) => void;
    const configResponse = new Promise<Response>((resolve) => {
      resolveConfig = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/config') return configResponse;
      return Promise.resolve(new Response(JSON.stringify({
        user: {
          id: 'user-1',
          name: '飞书同事',
          role: 'member',
        },
      }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    resolveConfig(new Response(JSON.stringify({
      enabled: true,
      provider: 'feishu',
      ready: true,
    }), { status: 200 }));

    expect(await screen.findByText('signed in as 飞书同事')).toBeTruthy();
  });

  it('keeps local development available when Feishu auth is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        enabled: false,
        provider: null,
        ready: true,
      }), { status: 200 }),
    ));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect(await screen.findByText('signed in as niki')).toBeTruthy();
  });

  it('shows the Feishu login entry when no browser session exists', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'feishu',
        ready: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401 },
      )));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect(await screen.findByRole('button', { name: '使用飞书登录' }))
      .toBeTruthy();
    expect(screen.queryByText(/signed in as/)).toBeNull();
  });

  it('shows desktop WeChat QR login when the website channel is configured', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'wechat',
        ready: true,
        passwordLogin: true,
        providers: {
          feishu: { enabled: false, ready: false },
          wechat: {
            enabled: true,
            ready: true,
            website: true,
            officialAccount: true,
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401 },
      )));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect(await screen.findByRole('button', { name: '微信扫码登录' }))
      .toBeTruthy();
    expect(screen.getByRole('button', { name: '账号密码登录' }))
      .toBeTruthy();
  });

  it('renders the authenticated Feishu identity for the workspace', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'feishu',
        ready: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: {
          id: 'user-1',
          name: '飞书同事',
          role: 'member',
        },
      }), { status: 200 })));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect(await screen.findByText('signed in as 飞书同事')).toBeTruthy();
  });

  it('shows a success notice and consumes the WeChat linking result', async () => {
    window.history.replaceState({}, '', '/workspace?wechatLinked=1&view=home');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'wechat',
        ready: true,
        passwordLogin: true,
        providers: {
          feishu: { enabled: false, ready: false },
          wechat: {
            enabled: true,
            ready: true,
            website: true,
            officialAccount: true,
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: {
          id: 'user-1',
          name: '已绑定用户',
          role: 'member',
          providers: ['wechat'],
        },
      }), { status: 200 })));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect((await screen.findByRole('status')).textContent).toBe('微信绑定成功');
    expect(window.location.pathname).toBe('/workspace');
    expect(window.location.search).toBe('?view=home');
  });
});
