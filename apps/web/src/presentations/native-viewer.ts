import { buildSrcdoc } from '../runtime/srcdoc';
import { fetchProjectFileText, projectFileUrl } from '../providers/registry';

export interface NativeDeckDocument {
  source: string;
  name: string;
  titles: string[];
  width: number;
  height: number;
  moduleImports?: Record<string, string>;
}

// A sandboxed srcdoc has an opaque origin: native module imports cannot send the
// app's login cookie. Fetch original, self-contained project modules in the host
// and provide their identical bytes through an import map, without changing the deck.
async function originalModuleImports(source: string, projectId: string, name: string): Promise<Record<string, string>> {
  const root = new URL(projectFileUrl(projectId, ''), window.location.origin);
  const base = new URL(projectFileUrl(projectId, name), window.location.origin);
  const imports: Record<string, string> = {};
  const references = [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]!);
  await Promise.all([...new Set(references)].map(async reference => {
    const url = new URL(reference, base);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
    const text = await fetchProjectFileText(projectId, decodeURIComponent(url.pathname.slice(root.pathname.length)), { cache: 'no-store' });
    // Keep original URL resolution for modules with dependencies or import.meta.
    if (text === null || /\b(?:from\s*['"]|import\s*(?:['".(]))/.test(text)) return;
    imports[url.href] = `data:text/javascript;charset=utf-8,${encodeURIComponent(text)}`;
  }));
  return imports;
}

/** Resolve original deck wrappers without changing the saved document or its runtime. */
export async function loadNativeDeck(projectId: string, entry: string): Promise<NativeDeckDocument> {
  const visited = new Set<string>();
  let name = entry;
  while (!visited.has(name)) {
    visited.add(name);
    const source = await fetchProjectFileText(projectId, name, {cache:'no-store'});
    if (source === null) throw new Error('无法读取文稿 / Could not load presentation');
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const slides = Array.from(doc.querySelectorAll('#deck > .slide, .deck > .slide, body > .slide'));
    if (slides.length) {
      const portrait = doc.body.classList.contains('tpl-xhs-post');
      const moduleImports = await originalModuleImports(source, projectId, name);
      return {source, name, moduleImports, titles:slides.map((slide,i) => (slide.getAttribute('data-title') || slide.querySelector('h1,h2,h3')?.textContent || `Page ${i+1}`).trim().replace(/\s+/g,' ')),width:portrait?960:1280,height:portrait?1280:720};
    }
    const frames = doc.querySelectorAll('iframe[src]');
    if (frames.length !== 1) throw new Error('页面尚未生成完整 / Slides are not ready yet');
    const root = new URL(projectFileUrl(projectId, ''), window.location.origin);
    const next = new URL(frames[0]!.getAttribute('src')!, new URL(projectFileUrl(projectId,name), window.location.origin));
    if (next.origin !== root.origin || !next.pathname.startsWith(root.pathname) || !/\.html?$/i.test(next.pathname)) throw new Error('无法预览此文稿入口 / Unsupported presentation entry');
    name = decodeURIComponent(next.pathname.slice(root.pathname.length));
  }
  throw new Error('文稿入口循环引用 / Circular presentation entry');
}

/** Preview-only bridge: drive the original navigation, never restyle slides or save generated HTML. */
export function nativeDeckSrcdoc(deck: NativeDeckDocument, projectId: string, initialPage: number): string {
  const baseHref = new URL(projectFileUrl(projectId,deck.name), window.location.origin).href;
  const compatibility = `<script data-niki-native-compat>for(const key of ['replaceState','pushState']){const original=history[key].bind(history);history[key]=function(...args){try{return original(...args)}catch(e){if(e.name!=='SecurityError')throw e}}}</script>`;
  const importMap = Object.keys(deck.moduleImports ?? {}).length ? `<script type="importmap">${JSON.stringify({ imports: deck.moduleImports }).replace(/</g,'\\u003c')}</script>` : '';
  const html = deck.source.replace(/<head\b[^>]*>/i, match => match+compatibility+importMap);
  const bridge = `<script data-niki-native-viewer>(function(){
    const slides=[...document.querySelectorAll('#deck > .slide, .deck > .slide, body > .slide')];
    const start=${Number.isInteger(initialPage)?Math.max(0,initialPage):0};
    let last=-1;
    function current(){
      if(document.querySelector('#deck') && Number.isInteger(window.__currentSlideIndex)) return window.__currentSlideIndex;
      const active=slides.findIndex(s=>s.classList.contains('is-active') || s.classList.contains('active'));
      return Math.max(0,active);
    }
    function send(){ const index=current(); if(index===last)return; last=index; parent.postMessage({type:'niki:ppt:state',index},'*'); }
    function goto(index){
      index=Math.max(0,Math.min(slides.length-1,index));
      if(document.querySelector('#deck') && typeof window.go==='function') window.go(index,{force:true});
      else { const thumbs=document.querySelectorAll('.overview .thumb'); if(thumbs[index]) thumbs[index].click(); else if(index!==current()) document.dispatchEvent(new KeyboardEvent('keydown',{key:index<current()?'ArrowLeft':'ArrowRight',bubbles:true})); }
      send();
    }
    function key(key){ document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})); send(); }
    addEventListener('message',event=>{if(event.source!==parent)return;const data=event.data;if(!data || data.type!=='niki:ppt:command')return;
      if(data.action==='goto' && Number.isInteger(data.index)) goto(data.index);
      if(data.action==='next') key('ArrowRight');
      if(data.action==='prev') key('ArrowLeft');
    });
    addEventListener('keydown',event=>{if(event.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
      if(event.key==='Escape' || event.key.toLowerCase()==='f'){event.preventDefault();event.stopImmediatePropagation();parent.postMessage({type:'niki:ppt:fullscreen',exit:event.key==='Escape'},'*');}
    },true);
    function ready(){
      if(!slides.length)return;
      const observer=new MutationObserver(send);
      slides.forEach(slide=>observer.observe(slide,{attributes:true,attributeFilter:['class']}));
      const root=document.querySelector('#deck');if(root)observer.observe(root,{attributes:true,attributeFilter:['style']});
      goto(start);send();
    }
    if(document.readyState==='complete')ready();else addEventListener('load',ready,{once:true});
  })();</script>`;
  return buildSrcdoc(html,{baseHref}).replace(/<\/body>/i, bridge+'</body>');
}
