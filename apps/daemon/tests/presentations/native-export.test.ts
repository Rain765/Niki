import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { exportNativePresentation } from '../../src/presentations/native-export.js';

const css = `body{margin:0;overflow:hidden}.slide{position:absolute;inset:0;display:none;background:#f0eae0;color:#181818;padding:50px}
.slide.active,.slide.is-active{display:block}.slide:nth-child(2){background:#202026;color:white}aside{display:none}
p{width:450px}svg{position:absolute;top:250px;left:150px}
.flow{position:absolute;top:400px;left:50px;width:1000px;height:100px}
.flow::before{content:"";position:absolute;top:50%;left:5%;right:5%;height:1px;background:repeating-linear-gradient(to right,currentColor 0 4px,transparent 4px 8px)}`;

it.each(['html', 'guizang'])('exports editable text, graphics, notes and original slide backgrounds for %s', async workflow => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'native-pptx-'));
  try {
    const container = workflow === 'html' ? 'class="deck"' : 'id="deck"';
    const navigation = workflow === 'html'
      ? 'document.documentElement.dataset.preview="1";addEventListener("message",e=>{if(e.data.type==="preview-goto")show(e.data.idx)});'
      : 'window.go=show;';
    await writeFile(path.join(dir, 'index.html'), `<!DOCTYPE html><html><head><style>${css}</style></head><body><main ${container}>
      <section class="slide active is-active"><h1>Architecture <span style="color:#ae382b">overview</span></h1><p>Editable paragraph &amp; source wording.</p><aside class="notes">Original speaker notes.</aside>
      <svg width="120" height="55" viewBox="0 0 120 55"><path d="M 2,3 L 100,48" stroke="#ef4000" stroke-width="3" fill="none"/></svg><div class="flow"></div></section>
      <section class="slide"><h1>第二页 · Second slide</h1><div style="width:200px;height:100px;background:#ae382b;border-radius:12px">Card body</div><table style="position:absolute;left:600px;top:150px;color:inherit"><tr><th>Name</th><th>Count</th></tr><tr><td>A</td><td>42</td></tr></table><pre style="position:absolute;top:600px;width:300px;height:40px;overflow:auto;line-height:20px">First code line\nSecond code line\nThird code line\nLast code line</pre></section></main>
      <script>window.__SPEAKER_NOTES__=[{purpose:'First purpose'},{purpose:'Second purpose',talk:['Second speaker detail.']}];function show(n){[...document.querySelectorAll('.slide')].forEach((slide,i)=>{slide.classList.toggle('active',i===n);slide.classList.toggle('is-active',i===n);});}${navigation}</script>
      </body></html>`);
    const progress: number[] = [];
    const result = await exportNativePresentation(dir, 'index.html', 'Architecture', page => progress.push(page));
    expect(progress).toEqual([1,2]);
    expect(result.report.stale).toBe(false);
    const zip = await JSZip.loadAsync(result.pptx);
    const first = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const second = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(first).toContain('<a:t xml:space="preserve">Architecture </a:t>');
    expect(first).toContain('Editable paragraph &amp; source wording.');
    expect(first).toContain('<a:custGeom>');
    expect(first).toContain('<a:prstDash val="dash"');
    expect(first).toMatch(/<p:bg>[\s\S]*?val="f0eae0"/i);
    expect(second).toContain('Second slide');
    expect(second).toContain('第二页');
    expect(second).toContain('<a:tbl>');
    expect(second).toMatch(/<p:bg>[\s\S]*?val="202026"/i);
    expect(second).toContain('roundRect');
    expect(second).toContain('Last code line');
    expect(result.warnings).toContain('可滚动内容已按原区域缩小排版');
    expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')).toContain('Original speaker notes.');
    expect(await zip.file('ppt/notesSlides/notesSlide2.xml')!.async('string')).toContain('Second speaker detail.');
    expect(first).not.toContain('<p:pic>');
    expect(second).not.toContain('<p:pic>');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

it('exports the original centered portrait canvas size', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'native-pptx-portrait-'));
  try {
    await writeFile(path.join(dir, 'index.html'), `<html><head><style>
      body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .deck,.slide{width:810px;height:1080px}.deck{position:relative}.slide{position:absolute;inset:0}h1{margin:40px}
      </style></head><body class="tpl-xhs-post"><div class="deck"><section class="slide is-active"><h1>Portrait source</h1></section></div>
      <script>document.documentElement.dataset.preview='1'</script></body></html>`);
    const result = await exportNativePresentation(dir, 'index.html', 'Portrait', () => {});
    const zip = await JSZip.loadAsync(result.pptx);
    expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('cx="7715250" cy="10287000"');
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Portrait source');
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 20_000);

it('keeps decorative canvas pixels in a separate image while leaving slide text editable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'native-pptx-canvas-'));
  try {
    await writeFile(path.join(dir, 'index.html'), `<html><head><style>${css}</style></head><body><main class="deck">
      <section class="slide is-active"><canvas aria-hidden="true" width="200" height="100"></canvas><h1>Editable foreground</h1><div style="width:100px;height:100px;background:#123456;mask-image:repeating-linear-gradient(to right,black 0 4px,transparent 4px 8px)"></div></section></main>
      <script>document.documentElement.dataset.preview='1';const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#ef4000';c.fillRect(0,0,200,100)</script></body></html>`);
    const result = await exportNativePresentation(dir, 'index.html', 'Canvas', () => {});
    const zip = await JSZip.loadAsync(result.pptx);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('Editable foreground');
    expect(slide).toContain('<p:pic>');
    expect(slide.match(/<p:pic>/g)).toHaveLength(2);
    expect(slide).not.toContain('val="123456"');
    expect(result.warnings).toContain('网页背景动效已静态化');
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 20_000);
