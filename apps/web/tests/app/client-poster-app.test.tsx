// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/NikiAuth', () => ({
  NikiAuthGate: function MockNikiAuthGate({ children }: { children: ReactNode }) {
    return <div data-testid="auth-gate">{children}</div>;
  },
}));

vi.mock('../../src/poster/PosterApp', () => ({
  PosterApp: function MockPosterApp() {
    return <div data-testid="poster-app">Poster app</div>;
  },
}));

vi.mock('../../src/i18n', () => ({
  I18nProvider: function MockI18nProvider({
    children,
    defaultLocale,
    deferUntilClient,
  }: {
    children: ReactNode;
    defaultLocale?: string;
    deferUntilClient?: boolean;
  }) {
    return (
      <div
        data-testid="i18n-provider"
        data-default-locale={defaultLocale}
        data-defer-until-client={String(deferUntilClient)}
      >
        {children}
      </div>
    );
  },
}));

import { ClientPosterApp } from '../../app/client-poster-app';

afterEach(() => {
  cleanup();
});

it('renders the dedicated poster flow behind authentication at the root', () => {
  render(<ClientPosterApp />);

  expect(screen.getByTestId('auth-gate')).toBeTruthy();
  expect(screen.getByTestId('i18n-provider').getAttribute('data-default-locale'))
    .toBe('zh-CN');
  expect(screen.getByTestId('i18n-provider').getAttribute('data-defer-until-client'))
    .toBe('true');
  expect(screen.getByTestId('poster-app')).toBeTruthy();
});
