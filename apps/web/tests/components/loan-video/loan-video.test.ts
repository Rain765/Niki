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
      },
    ],
  };
}

describe('loan video draft helpers', () => {
  it('reports missing required tutorial inputs without duplicate errors', () => {
    const draft: LoanVideoDraft = {
      ...completeDraft(),
      title: '',
      steps: [createLoanVideoStep('one'), createLoanVideoStep('two')],
    };

    expect(validateLoanVideoDraft(draft)).toEqual([
      'title-required',
      'text-required',
      'screenshot-required',
      'tap-required',
    ]);
  });

  it('requires a marked point only for non-terminal tap advances', () => {
    const draft = completeDraft();
    draft.steps[0] = { ...draft.steps[0]!, tap: null };
    expect(validateLoanVideoDraft(draft)).toContain('tap-required');

    draft.steps[0] = { ...draft.steps[0]!, advance: 'auto' };
    expect(validateLoanVideoDraft(draft)).not.toContain('tap-required');

    draft.steps[1] = { ...draft.steps[1]!, advance: 'tap', tap: null };
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
    const storyboard = buildLoanVideoStoryboard(draft, [
      '.od-inputs/01-apply.png',
      '.od-inputs/02-details.png',
    ]);

    expect(storyboard).toMatchObject({
      version: 2,
      narration: true,
      scenes: [
        {
          id: 'step-1',
          screenshotAttachmentIndex: 1,
          screenshotOriginalName: 'apply.png',
          assetRef: '.od-inputs/01-apply.png',
          text: 'Tap Apply Now',
          captionEnabled: true,
          voiceoverEnabled: true,
        },
        { id: 'step-2', terminal: true },
      ],
      transitions: [{
        fromSceneId: 'step-1',
        toSceneId: 'step-2',
        action: { type: 'tap', x: 1, y: 0 },
      }],
    });
    expect(loanVideoProjectName(draft)).toBe('ZamLoan · How to apply');
    expect(loanVideoOutputName(draft)).toBe('zamloan-how-to-apply.mp4');
  });

  it('requires one exact uploaded asset reference per scene', () => {
    expect(() => buildLoanVideoStoryboard(completeDraft(), ['.od-inputs/only-one.png']))
      .toThrow('one uploaded asset reference per scene');
  });

  it('disables narration when no scene has voiceover enabled', () => {
    const draft = completeDraft();
    draft.steps = draft.steps.map((step) => ({ ...step, voiceoverEnabled: false }));
    const storyboard = buildLoanVideoStoryboard(draft, [
      '.od-inputs/01-apply.png',
      '.od-inputs/02-details.png',
    ]);

    expect(storyboard.narration).toBe(false);
  });
});
