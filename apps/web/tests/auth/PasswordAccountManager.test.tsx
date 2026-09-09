// @vitest-environment jsdom

import { cleanup, fireEvent, render as testingRender, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NikiManagedUser } from '@open-design/contracts';
import type { ReactNode } from 'react';

import { PasswordAccountManager } from '../../src/auth/PasswordAccountManager';
import { I18nProvider } from '../../src/i18n';

function render(ui: ReactNode) {
  return testingRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
}

const admin: NikiManagedUser = {
  user: { id: 'admin-1', name: 'Niki 管理员', role: 'admin' },
  provider: 'feishu',
  isActive: true,
  createdAt: 1,
  quota: { storageBytes: 5 * 1024 ** 3, dailyGenerations: 30 },
  usage: { storageBytes: 0, dailyGenerations: 0, windowStartedAt: 1 },
};

const member: NikiManagedUser = {
  user: { id: 'member-1', name: '成员一号', role: 'member' },
  provider: 'password',
  username: 'member.one',
  isActive: true,
  createdAt: 2,
  quota: { storageBytes: 5 * 1024 ** 3, dailyGenerations: 30 },
  usage: { storageBytes: 0, dailyGenerations: 0, windowStartedAt: 1 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PasswordAccountManager', () => {
  it('protects the administrator row and creates a member account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [admin, member] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        account: {
          username: 'new.member',
          user: { id: 'member-2', name: '新成员', role: 'member' },
          isActive: true,
          createdAt: 3,
        },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [admin, member] })));
    vi.stubGlobal('fetch', fetchMock);

    render(<PasswordAccountManager open onClose={vi.fn()} />);

    const adminName = await screen.findByText('Niki 管理员');
    const adminRow = adminName.closest('article');
    const memberRow = screen.getByText('成员一号').closest('article');
    expect(adminRow?.textContent).toContain('飞书账号 · 管理员');
    expect(adminRow?.querySelector('.is-danger')).toBeNull();
    expect(memberRow?.querySelector('.is-danger')?.textContent).toContain('停用');
    const initialPassword = screen.getByLabelText('初始密码');
    expect(initialPassword.getAttribute('type')).toBe('password');
    expect(initialPassword.getAttribute('minlength')).toBe('8');

    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: 'new.member' },
    });
    fireEvent.change(screen.getByLabelText('显示名称'), {
      target: { value: '新成员' },
    });
    fireEvent.change(screen.getByLabelText('初始密码'), {
      target: { value: 'member-password' },
    });
    fireEvent.change(screen.getByLabelText('再次输入密码'), {
      target: { value: 'member-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/password-users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: 'new.member',
            name: '新成员',
            password: 'member-password',
          }),
        }),
      );
    });
    expect(await screen.findByText('new.member 已创建')).toBeTruthy();
  });
});
