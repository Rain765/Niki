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
}

/** IDs are local to a slide. Edges describe actual source relationships. */
export interface PresentationItem {
  id: string;
  title: string;
  body: string;
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
}
export interface PresentationDeck {
  title: string;
  slides: PresentationSlide[];
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
  status: 'generating' | 'rendering' | 'complete' | 'failed';
  sourceName: string;
  createdAt: number;
  updatedAt: number;
  options: PresentationOptions;
  deck?: PresentationDeck;
  usage?: PresentationUsage;
  error?: string;
  /** Relative project paths, served through the regular project file API. */
  pptx?: string;
  previews?: string[];
}
export type PresentationSummary = Pick<
  PresentationJob,
  'projectId' | 'status' | 'sourceName' | 'createdAt'
> & { title: string };
export interface PresentationEditRequest {
  revision: number;
  slideIndex: number;
  slide: PresentationSlide;
}
/** POST /api/presentations: multipart file + JSON options; returns PresentationJob. */
export interface PresentationListResponse {
  presentations: PresentationSummary[];
}
