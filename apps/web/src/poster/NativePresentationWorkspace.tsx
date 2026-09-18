'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProjectView } from '../components/ProjectView';
import { useRoute } from '../router';
import { fetchAgents, fetchSkills, fetchDesignTemplates, fetchDesignSystems } from '../providers/registry';
import { getProject, patchProject } from '../state/projects';
import { loadConfig, fetchDaemonConfig, mergeDaemonConfig, saveConfig } from '../state/config';
import { I18nProvider, useI18n } from '../i18n';
import { NikiAuthGate } from '../auth/NikiAuth';
import { isNativePresentation } from './native-presentations';
import type { AgentInfo, AppConfig, Project, SkillSummary, DesignSystemSummary } from '../types';
import '../index.css';
import './native-presentation-workspace.css';

function Workspace() {
  const route = useRoute();
  const id = route.kind === 'project' ? route.projectId : null;
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [templates, setTemplates] = useState<SkillSummary[]>([]);
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => { setEmbedded(window.parent !== window); }, []);
  const refreshAgents = useCallback(() => { void fetchAgents().then(setAgents); }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([fetchDaemonConfig(), fetchAgents(), fetchSkills(), fetchDesignTemplates(), fetchDesignSystems()])
      .then(([prefs, available, functional, designs, brands]) => {
        if (!active) return;
        const cfg = mergeDaemonConfig(loadConfig(), prefs);
        // CLI agents can read and preserve complete skill resource folders.
        cfg.mode = 'daemon';
        if (!available.some((agent) => agent.id === cfg.agentId && agent.available)) {
          cfg.agentId = available.find((agent) => agent.available && agent.authStatus !== 'missing')?.id ?? null;
        }
        setConfig(cfg); setAgents(available); setSkills(functional); setTemplates(designs); setSystems(brands);
      }).catch(() => { if (active) setError('无法加载工作区 / Could not load workspace'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setProject(null); setError('');
    void getProject(id).then((next) => {
      if (!active) return;
      if (!next || !isNativePresentation(next)) setError('文稿不存在或不属于原生演示工作区 / Presentation unavailable');
      else setProject(next);
    });
    return () => { active = false; };
  }, [id]);
  const update = (next: AppConfig) => { setConfig(next); saveConfig(next); };
  const agent = agents.find((item) => item.id === config?.agentId);
  const model = config?.agentModels?.[agent?.id ?? '']?.model;
  const ready = Boolean(agent?.available && agent.authStatus !== 'missing' && model);
  useEffect(() => {
    if (!id || window.parent === window) return;
    window.parent.postMessage({type:'niki:ppt:attention',projectId:id,required:Boolean(error || (config && !ready))}, window.location.origin);
  }, [id, config, ready, error]);
  const back = () => { window.location.assign('/?mode=ppt'); };
  return <div className={`native-ppt-workspace${embedded?' native-ppt-workspace--embedded':''}`}>
    <header className="native-ppt-workspace__bar">
      <a href="/?mode=ppt" target="_top">← {zh ? '演示文稿' : 'Presentations'}</a>
      <strong>{project?.name}</strong>
      <button onClick={() => setSettings(!settings)}>{agent?.name ?? (zh ? '选择执行代理' : 'Choose agent')}</button>
    </header>
    {config && (settings || !ready) && <div className="native-ppt-workspace__settings">
      <label>{zh ? '执行代理' : 'Agent'} <select value={config.agentId ?? ''} onChange={(event) => update({ ...config, agentId: event.target.value })}>
        <option value="">{zh ? '请选择' : 'Select'}</option>
        {agents.map((item) => <option key={item.id} value={item.id} disabled={!item.available || item.authStatus === 'missing'}>{item.name}{!item.available ? ' · unavailable' : ''}</option>)}
      </select></label>
      <label>{zh ? '模型' : 'Model'} <select value={config.agentModels?.[agent?.id ?? '']?.model ?? ''} onChange={(event) => agent && update({ ...config, agentModels: { ...config.agentModels, [agent.id]: { ...config.agentModels?.[agent.id], model: event.target.value || undefined } } })}>
        <option value="">{zh ? '请选择执行模型' : 'Choose a model'}</option>
        {agent?.models?.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      </select></label>
      <label>{zh ? '思考强度' : 'Reasoning'} <select value={config.agentModels?.[agent?.id ?? '']?.reasoning ?? 'default'} onChange={(event) => agent && update({ ...config, agentModels: { ...config.agentModels, [agent.id]: { ...config.agentModels?.[agent.id], reasoning: event.target.value } } })}>
        {agent?.reasoningOptions?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select></label>
      <button onClick={refreshAgents}>{zh ? '重新检测' : 'Refresh'}</button>
      {!ready && <p role="status">{zh ? '选择可用的执行代理与模型后继续。原流程需要本地代理完成文件读取、设计和检查，资料已保存。' : 'Choose an available local agent and model to continue. The original workflow needs file and validation tools. Your source is saved.'}</p>}
    </div>}
    {error ? <p role="alert">{error}</p> : project && config && (ready || !project.pendingPrompt) ? <div className="native-ppt-workspace__body">
      <ProjectView key={project.id} project={project} routeFileName={route.kind === 'project' ? route.fileName : null}
        routeConversationId={route.kind === 'project' ? route.conversationId : null}
        config={config} agents={agents} skills={skills} designTemplates={templates} designSystems={systems} daemonLive={true}
        onModeChange={() => {}} onAgentChange={(agentId) => update({ ...config, agentId })}
        onAgentModelChange={(agentId, choice) => update({ ...config, agentModels: { ...config.agentModels, [agentId]: choice } })}
        onRefreshAgents={refreshAgents} onOpenSettings={() => setSettings(true)} onBack={back} showBackButton={false}
        onClearPendingPrompt={() => { void patchProject(project.id, { pendingPrompt: '' }).then((next) => { if (next) setProject(next); }); }}
        onTouchProject={() => {}} onProjectChange={setProject} onProjectsRefresh={() => {}} />
    </div> : <p role="status">{zh ? '正在打开原生工作区…' : 'Opening workspace…'}</p>}
  </div>;
}

export function NativePresentationWorkspace() {
  return <I18nProvider defaultLocale="zh-CN" supportedLocales={['zh-CN', 'en']} deferUntilClient><NikiAuthGate><Workspace /></NikiAuthGate></I18nProvider>;
}
