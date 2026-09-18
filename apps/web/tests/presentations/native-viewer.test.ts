// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadNativeDeck, nativeDeckSrcdoc } from '../../src/presentations/native-viewer';
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
