import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, PanelLeft } from 'lucide-react';
import { useI18n } from '../i18n';
import { projectFileUrl } from '../providers/registry';
import { loadNativeDeck, nativeDeckSrcdoc, type NativeDeckDocument } from '../presentations/native-viewer';
import { NativePresentationEditor } from './NativePresentationEditor';
import { NativePresentationInspectionPanel } from './NativePresentationInspectionPanel';
import { Button } from './Button';
import './native-presentation-player.css';

export function NativePresentationPreview({ projectId, name, revision = 0, editingDisabled = false }: { projectId: string; name: string; revision?: number | string; editingDisabled?: boolean }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [deck, setDeck] = useState<NativeDeckDocument | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [jump, setJump] = useState('1');
  const [expanded, setExpanded] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [editing, setEditing] = useState(false);
  const [scale, setScale] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const remembered = useRef(0);
  const positionKey = `native-ppt-position:${projectId}:${name}`;
  useEffect(() => {
    remembered.current = 0;
    try { const saved = Number(sessionStorage.getItem(positionKey)); if(Number.isInteger(saved) && saved>=0) remembered.current=saved; } catch { /* Optional session persistence. */ }
    setIndex(remembered.current); setJump(String(remembered.current+1));
  }, [positionKey]);
  useEffect(() => {
    let active=true;
    setReady(false); setError(''); setDeck(null);
    const timeout=setTimeout(()=>{active=false;setError(zh?'读取超时，请重新加载。':'Loading timed out. Retry.');},20000);
    void loadNativeDeck(projectId,name).then(value=>{if(active)setDeck(value);}).catch(e=>{if(active){setDeck(null);setError(e instanceof Error?e.message:String(e));}}).finally(()=>clearTimeout(timeout));
    return ()=>{active=false;clearTimeout(timeout);};
  }, [projectId,name,revision,retry,zh]);
  const srcDoc=useMemo(()=>deck?nativeDeckSrcdoc(deck,projectId,Math.min(remembered.current,deck.titles.length-1)):undefined,[deck,projectId]);
  const closeFullscreen=useCallback(()=>{
    if(document.fullscreenElement===root.current) void document.exitFullscreen().catch(()=>{});
    setExpanded(false);
    fullscreenButton.current?.focus();
  },[]);
  const openFullscreen=useCallback(()=>{
    setExpanded(true); setSidebar(true);
    // Mobile browsers without Fullscreen API retain the same full-window viewer.
    try { void root.current?.requestFullscreen?.().catch(()=>{}); } catch { /* Full-window fallback. */ }
  },[]);
  useEffect(()=>{
    const change=()=>{setExpanded(document.fullscreenElement===root.current);};
    document.addEventListener('fullscreenchange',change);
    return ()=>document.removeEventListener('fullscreenchange',change);
  },[]);
  useEffect(()=>{
    if(!expanded)return;
    const before=document.body.style.overflow;
    document.body.style.overflow='hidden';
    root.current?.focus();
    return ()=>{document.body.style.overflow=before;};
  },[expanded]);
  const command=useCallback((action:string,page?:number)=>frame.current?.contentWindow?.postMessage({type:'niki:ppt:command',action,index:page},'*'),[]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='niki:ppt:fullscreen') { if(event.data.exit)closeFullscreen();else openFullscreen();return; }
      const value=event.data?.index;
      if(event.data?.type!=='niki:ppt:state' || !deck || !Number.isInteger(value) || value<0 || value>=deck.titles.length)return;
      setReady(true);setError('');setIndex(value);setJump(String(value+1));remembered.current=value;
      try{sessionStorage.setItem(positionKey,String(value));}catch{/* Optional. */}
    };
    window.addEventListener('message',receive);
    return ()=>window.removeEventListener('message',receive);
  },[deck,positionKey,closeFullscreen,openFullscreen]);
  useEffect(()=>{
    if(!deck || !stage.current)return;
    const measure=()=>{const box=stage.current?.getBoundingClientRect();if(box)setScale(Math.min(box.width/deck.width,box.height/deck.height));};
    const observer=new ResizeObserver(measure);observer.observe(stage.current);measure();
    return ()=>observer.disconnect();
  },[deck,expanded,sidebar,editing]);
  useEffect(()=>{
    if(!expanded || !sidebar)return;
    root.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({block:'nearest'});
  },[index,expanded,sidebar]);
  useEffect(()=>{
    if(!deck || ready || editing)return;
    const timer=setTimeout(()=>setError(zh?'文稿加载超时，请重新加载或打开原生演示。':'The presentation took too long to load. Retry or open the original.'),20000);
    return ()=>clearTimeout(timer);
  },[deck,ready,editing,zh]);
  const go=()=>{if(deck){const page=Number(jump);if(Number.isInteger(page)&&page>=1&&page<=deck.titles.length)command('goto',page-1);else setJump(String(index+1));}};
  return <div ref={root} className={`native-player${expanded?' is-expanded':''}`} tabIndex={-1} data-testid="native-presentation-preview"
    onKeyDown={event=>{
      if(event.metaKey || event.ctrlKey || event.altKey)return;
      if((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
      if(event.key==='Escape' && expanded){event.preventDefault();closeFullscreen();return;}
      if(event.key.toLowerCase()==='f'){event.preventDefault();expanded?closeFullscreen():openFullscreen();return;}
      if(!ready)return;
      const action=['ArrowRight','PageDown'].includes(event.key)?'next':['ArrowLeft','PageUp'].includes(event.key)?'prev':null;
      if(action){event.preventDefault();command(action);}
      else if(event.key==='Home'||event.key==='End'){event.preventDefault();command('goto',event.key==='Home'?0:deck!.titles.length-1);}
    }}>
    <div className="native-player__toolbar">
      {expanded && <Button aria-label={zh?'切换页面目录':'Toggle slide list'} aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}><PanelLeft size={18}/></Button>}
      <span className="native-player__title" title={deck?.titles[index]}>{deck?.titles[index] || name}</span>
      <Button disabled={!ready || editing || editingDisabled} onClick={()=>{try{sessionStorage.removeItem(`native-ppt-inspection:${projectId}:${deck?.name??name}`);}catch{/* Optional. */}setEditing(true);}}>{zh?'编辑本页':'Edit slide'}</Button>
      <a className="od-button od-button--secondary od-button--default" href={`/api/projects/${encodeURIComponent(projectId)}/archive`}>{zh?'下载文稿':'Download deck'}</a>
      <button ref={fullscreenButton} type="button" className="od-button od-button--secondary od-button--default" onClick={expanded?closeFullscreen:openFullscreen} aria-label={expanded?(zh?'退出全屏':'Exit fullscreen'):(zh?'全屏':'Fullscreen')}>
        {expanded?<Minimize size={18}/>:<Maximize size={18}/>}<span>{expanded?(zh?'退出全屏':'Exit fullscreen'):(zh?'全屏':'Fullscreen')}</span>
      </button>
    </div>
    {editing ? <NativePresentationEditor projectId={projectId} name={deck?.name??name} initialPage={index} onClose={()=>{setEditing(false);setReady(false);setDeck(null);setRetry(n=>n+1);}}/> : <div className={`native-player__body${expanded&&sidebar?' has-sidebar':''}`}>
      {expanded && sidebar && <nav className="native-player__sidebar" aria-label={zh?'页面目录':'Slide list'}>{deck?.titles.map((title,i)=><button type="button" key={i} disabled={!ready} aria-current={i===index?'page':undefined} onClick={()=>command('goto',i)}><span>{String(i+1).padStart(2,'0')}</span><span>{title}</span></button>)}</nav>}
      <div ref={stage} className="native-player__stage">
        {deck && <iframe ref={frame} title={zh?'文稿预览':'Presentation preview'} srcDoc={srcDoc} sandbox="allow-scripts" style={{width:deck.width,height:deck.height,transform:`translate(-50%, -50%) scale(${scale})`}} />}
        {!ready && !error && <div className="native-player__skeleton" role="status" aria-label={zh?'正在加载文稿':'Loading presentation'}><span/><span/><span/></div>}
        {error && <div className="native-player__error" role="alert">{error}<Button onClick={()=>setRetry(n=>n+1)}>{zh?'重新加载':'Reload'}</Button></div>}
      </div>
    </div>}
    <div className="native-player__navigation">
      <Button aria-label={zh?'上一页':'Previous slide'} disabled={!ready||index===0||editing} onClick={()=>command('prev')}><ChevronLeft size={20}/></Button>
      <label><span className="native-player__sr-only">{zh?'跳转页码':'Go to slide'}</span><input type="number" min={1} max={deck?.titles.length??1} value={jump} disabled={!ready||editing} onChange={e=>setJump(e.target.value)} onBlur={go} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();go();}}}/></label><span>/ {deck?.titles.length??'—'}</span>
      <Button aria-label={zh?'下一页':'Next slide'} disabled={!ready||editing} onClick={()=>command('next')}><ChevronRight size={20}/></Button>
    </div>
    {!expanded && !editing && <details className="native-player__more"><summary>{zh?'更多操作':'More actions'}</summary><a href={projectFileUrl(projectId,deck?.name??name)} target="_blank" rel="noopener noreferrer">{zh?'原生演示 / 演讲者模式 ↗':'Original presentation / presenter mode ↗'}</a><NativePresentationInspectionPanel key={`${revision}:${retry}`} projectId={projectId} name={deck?.name??name}/></details>}
  </div>;
}
