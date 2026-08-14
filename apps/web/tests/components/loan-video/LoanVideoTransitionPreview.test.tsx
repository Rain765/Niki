// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoanVideoTransitionPreview } from '../../../src/components/loan-video/LoanVideoTransitionPreview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LoanVideoTransitionPreview', () => {
  it('previews the full current canvas through its tap target into the next canvas', async () => {
    render(
      <LoanVideoTransitionPreview
        currentSrc="blob:current"
        nextSrc="blob:next"
        fromStep={1}
        toStep={2}
        advance="tap"
        tap={{ x: 0.25, y: 0.75 }}
        caption="Tap Apply now"
        captionEnabled
        nextCaption="Review your details"
        nextCaptionEnabled
      />,
    );

    const trigger = screen.getByTestId('loan-video-transition-preview-1');
    expect(trigger.textContent).toContain('Preview');
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(trigger.textContent).toContain('Replay');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByTestId('loan-video-transition-preview-panel-1')
        .getAttribute('aria-hidden'),
    ).toBe('false');
    expect(screen.getByRole('img', { name: 'Step 1 canvas' }).getAttribute('src'))
      .toBe('blob:current');
    expect(screen.getByRole('img', { name: 'Step 2 canvas' }).getAttribute('src'))
      .toBe('blob:next');
    expect(screen.getByText('Tap Apply now')).toBeTruthy();
    expect(screen.getByText('Review your details')).toBeTruthy();

    const stage = screen.getByTestId('loan-video-transition-preview-stage-1');
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 180,
      width: 300,
      height: 180,
      toJSON: () => ({}),
    });
    const currentImage = screen.getByRole('img', { name: 'Step 1 canvas' });
    Object.defineProperties(currentImage, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    });
    fireEvent.load(currentImage);

    await waitFor(() => {
      const marker = screen.getByTestId('loan-video-transition-preview-tap-1');
      const current = screen.getByTestId('loan-video-transition-preview-current-1');
      expect(marker.style.left).toBe('127.5px');
      expect(marker.style.top).toBe('135px');
      expect(current.style.transformOrigin).toBe('127.5px 135px');
    });
  });

  it('keeps preview disabled until both adjacent screenshots exist', () => {
    render(
      <LoanVideoTransitionPreview
        currentSrc="blob:current"
        nextSrc={null}
        fromStep={1}
        toStep={2}
        advance="auto"
        tap={null}
        caption="Continue"
        captionEnabled={false}
      />,
    );

    const trigger = screen.getByTestId('loan-video-transition-preview-1');
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(trigger.getAttribute('aria-label'))
      .toBe('Upload both step images to preview this transition');
    expect(screen.queryByTestId('loan-video-transition-preview-panel-1')).toBeNull();
  });

  it('replays the transition and omits tap and caption layers for automatic steps', () => {
    render(
      <LoanVideoTransitionPreview
        currentSrc="blob:current"
        nextSrc="blob:next"
        fromStep={1}
        toStep={2}
        advance="auto"
        tap={null}
        caption="Hidden caption"
        captionEnabled={false}
      />,
    );

    const trigger = screen.getByTestId('loan-video-transition-preview-1');
    fireEvent.click(trigger);
    const firstStage = screen.getByTestId('loan-video-transition-preview-stage-1');
    expect(screen.queryByTestId('loan-video-transition-preview-tap-1')).toBeNull();
    expect(screen.queryByText('Hidden caption')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByTestId('loan-video-transition-preview-stage-1')).not.toBe(firstStage);
  });

  it('shows the next canvas without animated movement when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    render(
      <LoanVideoTransitionPreview
        currentSrc="blob:current"
        nextSrc="blob:next"
        fromStep={1}
        toStep={2}
        advance="tap"
        tap={{ x: 0.5, y: 0.5 }}
        caption="Tap Next"
        captionEnabled
      />,
    );

    fireEvent.click(screen.getByTestId('loan-video-transition-preview-1'));
    const stage = screen.getByTestId('loan-video-transition-preview-stage-1');
    expect(stage.getAttribute('data-motion')).toBe('reduced');
    expect(stage.className).not.toContain('is-animating');
  });
});
