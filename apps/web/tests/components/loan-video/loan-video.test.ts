// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  buildLoanVideoPrompt,
  createLoanVideoStep,
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
    narration: true,
    steps: [{
      ...createLoanVideoStep('step-1'),
      screenshot: new File(['screen'], 'apply.png', { type: 'image/png' }),
      caption: 'Tap Apply Now',
      voiceover: 'Tap Apply Now to begin.',
      tap: { x: 1.2, y: -0.1 },
    }],
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
      'caption-required',
      'screenshot-required',
    ]);
  });

  it('builds a deterministic storyboard prompt with clamped tap coordinates', () => {
    const draft = completeDraft();
    const prompt = buildLoanVideoPrompt(draft);

    expect(prompt).toContain('This brief is complete. Do not ask follow-up questions.');
    expect(prompt).toContain('"screenshotAttachmentIndex": 1');
    expect(prompt).toContain('"screenshotOriginalName": "apply.png"');
    expect(prompt).toContain('"x": 1');
    expect(prompt).toContain('"y": 0');
    expect(prompt).toContain('"voiceover": "Tap Apply Now to begin."');
    expect(loanVideoProjectName(draft)).toBe('ZamLoan · How to apply');
  });
});
