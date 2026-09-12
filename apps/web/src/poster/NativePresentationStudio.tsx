'use client';

import { nativePresentationWorkspaceUrl } from '@open-design/contracts';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, FileText, Upload, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { fetchDesignTemplates, fetchSkills } from '../providers/registry';
import { listProjects } from '../state/projects';
import type { Project, SkillSummary } from '../types';
import { PresentationStudio } from './PresentationStudio';
import { isNativePresentation, prepareNativePresentation, type NativePptBrief, type NativePptSkill } from './native-presentations';
import './native-presentation-studio.css';

const INITIAL: Record<NativePptSkill, NativePptBrief> = {
  'html-ppt': { skill: 'html-ppt', topic: '', audience: '', pages: 'auto', style: '', theme: '', duration: '' },
  'guizang-ppt-skill': { skill: 'guizang-ppt-skill', topic: '', audience: '', pages: 'auto', style: 'B · 瑞士国际主义', theme: '', duration: '' },
};
const HTML_THEMES = ['minimal-white', 'editorial-serif', 'soft-pastel', 'sharp-mono', 'arctic-cool', 'sunset-warm', 'catppuccin-latte', 'catppuccin-mocha', 'dracula', 'tokyo-night', 'nord', 'solarized-light', 'gruvbox-dark', 'rose-pine', 'neo-brutalism', 'glassmorphism', 'bauhaus', 'swiss-grid', 'terminal-green', 'xiaohongshu-white', 'rainbow-gradient', 'aurora', 'blueprint', 'memphis-pop', 'cyberpunk-neon', 'y2k-chrome', 'retro-tv', 'japanese-minimal', 'vaporwave', 'midcentury', 'corporate-clean', 'academic-paper', 'news-broadcast', 'pitch-deck-vc', 'magazine-bold', 'engineering-whiteprint'];
const FULL_DECKS = ['pitch-deck', 'product-launch', 'tech-sharing', 'weekly-report', 'xhs-post', 'course-module', 'presenter-mode-reveal', 'xhs-white-editorial', 'graphify-dark-graph', 'knowledge-arch-blueprint', 'hermes-cyber-terminal', 'obsidian-claude-gradient', 'testing-safety-alert', 'xhs-pastel-card', 'dir-key-nav-minimal'];

