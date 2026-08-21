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
