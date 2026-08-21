import type { CreateProjectRequest } from './projects.js';

export type LogoArchitecture = 'symbol' | 'wordmark' | 'combination' | 'monogram';

export interface LogoBriefRequest {
  brandName: string;
  industry: string;
  audience?: string;
  personality?: string[];
  architecture?: LogoArchitecture;
  palette?: string[];
  applications?: string[];
  avoid?: string[];
  notes?: string;
}

export interface NormalizedLogoBrief {
  brandName: string;
  industry: string;
  audience: string;
  personality: string[];
  architecture: LogoArchitecture;
  palette: string[];
  applications: string[];
  avoid: string[];
  notes: string;
}

export interface LogoBriefResponse {
  brief: NormalizedLogoBrief;
  project: CreateProjectRequest;
}

export type LogoDirection = 1 | 2 | 3 | 4;

export type LogoFinalizationStatus =
  | 'prepared'
  | 'queued'
  | 'running'
  | 'complete'
  | 'failed';

export interface LogoFinalizeRequest {
  projectId: string;
  direction: LogoDirection;
  notes?: string;
}

/**
 * One durable refinement request. Outputs live below a unique root so a
 * second refinement never overwrites a previously generated brand kit.
 */
export interface LogoFinalization {
  id: string;
  projectId: string;
  conversationId: string;
  clientRequestId: string;
  direction: LogoDirection;
  sourceFile: string;
  outputRoot: string;
  expectedOutputs: string[];
  outputFiles: string[];
  status: LogoFinalizationStatus;
  requestedAt: number;
  notes: string;
  prompt: string;
  archiveUrl?: string;
  error?: string;
}

export interface LogoFinalizeResponse {
  finalization: LogoFinalization;
  prompt: string;
}

export interface LogoFinalizationsResponse {
  finalizations: LogoFinalization[];
}
