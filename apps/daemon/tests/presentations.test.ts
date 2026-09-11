import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  PRESENTATION_LAYOUTS,
  PRESENTATION_RATIOS,
  type PresentationDeck,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import {
  extractPresentationDocument,
  parsePresentationDeck,
  parsePresentationOptions,
  parsePresentationSlide,
} from '../src/presentations/content.js';
import {
  buildPresentationScene,
  presentationSceneSvg,
  renderPresentation,
} from '../src/presentations/render.js';
import {
  presentationSourceBlocks,
  attachPresentationSources,
} from '../src/presentations/source.js';
import { presentationUsage } from '../src/presentations/generate.js';

export const options: PresentationOptions = {
  palette: 'emerald',
  ratio: '16:9',
  pageCount: 5,
  prompt: '',
};
export function fixtureSlide(
  layout: PresentationSlide['layout'] = 'overview',
): PresentationSlide {
  const items = ['上传文档', '内容提炼', '图形编排', '导出文件'].map(
    (title, i) => ({
      id: String(i),
      title,
      body: ['保留原始事实', '按主题组织', '明确连接关系', '继续编辑'][i]!,
    }),
  );
  return {
    title: '文档生成演示文稿的流程',
    subtitle: '同一份结构化内容用于预览和可编辑文件',
    layout,
    items: ['cover', 'closing'].includes(layout) ? [] : items,
    edges: ['architecture', 'flow', 'cycle'].includes(layout)
      ? [
          { from: '0', to: '1', label: '' },
          { from: '1', to: '2', label: '' },
          { from: '1', to: '3', label: '输出' },
        ]
      : [],
    notes: '来源：测试文档。只有来源中定义的关系才连线。',
  };
}
export const fixtureDeck: PresentationDeck = {
  title: '文档生成演示文稿',
  slides: ['cover', 'overview', 'flow', 'comparison', 'closing'].map((layout) =>
    fixtureSlide(layout as PresentationSlide['layout']),
  ),
};

describe('presentation document and output boundaries', () => {
  it('validates configuration and exact total page count', () => {
    expect(() =>
      parsePresentationOptions({ ...options, palette: '__proto__' }),
    ).toThrow();
    expect(() =>
      parsePresentationOptions({ ...options, pageCount: 99 }),
    ).toThrow();
    expect(() =>
      parsePresentationDeck(fixtureDeck, { ...options, pageCount: 10 }),
    ).toThrow();
    expect(parsePresentationDeck(fixtureDeck, options).slides).toHaveLength(5);
    const invalid = fixtureSlide('flow');
    invalid.edges[0]!.to = 'missing';
    expect(() => parsePresentationSlide(invalid)).toThrow('connection');
    const editorial = fixtureSlide('editorial');
    editorial.items = editorial.items.slice(0, 1);
    expect(parsePresentationSlide(editorial).items).toHaveLength(1);
    editorial.items = [];
    expect(() => parsePresentationSlide(editorial)).toThrow('at least 1');
  });
  it('extracts DOCX text, rejects binary/oversized text and empty scanned PDFs', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>' +
        'Document source with enough readable words to build a presentation.' +
        '</w:t></w:r></w:p></w:body></w:document>',
    );
    const value = await extractPresentationDocument(
      'source.docx',
      await zip.generateAsync({ type: 'nodebuffer' }),
    );
    expect(value).toContain('enough readable');
    await expect(
      extractPresentationDocument('source.txt', Buffer.from([255, 254])),
    ).rejects.toThrow('UTF-8');
    await expect(
      extractPresentationDocument('source.md', Buffer.from('x'.repeat(80_001))),
    ).rejects.toThrow('80,000');
    await expect(
      extractPresentationDocument('source.pdf', Buffer.from('not a pdf')),
    ).rejects.toThrow('No readable text');
  });
  it('escapes slide text in SVG and includes reasoning tokens in the price exactly once', () => {
    const slide = fixtureSlide('cover');
    slide.title = '<script>alert(1)</script>';
    const svg = presentationSceneSvg(
      buildPresentationScene(slide, options, 0, 5),
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    const usage = presentationUsage({
      usage: {
        input_tokens: 10000,
        output_tokens: 5000,
        input_tokens_details: { cached_tokens: 2000 },
        output_tokens_details: { reasoning_tokens: 3000 },
      },
    });
    expect(usage?.estimatedUsd).toBeCloseTo(0.0764);
    expect(usage?.outputTokens).toBe(5000);
  });
});

