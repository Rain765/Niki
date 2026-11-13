// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../src/auth/NikiAuth', () => ({
  NikiAuthGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../src/i18n', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../src/poster/PosterApp', () => ({
  PosterApp: ({ initialMode }: { initialMode?: string }) => (
    <div data-testid="poster-app-mode">{initialMode}</div>
  ),
}));

import { ClientLogoApp } from '../../app/logo/client-logo-app';

afterEach(cleanup);

it('mounts Logo Studio inside the current light Niki app', () => {
  render(<ClientLogoApp />);

  expect(screen.getByTestId('poster-app-mode').textContent).toBe('logo');
});
