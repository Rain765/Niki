import { nativePresentationWorkspaceUrl, type ChatRunStatusResponse, type ProjectFile } from '@open-design/contracts';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { NativePresentationPreview } from '../components/NativePresentationPreview';
import { Button } from '../components/Button';
import { X } from 'lucide-react';
import { NativePresentationQuestionForm } from './NativePresentationQuestionForm';
import type { PresentationQuestionRequest } from './native-presentation-questions';

/** Observe the original workflow; the embedded workspace remains its sole run/confirmation owner. */
export function NativePresentationResult({ projectId }: { projectId: string }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [entry, setEntry] = useState<ProjectFile | null>(null);
  const [revision, setRevision] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'question' | 'workspace' | null>(null);
  const [question, setQuestion] = useState<PresentationQuestionRequest | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerError, setAnswerError] = useState('');
  const [hasRun, setHasRun] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const questionId = useRef<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const workspaceFrame = useRef<HTMLIFrameElement>(null);
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
        setEntry(visible); setRunning(active); setFailed(!active && (latestRun?.status === 'failed' || latestRun?.status === 'canceled')); setHasRun(runs.length > 0); setLoading(false); setError('');
        // Wait for a write burst to finish before replacing a readable deck. Inspection files never reload it.
        if (!active || !hadEntry.current) setRevision(files.filter(file => /\.(html?|css|js|mjs|svg)$/i.test(file.name) && !file.name.startsWith('native-review/')).map(file => `${file.name}:${file.mtime}:${file.size}`).sort().join('|'));
        if (visible && !hadEntry.current) { hadEntry.current = true; }
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
      if (event.data.type === 'niki:ppt:configuration') {
        setConfigurationRequired(Boolean(event.data.required));
        if (event.data.required) setMode('workspace');
      }
      if (event.data.type === 'niki:ppt:question') {
        const next = event.data.question as PresentationQuestionRequest | null;
        setQuestion(next);
        if (next?.id && next.id !== questionId.current) { setMode('question'); setAnswerError(''); setAnswerBusy(false); }
        if (!next) { setMode(current => current === 'question' ? null : current); setAnswerBusy(false); }
        questionId.current = next?.id ?? null;
      }
      if (event.data.type === 'niki:ppt:answer-result' && event.data.id === questionId.current) {
        setAnswerBusy(false);
        if (event.data.ok) { setMode(null); setQuestion(null); setRunning(true); }
        else setAnswerError(zh ? '回答未提交成功，请稍后重试。你的选择已保留。' : 'Could not submit your answer. Your selections are saved; please retry.');
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [projectId, zh]);
  useEffect(() => {
    if (mode) {
      if (!dialog.current?.open) { previousFocus.current = document.activeElement as HTMLElement; dialog.current?.showModal(); }
    } else if (dialog.current?.open) {
      dialog.current.close(); previousFocus.current?.focus();
    }
  }, [mode]);
  const openWorkspace = () => { setOpened(true); setMode('workspace'); };
  const paused = !loading && !running && !entry && hasRun;
  const status = question ? (zh ? '等待你的回答' : 'Waiting for your answer')
    : configurationRequired ? (zh ? '请先完成生成设置' : 'Finish setup to continue')
    : failed ? (zh ? '生成未完成' : 'Generation did not finish')
    : paused ? (zh ? '尚未生成文稿' : 'No presentation generated yet')
    : running ? (zh ? '正在生成 PPT…' : 'Generating presentation…')
    : (zh ? '正在准备文稿…' : 'Preparing presentation…');
  return <div className="native-ppt__result">
    {error && <p role="alert">{error} <Button size="compact" onClick={()=>setRetry(n=>n+1)}>{zh?'重试':'Retry'}</Button></p>}
    {!entry && !error && <div className="native-ppt__pending" role="status" aria-label={status}>
      {!question && !failed && !paused && !configurationRequired && <div className="native-player__skeleton"><span/><span/><span/></div>}
      <div className="native-ppt__stage-status"><span>{status}</span>
        {question ? <Button onClick={()=>setMode('question')}>{zh?'回答问题':'Answer questions'}</Button>
          : (failed || paused || configurationRequired) && <Button onClick={openWorkspace}>{zh?(configurationRequired?'生成设置':'查看进度'):(configurationRequired?'Generation settings':'View progress')}</Button>}
      </div>
    </div>}
    {entry && <NativePresentationPreview projectId={projectId} name={entry.name} revision={revision} editingDisabled={running} onRevise={openWorkspace}/>}
    {entry && question && mode !== 'question' && <Button onClick={()=>setMode('question')}>{zh?'回答问题':'Answer questions'}</Button>}
    <dialog ref={dialog} className="native-ppt__dialog" aria-labelledby={`ppt-dialog-title-${projectId}`} onCancel={()=>setMode(null)} onClose={()=>setMode(null)}>
      <header><h2 id={`ppt-dialog-title-${projectId}`}>{zh?(mode==='question'?'确认内容':configurationRequired?'生成设置':'修改文稿'):(mode==='question'?'Confirm details':configurationRequired?'Generation settings':'Revise presentation')}</h2>
        <Button variant="ghost" aria-label={zh?'关闭':'Close'} onClick={()=>setMode(null)}><X size={18}/></Button></header>
      {question && <div hidden={mode !== 'question'}><NativePresentationQuestionForm key={question.id} request={question} busy={answerBusy} error={answerError} onSubmit={content=>{
        if (answerBusy) return;
        setAnswerBusy(true); setAnswerError('');
        workspaceFrame.current?.contentWindow?.postMessage({type:'niki:ppt:answer',projectId,id:question.id,content},window.location.origin);
      }}/></div>}
      {opened && <div className="native-ppt__workspace" hidden={mode !== 'workspace'}>
        <iframe ref={workspaceFrame} title={zh?'生成与修改工作区':'Generation and editing workspace'} src={`${nativePresentationWorkspaceUrl(projectId)}&embedded=1`} allowFullScreen />
      </div>}
    </dialog>
  </div>;
}
