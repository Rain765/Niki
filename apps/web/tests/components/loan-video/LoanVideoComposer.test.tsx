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
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Upload an intro image.');
    expect(screen.getByTestId('loan-video-errors').textContent).toContain('Every step needs an interface image.');
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
      .toContain('Every step needs an interface image.');
  });

  it('collects screenshots, captions, voiceover, ordering, and tap coordinates', () => {
    const onSubmit = vi.fn();
    render(<LoanVideoComposer onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

    fireEvent.change(screen.getByTestId('loan-video-title'), {
      target: { value: 'How to top up' },
    });

    for (const role of ['intro', 'background', 'outro']) {
      fireEvent.change(screen.getByTestId(`loan-video-${role}`), {
        target: {
          files: [new File([role], `${role}.png`, { type: 'image/png' })],
        },
      });
    }

    for (let index = 1; index <= 3; index += 1) {
      fireEvent.change(screen.getByTestId(`loan-video-text-${index}`), {
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
    const preview = picker.querySelector('img')!;
    Object.defineProperties(preview, {
      naturalWidth: { configurable: true, value: 200 },
      naturalHeight: { configurable: true, value: 400 },
    });
    fireEvent.load(preview);
    fireEvent.click(picker, { clientX: 110, clientY: 320 });
    fireEvent.click(screen.getByTestId('loan-video-advance-auto-2'));
    fireEvent.click(screen.getByTestId('loan-video-advance-auto-3'));
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('true');
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: 'How to top up',
      brand: 'zamloan',
      aspectRatio: '9:16',
      durationSeconds: 30,
      intro: expect.objectContaining({ name: 'intro.png' }),
      background: expect.objectContaining({ name: 'background.png' }),
      outro: expect.objectContaining({ name: 'outro.png' }),
      steps: [
        {
          text: 'Step 1',
          captionEnabled: true,
          voiceoverEnabled: true,
          advance: 'tap',
          tap: { x: 0.5, y: 0.75 },
        },
        { text: 'Step 2', advance: 'auto', tap: null },
        { text: 'Step 3', advance: 'auto' },
      ],
    });
  });

  it('uses one step text field with independent caption and voiceover switches', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

    expect(screen.getByTestId('loan-video-text-1')).toBeTruthy();
    expect(screen.queryByTestId('loan-video-caption-1')).toBeNull();
    expect(screen.queryByTestId('loan-video-voiceover-1')).toBeNull();

    const caption = screen.getByTestId('loan-video-caption-enabled-1') as HTMLInputElement;
    const voiceover = screen.getByTestId('loan-video-voiceover-enabled-1') as HTMLInputElement;
    const firstStep = within(screen.getByTestId('loan-video-step-1'));
    expect(firstStep.getByRole('switch', { name: 'Caption' })).toBe(caption);
    expect(firstStep.getByRole('switch', { name: 'Voiceover' })).toBe(voiceover);
    expect(caption.checked).toBe(true);
    expect(voiceover.checked).toBe(true);
    fireEvent.click(caption);
    expect(caption.checked).toBe(false);
    expect(voiceover.checked).toBe(true);
    fireEvent.click(voiceover);
    expect(caption.checked).toBe(false);
    expect(voiceover.checked).toBe(false);
  });

  it('shows page-to-page actions and a final page-to-outro action', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

    expect(screen.getByTestId('loan-video-transition-1').textContent).toContain('Step 1 → Step 2');
    expect(screen.getByTestId('loan-video-advance-tap-1')).toBeTruthy();
    expect(screen.getByTestId('loan-video-advance-auto-1')).toBeTruthy();
    expect(screen.getByTestId('loan-video-transition-3').textContent).toContain('Step 3 → Outro');
    expect(screen.queryByTestId('loan-video-end-3')).toBeNull();
  });

  it('reveals an inline transition preview only when both adjacent images exist', async () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));

    const firstPreview = screen.getByTestId(
      'loan-video-transition-preview-1',
    ) as HTMLButtonElement;
    const secondPreview = screen.getByTestId(
      'loan-video-transition-preview-2',
    ) as HTMLButtonElement;
    expect(firstPreview.disabled).toBe(true);
    expect(secondPreview.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('loan-video-screenshot-1'), {
      target: {
        files: [new File(['one'], 'one.png', { type: 'image/png' })],
      },
    });
    expect(firstPreview.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('loan-video-screenshot-2'), {
      target: {
        files: [new File(['two'], 'two.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => expect(firstPreview.disabled).toBe(false));
    expect(secondPreview.disabled).toBe(true);
    fireEvent.click(firstPreview);
    expect(screen.getByTestId('loan-video-transition-preview-panel-1').getAttribute('aria-hidden'))
      .toBe('false');
    expect(screen.getByRole('img', { name: 'Step 1 canvas' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Step 2 canvas' })).toBeTruthy();

    fireEvent.change(screen.getByTestId('loan-video-screenshot-3'), {
      target: {
        files: [new File(['three'], 'three.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(within(screen.getByTestId('loan-video-step-2')).getByRole('button', {
      name: 'Move step down',
    }));

    expect(screen.getByTestId('loan-video-transition-preview-1').textContent).toContain('Preview');
    expect(screen.getByTestId('loan-video-transition-preview-panel-1').getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('passes the uploaded image natural ratio to the responsive screenshot surface', () => {
    render(<LoanVideoComposer onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
    fireEvent.change(screen.getByTestId('loan-video-screenshot-1'), {
      target: {
        files: [new File(['wide'], 'wide.png', { type: 'image/png' })],
      },
    });

    const picker = screen.getByTestId('loan-video-tap-picker-1');
    const image = picker.querySelector('img')!;
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(image);

    const surface = picker.closest<HTMLElement>('.loan-video-screenshot');
    expect(surface?.style.getPropertyValue('--loan-video-screenshot-aspect'))
      .toBe(String(1600 / 900));
    expect(surface?.dataset.imageOrientation).toBe('landscape');
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
    expect(screen.getByTestId('loan-video-manage-steps').textContent).toContain('1/6');

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
    expect(manageButton.textContent).toContain('0/6');
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
    expect(manageButton.textContent).toContain('0/7');

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
    fireEvent.change(screen.getByTestId('loan-video-text-1'), {
      target: { value: 'Open the application' },
    });
    fireEvent.pointerDown(screen.getByTestId('loan-video-upload-drawer-backdrop'));

    expect(screen.getByTestId('loan-video-upload-drawer').getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(manageButton);
    expect((screen.getByTestId('loan-video-text-1') as HTMLInputElement).value)
      .toBe('Open the application');
  });
});
