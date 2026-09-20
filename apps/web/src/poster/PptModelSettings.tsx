'use client';
import { useEffect, useRef, useState } from 'react';
import { PPT_MODEL_PROVIDERS, type PptApiProvider, type PptModelSettings as Settings } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { Button } from '../components/Button';
import { pptModelRequest } from './ppt-model-api';
import './ppt-model-settings.css';

export function PptModelSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Settings>();
  const [keys, setKeys] = useState<Partial<Record<PptApiProvider, string>>>({});
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) { if (dialog.current?.open) dialog.current.close(); setKeys({}); return; }
    dialog.current?.showModal(); setError(''); setMessage('');
    let active = true;
    void pptModelRequest().then(result => { if (active) setData(result); }).catch(() => { if (active) setError(zh ? '无法加载模型设置' : 'Could not load model settings'); });
    return () => { active = false; };
  }, [open, zh]);
  const act = async (id: string, action: () => Promise<Settings>, success: string) => {
    setBusy(id); setError(''); setMessage('');
    try { setData(await action()); if (Object.hasOwn(PPT_MODEL_PROVIDERS,id)) setKeys(old=>({...old,[id]:''})); setMessage(success); window.dispatchEvent(new Event('niki:ppt-models-changed')); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(''); }
  };
  return <dialog className="ppt-model-settings" ref={dialog} aria-labelledby="ppt-model-settings-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="ppt-model-settings-title">{zh ? '模型设置' : 'Model settings'}</h2><Button variant="ghost" onClick={onClose}>{zh ? '关闭' : 'Close'}</Button></header>
    <p>{zh ? '用于 PPT 创作。连接测试会发起一次小额 API 请求。' : 'For PPT creation. Connection tests make a small billable API request.'}</p>
    {data && <label>{zh ? '新文稿默认模型' : 'Default for new presentations'}<select value={data.defaultProvider} disabled={Boolean(busy)} onChange={event => { const provider=event.target.value; void act('default', () => pptModelRequest('/default','PUT',{provider}), zh?'默认模型已保存，仅影响新文稿':'Default saved for new presentations'); }}><option value="existing">{zh?'当前模型':'Existing model'}</option>{data.providers.map(item=><option key={item.provider} value={item.provider} disabled={!item.testedAt}>{PPT_MODEL_PROVIDERS[item.provider].label}</option>)}</select></label>}
    {data?.providers.map(item => <section key={item.provider}>
      <h3>{PPT_MODEL_PROVIDERS[item.provider].label}</h3>
      <small>{PPT_MODEL_PROVIDERS[item.provider].baseUrl} · {PPT_MODEL_PROVIDERS[item.provider].model}</small>
      <label htmlFor={`ppt-key-${item.provider}`}>API Key {item.configured ? `· ${item.maskedKey}` : ''}</label>
      <input id={`ppt-key-${item.provider}`} type="password" autoComplete="new-password" value={keys[item.provider] ?? ''} placeholder={item.configured ? (zh?'输入新密钥以替换':'Enter replacement key') : (zh?'输入 API Key':'Enter API Key')} disabled={Boolean(busy)} onChange={e => setKeys(old => ({...old,[item.provider]:e.target.value}))}/>
      <div className="ppt-model-settings__actions">
        <Button disabled={Boolean(busy) || !keys[item.provider]?.trim()} onClick={() => { void act(item.provider, () => pptModelRequest(`/${item.provider}`,'PUT',{apiKey:keys[item.provider]}),zh?'密钥已保存，请测试连接':'Key saved. Test the connection next.'); }}>{zh?'保存密钥':'Save key'}</Button>
        <Button disabled={Boolean(busy) || !item.configured || Boolean(keys[item.provider]?.trim())} onClick={() => { void act(item.provider, () => pptModelRequest(`/${item.provider}/test`,'POST'),zh?'连接成功，可选择此模型。生成质量需另行验收。':'Connected. Generation quality still needs review.'); }}>{busy===item.provider?(zh?'处理中…':'Working…'):(zh?'测试连接':'Test connection')}</Button>
        <Button variant="ghost" disabled={Boolean(busy) || !item.configured || data.defaultProvider===item.provider} onClick={() => { void act(item.provider, () => pptModelRequest(`/${item.provider}`,'DELETE'),zh?'密钥已删除':'Key deleted'); }}>{zh?'删除':'Delete'}</Button>
        <span>{item.testedAt?(zh?'连接已验证':'Connection verified'):item.configured?(zh?'待测试':'Not tested'):(zh?'未配置':'Not configured')}</span>
      </div>
    </section>)}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </dialog>;
}
