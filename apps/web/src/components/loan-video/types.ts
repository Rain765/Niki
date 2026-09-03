export const LOAN_VIDEO_BRANDS = ['zamloan', 'biumoney'] as const;
export type LoanVideoBrand = (typeof LOAN_VIDEO_BRANDS)[number];

export const LOAN_VIDEO_PURPOSES = [
  'anti-fraud',
  'loan-guide',
  'top-up-guide',
] as const;
export type LoanVideoPurpose = (typeof LOAN_VIDEO_PURPOSES)[number];

export const LEGACY_LOAN_VIDEO_PURPOSES = [
  'acquisition',
  'tutorial',
  'feature',
  'promotion',
  'support',
] as const;
export type LegacyLoanVideoPurpose = (typeof LEGACY_LOAN_VIDEO_PURPOSES)[number];

export function normalizeLoanVideoPurpose(value: unknown): LoanVideoPurpose | null {
  if (value === 'anti-fraud' || value === 'loan-guide' || value === 'top-up-guide') {
    return value;
  }
  if (value === 'acquisition' || value === 'tutorial') return 'loan-guide';
  return null;
}

export const LOAN_VIDEO_ASPECT_RATIOS = ['3:4', '1:1', '9:16', '16:9'] as const;
export type LoanVideoAspectRatio = (typeof LOAN_VIDEO_ASPECT_RATIOS)[number];

export const LOAN_VIDEO_DURATIONS = [15, 30, 45] as const;
export type LoanVideoDuration = (typeof LOAN_VIDEO_DURATIONS)[number];

export const LOAN_VIDEO_LANGUAGES = ['en', 'zh-CN'] as const;
export type LoanVideoLanguage = (typeof LOAN_VIDEO_LANGUAGES)[number];

export interface LoanVideoTapPoint {
  x: number;
  y: number;
}

export const LOAN_VIDEO_ADVANCE_TYPES = ['tap', 'auto', 'open-modal', 'close-modal'] as const;
export type LoanVideoAdvanceType = (typeof LOAN_VIDEO_ADVANCE_TYPES)[number];

export const LOAN_VIDEO_INTERACTION_TYPES = ['none', 'type', 'otp'] as const;
export type LoanVideoInteractionType = (typeof LOAN_VIDEO_INTERACTION_TYPES)[number];

export interface LoanVideoStepDraft {
  id: string;
  text: string;
  captionEnabled: boolean;
  voiceoverEnabled: boolean;
  screenshot: File | null;
  interaction: LoanVideoInteractionType;
  interactionText: string;
  interactionTap: LoanVideoTapPoint | null;
  advance: LoanVideoAdvanceType;
  tap: LoanVideoTapPoint | null;
}

export interface LoanVideoDraft {
  title: string;
  brand: LoanVideoBrand;
  purpose: LoanVideoPurpose;
  language: LoanVideoLanguage;
  aspectRatio: LoanVideoAspectRatio;
  durationSeconds: LoanVideoDuration;
  intro: File | null;
  background: File | null;
  outro: File | null;
  steps: LoanVideoStepDraft[];
}

export interface LoanVideoQuickOptions {
  brand: LoanVideoBrand;
  purpose: LoanVideoPurpose;
  aspectRatio: LoanVideoAspectRatio;
}

export function loanVideoPresetKey(
  brand: LoanVideoBrand,
  purpose: LoanVideoPurpose,
): string {
  return `${brand}:${purpose}`;
}

export interface LoanVideoAssetRefs {
  intro: string;
  background: string;
  pages: readonly string[];
  outro: string;
}

export type LoanVideoValidationError =
  | 'title-required'
  | 'intro-required'
  | 'background-required'
  | 'outro-required'
  | 'step-required'
  | 'text-required'
  | 'screenshot-required'
  | 'interaction-text-required'
  | 'interaction-target-required'
  | 'tap-required';
