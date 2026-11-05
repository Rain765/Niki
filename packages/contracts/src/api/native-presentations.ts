import type { PptModelBinding } from './ppt-models.js';
/** Frozen resources used by the native entry; no renderer or model policy lives here. */
export const NATIVE_PRESENTATION_RESOURCES = {
  'html-ppt': 'sha256:4c6c510e6c28f0962416689c2b91b24539a65685563c9843bcd5f9c3a5af780f',
  'guizang-ppt-skill': 'zip-sha256:386e091390b83d2d8abf737e80540eb1b767c0a70e86bd92aa88d7f6d29c451b',
} as const;

export type NativePresentationWorkflow = keyof typeof NATIVE_PRESENTATION_RESOURCES;
export const NATIVE_PRESENTATION_INSPECTOR_VERSION = '5';
export interface NativePresentationInspection {
  inspectorVersion?: string;
  version: 1;
  entry: string;
  sourceHash: string;
  resourceHashes: Record<string, string>;
  stale: boolean;
  viewport: { width: number; height: number };
  reportFile: string;
  visualReviewRequired: true;
  slides: Array<{
    page: number;
    screenshot: string;
    text: string;
    design?: { layout: string; background: string; backgroundImage: string; elements: Array<{ text: string; font: string; size: string; weight: string; color: string; x: number; y: number; width: number; height: number }> };
    issues: Array<{ kind: 'dim-text' | 'low-contrast' | 'overflow' | 'missing-image' | 'pipeline-markup' | 'text-overlap' | 'visual-review'; text: string }>;
  }>;
  blockedResources: string[];
  failedResources: string[];
}
export interface NativePresentationInspectionJob {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed';
  report?: NativePresentationInspection;
  error?: string;
}
export type NativePptxExportJob = { id: string; pages: number } & (
  | { status: 'running' }
  | { status: 'ready'; downloadUrl: string; warnings: string[] }
  | { status: 'failed'; error: string }
);
export interface NativePresentationMetadata {
  modelBinding?: PptModelBinding;
  version: 1;
  workflow: NativePresentationWorkflow;
  resourceVersion: string;
  brief: string;
  sourceFileName?: string;
  selection?: { template: string; theme: string };
}

export function nativePresentationWorkspaceUrl(projectId: string): string {
  return `/ppt-workspace?path=${encodeURIComponent(`/projects/${encodeURIComponent(projectId)}`)}`;
}

export const NATIVE_HTML_TEMPLATES = [
  'pitch-deck', 'product-launch', 'tech-sharing', 'weekly-report', 'xhs-post', 'course-module',
  'presenter-mode-reveal', 'xhs-white-editorial', 'graphify-dark-graph', 'knowledge-arch-blueprint',
  'hermes-cyber-terminal', 'obsidian-claude-gradient', 'testing-safety-alert', 'xhs-pastel-card', 'dir-key-nav-minimal',
] as const;

export const NATIVE_HTML_THEMES = ['minimal-white', 'editorial-serif', 'soft-pastel', 'sharp-mono', 'arctic-cool', 'sunset-warm', 'catppuccin-latte', 'catppuccin-mocha', 'dracula', 'tokyo-night', 'nord', 'solarized-light', 'gruvbox-dark', 'rose-pine', 'neo-brutalism', 'glassmorphism', 'bauhaus', 'swiss-grid', 'terminal-green', 'xiaohongshu-white', 'rainbow-gradient', 'aurora', 'blueprint', 'memphis-pop', 'cyberpunk-neon', 'y2k-chrome', 'retro-tv', 'japanese-minimal', 'vaporwave', 'midcentury', 'corporate-clean', 'academic-paper', 'news-broadcast', 'pitch-deck-vc', 'magazine-bold', 'engineering-whiteprint'] as const;
export const NATIVE_GUIZANG_THEMES = {
  A: ['Monocle', 'Indigo Porcelain', 'Forest Ink', 'Kraft Paper', 'Dune'],
  B: ['IKB', 'Lemon', 'Lemon Green', 'Safety Orange'],
} as const;