describe('native presentation rendering', () => {
  it('separates return arrows and their labels instead of drawing one over the other', () => {
    const slide = fixtureSlide('flow');
    slide.edges = [
      { from: '0', to: '1', label: '超区' },
      { from: '1', to: '0', label: '一次' },
    ];
    const scene = buildPresentationScene(slide, options, 0, 5);
    const labels = scene.elements.filter(
      (element) =>
        element.kind === 'text' && ['1', '2'].includes(element.lines[0]!),
    );
    expect(labels).toHaveLength(2);
    expect(Math.abs(labels[0]!.y - labels[1]!.y)).toBeGreaterThanOrEqual(26);
  });
  for (const ratio of PRESENTATION_RATIOS)
    it(`keeps every layout inside ${ratio} with readable text`, () => {
      for (const layout of PRESENTATION_LAYOUTS) {
        const scene = buildPresentationScene(
          fixtureSlide(layout),
          { ...options, ratio },
          0,
          10,
        );
        for (const element of scene.elements) {
          expect(element.x, layout).toBeGreaterThanOrEqual(0);
          expect(element.y, layout).toBeGreaterThanOrEqual(0);
          if (element.kind === 'line') {
            expect(element.x2).toBeLessThanOrEqual(scene.width);
            expect(element.y2).toBeLessThanOrEqual(scene.height);
          } else {
            expect(element.x + element.w, layout).toBeLessThanOrEqual(
              scene.width,
            );
            expect(element.y + element.h, layout).toBeLessThanOrEqual(
              scene.height,
            );
          }
          if (element.kind === 'text' && element.size > 16)
            expect(element.size).toBeGreaterThanOrEqual(19);
        }
      }
    });
  it('exports the requested number of native slides, text, connections and speaker notes without rasterized pages', async () => {
    const result = await renderPresentation(fixtureDeck, {
      ...options,
      ratio: '4:3',
    });
    const zip = await JSZip.loadAsync(result.pptx);
    expect(
      Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name),
      ),
    ).toHaveLength(5);
    const xml = await zip.file('ppt/slides/slide3.xml')!.async('text');
    expect(xml).toContain('<a:t>上传文档</a:t>');
    expect(xml).toContain('triangle');
    expect(xml).not.toContain('<p:pic>');
    expect(
      await zip.file('ppt/notesSlides/notesSlide3.xml')!.async('text'),
    ).toContain('来源：测试文档');
    expect(await zip.file('ppt/presentation.xml')!.async('text')).toContain(
      'cx="9144000" cy="6858000"',
    );
    expect(result.previews).toHaveLength(5);
  });
});

