// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyConsentModal } from '../../src/components/PrivacyConsentModal';
import { I18nProvider } from '../../src/i18n';

const PRIVACY_POLICY_HREF = 'https://github.com/Rain765/Niki/blob/main/PRIVACY.md';

function renderModal(overrides?: { onAccept?: () => void }) {
  const onAccept = overrides?.onAccept ?? vi.fn();
  render(
    <I18nProvider initial="en">
      <PrivacyConsentModal onAccept={onAccept} />
    </I18nProvider>,
  );
  return { onAccept };
}

describe('PrivacyConsentModal', () => {
  afterEach(cleanup);

  it('renders a single "I get it" acknowledgement button (no decline)', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'I get it' })).toBeTruthy();
    // Single-button banner: previous double-button labels must be gone so
    // the surface reads as informed-disclosure-plus-acknowledgement, not a
    // forced binary choice.
    expect(screen.queryByRole('button', { name: 'Save sharing preferences' })).toBeNull();
    expect(screen.queryByRole('button', { name: "Don't share" })).toBeNull();
  });

  it('tells the user data sharing is paused and preferences remain in Settings', () => {
    renderModal();
    const footer = screen.getByText(/Data sharing is currently paused/i);
    expect(footer.textContent ?? '').toMatch(/Settings/);
    expect(footer.textContent ?? '').toMatch(/Privacy/);
    expect(footer.textContent ?? '').toMatch(/saved preferences/i);
    expect(
      screen.getByText(/Email delivery to q1y2nfc@gmail\.com is not configured yet/i),
    ).toBeTruthy();
  });

  it('exposes the privacy policy via an obvious external link', () => {
    renderModal();
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link.getAttribute('href')).toBe(PRIVACY_POLICY_HREF);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('invokes onAccept when the acknowledgement button is clicked', () => {
    const { onAccept } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'I get it' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
