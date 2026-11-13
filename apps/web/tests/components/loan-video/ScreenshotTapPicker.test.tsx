// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScreenshotTapPicker } from '../../../src/components/loan-video/ScreenshotTapPicker';

afterEach(cleanup);

describe('ScreenshotTapPicker', () => {
  it('maps taps to the contained image content and ignores letterbox clicks', async () => {
    const onChange = vi.fn();
    const onAspectRatioChange = vi.fn();
    render(
      <ScreenshotTapPicker
        src="blob:canvas"
        alt="Design canvas"
        testId="picker"
        tap={{ x: 0.5, y: 0.75 }}
        interactive
        onChange={onChange}
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    const picker = screen.getByTestId('picker');
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 212,
      bottom: 422,
      width: 202,
      height: 402,
      toJSON: () => ({}),
    });
    Object.defineProperties(picker, {
      clientLeft: { configurable: true, value: 1 },
      clientTop: { configurable: true, value: 1 },
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 400 },
    });
    const image = picker.querySelector('img')!;
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 200 },
      naturalHeight: { configurable: true, value: 200 },
    });
    fireEvent.load(image);

    expect(onAspectRatioChange).toHaveBeenCalledWith(1);

    fireEvent.click(picker, { clientX: 111, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(picker, { clientX: 111, clientY: 271 });
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.75 });

    await waitFor(() => {
      expect(picker.querySelector<HTMLElement>('.loan-video-tap-picker__marker')?.style.left)
        .toBe('100px');
      expect(picker.querySelector<HTMLElement>('.loan-video-tap-picker__marker')?.style.top)
        .toBe('250px');
    });
  });

  it('does not collect a tap when the transition is automatic', () => {
    const onChange = vi.fn();
    render(
      <ScreenshotTapPicker
        src="blob:canvas"
        alt="Design canvas"
        testId="picker"
        tap={null}
        interactive={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('picker'), { clientX: 10, clientY: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the natural landscape ratio for responsive upload sizing', () => {
    const onAspectRatioChange = vi.fn();
    render(
      <ScreenshotTapPicker
        src="blob:landscape"
        alt="Landscape canvas"
        testId="picker"
        tap={null}
        interactive={false}
        onChange={vi.fn()}
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    const image = screen.getByRole('img', { name: 'Landscape canvas' });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(image);

    expect(onAspectRatioChange).toHaveBeenCalledWith(1600 / 900);
  });
});
