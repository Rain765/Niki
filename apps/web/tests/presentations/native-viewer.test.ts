// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadNativeDeck, nativeDeckSrcdoc, NativeDeckPendingError } from '../../src/presentations/native-viewer';
import { fetchProjectFileText } from '../../src/providers/registry';
vi.mock('../../src/providers/registry',()=>({fetchProjectFileText:vi.fn(),projectFileUrl:(id:string,name:string)=>`/api/projects/${id}/raw/${name}`}));
afterEach(()=>vi.resetAllMocks());
it('resolves project-local wrappers and preserves all original layout and runtime code',async()=>{
 const source='<html><head><style>.slide { color: red }</style></head><body><div id="deck"><section class="slide"><h1>封面</h1></section><section class="slide"><h2>流程</h2></section></div><script>function go(n){window.__currentSlideIndex=n;}</script></body></html>';
 vi.mocked(fetchProjectFileText).mockImplementation(async(_id,name)=>name==='index.html'?'<iframe src="deck/index.html"></iframe>':source);
 const deck=await loadNativeDeck('p','index.html');
 expect(deck.name).toBe('deck/index.html');expect(deck.titles).toEqual(['封面','流程']);expect(deck.source).toBe(source);
 const preview=nativeDeckSrcdoc(deck,'p',1);
 expect(preview).toContain('.slide { color: red }');expect(preview).toContain('function go(n){window.__currentSlideIndex=n;}');
 expect(preview).toContain('window.go(index,{force:true})');expect(preview).toContain("document.dispatchEvent(new KeyboardEvent('keydown'");
 expect(preview).not.toContain('data-od-deck-bridge');
});
it('rejects circular and out-of-project wrappers without fetching other project files',async()=>{
 vi.mocked(fetchProjectFileText).mockResolvedValue('<iframe src="index.html"></iframe>');
 await expect(loadNativeDeck('p','index.html')).rejects.toThrow('Circular');
 expect(fetchProjectFileText).toHaveBeenCalledTimes(1);
 vi.mocked(fetchProjectFileText).mockResolvedValue('<iframe src="/api/projects/other/raw/index.html"></iframe>');
 await expect(loadNativeDeck('p','index.html')).rejects.toThrow('Unsupported');
 expect(fetchProjectFileText).toHaveBeenCalledTimes(2);
});
it('preserves authenticated local module bytes through a preview-only import map',async()=>{
 const source='<html><head></head><body><section class="slide"><h1>Title</h1></section><script type="module">await import("./assets/motion.min.js")</script></body></html>';
 const module='export const animate=()=>"original";';
 vi.mocked(fetchProjectFileText).mockImplementation(async(_id,name)=>name==='index.html'?source:module);
 const deck=await loadNativeDeck('p','index.html');
 const url=new URL('/api/projects/p/raw/assets/motion.min.js',window.location.origin).href;
 expect(deck.moduleImports?.[url]).toBe(`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`);
 expect(deck.source).toBe(source);expect(nativeDeckSrcdoc(deck,'p',0)).toContain('type="importmap"');
});

it('carries local styles, nested styles and classic scripts into an opaque preview in their original order', async () => {
 const source='<html><head><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="style.css" media="screen"><link rel="stylesheet" href="/api/projects/other/raw/private.css"></head><body><section class="slide"><h1>Title</h1></section><script defer src="assets/runtime.js"></script></body></html>';
 const files: Record<string, string> = {
   'deck/index.html': source,
   'deck/assets/base.css': '@import "../theme/colors.css"; /* url(missing.svg) */ .slide{display:none}',
   'deck/theme/colors.css': '.slide{color:blue}',
   'deck/style.css': '.slide.is-active{display:block}',
   'deck/assets/runtime.js': 'window.slideRuntime = true;',
 };
 vi.mocked(fetchProjectFileText).mockImplementation(async (_id,name) => files[name] ?? null);
 const deck = await loadNativeDeck('p','deck/index.html');
 expect(deck.source).toBe(source);
 const preview = new DOMParser().parseFromString(nativeDeckSrcdoc(deck,'p',0),'text/html');
 const styles = Array.from(preview.querySelectorAll('link[rel="stylesheet"]'));
 const decode = (url: string) => decodeURIComponent(url.slice(url.indexOf(',')+1));
 const base = decode(styles[0]!.getAttribute('href')!);
 expect(base).toContain('data:text/css;charset=utf-8,'+encodeURIComponent(files['deck/theme/colors.css']!));
 expect(base).toContain('.slide{display:none}');
 expect(decode(styles[1]!.getAttribute('href')!)).toBe(files['deck/style.css']);
 expect(styles[1]!.getAttribute('media')).toBe('screen');
 expect(styles[2]!.getAttribute('href')).toBe('/api/projects/other/raw/private.css');
 const script = preview.querySelector('script[src]')!;
 expect(script.hasAttribute('defer')).toBe(true);
 expect(decode(script.getAttribute('src')!)).toBe(files['deck/assets/runtime.js']);
 expect(vi.mocked(fetchProjectFileText).mock.calls.map(([,name]) => name).sort()).toEqual(Object.keys(files).sort());
});

it('reports a missing local stylesheet before showing an unstyled deck', async () => {
 vi.mocked(fetchProjectFileText).mockImplementation(async (_id,name) => name === 'index.html'
   ? '<link rel="stylesheet" href="style.css"><section class="slide"><h1>Title</h1></section>'
   : null);
 await expect(loadNativeDeck('p','index.html')).rejects.toThrow('Could not load presentation assets');
});

it('identifies an unfinished entry separately from read and wrapper failures',async()=>{
 vi.mocked(fetchProjectFileText).mockResolvedValue('<html><body></body></html>');
 await expect(loadNativeDeck('p','index.html')).rejects.toBeInstanceOf(NativeDeckPendingError);
 vi.mocked(fetchProjectFileText).mockResolvedValue(null);
 await expect(loadNativeDeck('p','index.html')).rejects.toThrow('Could not load presentation');
});
