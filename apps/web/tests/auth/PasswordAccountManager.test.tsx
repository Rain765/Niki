// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordAccountManager } from '../../src/auth/PasswordAccountManager';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PasswordAccountManager', () => {
  it('uses visible four-character password fields and requires confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<PasswordAccountManager open onClose={vi.fn()} />);
    await screen.findByText('尚未创建账号密码用户');

    const password = screen.getByLabelText('初始密码') as HTMLInputElement;
    const confirmation = screen.getByLabelText('再次输入密码') as HTMLInputElement;
    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('text');
    expect(password.minLength).toBe(4);
    expect(confirmation.minLength).toBe(4);

    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: 'friend.one' },
    });
    fireEvent.change(screen.getByLabelText('显示名称'), {
      target: { value: 'Friend One' },
    });
    fireEvent.change(password, { target: { value: '1234' } });
    fireEvent.change(confirmation, { target: { value: '4321' } });
    fireEvent.submit(screen.getByRole('button', { name: '创建账号' }).closest('form')!);

    expect(await screen.findByText('两次输入的密码不一致')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets an administrator set a new visible password for an existing account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accounts: [{
          username: 'friend.one',
          user: { id: 'user-1', name: 'Friend One', role: 'member' },
          isActive: true,
          createdAt: 1,
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PasswordAccountManager open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '修改 friend.one 的密码' }));

    const password = screen.getByLabelText('新密码') as HTMLInputElement;
    const confirmation = screen.getByLabelText('再次输入新密码') as HTMLInputElement;
    expect(password.type).toBe('text');
    expect(password.minLength).toBe(4);

    fireEvent.change(password, { target: { value: '5678' } });
    fireEvent.change(confirmation, { target: { value: '5678' } });
    fireEvent.click(screen.getByRole('button', { name: '保存密码' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password-users/user-1/password',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ password: '5678' }),
      }),
    ));
    expect(await screen.findByText('friend.one 的密码已更新')).toBeTruthy();
  });
});
