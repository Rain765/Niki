import type { LoanVideoStoryboard } from '@open-design/contracts';

import type {
  LoanVideoDraft,
  LoanVideoAssetRefs,
  LoanVideoPurpose,
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
    interaction: 'none',
    interactionText: '',
    interactionTap: null,
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
    if (step.advance === 'auto' || !step.tap) return step;
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
  if (!draft.intro) errors.add('intro-required');
  if (!draft.background) errors.add('background-required');
  if (!draft.outro) errors.add('outro-required');
  if (draft.steps.length === 0) errors.add('step-required');
  for (const step of draft.steps) {
    if ((step.captionEnabled || step.voiceoverEnabled) && !step.text.trim()) {
      errors.add('text-required');
    }
    if (!step.screenshot) errors.add('screenshot-required');
    if (step.interaction !== 'none') {
      const interactionText = step.interactionText.trim();
      if (
        !interactionText
        || (step.interaction === 'otp' && !/^\d{1,8}$/.test(interactionText))
      ) errors.add('interaction-text-required');
      if (!step.interactionTap) errors.add('interaction-target-required');
    }
    if (
      step.advance !== 'auto'
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

export function loanVideoPurposeLabel(purpose: LoanVideoPurpose): string {
  const labels: Record<LoanVideoPurpose, string> = {
    'anti-fraud': '防欺诈',
    acquisition: '引流获客',
    tutorial: '操作教学',
    feature: '新功能发布',
    promotion: '活动促销',
    support: '客服答疑',
  };
  return labels[purpose];
}

export function loanVideoProjectName(draft: LoanVideoDraft): string {
  return `${loanVideoBrandLabel(draft.brand)} · ${loanVideoPurposeLabel(draft.purpose)} · ${draft.title.trim()}`;
}

export function loanVideoOutputName(draft: LoanVideoDraft): string {
  const title = draft.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${draft.brand}-${title || 'tutorial'}.mp4`;
}

export function loanVideoPresetOutputName(
  brand: LoanVideoDraft['brand'],
  purpose: LoanVideoPurpose,
  requestId: string,
): string {
  const suffix = requestId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return `${brand}-${purpose}-${suffix || 'video'}.mp4`;
}

export function buildLoanVideoStoryboard(
  draft: LoanVideoDraft,
  assetRefs: LoanVideoAssetRefs,
): LoanVideoStoryboard {
  if (
    assetRefs.pages.length !== draft.steps.length
    || assetRefs.pages.some((assetRef) => !assetRef.trim())
  ) {
    throw new Error('Loan video generation requires one uploaded page reference per tutorial step.');
  }
  if (![assetRefs.intro, assetRefs.background, assetRefs.outro].every((ref) => ref.trim())) {
    throw new Error('Loan video generation requires uploaded intro, background, and outro references.');
  }
  const pageScenes: LoanVideoStoryboard['scenes'] = draft.steps.map((step, index) => {
    const interaction = stepInteraction(step);
    return {
      id: step.id,
      index: index + 2,
      screenshotAttachmentIndex: index + 3,
      screenshotOriginalName: step.screenshot?.name ?? null,
      assetRef: assetRefs.pages[index]!,
      text: step.text.trim(),
      captionEnabled: step.captionEnabled,
      voiceoverEnabled: step.voiceoverEnabled,
      terminal: false,
      presentation: 'device',
      ...(interaction ? { interaction } : {}),
    };
  });
  const sceneIds = ['intro', ...draft.steps.map((step) => step.id), 'outro'];
  return {
    version: 2,
    title: draft.title.trim(),
    product: draft.brand,
    language: draft.language,
    aspectRatio: draft.aspectRatio,
    durationSeconds: draft.durationSeconds,
    narration: draft.steps.some((step) => step.voiceoverEnabled),
    subtitles: draft.steps.some((step) => step.captionEnabled),
    backgroundRef: assetRefs.background,
    scenes: [
      {
        id: 'intro',
        index: 1,
        screenshotAttachmentIndex: 1,
        screenshotOriginalName: draft.intro?.name ?? null,
        assetRef: assetRefs.intro,
        text: '',
        captionEnabled: false,
        voiceoverEnabled: false,
        terminal: false,
        presentation: 'full',
      },
      ...pageScenes,
      {
        id: 'outro',
        index: draft.steps.length + 2,
        screenshotAttachmentIndex: draft.steps.length + 3,
        screenshotOriginalName: draft.outro?.name ?? null,
        assetRef: assetRefs.outro,
        text: '',
        captionEnabled: false,
        voiceoverEnabled: false,
        terminal: true,
        presentation: 'full',
      },
    ],
    transitions: sceneIds.slice(0, -1).map((sceneId, index) => ({
      fromSceneId: sceneId!,
      toSceneId: sceneIds[index + 1]!,
      action: index === 0 ? { type: 'auto' as const } : transitionAction(draft.steps[index - 1]!),
    })),
  };
}

function transitionAction(step: LoanVideoStepDraft) {
  if (step.advance === 'auto') return { type: 'auto' as const };
  if (!step.tap) {
    throw new Error(`Step ${step.id} requires a marked tap position.`);
  }
  return {
    type: step.advance,
    x: roundCoordinate(step.tap.x),
    y: roundCoordinate(step.tap.y),
    ...(step.advance === 'open-modal' || step.advance === 'close-modal'
      ? { clipTop: 0.106 }
      : {}),
  };
}

function stepInteraction(step: LoanVideoStepDraft) {
  if (step.interaction === 'none') return null;
  if (!step.interactionTap || !step.interactionText.trim()) {
    throw new Error(`Step ${step.id} requires interaction text and a marked field.`);
  }
  const text = step.interactionText.trim();
  const isOtp = step.interaction === 'otp';
  const width = isOtp ? 0.83 : 0.4;
  const height = isOtp ? 0.073 : 0.05;
  const firstCellOffset = isOtp ? width / (Math.max(1, text.length) * 2) : width / 2;
  return {
    type: step.interaction,
    start: isOtp ? 0.66 : 0.68,
    duration: isOtp ? 1.12 : 1.1,
    text,
    target: {
      x: roundCoordinate(Math.min(1 - width, Math.max(0, step.interactionTap.x - firstCellOffset))),
      y: roundCoordinate(Math.min(1 - height, Math.max(0, step.interactionTap.y - height / 2))),
      width,
      height,
    },
  };
}

function roundCoordinate(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}
