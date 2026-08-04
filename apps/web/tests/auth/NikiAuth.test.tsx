// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NikiAuthGate, useNikiAuth } from '../../src/auth/NikiAuth';

function UserProbe() {
  const { user } = useNikiAuth();
  return <div>signed in as {user.name}</div>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it('keeps the visible bootstrap screen and retries while daemon starts', async () => {
    let configAttempts = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/config') {
        configAttempts += 1;
        if (configAttempts === 1) {
          return Promise.resolve(new Response('starting', { status: 502 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          enabled: false,
          provider: null,
          ready: true,
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        error: 'Authentication required',
      }), { status: 401 }));
    }));

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    expect(screen.getByText('正在连接 Niki…')).toBeTruthy();
    expect(await screen.findByText('signed in as niki', {}, { timeout: 1_500 })).toBeTruthy();
    expect(configAttempts).toBe(2);
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

  it('shows immediate feedback while the Feishu login redirect is starting', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
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

    const loginButton = await screen.findByRole('button', { name: '使用飞书登录' });
    fireEvent.click(loginButton);

    expect(loginButton.getAttribute('aria-busy')).toBe('true');
    expect((loginButton as HTMLButtonElement).disabled).toBe(true);
    expect(loginButton.textContent).toContain('正在前往飞书');
    expect(loginButton.querySelector('.niki-auth__button-spinner')).toBeTruthy();
    expect(screen.getByRole('button', { name: '账号密码登录' })).toHaveProperty('disabled', true);
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
});
