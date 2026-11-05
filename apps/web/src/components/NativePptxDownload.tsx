import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { NativePptxExportJob } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { Button } from './Button';

async function downloadPptx(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(error.error || 'PowerPoint download failed');
  }
  if (!response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation'))
    throw new Error('PowerPoint 文件格式异常，请重新导出');
  const blob = await response.blob();
  if (signal?.aborted) return;
  const filename = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition') ?? '')?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(response.headers.get('content-disposition') ?? '')?.[1];
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename ? decodeURIComponent(filename) : plain ?? 'presentation.pptx';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function NativePptxDownload({ projectId, entry, revision, disabled, autoDownload }: {
  projectId: string; entry: string; revision: string; disabled: boolean; autoDownload: boolean;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const attempted = useRef(false);
  const [attempt, setAttempt] = useState<{ revision: string; download: boolean }>();
  const [result, setResult] = useState<{ revision: string; job: NativePptxExportJob }>();
  const [downloading, setDownloading] = useState(false);
  const current = result?.revision === revision ? result.job : undefined;
  const active = !disabled && attempt?.revision === revision && (!current || current.status === 'running');
  useEffect(() => {
    if (disabled || !autoDownload || attempted.current) return;
    attempted.current = true;
    setAttempt({ revision, download: true });
  }, [autoDownload, disabled, revision]);

  useEffect(() => {
    if (disabled || attempt?.revision !== revision) return;
    const controller = new AbortController();
    const endpoint = `/api/projects/${encodeURIComponent(projectId)}/native-presentation/pptx`;
    let timer: ReturnType<typeof setTimeout>;
    const read = async (url: string, init?: RequestInit) => {
      const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
      const body = await response.json() as NativePptxExportJob & { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    };
    const report = (job: NativePptxExportJob) => {
      if (controller.signal.aborted) return;
      setResult({ revision, job });
      if (job.status === 'running') {
        timer = setTimeout(() => void poll(job.id), 1200);
      } else if (job.status === 'ready' && attempt.download && document.visibilityState === 'visible') {
        void downloadPptx(job.downloadUrl, controller.signal).catch(fail);
      }
    };
    const fail = (error: unknown) => report({
      id: '', pages: 0, status: 'failed',
      error: error instanceof Error ? error.message : (zh ? '导出失败，请重试' : 'Export failed. Try again.'),
    });
    const poll = async (id: string) => {
      try { report(await read(`${endpoint}/jobs/${encodeURIComponent(id)}`)); }
      catch (error) { fail(error); }
    };
    void read(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry }),
    }).then(report, fail);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt, disabled, entry, projectId, revision, zh]);

  const title = zh ? '下载 .pptx' : 'Download .pptx';
  const start = () => { setResult(undefined); setAttempt({ revision, download: true }); };
  const download = async () => {
    if (current?.status !== 'ready' || downloading || disabled) return;
    setDownloading(true);
    try { await downloadPptx(current.downloadUrl); }
    catch (error) { setResult({ revision, job: { id: '', status: 'failed', pages: 0, error: error instanceof Error ? error.message : '下载失败，请重试' } }); }
    finally { setDownloading(false); }
  };
  return <div className="native-player__export">
    {current?.status === 'ready' && !disabled
      ? <a className="od-button od-button--primary" href={current.downloadUrl} download aria-disabled={downloading} onClick={event => { event.preventDefault(); void download(); }}><Download size={16}/>{title}</a>
      : <Button variant="primary" disabled={disabled || active} loading={active} onClick={start}>{current?.status === 'failed' ? (zh ? '重试导出' : 'Retry export') : title}</Button>}
    {active && <span role="status">{zh ? '正在导出 PowerPoint…' : 'Exporting PowerPoint…'} {current?.pages ? (zh ? `已处理 ${current.pages} 页` : `${current.pages} slides processed`) : ''}</span>}
    {current?.status === 'failed' && <span role="alert">{current.error}</span>}
    {current?.status === 'ready' && current.warnings.length > 0 && <span>{current.warnings.join(' · ')}</span>}
  </div>;
}
