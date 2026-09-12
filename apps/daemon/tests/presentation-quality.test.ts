import JSZip from 'jszip';
import { extractPresentationSource } from '../src/presentations/extract.js';
import { describe, expect, it } from 'vitest';
import {
  analyzePresentationSource,
  visiblePresentationText,
  presentationReviewFacts,
} from '../src/presentations/analysis.js';
import { checkPresentationQuality } from '../src/presentations/quality.js';
import { presentationTemplates } from '../src/presentations/templates.js';
import {
  buildPresentationScene,
  renderPresentation,
  presentationSceneSvg,
} from '../src/presentations/render.js';
import type {
  PresentationDeck,
  PresentationOptions,
} from '@open-design/contracts';
import { fitPresentationDeck } from '../src/presentations/layout.js';
import { parsePresentationSlide } from '../src/presentations/content.js';

const options: PresentationOptions = {
  palette: 'emerald',
  ratio: '4:3',
  pageCount: 'auto',
  prompt: '',
};
describe('source-backed presentation planning', () => {
  it('exports only existing package content-type targets and keeps short table headers compact', async () => {
    const sample = presentationTemplates.find(
      (t) => t.id === 'H-table',
    )!.sample;
    const scene = buildPresentationScene(sample, options, 0, 3);
    const table = scene.elements.find((e) => e.kind === 'table')!;
    expect(table.h).toBeLessThan(400);
    const output = await renderPresentation(
      { title: 'Package integrity', slides: [sample, sample, sample] },
      options,
    );
    const zip = await JSZip.loadAsync(output.pptx);
    const types = await zip.file('[Content_Types].xml')!.async('string');
    const missing = [...types.matchAll(/PartName="\/([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((name) => !zip.file(name));
    expect(missing).toEqual([]);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const headerHeight = Number(slide.match(/<a:tr h="(\d+)"/)?.[1]);
    expect(headerHeight).toBeGreaterThan(0);
    expect(headerHeight).toBeLessThan(70 * 9525);
  });
  it('keeps native chart decimals and a portable category cache linked to its workbook', async () => {
    const sample = presentationTemplates.find(
      (t) => t.id === 'H-chart-bar',
    )!.sample;
    const output = await renderPresentation(
      {
        title: 'Chart',
        slides: [
          {
            ...sample,
            chart: {
              ...sample.chart!,
              values: [91.96, 93.98, 72.77, 56.99],
            },
          },
        ],
      },
      options,
    );
    const zip = await JSZip.loadAsync(output.pptx);
    const chart = await zip.file('ppt/charts/chart1.xml')!.async('string');
    expect(chart).toContain('formatCode="#,##0.########"');
    expect(chart).toContain('<c:v>91.96</c:v>');
    expect(chart).toContain('<c:strCache>');
    expect(chart).not.toContain('<c:multiLvlStrRef>');
    expect(Object.keys(zip.files).some((name) => name.endsWith('.xlsx'))).toBe(
      true,
    );
  });
  it('deduplicates identical review sentences while retaining every source scope', () => {
    const source = analyzePresentationSource(
      '# 客户 A\n\n必须复核后发布。\n\n# 客户 B\n\n必须复核后发布。',
    );
    const facts = presentationReviewFacts(source);
    const rule = facts.find((fact) => fact.quote === '必须复核后发布。')!;
    expect(rule.factIds).toHaveLength(2);
    expect(rule.occurrences.map((item) => item.context)).toEqual([
      '# 客户 A',
      '# 客户 B',
    ]);
    expect(facts.flatMap((fact) => fact.factIds).sort()).toEqual(
      source.facts.map((fact) => fact.id).sort(),
    );
  });
  it('preserves table cells and exception statements as separately reviewable evidence', () => {
    const a = analyzePresentationSource(
      '# 收费\n\n| 方案 | 月费 | 条件 |\n|---|---|---|\n| A | 45 元 | 不支持退款 |\n| B | 450 元 | 仅限新用户 |\n\n审批失败必须退回，不能跳过复核。',
    );
    expect(a.tables[0]?.rows).toEqual([
      ['A', '45 元', '不支持退款'],
      ['B', '450 元', '仅限新用户'],
    ]);
    expect(a.facts.some((f) => f.quote.includes('不能跳过'))).toBe(true);
    expect(
      a.facts.every((f) => a.blocks[f.sourceRef - 1]?.includes(f.quote)),
    ).toBe(true);
  });
  it('does not certify completeness just because every source passage is referenced', async () => {
    const source = analyzePresentationSource(
      '每月费用为 45 元。审批失败必须退回，不能跳过复核。',
    );
    const deck: PresentationDeck = {
      title: '收费',
      sourceBlocks: source.blocks,
      slides: [
        {
          title: '收费',
          subtitle: '每月费用为 450 元',
          layout: 'cover',
          items: [],
          edges: [],
          notes: source.blocks.join(''),
          sourceRefs: [1],
        },
      ],
    };
    const quality = await checkPresentationQuality(deck, options, source);
    expect(quality.issues.some((i) => i.code === 'source-fact-missing')).toBe(
      true,
    );
    expect(quality.status).not.toBe('passed');
  });
  it('renders registered template samples at the requested ratio with different compositions', () => {
    for (const template of presentationTemplates)
      expect(() => parsePresentationSlide(template.sample)).not.toThrow();
    expect(
      presentationTemplates.filter((t) => t.id.startsWith('S')),
    ).toHaveLength(22);
    const images = presentationTemplates.map((t) =>
      presentationSceneSvg(buildPresentationScene(t.sample, options, 1, 10)),
    );
    expect(images.every((s) => s.includes('width="960"'))).toBe(true);
    expect(new Set(images).size).toBe(presentationTemplates.length);
  });
  it('splits wide and dense native tables with the identifying column retained', () => {
    const table = {
      headers: Array.from({ length: 12 }, (_, i) => `列${i}`),
      rows: Array.from({ length: 18 }, (_, i) =>
        Array.from({ length: 12 }, (_, j) => `${i}:${j}`),
      ),
    };
    const slide = {
      title: '规格',
      subtitle: '',
      layout: 'table' as const,
      templateId: 'H-table',
      table,
      items: [],
      edges: [],
      notes: '',
    };
    const result = fitPresentationDeck(
      { title: '规格', slides: [slide] },
      options,
    );
    expect(result.slides.length).toBeGreaterThan(1);
    expect(result.slides.every((s) => s.table!.headers[0] === '列0')).toBe(
      true,
    );
    for (const row of table.rows)
      for (const value of row)
        expect(
          result.slides.some((s) =>
            s.table!.rows.some((r) => r.includes(value)),
          ),
        ).toBe(true);
    expect(() =>
      fitPresentationDeck(
        { title: '规格', slides: [slide] },
        { ...options, pageCount: 5 },
      ),
    ).toThrow();
  });
  it('keeps closing-page bodies visible instead of hiding them in metadata', () => {
    const slide = {
      title: 'Delivery',
      subtitle: '',
      layout: 'closing' as const,
      templateId: 'S09',
      items: [
        {
          id: 'a',
          title: 'Recovery',
          body: 'RPO must not exceed 15 minutes.',
        },
      ],
      edges: [],
      notes: '',
    };
    const svg = presentationSceneSvg(
      buildPresentationScene(slide, options, 4, 5),
    );
    expect(svg).toContain('RPO must not exceed');
    expect(svg).toContain('15 minutes.');
  });
  it('rejects undefined diagram lanes and renders a single declared lane heading', () => {
    const slide = {
      title: '流程',
      subtitle: '',
      layout: 'flow' as const,
      templateId: 'H-flow',
      items: [
        { id: 'a', title: '申请', body: '', group: 'staff' },
        { id: 'b', title: '审批', body: '', group: 'missing' },
      ],
      edges: [{ from: 'a', to: 'b', label: '提交' }],
      groups: [{ id: 'staff', title: '员工处理' }],
      notes: '',
    };
    expect(() => buildPresentationScene(slide, options, 1, 5)).toThrow(
      /group/i,
    );
    slide.items[1]!.group = 'staff';
    expect(
      presentationSceneSvg(buildPresentationScene(slide, options, 1, 5)),
    ).toContain('员工处理');
  });
  it('renders all template samples at all three ratios without leaving the canvas', () => {
    for (const ratio of ['4:3', '16:9', '16:10'] as const)
      for (const template of presentationTemplates) {
        const scene = buildPresentationScene(
          template.sample,
          { ...options, ratio },
          1,
          10,
        );
        for (const e of scene.elements) {
          const right = e.kind === 'line' ? e.x2 : e.x + e.w;
          const bottom = e.kind === 'line' ? e.y2 : e.y + e.h;
          expect(right, `${template.id}/${ratio}`).toBeLessThanOrEqual(
            scene.width,
          );
          expect(bottom, `${template.id}/${ratio}`).toBeLessThanOrEqual(
            scene.height,
          );
        }
      }
  });
  it('never counts hidden item bodies as visible proof on a structured table slide', async () => {
    const source = analyzePresentationSource(
      '| Name | Amount |\n|---|---|\n| A | 45 |\n| B | 90 |',
    );
    const slide = {
      title: 'Data',
      subtitle: '',
      layout: 'table' as const,
      templateId: 'H-table',
      items: [{ id: 'hidden', title: 'B', body: '90' }],
      edges: [],
      notes: '',
      table: {
        sourceId: 'T1',
        headers: ['Name', 'Amount'],
        rows: [['A', '45']],
      },
    };
    expect(visiblePresentationText(slide)).not.toContain('90');
    const q = await checkPresentationQuality(
      { title: 'Data', slides: [slide] },
      options,
      source,
    );
    expect(q.issues.some((i) => i.code === 'table-cells-missing')).toBe(true);
    expect(q.status).toBe('blocked');
  });

  it('extracts original Word table cells and embedded images without flattening them', async () => {
    const zip = new JSZip();
    const paragraph =
      '<w:p><w:r><w:t>The original source contains a table and a linked evidence image for the presentation.</w:t></w:r></w:p>';
    const row = (values: string[]) =>
      '<w:tr>' +
      values
        .map((v) => '<w:tc><w:p><w:r><w:t>' + v + '</w:t></w:r></w:p></w:tc>')
        .join('') +
      '</w:tr>';
    zip.file(
      'word/document.xml',
      '<w:document><w:body>' +
        paragraph +
        '<w:tbl>' +
        row(['Plan', 'Monthly fee']) +
        row(['A', '45 USD']) +
        '</w:tbl></w:body></w:document>',
    );
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );
    zip.file('word/media/evidence.png', png);
    const { source } = await extractPresentationSource(
      'evidence.docx',
      await zip.generateAsync({ type: 'nodebuffer' }),
    );
    expect(source.tables[0]?.headers).toEqual(['Plan', 'Monthly fee']);
    expect(source.tables[0]?.rows).toEqual([['A', '45 USD']]);
    expect(source.assets?.[0]?.data).toBe(
      'data:image/png;base64,' + png.toString('base64'),
    );
  });
});
