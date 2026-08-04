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

import { ClientPosterApp } from '../../app/client-poster-app';

afterEach(() => {
  cleanup();
});

it('renders the dedicated poster flow behind authentication at the root', () => {
  render(<ClientPosterApp />);

  expect(screen.getByTestId('auth-gate')).toBeTruthy();
  expect(screen.getByTestId('poster-app')).toBeTruthy();
});