export function NativePresentationStudio({ onNavigationLockChange }: { onNavigationLockChange?: (locked: boolean) => void }) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [skill, setSkill] = useState<NativePptSkill>('html-ppt');
  const [drafts, setDrafts] = useState(INITIAL);
  const [files, setFiles] = useState<Partial<Record<NativePptSkill, File>>>({});
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'create' | 'history' | 'legacy' | 'workspace'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const brief = drafts[skill];
  const file = files[skill];
  const available = catalog.some((item) => item.id === skill && item.hasBody);
  const refresh = () => { void listProjects().then((items) => setProjects(items.filter(isNativePresentation))); };
  useEffect(() => {
    void Promise.all([fetchSkills(), fetchDesignTemplates()]).then(([a, b]) => setCatalog([...a, ...b]));
    refresh();
    const id = new URLSearchParams(window.location.search).get('pptProject');
    if (id) { setProjectId(id); setView('workspace'); }
  }, []);
  useEffect(() => {
    onNavigationLockChange?.(busy);
    return () => onNavigationLockChange?.(false);
  }, [busy, onNavigationLockChange]);
  const edit = (patch: Partial<NativePptBrief>) => setDrafts((old) => ({ ...old, [skill]: { ...old[skill], ...patch } }));
  const open = (id: string) => {
    setProjectId(id); setView('workspace');
    const url = new URL(window.location.href); url.searchParams.set('pptProject', id);
    window.history.replaceState(null, '', url);
  };
  const show = (next: typeof view) => {
    setView(next); refresh();
    const url = new URL(window.location.href); url.searchParams.delete('pptProject');
    window.history.replaceState(null, '', url);
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const project = await prepareNativePresentation(brief, file ?? null);
      try { window.sessionStorage.setItem(`od:auto-send-first:${project.id}`, '1'); } catch { /* The original composer still opens with the saved brief. */ }
      open(project.id); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); refresh(); }
    finally { setBusy(false); }
  };
  const themes = skill === 'html-ppt' ? HTML_THEMES : brief.style.startsWith('A')
    ? ['墨水经典 Monocle', '靛蓝瓷 Indigo Porcelain', '森林墨 Forest Ink', '牛皮纸 Kraft Paper', '沙丘 Dune']
    : ['克莱因蓝 IKB', '柠檬黄 Lemon', '柠檬绿 Lemon Green', '安全橙 Safety Orange'];
  return <section className="native-ppt" aria-label={zh ? '演示文稿工作室' : 'Presentation studio'}>
    <header className="native-ppt__nav">
      <div><span className="native-ppt__eyebrow">PRESENTATION STUDIO</span><strong>{zh ? '演示文稿' : 'Presentations'}</strong></div>
      <nav aria-label={zh ? '文稿导航' : 'Presentation navigation'}>
        <button aria-current={view === 'create' ? 'page' : undefined} onClick={() => show('create')} disabled={busy}><Plus size={16} />{zh ? '新建文稿' : 'Create'}</button>
        <button aria-current={view === 'history' ? 'page' : undefined} onClick={() => show('history')} disabled={busy}>{zh ? '我的文稿' : 'My presentations'} <span>{projects.length}</span></button>
        <button aria-current={view === 'legacy' ? 'page' : undefined} onClick={() => show('legacy')} disabled={busy}>{zh ? '旧版文稿' : 'Legacy studio'}</button>
      </nav>
    </header>
    {view === 'workspace' && projectId ? <div className="native-ppt__workspace">
      <div className="native-ppt__workspace-tools"><span>{zh ? '需求确认 → 页面设计 → 预览与修改 → 演示' : 'Brief → Design → Review → Present'}</span><a href={nativePresentationWorkspaceUrl(projectId)} target="_blank" rel="noreferrer">{zh ? '独立打开工作区' : 'Open workspace'} <ArrowUpRight size={16} /></a></div>
      <iframe title={zh ? '原生演示工作区' : 'Native presentation workspace'} src={nativePresentationWorkspaceUrl(projectId)} />
    </div> : view === 'legacy' ? <PresentationStudio onNavigationLockChange={onNavigationLockChange} /> : view === 'history' ? <div className="native-ppt__history">
      <h2>{zh ? '继续你的演示文稿' : 'Continue a presentation'}</h2>
      {!projects.length && <p>{zh ? '创建后的文稿、原始资料和对话会保存在这里。' : 'Your presentations, source files and conversations will appear here.'}</p>}
      {projects.map((project) => <button key={project.id} onClick={() => open(project.id)}><FileText size={22} /><span><strong>{project.name}</strong><small>{project.skillId === 'html-ppt' ? 'HTML PPT Studio' : 'Guizang'} · {new Date(project.updatedAt).toLocaleDateString(locale)}</small></span><ArrowRight size={18} /></button>)}
    </div> : <>
      <div className="native-ppt__intro"><span className="native-ppt__eyebrow">FROM DOCUMENT TO PRESENTATION</span><h1>{zh ? '让内容，拥有好的表达。' : 'Give your ideas a considered form.'}</h1><p>{zh ? '选一种创作方式。从原始资料出发，先对齐设计，再逐页打磨。' : 'Choose a workflow. Start with your source, agree on a direction, then refine each slide.'}</p></div>
      <div className="native-ppt__choices" role="group" aria-label={zh ? '创作方式' : 'Workflow'}>
        <button className={skill === 'html-ppt' ? 'is-selected' : ''} aria-pressed={skill === 'html-ppt'} onClick={() => setSkill('html-ppt')}>
          <span className="native-ppt__choice-index">01 / HTML PPT STUDIO</span><h2>{zh ? '从完整模板开始' : 'Start with a complete template'}</h2><p>{zh ? '报告、架构、流程、课程。用成熟的主题与版式组织复杂内容。' : 'Reports, architecture, processes and courses. Compose complex ideas with established layouts.'}</p><small>{zh ? '36 套主题 · 15 套整稿模板 · 31 种版式' : '36 themes · 15 full decks · 31 layouts'}</small>
        </button>
        <button className={skill === 'guizang-ppt-skill' ? 'is-selected' : ''} aria-pressed={skill === 'guizang-ppt-skill'} onClick={() => setSkill('guizang-ppt-skill')}>
          <span className="native-ppt__choice-index">02 / GUIZANG</span><h2>{zh ? '从鲜明的视觉叙事开始' : 'Start with a visual narrative'}</h2><p>{zh ? '电子杂志与瑞士设计。适合分享、发布和信息图表达。' : 'Editorial and Swiss design for talks, launches and visual storytelling.'}</p><small>{zh ? '2 种完整风格 · 原生演讲者模式' : '2 complete styles · Presenter mode'}</small>
        </button>
      </div>
      <div className="native-ppt__compose">
        <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <h2>{zh ? '这次想讲什么？' : 'What would you like to present?'}</h2>
          <label className="native-ppt__upload"><Upload size={24}/><strong>{file?.name ?? (zh ? '上传原始文档' : 'Upload source document')}</strong><span>{zh ? 'PDF、Word、PPTX、Markdown、文本 · 原文件完整保留' : 'PDF, Word, PPTX, Markdown, text · Original file retained'}</span><input type="file" accept=".pdf,.docx,.pptx,.md,.txt,.csv,.xlsx" onChange={(event) => setFiles((old) => ({ ...old, [skill]: event.target.files?.[0] }))} disabled={busy} /></label>
          {file && <button type="button" className="native-ppt__text-button" onClick={() => setFiles((old) => ({ ...old, [skill]: undefined }))}>{zh ? '移除文件' : 'Remove file'}</button>}
          <label>{zh ? '主题与要求' : 'Topic and requirements'}<textarea value={brief.topic} onChange={(event) => edit({ topic: event.target.value })} placeholder={zh ? '希望观众理解什么？必须保留哪些内容？也可以只上传文档，在下一步一起确认。' : 'What should the audience understand? What must be preserved?'} rows={4} /></label>
          <div className="native-ppt__fields"><label>{zh ? '受众 / 使用场景' : 'Audience / occasion'}<input value={brief.audience} onChange={(event) => edit({ audience: event.target.value })} placeholder={zh ? '例如：产品团队 · 方案评审' : 'e.g. Product team · Design review'} /></label><label>{zh ? '目标页数' : 'Target slides'}<select value={brief.pages} onChange={(event) => edit({ pages: event.target.value })}><option value="auto">{zh ? '按内容建议' : 'Recommend from content'}</option>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></div>
          <details><summary>{zh ? '风格、主题与分享时长' : 'Style, theme and talk duration'}</summary><div className="native-ppt__fields">
            <label>{zh ? '风格 / 整稿模板' : 'Style / full deck'}<select value={brief.style} onChange={(event) => edit({ style: event.target.value, theme: '' })}>{skill === 'html-ppt' ? <><option value="">{zh ? '让原流程推荐' : 'Recommend from the original catalog'}</option>{FULL_DECKS.map((name) => <option key={name}>{name}</option>)}</> : <><option>A · 电子杂志</option><option>B · 瑞士国际主义</option></>}</select></label>
            <label>{zh ? '原始主题' : 'Original theme'}<select value={brief.theme} onChange={(event) => edit({ theme: event.target.value })}><option value="">{zh ? '保留模板主题 / 推荐' : 'Keep template theme / recommend'}</option>{themes.map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>{zh ? '分享时长（分钟）' : 'Talk duration (minutes)'}<input type="number" min={1} max={240} value={brief.duration} onChange={(event) => edit({ duration: event.target.value })} placeholder={zh ? '选填' : 'Optional'} /></label>
            <p>{zh ? '画幅沿用所选原模板。需要其他比例时，可在设计确认中提出。' : 'Canvas follows the original template. Discuss a different ratio during design review.'}</p>
          </div></details>
          {!available && <p role="status">{zh ? '正在检测原始资源；资源不可用时不会切换到其他生成器。' : 'Checking original resources. An unavailable workflow will not fall back to another generator.'}</p>}
          {error && <p className="native-ppt__error" role="alert">{error}</p>}
          <button type="submit" className="native-ppt__submit" disabled={busy || !available || (!brief.topic.trim() && !file)}>{busy ? (zh ? '正在保存资料…' : 'Saving source…') : (zh ? '开始创作' : 'Start creating')}<ArrowRight size={18}/></button>
          <p className="native-ppt__fine">{zh ? '由本机执行代理运行完整流程，可在工作区选择模型。生成后可预览、逐页修改、演示并下载实际产物。' : 'A local agent runs the original workflow. Choose its model in the workspace, then preview, refine, present and download.'}</p>
        </form>
        <aside className="native-ppt__reference"><span className="native-ppt__eyebrow">THE ORIGINAL WORKFLOW</span><h2>{skill === 'html-ppt' ? 'HTML PPT Studio' : 'Guizang'}</h2>
          {skill === 'guizang-ppt-skill' && available ? <img src="/api/skills/guizang-ppt-skill/assets/ppt-skill-showcase.png" alt={zh ? 'Guizang 原作者提供的风格示例' : 'Original Guizang style showcase'} /> : <div className="native-ppt__specimen"><span>36 THEMES</span><strong>Ideas.<br/>Structure.<br/>Expression.</strong><span>15 FULL DECKS / 31 LAYOUTS</span></div>}
          <p>{skill === 'html-ppt' ? (zh ? '沿用原模板的字体、图形、布局及翻页运行时。具体设计在下一步从完整目录选择。' : 'Original typography, graphics, layouts and navigation runtime. Explore the full catalog in the next step.') : (zh ? '原作者风格展示，非本次生成结果。A/B 两套风格分别使用各自模板与主题，不混排。' : 'Original author showcase, not a generated result. Each style uses its own template and theme.')}</p>
          <ol><li>{zh ? '对齐内容、受众与视觉方向' : 'Agree on content, audience and visual direction'}</li><li>{zh ? '按原流程组织页面并生成' : 'Plan and author through the original workflow'}</li><li>{zh ? '预览检查，保留完整演示能力' : 'Review with the complete presentation runtime'}</li></ol>
          <div className="native-ppt__format"><strong>HTML</strong><span>{zh ? '原生演示稿 · 字体 / 动效 / 演讲者模式' : 'Native deck · Typography / motion / presenter mode'}</span></div>
        </aside>
      </div>
    </>}
  </section>;
}
