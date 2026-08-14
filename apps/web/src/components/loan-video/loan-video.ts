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
  const compositionDir = '.hyperframes-cache/loan-video-fast';
  const storyboardPath = `${compositionDir}/storyboard.json`;
  const outputName = `${draft.brand}-tutorial.mp4`;
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
    '## Loan-video fast path',
    '',
    'This brief is complete. Do not ask follow-up questions. These instructions override the generic HyperFrames authoring workflow and the media scenario pipeline for this request.',
    'Do not read `SKILL.md` or any reference documentation. Do not browse package docs, GitHub, or the repository.',
    'Do not invoke safe-task or use TodoWrite. Do not run npx, npm, pnpm, git, Python, pip, curl, wget, or any installer. Do not author composition HTML from scratch.',
    'Use only the staged fixed builder plus the daemon media wrapper commands shown below. The builder uses the uploaded screenshots in their exact attachment order; never redraw, replace, or guess product UI.',
    '',
    `1. Copy the Storyboard JSON block below verbatim to \`${storyboardPath}\`. This is data entry, not a planning step; do not rewrite or expand it.`,
    '2. Run the fixed builder exactly once:',
    '```bash',
    `"$OD_NODE_BIN" ".od-skills/hyperframes/scripts/build-loan-video.mjs" --storyboard "${storyboardPath}"`,
    '```',
    'The builder creates a complete fixed HyperFrames composition from the real uploaded screenshots. When `narration` is true it calls the daemon `gpt-4o-mini-tts` model exactly once and embeds the real MP3. If that TTS call fails, report the error and stop; never install or use a local fallback.',
    '3. Run exactly one final video generation:',
    '```bash',
    `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --output "${outputName}" --composition-dir "${compositionDir}"`,
    '```',
    'If the final stdout JSON contains a `taskId` instead of `file`, continue only with `"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <nextSince>` until it returns the file or a terminal error. A queued handoff is not completion.',
    '4. After the MP4 exists, reply with its filename and stop.',
    '',
    'Do not run critique, validation, inspection, preview, or a second render. Do not create a live artifact or expose cache/source files as deliverables.',
    '',
    'The attached screenshots are ordered exactly like the storyboard scenes. Use the real screenshots; do not redraw or replace the product UI.',
    'Keep motion restrained and readable for users on low-end Android devices: large captions, high contrast, slow taps, simple transitions, and generous safe areas.',
    'Never add lending promises, get-rich language, or unprovided financial claims.',
    draft.narration
      ? 'Use the builder-provided daemon narration and keep captions visible while it plays.'
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
