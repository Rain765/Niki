import type { ProjectFile } from './files.js';
import type { MediaAspect, Project } from './projects.js';

export type MediaTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'interrupted';
export type PosterCopyStyle = 'standard' | 'anti-fraud' | 'anti-fraud-message';

export interface LoanVideoTapAction {
  type: 'tap';
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface LoanVideoAutoAction {
  type: 'auto';
}

export interface LoanVideoModalAction {
  type: 'open-modal' | 'close-modal';
  x: number;
  y: number;
  width?: number;
  height?: number;
  clipTop?: number;
}

export interface LoanVideoSceneInteraction {
  type: 'type' | 'keypad' | 'otp';
  start: number;
  duration: number;
  text: string;
  target: LoanVideoFocusTarget;
}

export interface LoanVideoStoryboardScene {
  id: string;
  index: number;
  screenshotAttachmentIndex: number;
  screenshotOriginalName: string | null;
  assetRef: string;
  text: string;
  captionEnabled: boolean;
  voiceoverEnabled: boolean;
  terminal: boolean;
  presentation?: 'full' | 'device';
  focusTargets?: LoanVideoFocusTarget[];
  interaction?: LoanVideoSceneInteraction;
}

export interface LoanVideoFocusTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LoanVideoStoryboardTransition {
  fromSceneId: string;
  toSceneId: string;
  action: LoanVideoTapAction | LoanVideoAutoAction | LoanVideoModalAction;
}

export interface LoanVideoStoryboard {
  version: 2;
  title: string;
  product: 'zamloan' | 'biumoney';
  language: 'en' | 'zh-CN';
  aspectRatio: MediaAspect;
  durationSeconds: number;
  narration: boolean;
  subtitles: boolean;
  backgroundRef?: string;
  scenes: LoanVideoStoryboardScene[];
  transitions: LoanVideoStoryboardTransition[];
}

export interface MediaGenerationRequest {
  /** Continue local processing of this project's saved poster; no provider call. */
  resumeTaskId?: string;
  clientRequestId?: string;
  surface: 'image' | 'video' | 'audio';
  model: string;
  prompt?: string;
  output?: string;
  aspect?: MediaAspect;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  length?: number;
  duration?: number;
  voice?: string;
  audioKind?: 'music' | 'speech' | 'sfx';
  compositionDir?: string;
  image?: string;
  overlayZ?: string;
  overlayLogo?: string;
  overlayLogoAnchor?: 'left' | 'right';
  overlayPhoneScreen?: string;
  foregroundPrompt?: string;
  posterHeadline?: string;
  posterSubtitle?: string;
  posterTextAnchor?: 'left' | 'right';
  posterCopyStyle?: PosterCopyStyle;
  language?: string;
  loanVideoStoryboard?: LoanVideoStoryboard;
}

export interface MediaTaskAcceptedResponse {
  taskId: string;
  status: MediaTaskStatus;
  startedAt: number;
  idempotentReplay?: boolean;
}

export interface MediaTaskFile {
  name: string;
  size: number;
  mtime: number;
  kind: string;
  mime: string;
  model: string;
  surface: string;
  providerNote: string;
  providerId: string;
  providerError?: string | null;
  usedStubFallback?: boolean;
  intentionalStub?: boolean;
  warnings?: string[];
}

export interface MediaTaskError {
  message: string;
  status?: number;
  code?: string;
}

/** Stable markers carried by the existing task progress stream (UI and CLI). */
export const IMAGE_GENERATION_PROGRESS = {
  preflight: 'image:preflight',
  localRetry: 'image:local-retry',
  handReview: 'image:hand-review',
  generating: 'image:generating',
  correcting: 'image:correcting',
  resumed: 'image:resumed',
  slow: 'image:slow',
  retrying: 'image:retrying',
  processing: 'image:processing',
} as const;

export interface MediaTaskSnapshot {
  taskId: string;
  status: MediaTaskStatus;
  startedAt: number;
  endedAt?: number | null;
  progress: string[];
  nextSince: number;
  file?: MediaTaskFile;
  error?: MediaTaskError;
}

export interface ProjectMediaTaskSummary extends MediaTaskSnapshot {
  elapsed: number;
  surface?: string;
  model?: string;
  progressCount: number;
}

export interface ProjectMediaTasksResponse {
  tasks: ProjectMediaTaskSummary[];
}

/**
 * One-round-trip restoration payload for Niki's tutorial-video workspace.
 * Project selection, output discovery, and task lookup happen together in
 * the local daemon so remote clients do not pay several serial network hops.
 */
export interface LoanVideoRestoreResponse {
  configuredPresetKeys: string[];
  files: ProjectFile[];
  project: Project | null;
  task: ProjectMediaTaskSummary | null;
}
