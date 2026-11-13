import sharp from 'sharp';
import type {
  PresentationDeck,
  PresentationOptions,
  PresentationQuality,
  PresentationSource,
} from '@open-design/contracts';
import { visiblePresentationText } from './analysis.js';
import { buildPresentationScene, presentationSceneSvg } from './render.js';

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\s#*|_`，。；：！？、,.!?;:()[\]（）]+/g, '')
    .toLowerCase();
/** Candidates require source text on visible slides; notes and fact IDs never count as proof. */
export async function checkPresentationQuality(
  deck: PresentationDeck,
  options: PresentationOptions,
  source: PresentationSource,
): Promise<PresentationQuality> {
  const issues: PresentationQuality['issues'] = [];
  const pages = deck.slides.map((s) => normalize(visiblePresentationText(s)));
  let candidates = 0,
    renderedPages = 0;
  for (const original of source.tables) {
    const tables = deck.slides
      .filter((s) => s.table?.sourceId === original.id)
      .map((s) => s.table!);
    for (const row of original.rows) {
      const missing = original.headers.filter(
        (header, column) =>
          !tables.some((t) => {
            const idColumn = t.headers.indexOf(original.headers[0]!);
            const valueColumn = t.headers.indexOf(header);
            return (
              idColumn >= 0 &&
              valueColumn >= 0 &&
              t.rows.some(
                (r) => r[idColumn] === row[0] && r[valueColumn] === row[column],
              )
            );
          }),
      );
      if (missing.length)
        issues.push({
          code: 'table-cells-missing',
          severity: 'error',
          message: `表格 ${original.id} 的 ${row[0]} 缺少原文单元格：${missing.join('、')}`,
        });
    }
  }
  for (const fact of source.facts) {
    const quote = normalize(fact.quote);
    const found = pages.findIndex((p) => p.includes(quote));
    if (found >= 0) candidates++;
    else
      issues.push({
        code: 'source-fact-missing',
        severity: 'warning',
        message: `需核对原文 ${fact.sourceRef}：${fact.quote}`,
        factId: fact.id,
      });
  }
  for (const asset of source.assets ?? [])
    if (!deck.slides.some((s) => s.image?.assetId === asset.id))
      issues.push({
        code: 'source-image-unused',
        severity: 'warning',
        message: `原文图片尚未引用：${asset.name}`,
      });
  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i]!;
    if (slide.table?.sourceId) {
      const original = source.tables.find(
        (t) => t.id === slide.table!.sourceId,
      );
      if (!original)
        issues.push({
          code: 'unknown-source-table',
          severity: 'error',
          page: i + 1,
          message: '表格来源不存在。',
        });
      else
        for (const row of slide.table.rows) {
          const cols = slide.table.headers.map((h) =>
            original.headers.indexOf(h),
          );
          if (
            cols.some((c) => c < 0) ||
            !original.rows.some((r) => cols.every((c, j) => r[c] === row[j]))
          )
            issues.push({
              code: 'table-cell-mismatch',
              severity: 'error',
              page: i + 1,
              message: `表格行与原文不一致：${row.join(' / ')}`,
            });
        }
    }
    if (slide.chart)
      for (const v of slide.chart.values) {
        if (
          !(source.blocks[slide.chart.sourceRef - 1] ?? '')
            .match(/[+-]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)
            ?.some((number) => Number(number.replace(/,/g, '')) === v)
        )
          issues.push({
            code: 'chart-value-missing',
            severity: 'error',
            page: i + 1,
            message: `图表数值 ${v} 未在对应原文中找到。`,
          });
      }
    try {
      const scene = buildPresentationScene(
        slide,
        options,
        i,
        deck.slides.length,
      );
      for (const e of scene.elements) {
        const x2 = e.kind === 'line' ? e.x2 : e.x + e.w;
        const y2 = e.kind === 'line' ? e.y2 : e.y + e.h;
        if (
          Math.min(e.x, x2, e.y, y2) < -1 ||
          Math.max(e.x, x2) > scene.width + 1 ||
          Math.max(e.y, y2) > scene.height + 1
        )
          issues.push({
            code: 'out-of-bounds',
            severity: 'error',
            page: i + 1,
            message: '文字或图形超出画布。',
          });
      }
      // Rasterize the exact preview/export scene. Office font substitution remains separately reviewable.
      await sharp(Buffer.from(presentationSceneSvg(scene)))
        .png()
        .toBuffer();
      renderedPages++;
    } catch (error) {
      issues.push({
        code: 'render-failed',
        severity: 'error',
        page: i + 1,
        message: error instanceof Error ? error.message : '页面未能渲染。',
      });
    }
    if (
      i >= 2 &&
      slide.templateId &&
      slide.templateId === deck.slides[i - 1]?.templateId &&
      slide.templateId === deck.slides[i - 2]?.templateId &&
      !slide.table
    )
      issues.push({
        code: 'repeated-composition',
        severity: 'warning',
        page: i + 1,
        message: '连续三页同一版式，需核对是否符合内容需要。',
      });
  }
  if (options.pageCount !== 'auto' && deck.slides.length !== options.pageCount)
    issues.push({
      code: 'page-count',
      severity: 'error',
      message: '总页数与选择值不一致。',
    });
  return {
    version: '2.0.0',
    status: issues.some((i) => i.severity === 'error')
      ? 'blocked'
      : 'needs-review',
    checkedAt: Date.now(),
    issues,
    facts: {
      total: source.facts.length,
      candidates,
      missing: source.facts.length - candidates,
    },
    renderedPages,
  };
}
