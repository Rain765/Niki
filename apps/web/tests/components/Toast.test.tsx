// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '../../src/components/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders the message and primary line by default', () => {
    render(<Toast message="Folder opened." />);
    expect(screen.getByText('Folder opened.')).not.toBeNull();
  });

  it('renders the optional secondary details line beneath the message', () => {
    render(<Toast message="Upstream issue" details="Account cap until 2026-06-01" />);
    expect(screen.getByText('Account cap until 2026-06-01')).not.toBeNull();
  });

  it('renders the code body in a <pre> when copy fails so users can manually copy the prompt', () => {
    const prompt = '# Continue in CLI — Acme\n\nWorking directory:\n/Users/me/projects/acme\n';
    render(<Toast message="Clipboard unavailable. Copy this prompt manually." code={prompt} />);
    const pre = screen.getByText((_content, node) => node?.tagName === 'PRE');
    expect(pre.textContent).toBe(prompt);
  });

  it('does not auto-dismiss when code is present (user needs time to copy)', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="manual copy" code="some prompt" ttlMs={100} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('auto-dismisses after ttlMs when code is not present', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="folder opened" ttlMs={2000} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2001);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses a three-second success timeout', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Saved" tone="success" onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps errors and persistent work visible by default', () => {
    vi.useFakeTimers();
    const errorDismiss = vi.fn();
    const workingDismiss = vi.fn();
    render(
      <>
        <Toast message="Failed" tone="error" onDismiss={errorDismiss} />
        <Toast message="Working" persistent onDismiss={workingDismiss} />
      </>,
    );
    vi.advanceTimersByTime(60_000);
    expect(errorDismiss).not.toHaveBeenCalled();
    expect(workingDismiss).not.toHaveBeenCalled();
  });

  it('renders a Dismiss button when both code and onDismiss are present', () => {
    render(<Toast message="manual copy" code="x" onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /Dismiss/i })).not.toBeNull();
  });

  it('supports an explicitly dismissible toast with a custom label', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Saved"
        dismissible
        dismissLabel="Close feedback"
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close feedback' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
