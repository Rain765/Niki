/** Frozen resources used by the native entry; no renderer or model policy lives here. */
export const NATIVE_PRESENTATION_RESOURCES = {
  'html-ppt': 'sha256:4c6c510e6c28f0962416689c2b91b24539a65685563c9843bcd5f9c3a5af780f',
  'guizang-ppt-skill': 'zip-sha256:386e091390b83d2d8abf737e80540eb1b767c0a70e86bd92aa88d7f6d29c451b',
} as const;

export type NativePresentationWorkflow = keyof typeof NATIVE_PRESENTATION_RESOURCES;
export interface NativePresentationMetadata {
  version: 1;
  workflow: NativePresentationWorkflow;
  resourceVersion: string;
  brief: string;
  sourceFileName?: string;
}

export function nativePresentationWorkspaceUrl(projectId: string): string {
  return `/ppt-workspace?path=${encodeURIComponent(`/projects/${encodeURIComponent(projectId)}`)}`;
}

export const NATIVE_HTML_TEMPLATES = [
  'pitch-deck', 'product-launch', 'tech-sharing', 'weekly-report', 'xhs-post', 'course-module',
  'presenter-mode-reveal', 'xhs-white-editorial', 'graphify-dark-graph', 'knowledge-arch-blueprint',
  'hermes-cyber-terminal', 'obsidian-claude-gradient', 'testing-safety-alert', 'xhs-pastel-card', 'dir-key-nav-minimal',
] as const;

export function nativePresentationDesignInstructions(workflow: NativePresentationWorkflow, template: string): string {
  const origin = workflow === 'html-ppt'
    ? `templates/full-decks/${template || 'weekly-report'}/index.html 及同目录 style.css`
    : template.startsWith('A') ? 'assets/template.html 和 references/layouts.md' : 'assets/template-swiss.html 和 references/layouts-swiss.md';
  return [
    `用户选定的原模板：${origin}。先完整读取并复制原模板和依赖，再替换内容；保持原有网格、字号层级、组件和运行脚本，不另写一套样式。`,
    '严格沿用原 Skill 的深浅背景节奏、主题 token 和版式规则，不统一背景、不另造视觉规范。浅底与深底下的正文、标题、注释颜色必须分别使用原模板配套的 token；遇到文字不清晰，修正文案颜色、透明度和字号，不改变背景节奏。',
    '内容按原版式容量拆页，不删减重要事实、表格或限制条件，不压缩正文到难以阅读。输出前逐页检查文字和背景配对、字号、溢出、图形关系及页码。以原模板的文字层级和配色为准；没有实际渲染检查时不得声称已通过。',
    '保留 HTML 可编辑文字、表格和 SVG 图形，不把整页转成图片。后续修改只改指定页面的内容或样式，保留未指定页面、主题及原运行时。',
  ].join('\n');
}
