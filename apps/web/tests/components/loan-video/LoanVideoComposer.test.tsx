// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  it('returns title validation to the main form and focuses the title field', async () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    expect(screen.getAllByTestId(/loan-video-step-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Add a video title.');
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Every step needs an app screenshot.');
    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => expect(screen.getByTestId('loan-video-title')).toBe(document.activeElement));
  });

  it('keeps step validation inside the open drawer', () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('loan-video-title'), {
      target: { value: 'How to apply' },
    });
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByTestId('loan-video-errors').textContent)
      .toContain('Every step needs an app screenshot.');
  });

  it('collects screenshots, captions, voiceover, ordering, and tap coordinates', () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

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
    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('true');
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

  it('renders ratio options in product order and supports listbox dismissal', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const aspect = screen.getByTestId('loan-video-aspect');
    fireEvent.click(aspect);
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim()))
      .toEqual(['3:4', '1:1', '9:16', '16:9']);

    fireEvent.keyDown(aspect, { key: 'Escape' });
    expect(aspect.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(aspect);
    fireEvent.mouseDown(document.body);
    expect(aspect.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a mobile filter menu usable when the trigger is near the viewport bottom', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(640);
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const aspect = screen.getByTestId('loan-video-aspect');
    vi.spyOn(aspect, 'getBoundingClientRect').mockReturnValue({
      x: 12,
      y: 588,
      left: 12,
      top: 588,
      right: 378,
      bottom: 630,
      width: 366,
      height: 42,
      toJSON: () => ({}),
    });

    fireEvent.click(aspect);

    const menu = await screen.findByRole('listbox', { name: 'Aspect ratio' });
    expect(Number.parseFloat(menu.style.maxHeight)).toBeGreaterThan(0);
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(588);
  });

  it('keeps all four video filters clickable and commits their selected labels', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const settings = screen.getByTestId('loan-video-title')
      .closest('.loan-video-composer__settings');
    expect(settings?.querySelectorAll('.loan-video-select-field')).toHaveLength(4);

    const selections = [
      ['loan-video-brand', /BiuMoney/, 'Product: BiuMoney'],
      ['loan-video-language', /简体中文/, 'Language: 简体中文'],
      ['loan-video-aspect', /^3:4$/, 'Aspect ratio: 3:4'],
      ['loan-video-duration', /^45s$/, 'Target length: 45s'],
    ] as const;

    for (const [testId, optionName, expectedLabel] of selections) {
      const trigger = screen.getByTestId(testId);
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('option', { name: optionName }));
      expect(trigger.getAttribute('aria-label')).toBe(expectedLabel);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('opens the screenshot picker from the image surface and in-image replace action', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

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
    expect(screen.getByTestId('loan-video-manage-steps').textContent).toContain('1/3');

    inputClick.mockClear();
    fireEvent.click(screen.getByTestId('loan-video-replace-screenshot-1'));
    expect(inputClick).toHaveBeenCalledOnce();
  });

  it('moves step editing into a modal drawer and keeps add-step in its top-right action', async () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const manageButton = screen.getByTestId('loan-video-manage-steps');
    const stepsSection = manageButton.closest('.loan-video-steps');
    const drawer = screen.getByTestId('loan-video-upload-drawer');

    expect(manageButton.textContent).toContain('Upload / manage steps');
    expect(manageButton.textContent).toContain('0/3');
    expect(manageButton.getAttribute('aria-expanded')).toBe('false');
    expect(stepsSection?.querySelector('.loan-video-step')).toBeNull();
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.hasAttribute('inert')).toBe(true);

    manageButton.focus();
    fireEvent.click(manageButton);

    expect(manageButton.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');

    const drawerHeader = drawer.querySelector('.loan-video-drawer__header');
    const drawerFooter = drawer.querySelector('.loan-video-drawer__footer');
    expect(drawerHeader).toBeTruthy();
    expect(drawerFooter).toBeTruthy();
    expect(within(drawerFooter as HTMLElement).getByTestId('loan-video-generate')).toBeTruthy();
    const addStep = within(drawerHeader as HTMLElement).getByTestId('loan-video-add-step');
    fireEvent.click(addStep);
    expect(screen.getAllByTestId(/loan-video-step-/)).toHaveLength(4);
    expect(manageButton.textContent).toContain('0/4');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close' })).toBe(document.activeElement);
    });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('');
    expect(manageButton).toBe(document.activeElement);
  });

  it('closes from the backdrop and preserves the step draft when reopened', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);

    const manageButton = screen.getByTestId('loan-video-manage-steps');
    fireEvent.click(manageButton);
    fireEvent.change(screen.getByTestId('loan-video-caption-1'), {
      target: { value: 'Open the application' },
    });
    fireEvent.pointerDown(screen.getByTestId('loan-video-upload-drawer-backdrop'));

    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(manageButton);
    expect((screen.getByTestId('loan-video-caption-1') as HTMLInputElement).value)
      .toBe('Open the application');
  });
});
