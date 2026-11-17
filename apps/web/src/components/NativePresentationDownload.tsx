import { useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { NativePresentationInspectionJob, NativePresentationExportRequest } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { IconButton } from './Button';

export function NativePresentationDownload({projectId, entry, disabled}: {projectId: string; entry: string; disabled?: boolean}) {
  const {locale} = useI18n(); const zh = locale.startsWith('zh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const download = async (format: NativePresentationExportRequest['format']) => {
    if (busy) return;
    if (menu.current) menu.current.open = false;
    setBusy(true); setError('');
    try {
      const prefix = `/api/projects/${encodeURIComponent(projectId)}/native-presentation`;
      const request = async (url: string, init?: RequestInit): Promise<NativePresentationInspectionJob> => {
        const response = await fetch(url, init); const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Render failed');
        return body;
      };
      let job = await request(`${prefix}/inspect`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry})});
      const deadline = Date.now() + 15 * 60_000;
      while (job.status === 'running') {
        if (Date.now() > deadline) throw new Error(zh ? '导出超时，请稍后重试' : 'Export timed out. Retry.');
        await new Promise(resolve=>setTimeout(resolve, 1000));
        job = await request(`${prefix}/inspections/${encodeURIComponent(job.id)}`);
      }
      if (job.status !== 'completed') throw new Error(job.error || 'Render failed');
      const body: NativePresentationExportRequest = {inspectionId:job.id,format};
      const response = await fetch(`${prefix}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href=url; link.download=`presentation.${format}`; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="native-player__download">
    {busy ? <IconButton label={zh?'正在导出':'Exporting'} disabled><LoaderCircle size={18}/></IconButton> : <details ref={menu} onKeyDown={event=>{if(event.key==='Escape' && menu.current)menu.current.open=false;}}>
      <summary className="od-button od-button--ghost od-icon-button" aria-label={zh?'下载文稿':'Download deck'} title={zh?'下载文稿':'Download deck'}><Download size={18}/></summary>
      <div className="native-player__download-menu">
        <button type="button" disabled={disabled} onClick={()=>void download('pptx')}>{zh?'下载 PPTX（图片版）':'Download PPTX (image slides)'}</button>
        <button type="button" disabled={disabled} onClick={()=>void download('pdf')}>{zh?'下载 PDF':'Download PDF'}</button>
      </div>
    </details>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
