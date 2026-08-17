// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  buildLoanVideoStoryboard,
  createLoanVideoStep,
  invalidateChangedLoanVideoTapTargets,
  loanVideoOutputName,
  loanVideoProjectName,
  validateLoanVideoDraft,
} from '../../../src/components/loan-video/loan-video';
import type { LoanVideoDraft } from '../../../src/components/loan-video/types';

function completeDraft(): LoanVideoDraft {
  return {
    title: 'How to apply',
    brand: 'zamloan',
    language: 'en',
    aspectRatio: '9:16',
    durationSeconds: 30,
    intro: new File(['intro'], 'intro.png', { type: 'image/png' }),
    background: new File(['background'], 'background.png', { type: 'image/png' }),
    outro: new File(['outro'], 'outro.png', { type: 'image/png' }),
    steps: [
      {
        ...createLoanVideoStep('step-1'),
        screenshot: new File(['screen'], 'apply.png', { type: 'image/png' }),
        text: 'Tap Apply Now',
        captionEnabled: true,
        voiceoverEnabled: true,
        advance: 'tap',
        tap: { x: 1.2, y: -0.1 },
      },
      {
        ...createLoanVideoStep('step-2'),
        screenshot: new File(['result'], 'details.png', { type: 'image/png' }),
        text: 'Review your details',
        captionEnabled: true,
        voiceoverEnabled: false,
        advance: 'auto',
      },
    ],
  };
}

describe('loan video draft helpers', () => {
  it('reports missing required tutorial inputs without duplicate errors', () => {
    const draft: LoanVideoDraft = {
      ...completeDraft(),
      title: '',
      intro: null,
      background: null,
      outro: null,
      steps: [createLoanVideoStep('one'), createLoanVideoStep('two')],
    };

    expect(validateLoanVideoDraft(draft)).toEqual([
      'title-required',
      'intro-required',
      'background-required',
      'outro-required',
      'text-required',
      'screenshot-required',
      'tap-required',
    ]);
  });

  it('requires a marked point for every page that taps toward the next page or outro', () => {
    const draft = completeDraft();
    draft.steps[0] = { ...draft.steps[0]!, tap: null };
    expect(validateLoanVideoDraft(draft)).toContain('tap-required');

    draft.steps[0] = { ...draft.steps[0]!, advance: 'auto' };
    expect(validateLoanVideoDraft(draft)).not.toContain('tap-required');

    draft.steps[1] = { ...draft.steps[1]!, advance: 'tap', tap: null };
    expect(validateLoanVideoDraft(draft)).toContain('tap-required');

    draft.steps[1] = { ...draft.steps[1]!, advance: 'auto' };
    expect(validateLoanVideoDraft(draft)).not.toContain('tap-required');
  });

  it('clears tap data only when that source step receives a different next target', () => {
    const stepA = {
      ...createLoanVideoStep('a'),
      tap: { x: 0.4, y: 0.7 },
    };
    const stepB = {
      ...createLoanVideoStep('b'),
      advance: 'auto' as const,
    };
    const stepC = createLoanVideoStep('c');

    const afterRemoval = invalidateChangedLoanVideoTapTargets(
      [stepA, stepB, stepC],
      [stepA, stepC],
    );
    expect(afterRemoval[0]?.tap).toBeNull();

    const prefix = createLoanVideoStep('prefix');
    const afterMoveWithSameTarget = invalidateChangedLoanVideoTapTargets(
      [prefix, stepA, stepB],
      [stepA, stepB, prefix],
    );
    expect(afterMoveWithSameTarget[0]?.tap).toEqual({ x: 0.4, y: 0.7 });
  });

  it('builds explicit v2 scenes and from/to transitions with clamped tap coordinates', () => {
    const draft = completeDraft();
    const storyboard = buildLoanVideoStoryboard(draft, {
      intro: '.od-inputs/01-intro.png',
      background: '.od-inputs/02-background.png',
      pages: ['.od-inputs/03-apply.png', '.od-inputs/04-details.png'],
      outro: '.od-inputs/05-outro.png',
    });

    expect(storyboard).toMatchObject({
      version: 2,
      narration: true,
      backgroundRef: '.od-inputs/02-background.png',
      scenes: [
        {
          id: 'intro',
          assetRef: '.od-inputs/01-intro.png',
          presentation: 'full',
        },
        {
          id: 'step-1',
          screenshotAttachmentIndex: 3,
          screenshotOriginalName: 'apply.png',
          assetRef: '.od-inputs/03-apply.png',
          text: 'Tap Apply Now',
          captionEnabled: true,
          voiceoverEnabled: true,
          presentation: 'device',
        },
        { id: 'step-2', presentation: 'device' },
        {
          id: 'outro',
          assetRef: '.od-inputs/05-outro.png',
          presentation: 'full',
          terminal: true,
        },
      ],
      transitions: [
        { fromSceneId: 'intro', toSceneId: 'step-1', action: { type: 'auto' } },
        {
          fromSceneId: 'step-1',
          toSceneId: 'step-2',
          action: { type: 'tap', x: 1, y: 0 },
        },
        { fromSceneId: 'step-2', toSceneId: 'outro', action: { type: 'auto' } },
      ],
    });
    expect(loanVideoProjectName(draft)).toBe('ZamLoan · How to apply');
    expect(loanVideoOutputName(draft)).toBe('zamloan-how-to-apply.mp4');
  });

  it('requires exact uploaded references for every asset role', () => {
    expect(() => buildLoanVideoStoryboard(completeDraft(), {
      intro: '.od-inputs/intro.png',
      background: '.od-inputs/background.png',
      pages: ['.od-inputs/only-one.png'],
      outro: '.od-inputs/outro.png',
    })).toThrow('one uploaded page reference per tutorial step');
  });

  it('disables narration when no scene has voiceover enabled', () => {
    const draft = completeDraft();
    draft.steps = draft.steps.map((step) => ({ ...step, voiceoverEnabled: false }));
    const storyboard = buildLoanVideoStoryboard(draft, {
      intro: '.od-inputs/01-intro.png',
      background: '.od-inputs/02-background.png',
      pages: ['.od-inputs/03-apply.png', '.od-inputs/04-details.png'],
      outro: '.od-inputs/05-outro.png',
    });

    expect(storyboard.narration).toBe(false);
  });
});
