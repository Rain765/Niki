import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { projectFileUrl } from '../providers/registry';
import { Button } from './Button';
import type { NativePresentationInspection, NativePresentationInspectionJob } from '@open-design/contracts';

export function NativePresentationInspectionPanel({ projectId, name }: { projectId: string; name: string }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<NativePresentationInspection | null>(null);
  const [error, setError] = useState('');
  const inspectionRequest = useRef<AbortController | null>(null);
  const inspectionKey = `native-ppt-inspection:${projectId}:${name}`;
  const resumeInspection = async (job: NativePresentationInspectionJob, controller: AbortController) => {
    while (job.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (controller.signal.aborted) return;
      const next = await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-presentation/inspections/${job.id}`, {signal: controller.signal});
      const data = await next.json();
      if (!next.ok) throw new Error(data.error || 'Inspection unavailable');
      job = data;
    }
    if (job.status === 'failed' || !job.report) throw new Error(job.error || 'Inspection failed');
    if (!controller.signal.aborted) setReport(job.report);
  };
  useEffect(() => {
    setReport(null); setError(''); setChecking(false);
    // Saving review screenshots refreshes the file viewer. Resume the existing job after remount.
    let id: string | null = null;
    try { id = window.sessionStorage.getItem(inspectionKey); } catch { /* Storage may be unavailable. */ }
    const controller = new AbortController();
    inspectionRequest.current = controller;
    if (id) {
      setChecking(true);
      void resumeInspection({id, projectId, status: 'running'}, controller).catch(e => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
          try { window.sessionStorage.removeItem(inspectionKey); } catch { /* Best effort. */ }
        }
      }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    }
    return () => { inspectionRequest.current?.abort(); inspectionRequest.current = null; };
  }, [projectId, name]);
  const inspect = async () => {
    inspectionRequest.current?.abort();
    const controller = new AbortController();
    inspectionRequest.current = controller;
    setChecking(true); setError(''); setReport(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-presentation/inspect`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({entry: name}), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Inspection failed');
      const job = body as NativePresentationInspectionJob;
      try { window.sessionStorage.setItem(inspectionKey, job.id); } catch { /* Best effort. */ }
      await resumeInspection(job, controller);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (!controller.signal.aborted) setChecking(false); }
  };
  return <div className="native-ppt-inspection">
    <Button loading={checking} onClick={() => void inspect()}>{zh ? '检查文稿' : 'Inspect deck'}</Button>
    {error && <p role="alert">{error}</p>}
    {report && <div role="status">
      <p>{report.stale ? (zh ? '文稿已更新，请重新检查' : 'Deck has changed; run inspection again') : (zh ? `已检查 ${report.slides.length} 页 · ${report.slides.reduce((n,s)=>n+s.issues.length,0)} 项待核对` : `${report.slides.length} slides inspected · ${report.slides.reduce((n,s)=>n+s.issues.length,0)} findings`)}</p>
      {!!((report.failedResources?.length ?? 0) + report.blockedResources.length) && <p>{zh ? '存在未加载的资源，请查看检查记录' : 'Some resources did not load; see the inspection report'}</p>}
      <a href={projectFileUrl(projectId, report.reportFile)} target="_blank" rel="noreferrer">{zh ? '检查记录 ↗' : 'Inspection report ↗'}</a>
      {report.slides.map(slide=><a key={slide.page} href={projectFileUrl(projectId,slide.screenshot)} target="_blank" rel="noreferrer"> {zh ? `第 ${slide.page} 页` : `Slide ${slide.page}`} ↗</a>)}
    </div>}
  </div>;
}
