'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PPT_MODEL_PROVIDERS, type PptModelSettings, type PptModelProvider } from '@open-design/contracts';
import { useNikiAuth } from '../auth/NikiAuth';
import { pptModelRequest } from './ppt-model-api';
import { ArrowRight, FileText, Paperclip, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { fetchDesignTemplates, fetchSkills } from '../providers/registry';
import { listProjects } from '../state/projects';
import type { Project, SkillSummary } from '../types';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';
import { NativePresentationResult } from './NativePresentationResult';
import { NativeTemplatePicker } from './NativeTemplatePicker';
import { isNativePresentation, prepareNativePresentation, type NativePptBrief, type NativePptSkill } from './native-presentations';
import './native-presentation-studio.css';

const INITIAL: Record<NativePptSkill, NativePptBrief> = {
  'html-ppt': { skill: 'html-ppt', topic: '', audience: '', pages: 'auto', style: 'xhs-white-editorial', theme: '', duration: '' },
  'guizang-ppt-skill': { skill: 'guizang-ppt-skill', topic: '', audience: '', pages: 'auto', style: 'A · 电子杂志', theme: 'Monocle', duration: '' },
};
export function NativePresentationStudio({ onNavigationLockChange }: { onNavigationLockChange?: (locked: boolean) => void }) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const { user } = useNikiAuth();
  const admin = user?.role === 'admin';
  const [models, setModels] = useState<PptModelSettings>();
  const previousDefault = useRef<PptModelProvider>();
  useEffect(() => {
    if (!admin) return;
    let active = true;
    const refreshModels = () => { void pptModelRequest().then(data => { if (active) { const changed = previousDefault.current !== data.defaultProvider; previousDefault.current = data.defaultProvider; setModels(data); setBrief(old => ({ ...old, provider: changed ? data.defaultProvider : old.provider ?? data.defaultProvider })); } }).catch(() => {}); };
    refreshModels(); window.addEventListener('niki:ppt-models-changed', refreshModels);
    return () => { active = false; window.removeEventListener('niki:ppt-models-changed', refreshModels); };
  }, [admin]);
  const [brief, setBrief] = useState<NativePptBrief>(INITIAL['html-ppt']);
  const [file, setFile] = useState<File>();
  const skill = brief.skill;
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'latest' | 'history'>('latest');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = catalog.some((item) => item.id === skill && item.hasBody);
  const refresh = () => { void listProjects().then((items) => { const decks = items.filter(isNativePresentation).sort((a,b) => b.updatedAt - a.updatedAt); setProjects(decks); setProjectId(current => current ?? decks[0]?.id ?? null); }); };
  useEffect(() => {
    void Promise.all([fetchSkills(), fetchDesignTemplates()]).then(([a, b]) => setCatalog([...a, ...b]));
    refresh();
    const query = new URLSearchParams(window.location.search);
    const flow = query.get('pptWorkflow');
    if (flow === 'html-ppt' || flow === 'guizang-ppt-skill') setBrief(INITIAL[flow]);
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
    setBusy(true); setError(''); setView('latest');
    results.current?.scrollIntoView?.({behavior:'smooth',block:'start'});
    try {
      const project = await prepareNativePresentation(brief, file ?? null);
      try { window.sessionStorage.setItem(`od:auto-send-first:${project.id}`, '1'); } catch { /* The original composer still opens with the saved brief. */ }
      open(project.id); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); refresh(); }
    finally { setBusy(false); }
  };
  const selectTemplate = (next: NativePptSkill, style: string, theme: string) => {
    edit({skill:next, style, theme});
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
    <form className="native-ppt__form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <section className={`native-ppt__filters od-generation-toolbar${admin ? ' has-model' : ''}${skill !== 'html-ppt' || brief.style === 'custom' ? ' has-theme' : ''}`} aria-label={zh ? '创作筛选' : 'Creation settings'}>
        {admin && <SelectField label={zh?'生成模型':'Generation model'} value={brief.provider ?? 'existing'} disabled={busy || !models} options={[{value:'existing',label:zh?'当前模型':'Existing model'}, ...(models?.providers ?? []).map(item => ({value:item.provider,label:PPT_MODEL_PROVIDERS[item.provider].label,disabled:!item.testedAt}))]} onChange={provider => edit({provider:provider as PptModelProvider})} />}
        <NativeTemplatePicker workflow={skill} template={brief.style} theme={brief.theme} disabled={busy} onChange={selectTemplate} />
        <SelectField label={zh ? '目标页数' : 'Target slides'} value={brief.pages} disabled={busy} onChange={pages => edit({pages})} options={[{value:'auto',label:zh ? '按内容建议' : 'Recommend from content'}, ...[5,10,15,20].map(n=>({value:String(n),label:String(n)}))]} />

        <div className="native-ppt__source od-field">
          <label className="od-field__label" htmlFor="ppt-creation-content">{zh ? '创作内容' : 'Content'}</label>
          <div className="native-ppt__composer">
            <label className="native-ppt__upload" title={zh ? '添加或替换文档 · PDF / Word / PPTX / Markdown / TXT / CSV / Excel' : 'Add or replace a document'}>
              <Paperclip size={16} aria-hidden="true" />
              <input key={`${skill}:${file?.name ?? 'empty'}`} aria-label={zh ? '添加文档' : 'Add document'} type="file" accept=".pdf,.docx,.pptx,.md,.txt,.csv,.xlsx" onChange={event => { const selected = event.target.files?.[0]; if (selected) setFile(selected); }} disabled={busy} />
            </label>
            <input type="text" id="ppt-creation-content" value={brief.topic} disabled={busy} onChange={event => edit({topic:event.target.value})} placeholder={zh ? '主题、受众、场景与重点要求' : 'Topic, audience, occasion and priorities'} />
            {file && <span className="native-ppt__attachment"><span title={file.name}>{file.name}</span><button type="button" disabled={busy} aria-label={zh ? '移除文档' : 'Remove document'} onClick={() => setFile(undefined)}><X size={14} aria-hidden="true" /></button></span>}
          </div>
        </div>
        <div className="native-ppt__generation-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!available || (!brief.topic.trim() && !file)}>{busy ? (zh ? '正在保存资料…' : 'Saving source…') : (zh ? '开始创作' : 'Start creating')}<ArrowRight size={18} /></Button>
        </div>
      </section>
      <div className="native-ppt__generation-status">{!available && <p role="status">{zh ? '模板资源尚未就绪' : 'Template resources unavailable'}</p>}{error && <p className="native-ppt__error" role="alert">{error}</p>}</div>
    </form>
    <div ref={results} className="poster-app__result-tabs native-ppt__result-tabs" role="tablist" onKeyDown={tabKeys} aria-label={zh ? '文稿导航' : 'Presentation navigation'}>
      <button type="button" id="ppt-tab-latest" role="tab" aria-controls="ppt-panel-latest" className={view === 'latest' ? 'is-active' : undefined} tabIndex={view === 'latest' ? 0 : -1} aria-selected={view === 'latest'} onClick={() => show('latest')}>{zh ? '最新一批' : 'Latest batch'}</button>
      <button type="button" id="ppt-tab-history" role="tab" aria-controls="ppt-panel-history" className={view === 'history' ? 'is-active' : undefined} tabIndex={view === 'history' ? 0 : -1} aria-selected={view === 'history'} onClick={() => show('history')}>{zh ? '历史生成' : 'History'} <small>{projects.length}</small></button>
    </div>
    <section id="ppt-panel-latest" className="native-ppt__result-panel" role="tabpanel" aria-labelledby="ppt-tab-latest" hidden={view !== 'latest'}>
      {busy ? <div className="native-ppt__pending" role="status" aria-label={zh?'正在保存资料':'Saving source'}><div className="native-player__skeleton"><span/><span/><span/></div></div> : projectId ? <NativePresentationResult key={projectId} projectId={projectId}/> : <p className="native-ppt__empty">{zh?'生成的文稿会显示在这里':'Your presentation will appear here'}</p>}
    </section>
    <section id="ppt-panel-history" className="native-ppt__result-panel" role="tabpanel" aria-labelledby="ppt-tab-history" hidden={view !== 'history'}>
      {historyId ? <><Button variant="ghost" onClick={()=>setHistoryId(null)}>{zh?'← 返回历史':'← Back to history'}</Button><NativePresentationResult key={historyId} projectId={historyId}/></> : <div className="native-ppt__history">
        {!projects.length && <p>{zh?'暂无历史生成记录':'No generation history yet'}</p>}
        {projects.map(project=><button type="button" key={project.id} onClick={()=>{if(project.id===projectId){setView('latest');}else{setHistoryId(project.id);}}}><FileText size={22}/><span><strong>{project.name}</strong><small>{project.skillId==='html-ppt'?(zh?'模板创作':'Template creation'):(zh?'设计创作':'Design creation')} · {new Date(project.updatedAt).toLocaleDateString(locale)}</small></span><ArrowRight size={18}/></button>)}
      </div>}
    </section>
  </section>;
}
