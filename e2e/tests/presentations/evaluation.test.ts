import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluate, evaluateLiteral, extractPptx, loadCase, loadCorpus, normalizeText, runCalibration } from '../../lib/presentations/evaluation.ts';
import { resultHtml } from '../../lib/presentations/report.ts';

describe('PPT evaluation evidence', () => {
  it('pins original source evidence and separates reserved documents', async () => {
    const corpus = await loadCorpus();
    expect(corpus.cases).toHaveLength(8);
    expect(corpus.cases.filter(c => c.split === 'reserved')).toHaveLength(2);
    expect(corpus.cases.every(c => c.checks.length >= 12)).toBe(true);
  });

  it('accepts formatting changes but preserves numeric and negation differences', () => {
    expect(normalizeText('费用：Ｋ ２５，按笔收取。')).toBe(normalizeText('费用: K 25, 按笔收取。'));
    const check = { kind: 'literal' as const, scope: 'block' as const, groups: [['费用'], ['25'], ['不收取']] };
    expect(evaluateLiteral(check, [{ page: 1, blocks: ['费用 25 不收取'], warnings: [] }])).toEqual([1]);
    expect(evaluateLiteral(check, [{ page: 1, blocks: ['费用 250 不收取'], warnings: [] }])).toEqual([]);
    expect(evaluateLiteral(check, [{ page: 1, blocks: ['费用 25'], warnings: [] }, { page: 2, blocks: ['不收取'], warnings: [] }])).toEqual([]);
  });

  it('reports deliberate corruptions and retains uncertain paraphrases for review', async () => {
    const calibration = await runCalibration();
    expect(calibration.errors).toEqual([]);
    expect(calibration.tp).toBeGreaterThanOrEqual(5);
    expect(calibration.tn).toBeGreaterThanOrEqual(3);
    expect(calibration.abstained).toBeGreaterThanOrEqual(3);
  });

  it.each(['0', 'false'])('reads presentation order and excludes notes, hidden (%s) slides and off-canvas text', async hiddenValue => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="3" r:id="second"/><p:sldId id="2" r:id="first"/></p:sldIdLst><p:sldSz cx="1000" cy="500"/></p:presentation>');
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Target="slides/slide1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/><Relationship Id="second" Target="slides/slide2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/></Relationships>');
    const shape = (text: string, x = 0) => `<p:sp><p:spPr><a:xfrm><a:off x="${x}" y="0"/><a:ext cx="400" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const slide = (content: string, hidden = false) => `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ${hidden ? `show="${hiddenValue}"` : ''}><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`;
    zip.file('ppt/slides/slide1.xml', slide(shape('hidden slide'), true));
    zip.file('ppt/slides/slide2.xml', slide(shape('visible') + shape('outside', 1200)));
    zip.file('ppt/notesSlides/notesSlide2.xml', slide(shape('notes-only fact')));
    const result = await extractPptx(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(result.slides[0]?.blocks).toEqual(['visible']);
    expect(result.slides[1]?.blocks).toEqual([]);
    expect(result.slides[0]?.warnings.join(' ')).toContain('off-canvas');
    expect(result.slides[1]?.warnings.join(' ')).toContain('hidden');
  });

  it('fails closed for missing presentation relationships', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<fake>not a presentation</fake>');
    await expect(extractPptx(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow();
  });

  it('does not turn perfect lexical matches into deck acceptance, and escapes source HTML', async () => {
    const c = (await loadCorpus()).cases[0]!;
    const result = evaluate(c, { sha256: 'fixture', width: 1600, height: 900, slides: [{ page: 1, blocks: [c.source], warnings: [] }] });
    expect(result.results.filter(r => r.status === 'flag')).toHaveLength(0);
    expect(result.status).toBe('needs-review');
    expect(result.results.some(r => r.status === 'manual')).toBe(true);
    const html = resultHtml({ ...c, title: '<script>alert(1)</script>' }, result, {}, []);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('尚未提供渲染页');
  });

  it('rejects changed source files and fabricated answer anchors', async () => {
    const c = (await loadCorpus()).cases[0]!;
    const dir = await mkdtemp(path.join(tmpdir(), 'ppt-eval-source-'));
    try {
      await writeFile(path.join(dir, 'case.json'), JSON.stringify(c));
      await writeFile(path.join(dir, 'source.md'), c.source + '\nchanged');
      await expect(loadCase(dir)).rejects.toThrow('Source changed');
      await writeFile(path.join(dir, 'source.md'), c.source);
      await writeFile(path.join(dir, 'case.json'), JSON.stringify({ ...c, checks: [{ ...c.checks[0], evidence: ['This invented quote is not in the source.'] }] }));
      await expect(loadCase(dir)).rejects.toThrow('Unanchored answer');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('exports only generation input and blocks casual access to reserved cases', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ppt-eval-input-'));
    const exec = promisify(execFile);
    try {
      await exec(process.execPath, ['--import', 'tsx', 'scripts/presentation-eval.ts', 'input', '--case', '01-long-report', '--out', dir]);
      expect((await readdir(dir)).sort()).toEqual(['request.json', 'source.md']);
      const request = JSON.parse(await readFile(path.join(dir, 'request.json'), 'utf8'));
      expect(Object.keys(request).sort()).toEqual(['options', 'sourceFile']);
      expect(request.options).toMatchObject({ palette: 'emerald', pageCount: 'auto', density: 'complete', style: 'swiss' });
      expect(Object.keys(request.options).sort()).toEqual(['density', 'pageCount', 'palette', 'prompt', 'ratio', 'style']);
      await expect(exec(process.execPath, ['--import', 'tsx', 'scripts/presentation-eval.ts', 'input', '--case', '03-wide-table', '--out', dir])).rejects.toThrow('Reserved document');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
