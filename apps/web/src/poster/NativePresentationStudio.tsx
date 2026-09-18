'use client';

import { nativePresentationWorkspaceUrl } from '@open-design/contracts';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, ArrowRight, FileText, Upload } from 'lucide-react';
import { useI18n } from '../i18n';
import { fetchDesignTemplates, fetchSkills } from '../providers/registry';
import { listProjects } from '../state/projects';
import type { Project, SkillSummary } from '../types';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';
import { NativeTemplatePicker, NativeTemplatePreview } from './NativeTemplatePicker';
import { isNativePresentation, prepareNativePresentation, type NativePptBrief, type NativePptSkill } from './native-presentations';
import './native-presentation-studio.css';

const INITIAL: Record<NativePptSkill, NativePptBrief> = {
  'html-ppt': { skill: 'html-ppt', topic: '', audience: '', pages: 'auto', style: '', theme: '', duration: '' },
  'guizang-ppt-skill': { skill: 'guizang-ppt-skill', topic: '', audience: '', pages: 'auto', style: '', theme: '', duration: '' },
};
export function NativePresentationStudio({ onNavigationLockChange }: { onNavigationLockChange?: (locked: boolean) => void }) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [skill, setSkill] = useState<NativePptSkill>('html-ppt');
  const [drafts, setDrafts] = useState(INITIAL);
  const [files, setFiles] = useState<Partial<Record<NativePptSkill, File>>>({});
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'create' | 'history' | 'workspace'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const brief = drafts[skill];
  const file = files[skill];
  const available = catalog.some((item) => item.id === skill && item.hasBody);
  const refresh = () => { void listProjects().then((items) => setProjects(items.filter(isNativePresentation))); };
  useEffect(() => {
    void Promise.all([fetchSkills(), fetchDesignTemplates()]).then(([a, b]) => setCatalog([...a, ...b]));
    refresh();
    const query = new URLSearchParams(window.location.search);
    const flow = query.get('pptWorkflow');
    if (flow === 'html-ppt' || flow === 'guizang-ppt-skill') setSkill(flow);
    const id = query.get('pptProject');
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
  const switchWorkflow = (next: NativePptSkill) => {
    setSkill(next);
    const url = new URL(window.location.href); url.searchParams.set('pptWorkflow', next);
    window.history.replaceState(null, '', url);
  };
  const tabKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
  };
  return <section className="native-ppt" aria-label={zh ? '演示文稿工作室' : 'Presentation studio'}>
    <header className="native-ppt__nav">
      <nav role="tablist" onKeyDown={tabKeys} aria-label={zh ? '文稿导航' : 'Presentation navigation'}>
        <button role="tab" tabIndex={view === 'create' ? 0 : -1} aria-selected={view === 'create'} onClick={() => show('create')} disabled={busy}>{zh ? '新建文稿' : 'Create'}</button>
        <button role="tab" tabIndex={view !== 'create' ? 0 : -1} aria-selected={view === 'history' || view === 'workspace'} onClick={() => show('history')} disabled={busy}>{zh ? '我的文稿' : 'My presentations'} <span>{projects.length}</span></button>
      </nav>
    </header>
    {view === 'workspace' && projectId ? <div className="native-ppt__workspace">
      <div className="native-ppt__workspace-tools"><a href={nativePresentationWorkspaceUrl(projectId)} target="_blank" rel="noreferrer">{zh ? '独立打开工作区' : 'Open workspace'} <ArrowUpRight size={16} /></a></div>
      <iframe title={zh ? '原生演示工作区' : 'Native presentation workspace'} src={nativePresentationWorkspaceUrl(projectId)} />
    </div> : view === 'history' ? <div className="native-ppt__history">
      {!projects.length && <p>{zh ? '暂无文稿' : 'No presentations yet'}</p>}
      {projects.map((project) => <button key={project.id} onClick={() => open(project.id)}><FileText size={22} /><span><strong>{project.name}</strong><small>{project.skillId === 'html-ppt' ? (zh ? '模板创作' : 'Template creation') : (zh ? '设计创作' : 'Design creation')} · {new Date(project.updatedAt).toLocaleDateString(locale)}</small></span><ArrowRight size={18} /></button>)}
    </div> : <form className="native-ppt__form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <section className="native-ppt__filters od-generation-toolbar od-filter-grid" aria-label={zh ? '创作筛选' : 'Creation settings'}>
        <SelectField className="od-filter-grid__item" label={zh ? '创作方式' : 'Creation mode'} value={skill} disabled={busy} onChange={value => switchWorkflow(value as NativePptSkill)} options={[
          {value:'html-ppt',label:zh ? '模板创作' : 'Template creation'},
          {value:'guizang-ppt-skill',label:zh ? '设计创作' : 'Design creation'},
        ]} />
        <NativeTemplatePicker workflow={skill} template={brief.style} theme={brief.theme} disabled={busy} onChange={(style, theme) => edit({ style, theme })} />
        <SelectField className="od-filter-grid__item" label={zh ? '目标页数' : 'Target slides'} value={brief.pages} disabled={busy} onChange={pages => edit({pages})} options={[{value:'auto',label:zh ? '按内容建议' : 'Recommend from content'}, ...[5,10,15,20].map(n=>({value:String(n),label:String(n)}))]} />
        <label className="od-field od-filter-grid__item"><span className="od-field__label">{zh ? '受众 / 场景' : 'Audience / occasion'}</span><input className="od-control-input" value={brief.audience} disabled={busy} onChange={event => edit({audience:event.target.value})} placeholder={zh ? '如：产品团队' : 'e.g. Product team'} /></label>
        <label className="od-field od-filter-grid__item"><span className="od-field__label">{zh ? '分享时长（分钟）' : 'Duration (minutes)'}</span><input className="od-control-input" type="number" min={1} max={240} value={brief.duration} disabled={busy} onChange={event => edit({duration:event.target.value})} placeholder={zh ? '选填' : 'Optional'} /></label>
      </section>
      <section className="native-ppt__generation" aria-label={zh ? '生成区' : 'Creation area'}>
        <div className="native-ppt__source">
          <div className="native-ppt__upload-row">
            <label className="native-ppt__upload">
              <Upload size={20} aria-hidden="true" />
              <span className="native-ppt__upload-copy"><strong title={file?.name}>{file?.name ?? (zh ? '上传文档' : 'Upload document')}</strong><small>{file ? (zh ? '点击替换' : 'Click to replace') : 'PDF / Word / PPTX / Markdown / TXT / CSV / Excel'}</small></span>
              <input key={`${skill}:${file?.name ?? 'empty'}`} aria-label={zh ? '上传文档' : 'Upload document'} type="file" accept=".pdf,.docx,.pptx,.md,.txt,.csv,.xlsx" onChange={event => { const selected = event.target.files?.[0]; if (selected) setFiles(old => ({...old,[skill]:selected})); }} disabled={busy} />
            </label>
            {file && <Button size="compact" variant="ghost" disabled={busy} onClick={() => setFiles(old => ({...old,[skill]:undefined}))}>{zh ? '移除' : 'Remove'}</Button>}
          </div>
          <label className="od-field native-ppt__topic"><span className="od-field__label">{zh ? '主题与要求' : 'Topic and requirements'}</span><textarea value={brief.topic} disabled={busy} onChange={event => edit({topic:event.target.value})} placeholder={zh ? '填写主题或补充要求，也可以只上传文档' : 'Enter a topic or requirements, or upload a document'} rows={3} /></label>
        </div>
        <NativeTemplatePreview workflow={skill} template={brief.style} theme={brief.theme} />
        <div className="native-ppt__generation-actions">
          <div>{!available && <p role="status">{zh ? '模板资源尚未就绪' : 'Template resources unavailable'}</p>}{error && <p className="native-ppt__error" role="alert">{error}</p>}</div>
          <Button type="submit" variant="primary" loading={busy} disabled={!available || (!brief.topic.trim() && !file)}>{busy ? (zh ? '正在保存资料…' : 'Saving source…') : (zh ? '开始创作' : 'Start creating')}<ArrowRight size={18} /></Button>
        </div>
      </section>
    </form>}
  </section>;
}
