'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { nativePresentationSelectionError } from '@open-design/contracts';
import { ArrowLeft, FileText, Paperclip, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { fetchDesignTemplates, fetchSkills } from '../providers/registry';
import { listProjects } from '../state/projects';
import type { Project, SkillSummary } from '../types';
import { Button, IconButton } from '../components/Button';
import { SelectField } from '../components/SelectField';
import { NativePresentationResult } from './NativePresentationResult';
import { NativePresentationProgress } from './NativePresentationProgress';
import { NativeTemplatePicker } from './NativeTemplatePicker';
import { isNativePresentation, prepareNativePresentation, type NativePptBrief, type NativePptSkill } from './native-presentations';
import './native-presentation-studio.css';

const SLIDE_COUNTS = ['5', '10', '15', '20'];

const INITIAL: Record<NativePptSkill, NativePptBrief> = {
  'html-ppt': { skill: 'html-ppt', topic: '', audience: '', pages: 'auto', style: 'xhs-white-editorial', theme: '', duration: '' },
  'guizang-ppt-skill': { skill: 'guizang-ppt-skill', topic: '', audience: '', pages: 'auto', style: 'A · 电子杂志', theme: 'Monocle', duration: '' },
};
export function NativePresentationStudio({ onNavigationLockChange }: { onNavigationLockChange?: (locked: boolean) => void }) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [brief, setBrief] = useState<NativePptBrief>(INITIAL['html-ppt']);
  const [file, setFile] = useState<File>();
  const skill = brief.skill;
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'latest' | 'history'>('latest');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState<{ startedAt: number; phase?: 'preparing' | 'uploading'; projectId?: string } | null>(null);
  const busy = Boolean(request?.phase);
  const [error, setError] = useState('');
  const available = catalog.some((item) => item.id === skill && item.hasBody);
  const refresh = () => { void listProjects().then((items) => { const decks = items.filter(isNativePresentation).sort((a,b) => b.updatedAt - a.updatedAt); setProjects(decks); setProjectId(current => current ?? decks[0]?.id ?? null); }); };
  useEffect(() => {
    void Promise.all([fetchSkills(), fetchDesignTemplates()]).then(([a, b]) => setCatalog([...a, ...b]));
    refresh();
    const query = new URLSearchParams(window.location.search);
    const flow = query.get('pptWorkflow');
    if (flow === 'html-ppt' || flow === 'guizang-ppt-skill') {
      const defaults = INITIAL[flow];
      const style = query.get('pptTemplate') || defaults.style;
      const theme = query.get('pptTheme') ?? defaults.theme;
      setBrief(nativePresentationSelectionError(flow, style, theme) ? defaults : { ...defaults, style, theme });
    }
    const pages = query.get('pptPages');
    if (pages && SLIDE_COUNTS.includes(pages)) setBrief(current => ({ ...current, pages }));
    const id = query.get('pptProject');
    if (id) { setProjectId(id); setView('latest'); }
  }, []);
  useEffect(() => {
    onNavigationLockChange?.(busy);
    return () => onNavigationLockChange?.(false);
  }, [busy, onNavigationLockChange]);
  const edit = (patch: Partial<NativePptBrief>) => setBrief(old => ({ ...old, ...patch }));
  const open = (id: string) => {
    setProjectId(id); setView('latest');
    const url = new URL(window.location.href); url.searchParams.set('pptProject', id);
    window.history.replaceState(null, '', url);
  };
  const show = (next: typeof view) => {
    setView(next); refresh();
  };
  const create = async () => {
    if (busy) return;
    const startedAt = Date.now();
    setRequest({ startedAt, phase: 'preparing' }); setError(''); setView('latest');
    results.current?.scrollIntoView?.({behavior:'smooth',block:'start'});
    try {
      const project = await prepareNativePresentation(brief, file ?? null, () => setRequest({ startedAt, phase: 'uploading' }));
      try { window.sessionStorage.setItem(`od:auto-send-first:${project.id}`, '1'); } catch { /* The original composer still opens with the saved brief. */ }
      setRequest({ startedAt, projectId: project.id }); open(project.id); refresh();
    } catch (err) { setRequest(null); setError(err instanceof Error ? err.message : String(err)); refresh(); }
  };
  const selectTemplate = (next: NativePptSkill, style: string, theme: string) => {
    edit({skill:next, style, theme});
    const url = new URL(window.location.href);
    url.searchParams.set('pptWorkflow', next);
    url.searchParams.set('pptTemplate', style);
    url.searchParams.set('pptTheme', theme);
    window.history.replaceState(null, '', url);
  };
  const selectPages = (pages: string) => {
    edit({ pages });
    const url = new URL(window.location.href);
    url.searchParams.set('pptPages', pages);
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
    <form className="native-ppt__form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <section className="native-ppt__filters od-generation-toolbar" aria-label={zh ? '创作筛选' : 'Creation settings'}>
        <div className="native-ppt__source od-field">
          <label className="od-field__label" htmlFor="ppt-creation-content">{zh ? '创作内容' : 'Content'}</label>
          <div className="native-ppt__composer">
            <label className="native-ppt__upload" title={zh ? '添加或替换文档 · PDF / Word / PPTX / Markdown / TXT / CSV / Excel' : 'Add or replace a document'}>
              <Paperclip size={16} aria-hidden="true" />
              <input key={`${skill}:${file?.name ?? 'empty'}`} aria-label={zh ? '添加文档' : 'Add document'} type="file" accept=".pdf,.docx,.pptx,.md,.txt,.csv,.xlsx" onChange={event => { const selected = event.target.files?.[0]; if (selected) setFile(selected); }} disabled={busy} />
            </label>
            <input type="text" id="ppt-creation-content" value={brief.topic} disabled={busy} onChange={event => edit({topic:event.target.value})} placeholder={zh ? '主题、受众、场景与重点要求' : 'Topic, audience, occasion and priorities'} />
            {file && <span className="native-ppt__attachment"><span title={file.name}>{file.name}</span><button type="button" disabled={busy} aria-label={zh ? '移除文档' : 'Remove document'} title={zh ? '移除文档' : 'Remove document'} onClick={() => setFile(undefined)}><X size={14} aria-hidden="true" /></button></span>}
          </div>
        </div>
        <NativeTemplatePicker workflow={skill} template={brief.style} theme={brief.theme} disabled={busy} onChange={selectTemplate} />
        <SelectField label={zh ? '目标页数' : 'Target slides'} value={brief.pages} disabled={busy} onChange={selectPages} options={[{value:'auto',label:zh ? '按内容建议' : 'Recommend from content'}, ...SLIDE_COUNTS.map(n=>({value:n,label:n}))]} />
        <div className="native-ppt__generation-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!available || (!brief.topic.trim() && !file)}>{busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '生成' : 'Generate')}</Button>
        </div>
      </section>
      <div className="native-ppt__generation-status">{!available && <p role="status">{zh ? '模板资源尚未就绪' : 'Template resources unavailable'}</p>}{error && <p className="native-ppt__error" role="alert">{error}</p>}</div>
    </form>
    <div ref={results} className="poster-app__result-tabs native-ppt__result-tabs" role="tablist" onKeyDown={tabKeys} aria-label={zh ? '文稿导航' : 'Presentation navigation'}>
      <button type="button" id="ppt-tab-latest" role="tab" aria-controls="ppt-panel-latest" className={view === 'latest' ? 'is-active' : undefined} tabIndex={view === 'latest' ? 0 : -1} aria-selected={view === 'latest'} onClick={() => show('latest')}>{zh ? '最新一批' : 'Latest batch'}</button>
      <button type="button" id="ppt-tab-history" role="tab" aria-controls="ppt-panel-history" className={view === 'history' ? 'is-active' : undefined} tabIndex={view === 'history' ? 0 : -1} aria-selected={view === 'history'} onClick={() => show('history')}>{zh ? '历史生成' : 'History'} <small>{projects.length}</small></button>
    </div>
    <section id="ppt-panel-latest" className="native-ppt__result-panel" role="tabpanel" aria-labelledby="ppt-tab-latest" hidden={view !== 'latest'}>
      {request?.phase ? <NativePresentationProgress stage={request.phase} startedAt={request.startedAt}/> : projectId ? <NativePresentationResult key={projectId} projectId={projectId} requestedAt={request?.projectId === projectId ? request.startedAt : undefined}/> : <p className="native-ppt__empty">{zh?'生成的文稿会显示在这里':'Your presentation will appear here'}</p>}
    </section>
    <section id="ppt-panel-history" className="native-ppt__result-panel" role="tabpanel" aria-labelledby="ppt-tab-history" hidden={view !== 'history'}>
      {historyId ? <><IconButton label={zh?'返回历史':'Back to history'} onClick={()=>setHistoryId(null)}><ArrowLeft size={18}/></IconButton><NativePresentationResult key={historyId} projectId={historyId}/></> : <div className="native-ppt__history">
        {!projects.length && <p>{zh?'暂无历史生成记录':'No generation history yet'}</p>}
        {projects.map(project=><button type="button" key={project.id} onClick={()=>{if(project.id===projectId){setView('latest');}else{setHistoryId(project.id);}}}><FileText size={22}/><span><strong>{project.name}</strong><small>{project.skillId==='html-ppt'?(zh?'模板创作':'Template creation'):(zh?'设计创作':'Design creation')} · {new Date(project.updatedAt).toLocaleDateString(locale)}</small></span></button>)}
      </div>}
    </section>
  </section>;
}
