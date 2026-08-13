// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoanVideoComposer } from '../../../src/components/loan-video/LoanVideoComposer';

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LoanVideoComposer', () => {
  it('validates required fields before submitting', () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    expect(screen.getAllByTestId(/loan-video-step-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Add a video title.');
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Every step needs an app screenshot.');
  });

  it('collects screenshots, captions, voiceover, ordering, and tap coordinates', () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('loan-video-title'), {
      target: { value: 'How to top up' },
    });

    for (let index = 1; index <= 3; index += 1) {
      fireEvent.change(screen.getByTestId(`loan-video-caption-${index}`), {
        target: { value: `Step ${index}` },
      });
      fireEvent.change(screen.getByTestId(`loan-video-screenshot-${index}`), {
        target: {
          files: [new File([`screen-${index}`], `screen-${index}.png`, { type: 'image/png' })],
        },
      });
    }

    const picker = screen.getByTestId('loan-video-tap-picker-1');
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 420,
      width: 200,
      height: 400,
      toJSON: () => ({}),
    });
    fireEvent.click(picker, { clientX: 110, clientY: 320 });
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: 'How to top up',
      brand: 'zamloan',
      aspectRatio: '9:16',
      durationSeconds: 30,
      narration: true,
      steps: [
        { caption: 'Step 1', tap: { x: 0.5, y: 0.75 } },
        { caption: 'Step 2' },
        { caption: 'Step 3' },
      ],
    });
  });

  it('opens the screenshot picker from the image surface and in-image replace action', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const screenshotInput = screen.getByTestId('loan-video-screenshot-1');
    const inputClick = vi.spyOn(screenshotInput, 'click');
    expect(screenshotInput.hasAttribute('hidden')).toBe(true);

    fireEvent.click(screen.getByTestId('loan-video-upload-surface-1'));
    expect(inputClick).toHaveBeenCalledOnce();

    fireEvent.change(screenshotInput, {
      target: {
        files: [new File(['screen'], 'screen.png', { type: 'image/png' })],
      },
    });

    inputClick.mockClear();
    fireEvent.click(screen.getByTestId('loan-video-replace-screenshot-1'));
    expect(inputClick).toHaveBeenCalledOnce();
  });
});
