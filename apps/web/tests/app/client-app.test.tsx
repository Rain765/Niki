// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/FullApp', () => ({
  FullApp: function MockFullApp() {
    return <div data-testid="full-app">Full app</div>;
  },
}));

import { ClientApp } from '../../app/[[...slug]]/client-app';

afterEach(() => {
  cleanup();
});

it('renders the full workspace as the only root application', () => {
  render(<ClientApp />);

  expect(screen.getByTestId('full-app')).toBeTruthy();
  expect(screen.queryByText('Loading Niki…')).toBeNull();
  expect(screen.queryByTestId('lite-image-home')).toBeNull();
});
