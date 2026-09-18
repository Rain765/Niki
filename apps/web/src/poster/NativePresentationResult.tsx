import { nativePresentationWorkspaceUrl, type ChatRunStatusResponse, type ProjectFile } from '@open-design/contracts';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { NativePresentationPreview } from '../components/NativePresentationPreview';
import { Button } from '../components/Button';

/** Observe the original workflow; the embedded workspace remains its sole run/confirmation owner. */
export function NativePresentationResult({ projectId }: { projectId: string }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [entry, setEntry] = useState<ProjectFile | null>(null);
  const [revision, setRevision] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState(false);
  const [opened, setOpened] = useState(false);
  const [attention, setAttention] = useState(false);
  const workspaceFrame = useRef<HTMLIFrameElement>(null);
  const conversationButton = useRef<HTMLSpanElement>(null);
  const [retry, setRetry] = useState(0);
  const hadEntry = useRef(false);
  const conversationInitialized = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [filesResponse, runsResponse] = await Promise.all([
          fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { signal: controller.signal, cache: 'no-store' }),
          fetch(`/api/runs?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal, cache: 'no-store' }),
        ]);
        if (!filesResponse.ok || !runsResponse.ok) throw new Error(zh ? '读取文稿状态失败，请重试' : 'Could not load presentation status. Retry.');
        const { files } = await filesResponse.json() as { files: ProjectFile[] };
        const { runs } = await runsResponse.json() as { runs: ChatRunStatusResponse[] };
        if (controller.signal.aborted) return;
        const active = runs.some(run => run.status === 'running' || run.status === 'queued');
        const latestRun = [...runs].sort((a,b) => b.createdAt - a.createdAt)[0];
        // Original workflows publish index.html; allow named decks, excluding copied source and review files.
        const html = files.filter(file => /\.html?$/i.test(file.name) && !/^(native-review|source|references|node_modules|assets)\//.test(file.name));
        const next = html.find(file => file.name === 'index.html') ?? html.find(file => file.artifactKind === 'deck') ?? html[0] ?? null;
        const visible = active && !hadEntry.current ? null : next;
        setEntry(visible); setRunning(active); setFailed(!active && latestRun?.status === 'failed'); setLoading(false); setError('');
        // Wait for a write burst to finish before replacing a readable deck. Inspection files never reload it.
        if (!active || !hadEntry.current) setRevision(files.filter(file => /\.(html?|css|js|mjs|svg)$/i.test(file.name) && !file.name.startsWith('native-review/')).map(file => `${file.name}:${file.mtime}:${file.size}`).sort().join('|'));
        if (visible && !hadEntry.current) { setWorkspace(false); hadEntry.current = true; }
        if (!visible && !conversationInitialized.current) { setOpened(true); conversationInitialized.current = true; }
      } catch (cause) {
        if (!controller.signal.aborted) { setLoading(false); setError(cause instanceof Error ? cause.message : String(cause)); }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, retry, zh]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== workspaceFrame.current?.contentWindow || event.data?.projectId !== projectId) return;
      if (event.data.type === 'niki:ppt:attention') setAttention(Boolean(event.data.required));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [projectId]);
  useEffect(() => {
    if (!workspace) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setWorkspace(false); conversationButton.current?.querySelector('button')?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);
  return <div className="native-ppt__result">
    {error && <p role="alert">{error} <Button size="compact" onClick={()=>setRetry(n=>n+1)}>{zh?'重试':'Retry'}</Button></p>}
    {(!entry && !error && !failed) && <div className="native-ppt__pending" role="status" aria-label={zh ? (running?'正在生成文稿':'正在加载文稿') : (running?'Generating presentation':'Loading presentation')}><div className="native-player__skeleton"><span/><span/><span/></div></div>}
    {(attention || (!loading && !running && !entry && !failed && !error)) && <p role="status">{zh?'需要确认后继续':'Confirmation needed to continue'}</p>}
    {running && <p role="status">{zh?'正在生成…':'Generating…'}</p>}
    {failed && <p role="alert">{zh?'这次生成未完成，可打开确认与修改继续。':'Generation did not finish. Review the conversation below to continue.'}</p>}
    {entry && <NativePresentationPreview projectId={projectId} name={entry.name} revision={revision} editingDisabled={running}/>}
    {!loading && <span ref={conversationButton}><Button className="native-ppt__conversation-toggle" variant="ghost" aria-expanded={workspace} aria-controls={`ppt-workspace-${projectId}`} onClick={()=>{setOpened(true);setWorkspace(value=>!value);}}>{workspace?(zh?'收起':'Close'):(zh?(attention?'需要确认':'确认与修改'):'Review and revise')}</Button></span>}
    {opened && <div id={`ppt-workspace-${projectId}`} className="native-ppt__workspace" hidden={!workspace} role="region" aria-label={zh?'确认与修改':'Review and revise'}>
      <iframe ref={workspaceFrame} title={zh?'生成与修改工作区':'Generation and editing workspace'} src={`${nativePresentationWorkspaceUrl(projectId)}&embedded=1`} allowFullScreen />
    </div>}
  </div>;
}
