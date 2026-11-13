/** Palette samples from the supplied Color Tokens reference, dark / normal / light / air. */
export const PRESENTATION_PALETTES = {
  emerald: {
    name: 'Emerald Green',
    zh: '翡翠绿',
    dark: '004D44',
    accent: '00AC97',
    light: 'DEFAF5',
    air: 'EDFAF8',
  },
  blue: {
    name: 'Blue',
    zh: '蓝色',
    dark: '001A4D',
    accent: '3491FA',
    light: 'E8F7FF',
    air: 'F2FBFF',
  },
  hermes: {
    name: 'Hermes Orange',
    zh: '爱马仕橙',
    dark: '4D0E00',
    accent: 'FE5200',
    light: 'FFF3E8',
    air: 'FEF8F1',
  },
  purple: {
    name: 'Purple',
    zh: '紫色',
    dark: '16004D',
    accent: '722ED1',
    light: 'F5E8FF',
    air: 'F9F2FF',
  },
  red: {
    name: 'Red',
    zh: '红色',
    dark: '680506',
    accent: 'E34D59',
    light: 'FDECEE',
    air: 'FDF3F4',
  },
  jade: {
    name: 'Jade Green',
    zh: '玉石绿',
    dark: '01582A',
    accent: '0AB81C',
    light: 'EBFAE3',
    air: 'F3FAF0',
  },
  orange: {
    name: 'Orange',
    zh: '橙色',
    dark: '5A1907',
    accent: 'D45A21',
    light: 'FEF3E6',
    air: 'FEF8F1',
  },
  yellow: {
    name: 'Yellow',
    zh: '黄色',
    dark: '4D2D00',
    accent: 'F7BA1E',
    light: 'FFFCE8',
    air: 'FFFEF5',
  },
  magenta: {
    name: 'Magenta',
    zh: '洋红',
    dark: '4D0034',
    accent: 'F5319D',
    light: 'FFE8F1',
    air: 'FFF2F7',
  },
  coral: {
    name: 'Orange Red',
    zh: '橘红',
    dark: '4D0005',
    accent: 'FF5F53',
    light: 'FFEDE8',
    air: 'FFF6F3',
  },
  zamred: {
    name: 'ZamRed',
    zh: 'Zam 红',
    dark: '77132E',
    accent: 'FA7268',
    light: 'FEF0E7',
    air: 'FEF6F1',
  },
} as const;

export const PRESENTATION_RATIOS = ['16:9', '4:3', '16:10'] as const;
export const PRESENTATION_PAGE_COUNTS = ['auto', 5, 10, 15, 20] as const;
export const PRESENTATION_LAYOUTS = [
  'cover',
  'overview',
  'steps',
  'timeline',
  'architecture',
  'flow',
  'comparison',
  'matrix',
  'cycle',
  'closing',
  'editorial',
  'table',
  'metrics',
] as const;
export type PresentationPalette = keyof typeof PRESENTATION_PALETTES;
export type PresentationRatio = (typeof PRESENTATION_RATIOS)[number];
export type PresentationPageCount = (typeof PRESENTATION_PAGE_COUNTS)[number];
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number];

export interface PresentationOptions {
  palette: PresentationPalette;
  ratio: PresentationRatio;
  pageCount: PresentationPageCount;
  prompt: string;
  /** Omitted on older presentations. */
  style?: 'swiss' | 'editorial';
  density?: 'complete' | 'brief';
  model?: string;
  fallbackModel?: string;
  /** Pause after generating a source-backed plan for user review. */
  reviewPlan?: boolean;
  templateFamily?: 'swiss' | 'editorial' | 'technical';
}

/** IDs are local to a slide. Edges describe actual source relationships. */
export interface PresentationItem {
  id: string;
  title: string;
  body: string;
  group?: string;
}
export interface PresentationEdge {
  from: string;
  to: string;
  label: string;
}
export interface PresentationSlide {
  title: string;
  subtitle: string;
  layout: PresentationLayout;
  items: PresentationItem[];
  edges: PresentationEdge[];
  notes: string;
  sourceRefs?: number[];
  templateId?: string;
  purpose?: string;
  factIds?: string[];
  table?: { headers: string[]; rows: string[][]; sourceId?: string };
  chart?: {
    type: 'bar' | 'line';
    labels: string[];
    values: number[];
    unit: string;
    sourceRef: number;
  };
  groups?: { id: string; title: string }[];
  image?: { assetId: string; caption: string };
}
export interface PresentationFact {
  id: string;
  sourceRef: number;
  quote: string;
  critical: boolean;
}
export interface PresentationSource {
  blocks: string[];
  facts: PresentationFact[];
  tables: {
    id: string;
    sourceRef: number;
    headers: string[];
    rows: string[][];
  }[];
  assets?: { id: string; name: string; data: string }[];
  recommendedPages: number;
  warnings: string[];
}
export interface PresentationQualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  page?: number;
  factId?: string;
}
export interface PresentationQuality {
  version: string;
  status: 'passed' | 'needs-review' | 'blocked';
  checkedAt: number;
  issues: PresentationQualityIssue[];
  facts: { total: number; candidates: number; missing: number };
  renderedPages: number;
  visualReview?: {
    model: string;
    issues: PresentationQualityIssue[];
    status: 'reviewed' | 'unavailable';
  };
  humanReview?: {
    verdict: 'accepted' | 'changes-requested';
    note: string;
    reviewedAt: number;
  };
}
export interface PresentationTemplate {
  id: string;
  name: string;
  family: 'swiss' | 'editorial' | 'technical';
  layout: PresentationLayout;
  description: string;
  reference: string;
  sample: PresentationSlide;
}
export interface PresentationDeck {
  title: string;
  slides: PresentationSlide[];
  /** Original text blocks, retained independently of generated summaries. */
  sourceBlocks?: string[];
  warnings?: string[];
}
export interface PresentationUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** Estimate in USD at recorded standard API prices; not an invoice. */
  estimatedUsd: number | null;
  pricingDate: string;
}
export interface PresentationJob {
  projectId: string;
  revision: number;
  status:
    | 'generating'
    | 'rendering'
    | 'complete'
    | 'failed'
    | 'planning'
    | 'awaiting-plan'
    | 'checking';
  sourceName: string;
  createdAt: number;
  updatedAt: number;
  options: PresentationOptions;
  deck?: PresentationDeck;
  usage?: PresentationUsage;
  error?: string;
  /** Relative project paths, served through the regular project file API. */
  pptx?: string;
  html?: string;
  previews?: string[];
  source?: PresentationSource;
  quality?: PresentationQuality;
  stage?: string;
  completedPages?: number;
  pipelineVersion?: string;
  plan?: PresentationDeck;
  pageDrafts?: Record<string, PresentationSlide>;
}
export type PresentationSummary = Pick<
  PresentationJob,
  'projectId' | 'status' | 'sourceName' | 'createdAt'
> & { title: string; qualityStatus?: PresentationQuality['status'] };
export interface PresentationEditRequest {
  revision: number;
  slideIndex: number;
  slide: PresentationSlide;
}
/** POST /api/presentations: multipart file + JSON options; returns PresentationJob. */
export interface PresentationListResponse {
  presentations: PresentationSummary[];
}
export interface PresentationActionRequest {
  action: 'continue' | 'repair' | 'check' | 'accept-review';
  revision: number;
  slideIndex?: number;
  note?: string;
  plan?: PresentationDeck;
}
export interface PresentationModelsResponse {
  models: string[];
  verified: boolean;
  message?: string;
}
export interface PresentationTemplatesResponse {
  version: string;
  templates: PresentationTemplate[];
}
