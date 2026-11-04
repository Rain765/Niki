import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectNativePresentation } from '../../src/presentations/native-inspection.js';

it('rejects paths and symlinks outside the project before rendering or writing review files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-review-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'native-review-outside-'));
  const save = vi.fn();
  try {
    await writeFile(path.join(outside, 'private.html'), 'private');
    await symlink(path.join(outside, 'private.html'), path.join(root, 'link.html'));
    for (const entry of ['../private.html', '/private.html', 'link.html', '.env.html', 'input.pdf']) {
      await expect(inspectNativePresentation({projectDir:root,entry,save})).rejects.toThrow();
    }
    expect(save).not.toHaveBeenCalled();
  } finally { await rm(root,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});

it('invalidates a saved review when its entry or a local dependency changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-review-stale-'));
  const { createHash } = await import('node:crypto');
  const { nativeInspectionIsStale } = await import('../../src/presentations/native-inspection.js');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const report = {inspectorVersion:'5',version:1 as const,entry:'index.html',sourceHash:digest('original'),resourceHashes:{'theme.css':digest('blue')},stale:false,viewport:{width:1280,height:720},reportFile:'report.json',visualReviewRequired:true as const,slides:[],blockedResources:[],failedResources:[]};
  try {
    await writeFile(path.join(root,'index.html'),'original');
    await writeFile(path.join(root,'theme.css'),'blue');
    expect(await nativeInspectionIsStale(root,report)).toBe(false);
    await writeFile(path.join(root,'theme.css'),'red');
    expect(await nativeInspectionIsStale(root,report)).toBe(true);
    await writeFile(path.join(root,'theme.css'),'blue');
    await writeFile(path.join(root,'index.html'),'edited');
    expect(await nativeInspectionIsStale(root,report)).toBe(true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

it('renders every page and reports overlap, clipping, complex backgrounds and missing assets without rewriting the deck', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-render-review-'));
  const {mkdir,readFile} = await import('node:fs/promises');
  const source = `<!doctype html><html><head><style>
    body{margin:0}.slide{width:1280px;height:720px;background:white;position:relative}.slide:not(.active){display:none}
    p{font:30px sans-serif;margin:0;position:absolute;left:80px;top:80px}.clip{overflow:hidden;width:80px;height:18px;position:absolute;top:200px}
    .gradient{background:linear-gradient(black,white);top:300px;color:white}
    </style></head><body><div id="deck"><section class="slide active"><p>第一段架构文字 Architecture</p><p>第二段重叠文字 Workflow</p><div class="clip"><span>很长的培训定义和容量边界</span></div><p class="gradient">渐变上的文字</p><div style="color:#fff;position:absolute;top:400px">白底白字普通元素</div><div style="position:absolute;top:460px;background:color-mix(in srgb,blue 6%,white);color:#102a60">浅色混合背景上的深字</div><div style="position:absolute;top:510px;color:color(srgb 1 1 1)">现代颜色格式的白字</div><img src="missing.png"></section><section class="slide"><p>第二页数据 42</p></section></div><script>window.go=(i)=>document.querySelectorAll('.slide').forEach((s,n)=>s.classList.toggle('active',n===i));</script></body></html>`;
  try {
    await writeFile(path.join(root,'index.html'),source);
    const report = await inspectNativePresentation({projectDir:root,entry:'index.html',save:async(name,bytes)=>{await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);}});
    expect(report.slides).toHaveLength(2);
    expect(report.slides[0]!.issues.map(issue=>issue.kind)).toEqual(expect.arrayContaining(['text-overlap','overflow','missing-image','visual-review','low-contrast']));
    expect(report.slides[0]!.issues).not.toContainEqual({kind:'low-contrast',text:'浅色混合背景上的深字'});
    expect(report.slides[0]!.issues).toContainEqual({kind:'low-contrast',text:'现代颜色格式的白字'});
    expect(report.slides[1]!.text).toContain('第二页数据 42');
    expect(report.slides[1]!.design?.elements.length).toBeGreaterThan(0);
    expect(report.visualReviewRequired).toBe(true);
    expect(await readFile(path.join(root,'index.html'),'utf8')).toBe(source);
  } finally { await rm(root,{recursive:true,force:true}); }
},30000);