/** Complete decks own their CSS; generic themes only apply to freely composed decks. */
export function nativePresentationThemes(workflow: NativePresentationWorkflow, template: string): readonly string[] {
  if (workflow === 'html-ppt') return !template || template === 'custom' ? NATIVE_HTML_THEMES : [];
  return template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A : template.startsWith('B') ? NATIVE_GUIZANG_THEMES.B : [];
}

/** Return the same selection error to the UI, API and CLI. Empty values retain the native discovery flow. */
export function nativePresentationSelectionError(workflow: unknown, template: unknown, theme: unknown): string | undefined {
  if (workflow !== 'html-ppt' && workflow !== 'guizang-ppt-skill') return 'Unknown presentation workflow';
  if (typeof template !== 'string' || typeof theme !== 'string') return 'Template and theme must be strings';
  if (workflow === 'html-ppt' && template && template !== 'custom' && !NATIVE_HTML_TEMPLATES.some(id => id === template)) {
    return 'Unknown native template';
  }
  if (workflow === 'guizang-ppt-skill' && template && !/^[AB](?:$| · .+)$/.test(template)) {
    return 'Guizang template must be A or B';
  }
  if (theme && !nativePresentationThemes(workflow, template).includes(theme)) {
    return 'Unknown theme for this workflow/style';
  }
}

export const NATIVE_SAFETY_ORANGE_INK = '#0a0a0a';

export function nativePresentationDesignInstructions(workflow: NativePresentationWorkflow, template: string, theme = ''): string {
  if (workflow === 'html-ppt') {
    const start = !template ? '起点尚未选择，按原流程推荐整稿模板或自由编排，并与用户确认。'
      : template === 'custom' ? '用户选择自由编排，从 templates/deck.html 与 templates/single-page/ 按原流程组织页面。'
      : `用户选择整稿模板 templates/full-decks/${template}/index.html 及同目录 style.css。`;
    return [
      start,
      template && template !== 'custom' ? '完整保留整稿模板自带主题、字体和样式，不叠加通用主题 CSS。' : theme ? `用户选择主题 assets/themes/${theme}.css。按 references/themes.md 和 references/authoring-guide.md 应用，检查最终计算样式确实使用该主题。` : '保留原始默认主题。',
      '完整使用 html-ppt 的模板、主题、布局、图形与动效能力。背景跟随选定模板与主题的实际样式，不另加模板未提供的背景轮换规则。按原流程保留完整依赖及演讲者运行时。',
    ].join('\n');
  }
  const style = template.startsWith('A') ? 'A' : template.startsWith('B') ? 'B' : '';
  if (!style) return '按 guizang-ppt-skill 原流程先确认 A/B 风格和对应主题，再读取该风格的模板与参考文件。';
  return [
    style === 'A' ? '用户选择 Guizang A：assets/template.html、references/layouts.md、references/themes.md。'
      : '用户选择 Guizang B：assets/template-swiss.html、references/swiss-layout-lock.md、references/layouts-swiss.md、references/themes-swiss.md。',
    theme ? `选定主题：${theme}。` : '主题按所选风格原流程推荐并确认。',
    style === 'B' && theme === 'Safety Orange'
      ? `安全橙文字对比度要求：保留原有 #FF6B35 强调色及深浅背景节奏。将主题 --accent-on 设为 ${NATIVE_SAFETY_ORANGE_INK}，橙色封面、强调块和分屏上的标题、正文及标签均使用 var(--accent-on)，替换直接写死的白字。纸白背景上的强调文字使用深色正文，橙色保留用于装饰、线条和图标。保留真正深色背景上的浅色文字。逐页检查实际背景上的计算样式，确认文字对比度至少 4.5:1。`
      : '',
    '完整沿用所选风格的原规则、主题节奏、字体、版式、图片和动效流程，A/B 分别使用自己的参考文件。按原流程运行校验器，并对照原始效果参考逐页检查。',
  ].join('\n');
}
