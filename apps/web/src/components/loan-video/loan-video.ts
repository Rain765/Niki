import type {
  LoanVideoDraft,
  LoanVideoStepDraft,
  LoanVideoValidationError,
} from './types';

export const LOAN_VIDEO_SKILL_ID = 'hyperframes';
export const LOAN_VIDEO_PLUGIN_ID = 'od-media-generation';

export function createLoanVideoStep(id: string): LoanVideoStepDraft {
  return {
    id,
    caption: '',
    voiceover: '',
    screenshot: null,
    tap: null,
  };
}

export function validateLoanVideoDraft(
  draft: LoanVideoDraft,
): LoanVideoValidationError[] {
  const errors = new Set<LoanVideoValidationError>();
  if (!draft.title.trim()) errors.add('title-required');
  if (draft.steps.length === 0) errors.add('step-required');
  for (const step of draft.steps) {
    if (!step.caption.trim()) errors.add('caption-required');
    if (!step.screenshot) errors.add('screenshot-required');
  }
  return [...errors];
}

export function loanVideoBrandLabel(brand: LoanVideoDraft['brand']): string {
  return brand === 'biumoney' ? 'BiuMoney' : 'ZamLoan';
}

export function loanVideoLanguageLabel(language: LoanVideoDraft['language']): string {
  return language === 'zh-CN' ? '简体中文' : 'English';
}

export function loanVideoProjectName(draft: LoanVideoDraft): string {
  return `${loanVideoBrandLabel(draft.brand)} · ${draft.title.trim()}`;
}

export function buildLoanVideoPrompt(draft: LoanVideoDraft): string {
  const storyboard = {
    version: 1,
    title: draft.title.trim(),
    product: draft.brand,
    language: draft.language,
    aspectRatio: draft.aspectRatio,
    durationSeconds: draft.durationSeconds,
    narration: draft.narration,
    scenes: draft.steps.map((step, index) => ({
      index: index + 1,
      screenshotAttachmentIndex: index + 1,
      screenshotOriginalName: step.screenshot?.name ?? null,
      caption: step.caption.trim(),
      voiceover: (step.voiceover.trim() || step.caption.trim()),
      action: step.tap
        ? {
            type: 'tap',
            x: roundCoordinate(step.tap.x),
            y: roundCoordinate(step.tap.y),
          }
        : { type: 'none' },
    })),
  };

  return [
    `Create a polished ${draft.durationSeconds}-second ${loanVideoBrandLabel(draft.brand)} mobile-app tutorial video.`,
    '',
    'This brief is complete. Do not ask follow-up questions. Start authoring and rendering immediately.',
    'Use the HyperFrames HTML-to-MP4 workflow and produce one descriptive .mp4 in the project root.',
    'The attached screenshots are ordered exactly like the storyboard scenes. Use the real screenshots; do not redraw or replace the product UI.',
    'Keep motion restrained and readable for users on low-end Android devices: large captions, high contrast, slow taps, simple transitions, and generous safe areas.',
    'Never add lending promises, get-rich language, or unprovided financial claims.',
    draft.narration
      ? 'Generate and synchronize narration from each scene voiceover. Keep captions visible even when narration is present.'
      : 'Do not generate narration. Render captions only.',
    '',
    'Storyboard JSON:',
    '```json',
    JSON.stringify(storyboard, null, 2),
    '```',
  ].join('\n');
}

function roundCoordinate(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}