it('does not accept stable but invisible animated text as a settled slide', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-hidden-animation-'));
  try {
    await writeFile(path.join(root,'index.html'),`<!doctype html><style>body{margin:0}.slide{width:1280px;height:720px;background:white}.hidden{transform:scaleX(0);transform-origin:left}</style><div id="deck"><section class="slide"><div class="hidden"><h2>隐藏标题必须被验收发现</h2></div><p>普通正文</p></section></div>`);
    const report = await inspectNativePresentation({projectDir:root,entry:'index.html',save:async()=>{}});
    expect(report.failedResources).toContain('page-1:entrance-animation-not-settled');
    expect(report.slides[0]!.issues).toContainEqual({kind:'dim-text',text:'隐藏标题必须被验收发现'});
  } finally { await rm(root,{recursive:true,force:true}); }
},30000);

it('waits for a delayed ancestor entrance without changing the original animation or source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-delayed-animation-'));
  const source = `<!doctype html><style>body{margin:0}.slide{width:1280px;height:720px;background:white}#title{opacity:0;transform:scaleX(0)}</style><div id="deck"><section class="slide"><div id="title"><h2>延迟入场后完整显示</h2></div></section></div><script>setTimeout(()=>{title.animate([{opacity:0,transform:'scaleX(0)'},{opacity:1,transform:'scaleX(1)'}],{duration:600,fill:'forwards'});},3500);</script>`;
  try {
    await writeFile(path.join(root,'index.html'),source);
    const report = await inspectNativePresentation({projectDir:root,entry:'index.html',save:async()=>{}});
    expect(report.failedResources).toEqual([]);
    expect(report.slides[0]!.issues).not.toContainEqual({kind:'dim-text',text:'延迟入场后完整显示'});
    const {readFile} = await import('node:fs/promises');
    expect(await readFile(path.join(root,'index.html'),'utf8')).toBe(source);
  } finally { await rm(root,{recursive:true,force:true}); }
},30000);

it('reveals a manual pipeline without advancing to the next slide before capture', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-manual-pipeline-'));
  try {
    await writeFile(path.join(root,'index.html'),`<!doctype html><style>body{margin:0}.slide{width:1280px;height:720px;background:white}.slide:not(.active){display:none}</style><nav id="nav"><button>1</button><button>2</button></nav><div id="deck"><section class="slide active" data-animate="pipeline"><p data-anim="step">第一步</p><p data-anim="step" style="opacity:.15">第二步</p></section><section class="slide"><h2>下一页</h2></section></div><script>let index=0;const slides=[...document.querySelectorAll('.slide')];window.go=(i)=>{index=i;slides.forEach((s,n)=>s.classList.toggle('active',n===i));};document.querySelectorAll('#nav button').forEach((b,i)=>b.onclick=()=>go(i));window.__pipeAdvance=()=>{const step=slides[index].querySelector('[style]');if(!step||step.style.opacity==='1')return false;step.style.opacity='1';return true;};addEventListener('keydown',e=>{if(e.key==='ArrowRight'&&!window.__pipeAdvance())go(Math.min(index+1,1));});</script>`);
    const report = await inspectNativePresentation({projectDir:root,entry:'index.html',save:async()=>{}});
    expect(report.failedResources).toEqual([]);
    expect(report.slides[0]!.design?.elements.map(el=>el.text)).toContain('第二步');
    expect(report.slides[1]!.design?.elements.map(el=>el.text)).toContain('下一页');
  } finally { await rm(root,{recursive:true,force:true}); }
},30000);
