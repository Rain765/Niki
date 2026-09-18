import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { projectFileUrl } from '../providers/registry';
import { Button } from './Button';
import type { NativePresentationInspection, NativePresentationInspectionJob } from '@open-design/contracts';

export function NativePresentationInspectionPanel({ projectId, name, auto = false, revision = '' }: { projectId: string; name: string; auto?: boolean; revision?: string | number }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<NativePresentationInspection | null>(null);
  const [error, setError] = useState('');
  const inspectionRequest = useRef<AbortController | null>(null);
  const inspectionKey = `native-ppt-inspection:${projectId}:${name}`;
  const inspect = async (resumeId?: string) => {
    inspectionRequest.current?.abort();
    const controller = new AbortController();
    inspectionRequest.current = controller;
    setChecking(true); setError(''); setReport(null);
    try {
      let refreshedStale = false;
      while (!controller.signal.aborted) {
        let job: NativePresentationInspectionJob;
        if (resumeId) job = {id:resumeId,projectId,status:'running'};
        else {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-presentation/inspect`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:name}),signal:controller.signal});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Inspection failed');
          job = data;
          if (controller.signal.aborted) return;
          try { sessionStorage.setItem(inspectionKey, job.id); } catch { /* Optional cache. */ }
        }
        while (job.status === 'running') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (controller.signal.aborted) return;
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-presentation/inspections/${job.id}`, {signal:controller.signal});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Inspection unavailable');
          job = data;
        }
        if (job.status === 'failed' || !job.report) throw new Error(job.error || 'Inspection failed');
        // An edit may finish while an earlier inspection is still rendering.
        // Follow that shared job with one inspection of the newly saved bytes.
        if (auto && job.report.stale && !refreshedStale) {
          refreshedStale = true; resumeId = undefined; continue;
        }
        if (!controller.signal.aborted) setReport(job.report);
        break;
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
        try { sessionStorage.removeItem(inspectionKey); } catch { /* Optional cache. */ }
      }
    } finally { if (!controller.signal.aborted) setChecking(false); }
  };
  useEffect(() => {
    setReport(null); setError(''); setChecking(false);
    let cached: string | null = null;
    try { cached = sessionStorage.getItem(inspectionKey); } catch { /* Optional cache. */ }
    // The server reuses an in-flight/current report, and re-renders changed bytes.
    if (auto) void inspect();
    else if (cached) void inspect(cached);
    return () => inspectionRequest.current?.abort();
  }, [projectId, name, auto, revision]);
  const findings = report?.slides.reduce((n, slide) => n + slide.issues.length, 0) ?? 0;
  return <div className="native-ppt-inspection">
    <Button loading={checking} onClick={() => void inspect()}>{zh ? '检查文稿' : 'Inspect deck'}</Button>
    {checking && <p role="status">{zh ? '正在检查页面…' : 'Checking slides…'}</p>}
    {error && <p role="alert">{error}</p>}
    {report && <div role="status">
      <p>{report.stale ? (zh ? '文稿已更新，请重新检查' : 'Deck has changed; inspect again') : (zh ? `已检查 ${report.slides.length} 页 · ${findings} 项待核对 · 视觉与内容仍需核对` : `${report.slides.length} slides checked · ${findings} findings · visual and content review pending`)}</p>
      {!!((report.failedResources?.length ?? 0) + report.blockedResources.length) && <p>{zh ? '存在未加载的资源，请查看检查记录' : 'Some resources did not load; see the report'}</p>}
      <details><summary>{zh ? '检查记录' : 'Inspection details'}</summary>
        <a href={projectFileUrl(projectId,report.reportFile)} target="_blank" rel="noreferrer">{zh ? '检查记录 ↗' : 'Inspection report ↗'}</a>
        {report.slides.map(slide=><a key={slide.page} href={projectFileUrl(projectId,slide.screenshot)} target="_blank" rel="noreferrer"> {zh ? `第 ${slide.page} 页` : `Slide ${slide.page}`} ↗</a>)}
      </details>
    </div>}
  </div>;
}
