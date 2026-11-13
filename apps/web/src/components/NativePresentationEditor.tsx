import { useEffect, useState } from 'react';
import { fetchProjectFileText, writeProjectTextFile } from '../providers/registry';
import { presentationTextFields, replacePresentationText, type PresentationTextField } from '../edit-mode/presentation-text';
import { useI18n } from '../i18n';

export function NativePresentationEditor({ projectId, name, onClose, initialPage = 0 }: { projectId: string; name: string; onClose: () => void; initialPage?: number }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [targetName, setTargetName] = useState(name);
  const [source, setSource] = useState<string | null>(null);
  const [fields, setFields] = useState<PresentationTextField[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [page, setPage] = useState(initialPage); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void fetchProjectFileText(projectId, name).then(async text => {
    let target = name;
    if (text !== null && !presentationTextFields(text).length) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const frames = doc.querySelectorAll('iframe[src]');
      if (frames.length === 1) {
        const base = new URL(name, 'https://project.invalid/');
        const url = new URL(frames[0]!.getAttribute('src')!, base);
        if (url.origin === base.origin && /\.html?$/.test(url.pathname)) {
          target = decodeURIComponent(url.pathname.slice(1));
          text = await fetchProjectFileText(projectId, target);
        }
      }
    }
    if (!active) return;
    if (text === null) setError(zh ? '读取失败' : 'Could not load');
    else { setTargetName(target); setSource(text); setFields(presentationTextFields(text)); }
  }).catch(() => { if (active) setError(zh ? '读取失败' : 'Could not load'); }); return () => { active = false; }; }, [projectId, name, zh]);
  const save = async () => {
    if (source === null) return;
    setBusy(true); setError('');
    try {
      if (await fetchProjectFileText(projectId, targetName) !== source) throw new Error(zh ? '文稿已在其他位置更新，请关闭后重新编辑。' : 'The deck changed elsewhere. Reopen the editor.');
      const changes = Object.entries(drafts).map(([index, after]) => ({ path: fields[Number(index)]!.path, before: fields[Number(index)]!.text, after }));
      const updated = replacePresentationText(source, changes);
      if (!await writeProjectTextFile(projectId, targetName, updated)) throw new Error(zh ? '保存失败，请重试' : 'Could not save');
      setSource(updated); setFields(presentationTextFields(updated)); setDrafts({}); onClose();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  };
  const pages = Math.max(initialPage, ...fields.map(f => f.slide)) + 1;
  return <div className="native-ppt-text-editor" role="region" aria-label={zh ? '编辑文案' : 'Edit text'}>
    <div className="native-ppt-text-editor__bar"><select aria-label={zh ? '页码' : 'Slide'} value={page} onChange={e => setPage(Number(e.target.value))}>{Array.from({length: pages}, (_, i) => <option key={i} value={i}>{zh ? `第 ${i + 1} 页` : `Slide ${i + 1}`}</option>)}</select><button disabled={busy} onClick={onClose}>{zh ? '取消' : 'Cancel'}</button><button disabled={busy || !Object.keys(drafts).length} onClick={() => void save()}>{busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存修改' : 'Save changes')}</button></div>
    {error && <p role="alert">{error}</p>}
    {source === null && !error && <p role="status">{zh ? '加载中…' : 'Loading…'}</p>}
    {source !== null && !fields.length && <p>{zh ? '未找到可编辑页面，可在源文件或对话中修改。' : 'No slide text found. Edit the source or use chat.'}</p>}
    <div className="native-ppt-text-editor__fields">{fields.map((field, index) => field.slide === page && <textarea aria-label={`${zh ? '文案' : 'Text'} ${index + 1}`} key={index} value={drafts[index] ?? field.text} rows={2} onChange={e => setDrafts(old => ({...old, [index]: e.target.value}))} />)}</div>
  </div>;
}
