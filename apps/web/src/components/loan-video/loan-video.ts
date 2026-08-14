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
    text: '',
    captionEnabled: true,
    voiceoverEnabled: true,
    screenshot: null,
    advance: 'tap',
    tap: null,
  };
}

export function invalidateChangedLoanVideoTapTargets(
  previousSteps: readonly LoanVideoStepDraft[],
  nextSteps: readonly LoanVideoStepDraft[],
): LoanVideoStepDraft[] {
  const previousTargetBySource = new Map(previousSteps.map((step, index) => [
    step.id,
    previousSteps[index + 1]?.id ?? null,
  ]));

  return nextSteps.map((step, index) => {
    if (step.advance !== 'tap' || !step.tap) return step;
    const nextTargetId = nextSteps[index + 1]?.id ?? null;
    const targetChanged = !previousTargetBySource.has(step.id)
      || previousTargetBySource.get(step.id) !== nextTargetId;
    return targetChanged ? { ...step, tap: null } : step;
  });
}

export function validateLoanVideoDraft(
  draft: LoanVideoDraft,
): LoanVideoValidationError[] {
  const errors = new Set<LoanVideoValidationError>();
  if (!draft.title.trim()) errors.add('title-required');
  if (draft.steps.length === 0) errors.add('step-required');
  for (const [index, step] of draft.steps.entries()) {
    if ((step.captionEnabled || step.voiceoverEnabled) && !step.text.trim()) {
      errors.add('text-required');
    }
    if (!step.screenshot) errors.add('screenshot-required');
    if (
      index < draft.steps.length - 1
      && step.advance === 'tap'
      && !step.tap
    ) {
      errors.add('tap-required');
    }
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

export function buildLoanVideoPrompt(
  draft: LoanVideoDraft,
  assetRefs: readonly string[],
): string {
  if (
    assetRefs.length !== draft.steps.length
    || assetRefs.some((assetRef) => !assetRef.trim())
  ) {
    throw new Error('Loan video generation requires one uploaded asset reference per scene.');
  }
  const compositionDir = '.hyperframes-cache/loan-video-fast';
  const storyboardPath = `${compositionDir}/storyboard.json`;
  const outputName = `${draft.brand}-tutorial.mp4`;
  const narration = draft.steps.some((step) => step.voiceoverEnabled);
  const storyboard = {
    version: 2,
    title: draft.title.trim(),
    product: draft.brand,
    language: draft.language,
    aspectRatio: draft.aspectRatio,
    durationSeconds: draft.durationSeconds,
    narration,
    scenes: draft.steps.map((step, index) => ({
      id: step.id,
      index: index + 1,
      screenshotAttachmentIndex: index + 1,
      screenshotOriginalName: step.screenshot?.name ?? null,
      assetRef: assetRefs[index]!,
      text: step.text.trim(),
      captionEnabled: step.captionEnabled,
      voiceoverEnabled: step.voiceoverEnabled,
      terminal: index === draft.steps.length - 1,
    })),
    transitions: draft.steps.slice(0, -1).map((step, index) => ({
      fromSceneId: step.id,
      toSceneId: draft.steps[index + 1]!.id,
      action: transitionAction(step),
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
    'Use only the staged fixed builder plus the daemon media wrapper commands shown below. Every storyboard scene has an exact uploaded `assetRef`; use that binding and never sort, redraw, replace, or guess product UI.',
    '',
    `1. Copy the Storyboard JSON block below verbatim to \`${storyboardPath}\`. This is data entry, not a planning step; do not rewrite or expand it.`,
    '2. Run the fixed builder exactly once:',
    '```bash',
    `"$OD_NODE_BIN" ".od-skills/hyperframes/scripts/build-loan-video.mjs" --storyboard "${storyboardPath}"`,
    '```',
    'The builder creates a complete fixed HyperFrames composition from the real uploaded screenshots. It calls the daemon `gpt-4o-mini-tts` model once for each scene whose `voiceoverEnabled` value is true, then schedules every real MP3 at that scene. If any TTS call fails, report the error and stop; never install or use a local fallback.',
    '3. Run exactly one final video generation:',
    '```bash',
    `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --output "${outputName}" --composition-dir "${compositionDir}"`,
    '```',
    'If the final stdout JSON contains a `taskId` instead of `file`, continue only with `"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <nextSince>` until it returns the file or a terminal error. A queued handoff is not completion.',
    '4. After the MP4 exists, reply with its filename and stop.',
    '',
    'Do not run critique, validation, inspection, preview, or a second render. Do not create a live artifact or expose cache/source files as deliverables.',
    '',
    'Resolve every scene through its exact `assetRef`. Use the real screenshots; do not redraw or replace the product UI.',
    'Keep motion lively but readable on low-end Android devices: image-adaptive backgrounds, focused tap motion, quick simple transitions, and subtle one-line captions in the bottom safe area.',
    'Never add lending promises, get-rich language, or unprovided financial claims.',
    narration
      ? 'Narrate only scenes whose `voiceoverEnabled` value is true, using that scene\'s `text` verbatim. Show the one-line caption only when `captionEnabled` is true.'
      : 'Do not generate narration. Show the one-line caption only for scenes whose `captionEnabled` value is true.',
    '',
    'Storyboard JSON:',
    '```json',
    JSON.stringify(storyboard, null, 2),
    '```',
  ].join('\n');
}

function transitionAction(step: LoanVideoStepDraft) {
  if (step.advance === 'auto') return { type: 'auto' as const };
  if (!step.tap) {
    throw new Error(`Step ${step.id} requires a marked tap position.`);
  }
  return {
    type: 'tap' as const,
    x: roundCoordinate(step.tap.x),
    y: roundCoordinate(step.tap.y),
  };
}

function roundCoordinate(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}
