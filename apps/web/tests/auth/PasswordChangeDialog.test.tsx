// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordChangeDialog } from '../../src/auth/PasswordChangeDialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PasswordChangeDialog', () => {
  it('changes the signed-in password without exposing it in a URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      user: { id: 'user-1', name: 'Owner', role: 'admin', provider: 'password' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();

    render(<PasswordChangeDialog open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('当前密码'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'a different strong password' },
    });
    fireEvent.change(screen.getByLabelText('再次输入新密码'), {
      target: { value: 'a different strong password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/password/change',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            currentPassword: 'correct horse battery staple',
            newPassword: 'a different strong password',
          }),
        }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
