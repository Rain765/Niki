import { buildSrcdoc } from '../runtime/srcdoc';
import { fetchProjectFileText, projectFileUrl } from '../providers/registry';

/** A published entry can exist before the generator has written its slides. */
export class NativeDeckPendingError extends Error {
  constructor() { super('Presentation slides pending'); this.name = 'NativeDeckPendingError'; }
}

export interface NativeDeckDocument {
  source: string;
  previewSource?: string;
  name: string;
  titles: string[];
  width: number;
  height: number;
  moduleImports?: Record<string, string>;
}

function previewDataUrl(mime: string, text: string): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
}

// The opaque viewer cannot use the application's SameSite login cookie.
// Read only references inside this project from the authenticated host and
// supply their bytes to the preview, leaving the saved deck untouched.
async function preparePreviewSource(doc: Document, projectId: string, name: string): Promise<string | undefined> {
  const root = new URL(projectFileUrl(projectId, ''), window.location.origin);
  const base = new URL(projectFileUrl(projectId, name), window.location.origin);
  const files = new Map<string, Promise<string>>();
  const local = (url: URL) => url.origin === root.origin && url.pathname.startsWith(root.pathname) && url.pathname !== root.pathname;
  const missing = () => new Error('文稿资源加载失败，请重新加载。 / Could not load presentation assets. Retry.');
  const fileText = (url: URL) => {
    const path = decodeURIComponent(url.pathname.slice(root.pathname.length));
    if (!files.has(path)) files.set(path, fetchProjectFileText(projectId, path, { cache: 'no-store' }).then(text => {
      if (text === null) throw missing();
      return text;
    }));
    return files.get(path)!;
  };
  const media = new Map<string, Promise<string>>();
  const mediaUrl = (url: URL) => {
    const hash = url.hash;
    const path = url.origin + url.pathname;
    if (!media.has(path)) media.set(path, fetch(path, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw missing();
      const blob = await response.blob();
      if (!/^(?:image|font)\//i.test(blob.type)) return path;
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(missing());
        reader.readAsDataURL(blob);
      });
    }));
    return media.get(path)!.then(data => data + hash);
  };
  const stylesheet = async (url: URL, ancestors = new Set<string>()): Promise<string> => {
    if (ancestors.has(url.pathname)) return previewDataUrl('text/css', '');
    const chain = new Set(ancestors).add(url.pathname);
    const css = await fileText(url);
    const pattern = /\/\*[\s\S]*?\*\/|(@import\s+)(?:"([^"]*)"|'([^']*)')|(@import\s+)?url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
    const rewritten = new Map<string, string>();
    await Promise.all([...css.matchAll(pattern)].map(async match => {
      const reference = (match[2] ?? match[3] ?? match[5] ?? match[6] ?? match[7] ?? '').trim();
      if (!reference || reference.startsWith('#') || /^(?:data|blob):/i.test(reference)) return;
      const dependency = new URL(reference, url);
      const importPrefix = match[1] ?? match[4];
      let href = dependency.href;
      if (local(dependency)) {
        if (!importPrefix) href = await mediaUrl(dependency);
        else if (/\.css$/i.test(dependency.pathname)) href = await stylesheet(dependency, chain);
      }
      rewritten.set(match[0], `${importPrefix ?? ''}url(${JSON.stringify(href)})`);
    }));
    return previewDataUrl('text/css', css.replace(pattern, match => rewritten.get(match) ?? match));
  };
  const resources = [...doc.querySelectorAll('link[rel~="stylesheet" i][href],script[src],img[src]')];
  const replacements = await Promise.all(resources.map(async element => {
    const attr = element.tagName === 'LINK' ? 'href' : 'src';
    const url = new URL(element.getAttribute(attr)!, base);
    if (!local(url)) return false;
    if (element.tagName === 'LINK') {
      if (!/\.css$/i.test(url.pathname)) return false;
      element.setAttribute(attr, await stylesheet(url));
    } else if (element.tagName === 'IMG') {
      element.setAttribute(attr, await mediaUrl(url));
    } else {
      const type = element.getAttribute('type')?.trim().toLowerCase();
      if (!/\.[cm]?js$/i.test(url.pathname) || (type && !['text/javascript', 'application/javascript'].includes(type))) return false;
      element.setAttribute(attr, previewDataUrl('text/javascript', await fileText(url)));
    }
    return true;
  }));
  if (replacements.some(Boolean)) return '<!doctype html>\n' + doc.documentElement.outerHTML;
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
    imports[url.href] = previewDataUrl('text/javascript', text);
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
      const [moduleImports, previewSource] = await Promise.all([
        originalModuleImports(source, projectId, name),
        preparePreviewSource(doc, projectId, name),
      ]);
      return {source, previewSource, name, moduleImports, titles:slides.map((slide,i) => (slide.getAttribute('data-title') || slide.querySelector('h1,h2,h3')?.textContent || `Page ${i+1}`).trim().replace(/\s+/g,' ')),width:portrait?960:1280,height:portrait?1280:720};
    }
    const frames = doc.querySelectorAll('iframe[src]');
    if (frames.length !== 1) throw new NativeDeckPendingError();
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
  const html = (deck.previewSource ?? deck.source).replace(/<head\b[^>]*>/i, match => match+compatibility+importMap);
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
    function turn(offset){
      if(document.querySelector('#deck') && typeof window.go==='function') goto(current()+offset);
      else { document.dispatchEvent(new KeyboardEvent('keydown',{key:offset>0?'ArrowRight':'ArrowLeft',bubbles:true})); send(); }
    }
    addEventListener('message',event=>{if(event.source!==parent)return;const data=event.data;if(!data || data.type!=='niki:ppt:command')return;
      if(data.action==='goto' && Number.isInteger(data.index)) goto(data.index);
      if(data.action==='next') turn(1);
      if(data.action==='prev') turn(-1);
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