describe('presentation detail retention and composition', () => {
  it('retains paragraphs beyond the old 100-character cap in editable slides', async () => {
    const detail =
      '每一笔申请必须核验渠道来源、申请金额与有效期限。若资料不完整，保留申请记录并标明具体缺项，由客户经理补齐后重新提交。' +
      '超出授权范围的申请转交复核人员，不得自动通过；审批结果须回写原系统，并记录处理时间、责任人和判断依据。' +
      '如果接口超时，系统保留同一个业务编号并进行一次重试，仍失败则进入人工处理队列，避免重复创建记录。';
    const slide = parsePresentationSlide({
      title: '保留规则、条件与异常处理',
      subtitle: '',
      layout: 'editorial',
      items: [
        { id: 'rules', title: '处理原则', body: detail },
        { id: 'trace', title: '审计与追踪', body: detail },
      ],
      edges: [],
      notes: '',
    });
    expect(slide.items[0]!.body.length).toBeGreaterThan(100);
    for (const ratio of PRESENTATION_RATIOS) {
      const result = await renderPresentation(
        { title: slide.title, slides: [slide] },
        { ...options, ratio },
      );
      const zip = await JSZip.loadAsync(result.pptx);
      const content = await zip.file('ppt/slides/slide1.xml')!.async('text');
      expect(content.replace(/<[^>]+>/g, '')).toContain(
        '仍失败则进入人工处理队列',
      );
      expect(result.html).toContain('deck-prev');
      expect(result.html).toContain('每一笔申请');
      expect(result.html).not.toContain('SLOT: slide 1 content');
    }
  });
  it('retains original passages and distinguishes missing references from semantic completeness', () => {
    const source =
      '第一部分\n' +
      '保留全部有效条件。'.repeat(170) +
      '\n第二部分\n' +
      '保留异常处理及审计记录。'.repeat(140);
    const blocks = presentationSourceBlocks(source);
    expect(blocks.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
    const deck = attachPresentationSources(
      { title: '来源检查', slides: [{ ...fixtureSlide(), sourceRefs: [1] }] },
      blocks,
    );
    expect(deck.sourceBlocks).toEqual(blocks);
    expect(deck.warnings).toHaveLength(1);
    expect(() =>
      attachPresentationSources(
        { ...deck, slides: [{ ...fixtureSlide(), sourceRefs: [999] }] },
        blocks,
      ),
    ).toThrow('reference');
  });
  it('uses layer rows for architecture and a distinct graph for branching flows', () => {
    const a = buildPresentationScene(
      fixtureSlide('architecture'),
      options,
      1,
      10,
    );
    const f = buildPresentationScene(fixtureSlide('flow'), options, 1, 10);
    const find = (scene: typeof a, value: string) =>
      scene.elements.find(
        (e) => e.kind === 'text' && e.lines.join('') === value,
      )!;
    expect(find(a, '上传文档').x).toBe(find(a, '内容提炼').x);
    expect(find(f, '上传文档').x).not.toBe(find(f, '内容提炼').x);
  });
});

it('fits longer rule labels alongside full descriptions on 4:3 tables', () => {
  const slide: PresentationSlide = {
    title: '成本控制与费用口径',
    subtitle: '保留核算条件',
    layout: 'table',
    notes: '',
    edges: [],
    items: Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      title: '输出Token已经包含推理Token',
      body: '推理消耗已包含在输出用量中，不能重复计费；自动重试消耗归入同一任务，费用以供应商账单为准。',
    })),
  };
  const scene = buildPresentationScene(
    slide,
    { ...options, ratio: '4:3' },
    0,
    10,
  );
  expect(
    scene.elements
      .filter((e) => e.kind === 'text')
      .map((e) => (e.kind === 'text' ? e.lines.join('') : ''))
      .join(''),
  ).toContain('不能重复计费');
});

it('keeps long connection labels outside nodes and renders source-defined retry loops', () => {
  const slide = fixtureSlide('flow');
  slide.edges = [
    { from: '0', to: '1', label: '提交完整文档' },
    { from: '1', to: '1', label: '重试一次' },
    { from: '1', to: '2', label: '校验通过' },
  ];
  expect(() => parsePresentationSlide(slide)).not.toThrow();
  const scene = buildPresentationScene(slide, options, 0, 5);
  const nodes = scene.elements.filter(
    (e) => e.kind === 'rect' && e.h > 70 && e.h < 600 && e.w > 150,
  );
  const badges = scene.elements.filter(
    (e) => e.kind === 'text' && /^\d+$/.test(e.lines.join('')) && e.size === 14,
  );
  expect(badges).toHaveLength(slide.edges.length);
  for (const edge of slide.edges) {
    const label = scene.elements.find(
      (e) => e.kind === 'text' && e.lines.join('').endsWith(edge.label),
    )!;
    expect(label).toBeDefined();
    if (label.kind !== 'text') throw new Error('Missing text');
    for (const node of [...nodes, ...badges]) {
      if (node.kind === 'line') continue;
      expect(
        label.x < node.x + node.w &&
          label.x + label.w > node.x &&
          label.y < node.y + node.h &&
          label.y + label.h > node.y,
      ).toBe(false);
    }
  }
  expect(
    scene.elements.filter((e) => e.kind === 'line' && e.arrow),
  ).toHaveLength(3);
});
