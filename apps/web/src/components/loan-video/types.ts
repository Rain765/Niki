export const LOAN_VIDEO_BRANDS = ['zamloan', 'biumoney'] as const;
export type LoanVideoBrand = (typeof LOAN_VIDEO_BRANDS)[number];

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
  language: LoanVideoLanguage;
  aspectRatio: LoanVideoAspectRatio;
  durationSeconds: LoanVideoDuration;
  intro: File | null;
  background: File | null;
  outro: File | null;
  steps: LoanVideoStepDraft[];
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
