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
  const report = {inspectorVersion:'3',version:1 as const,entry:'index.html',sourceHash:digest('original'),resourceHashes:{'theme.css':digest('blue')},stale:false,viewport:{width:1280,height:720},reportFile:'report.json',visualReviewRequired:true as const,slides:[],blockedResources:[],failedResources:[]};
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
    </style></head><body><div id="deck"><section class="slide active"><p>第一段架构文字 Architecture</p><p>第二段重叠文字 Workflow</p><div class="clip"><span>很长的培训定义和容量边界</span></div><p class="gradient">渐变上的文字</p><div style="color:#fff;position:absolute;top:400px">白底白字普通元素</div><img src="missing.png"></section><section class="slide"><p>第二页数据 42</p></section></div><script>window.go=(i)=>document.querySelectorAll('.slide').forEach((s,n)=>s.classList.toggle('active',n===i));</script></body></html>`;
  try {
    await writeFile(path.join(root,'index.html'),source);
    const report = await inspectNativePresentation({projectDir:root,entry:'index.html',save:async(name,bytes)=>{await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);}});
    expect(report.slides).toHaveLength(2);
    expect(report.slides[0]!.issues.map(issue=>issue.kind)).toEqual(expect.arrayContaining(['text-overlap','overflow','missing-image','visual-review','low-contrast']));
    expect(report.slides[1]!.text).toContain('第二页数据 42');
    expect(report.slides[1]!.design?.elements.length).toBeGreaterThan(0);
    expect(report.visualReviewRequired).toBe(true);
    expect(await readFile(path.join(root,'index.html'),'utf8')).toBe(source);
  } finally { await rm(root,{recursive:true,force:true}); }
},30000);
