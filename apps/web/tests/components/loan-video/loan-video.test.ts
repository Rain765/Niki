// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  buildLoanVideoPrompt,
  createLoanVideoStep,
  invalidateChangedLoanVideoTapTargets,
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
    const prompt = buildLoanVideoPrompt(draft, [
      '.od-inputs/01-apply.png',
      '.od-inputs/02-details.png',
    ]);

    expect(prompt).toContain('This brief is complete. Do not ask follow-up questions.');
    expect(prompt).toContain('"version": 2');
    expect(prompt).toContain('"id": "step-1"');
    expect(prompt).toContain('"screenshotAttachmentIndex": 1');
    expect(prompt).toContain('"screenshotOriginalName": "apply.png"');
    expect(prompt).toContain('"assetRef": ".od-inputs/01-apply.png"');
    expect(prompt).toContain('"text": "Tap Apply Now"');
    expect(prompt).toContain('"captionEnabled": true');
    expect(prompt).toContain('"voiceoverEnabled": true');
    expect(prompt).toContain('"fromSceneId": "step-1"');
    expect(prompt).toContain('"toSceneId": "step-2"');
    expect(prompt).toContain('"type": "tap"');
    expect(prompt).toContain('"x": 1');
    expect(prompt).toContain('"y": 0');
    expect(prompt).toContain('"terminal": true');
    expect(prompt).toContain('"narration": true');
    expect(loanVideoProjectName(draft)).toBe('ZamLoan · How to apply');
  });

  it('locks generation to the staged fast path without runtime installs or critique loops', () => {
    const prompt = buildLoanVideoPrompt(completeDraft(), [
      '.od-inputs/01-apply.png',
      '.od-inputs/02-details.png',
    ]);

    expect(prompt).toContain('Loan-video fast path');
    expect(prompt).toContain('.od-skills/hyperframes/scripts/build-loan-video.mjs');
    expect(prompt).toContain('.hyperframes-cache/loan-video-fast/storyboard.json');
    expect(prompt).toContain('gpt-4o-mini-tts');
    expect(prompt).toContain('Run exactly one final video generation');
    expect(prompt).toContain('--composition-dir ".hyperframes-cache/loan-video-fast"');
    expect(prompt).toContain('Do not read `SKILL.md` or any reference documentation');
    expect(prompt).toContain('Do not run critique, validation, inspection, preview, or a second render');
    expect(prompt).not.toContain('npx hyperframes');
    expect(prompt).not.toContain('pip install');
    expect(prompt).not.toContain('github.com');
  });

  it('requires one exact uploaded asset reference per scene', () => {
    expect(() => buildLoanVideoPrompt(completeDraft(), ['.od-inputs/only-one.png']))
      .toThrow('one uploaded asset reference per scene');
  });

  it('disables narration when no scene has voiceover enabled', () => {
    const draft = completeDraft();
    draft.steps = draft.steps.map((step) => ({ ...step, voiceoverEnabled: false }));
    const prompt = buildLoanVideoPrompt(draft, [
      '.od-inputs/01-apply.png',
      '.od-inputs/02-details.png',
    ]);

    expect(prompt).toContain('"narration": false');
    expect(prompt).toContain('Do not generate narration.');
  });
});
