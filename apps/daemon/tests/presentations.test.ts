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
        element.kind === 'text' && ['超区', '一次'].includes(element.lines[0]!),
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
