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

export interface LoanVideoStepDraft {
  id: string;
  caption: string;
  voiceover: string;
  screenshot: File | null;
  tap: LoanVideoTapPoint | null;
}

export interface LoanVideoDraft {
  title: string;
  brand: LoanVideoBrand;
  language: LoanVideoLanguage;
  aspectRatio: LoanVideoAspectRatio;
  durationSeconds: LoanVideoDuration;
  narration: boolean;
  steps: LoanVideoStepDraft[];
}

export type LoanVideoValidationError =
  | 'title-required'
  | 'step-required'
  | 'caption-required'
  | 'screenshot-required';
