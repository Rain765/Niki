// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('offers administrator-created username and password login without sign-up', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'feishu',
        ready: true,
        passwordLogin: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: {
          id: 'password-user',
          name: '外部朋友',
          role: 'member',
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enabled: true,
        provider: 'feishu',
        ready: true,
        passwordLogin: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: {
          id: 'password-user',
          name: '外部朋友',
          role: 'member',
        },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NikiAuthGate>
        <UserProbe />
      </NikiAuthGate>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '账号密码登录' }));
    expect(screen.queryByText(/注册/)).toBeNull();
    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: 'friend.one' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'A-strong-password-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('signed in as 外部朋友')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
