import { createRequire } from 'node:module';
import {
  PRESENTATION_PALETTES,
  type PresentationDeck,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { PresentationError } from './content.js';
import { DECK_SKELETON_HTML } from '../prompts/deck-framework.js';

const NEUTRAL = {
  white: 'FFFFFF',
  ink: '1D2129',
  muted: '4E5969',
  line: 'C9CDD4',
  fill: 'F7F8FA',
};
const FONT = 'Microsoft YaHei';
// PptxGenJS 4 ships CommonJS declarations; use its explicit CJS entry under NodeNext.
const PptxGenJS = createRequire(import.meta.url)(
  'pptxgenjs',
) as typeof import('pptxgenjs').default;
type Box = { x: number; y: number; w: number; h: number };
type Text = Box & {
  kind: 'text';
  lines: string[];
  size: number;
  color: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  font: string;
};
type Shape = Box & {
  kind: 'rect' | 'ellipse';
  fill: string;
  stroke?: string | undefined;
};
type Line = {
  kind: 'line';
  x: number;
  y: number;
  x2: number;
  y2: number;
  color: string;
  arrow: boolean;
  width: number;
};
export type PresentationScene = {
  width: number;
  height: number;
  elements: Array<Text | Shape | Line>;
};

/** Conservative CJK-aware wrapping shared by SVG and PPTX, without silently dropping words. */
function wrap(value: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    let used = 0;
    // Keep closing punctuation with its preceding CJK character while measuring.
    for (const token of paragraph.match(
      /[\x20-\x7E]+|[^\x20-\x7E][，。；：！？、）》」』】]*/gu,
    ) ?? ['']) {
      for (const part of token.match(/\S+\s*|\s+/gu) ?? [token]) {
        const measure = (s: string) =>
          [...s].reduce(
            (sum, char) =>
              sum +
              (/[^\x20-\x7E]/u.test(char)
                ? 1
                : /[MW@%]/.test(char)
                  ? 0.85
                  : 0.58) *
                size,
            0,
          );
        if (measure(part) <= width) {
          if (used + measure(part) > width && line) {
            lines.push(line.trimEnd());
            line = '';
            used = 0;
          }
          line += part;
          used += measure(part);
        } else {
          for (const char of part) {
            if (used + measure(char) > width && line) {
              lines.push(line.trimEnd());
              line = '';
              used = 0;
            }
            line += char;
            used += measure(char);
          }
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function buildPresentationScene(
  slide: PresentationSlide,
  options: PresentationOptions,
  index: number,
  count: number,
): PresentationScene {
  const height = 720;
  const width =
    options.ratio === '4:3' ? 960 : options.ratio === '16:10' ? 1152 : 1280;
  const scene: PresentationScene = { width, height, elements: [] };
  const palette = PRESENTATION_PALETTES[options.palette];
  const margin = 56;
  const available = width - 2 * margin;
  const rect = (
    box: Box,
    fill: string,
    stroke?: string,
    kind: Shape['kind'] = 'rect',
  ) => scene.elements.push({ ...box, kind, fill, stroke });
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    color = palette.accent as string,
    arrow = false,
    thickness = 2,
  ) =>
    scene.elements.push({
      kind: 'line',
      x,
      y,
      x2,
      y2,
      color,
      arrow,
      width: thickness,
    });
  const text = (
    value: string,
    box: Box,
    size = 24,
    color = NEUTRAL.ink,
    bold = false,
    align: Text['align'] = 'left',
  ) => {
    if (!value) return;
    let actual = size;
    let lines = wrap(value, box.w, actual);
    while (lines.length * actual * 1.32 > box.h && actual > 19) {
      actual -= 1;
      lines = wrap(value, box.w, actual);
    }
    if (lines.length * actual * 1.32 > box.h)
      throw new PresentationError(
        `Slide ${index + 1}: text is too long for this layout. Choose editorial/table, fewer items per slide or more pages; preserve the source information.`,
        422,
      );
    scene.elements.push({
      kind: 'text',
      ...box,
      lines,
      size: actual,
      color,
      bold,
      align,
      font:
        options.style === 'editorial' && size >= 40 ? 'Noto Serif SC' : FONT,
    });
  };
  const editorial = options.style === 'editorial';
  const ink = palette.dark;
  const body = NEUTRAL.muted;
  const dark = slide.layout === 'closing';
  rect({ x: 0, y: 0, w: width, h: height }, dark ? ink : NEUTRAL.white);
  const fg = dark ? NEUTRAL.white : ink;
  line(
    margin,
    664,
    width - margin,
    664,
    dark ? palette.accent : NEUTRAL.line,
    false,
    1,
  );
  text(
    `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
    { x: width - 158, y: 680, w: 94, h: 25 },
    16,
    dark ? NEUTRAL.white : body,
    false,
    'right',
  );
  text(
    editorial ? 'NIKI / FIELD NOTES' : 'NIKI / PRESENTATION',
    { x: margin, y: 681, w: available - 160, h: 24 },
    16,
    dark ? NEUTRAL.white : body,
  );
  if (slide.layout === 'cover' || slide.layout === 'closing') {
    text(
      slide.layout === 'cover' ? 'DOCUMENT / INSIGHT' : 'TAKEAWAYS / NEXT',
      { x: margin, y: 62, w: available, h: 28 },
      19,
      dark ? palette.light : body,
    );
    line(margin, 110, width - margin, 110, palette.accent, false, 3);
    text(
      slide.title,
      { x: margin, y: 165, w: available * 0.76, h: 250 },
      70,
      fg,
      !editorial,
    );
    rect({ x: width - margin - 126, y: 175, w: 126, h: 126 }, palette.accent);
    rect(
      { x: width - margin - 84, y: 322, w: 84, h: 84 },
      dark ? palette.light : palette.light,
    );
    text(
      slide.subtitle,
      { x: margin, y: 430, w: available * 0.84, h: 124 },
      27,
      dark ? NEUTRAL.white : body,
    );
    if (slide.items.length)
      text(
        slide.items.map((i) => `${i.title}: ${i.body}`).join('\n'),
        { x: margin, y: 564, w: available, h: 85 },
        20,
        fg,
      );
    return scene;
  }
  text(
    `${String(index + 1).padStart(2, '0')} / ${slide.layout.toUpperCase()}`,
    { x: margin, y: 35, w: available, h: 28 },
    16,
    body,
  );
  rect({ x: width - margin - 36, y: 35, w: 36, h: 9 }, palette.accent);
  text(
    slide.title,
    { x: margin, y: 65, w: available, h: 88 },
    43,
    ink,
    !editorial,
  );
  const titleElement = scene.elements.at(-1) as Text;
  const leadY =
    titleElement.y + titleElement.lines.length * titleElement.size * 1.32 + 16;
  text(slide.subtitle, { x: margin, y: leadY, w: available, h: 105 }, 21, body);
  const lead = scene.elements.at(-1) as Text;
  let top = lead.y + lead.lines.length * lead.size * 1.32 + 26;
  if (slide.layout === 'architecture') {
    const labels = slide.edges
      .filter((e) => e.label)
      .map(
        (e) =>
          `${slide.items.findIndex((i) => i.id === e.from) + 1}→${slide.items.findIndex((i) => i.id === e.to) + 1} ${e.label}`,
      );
    if (labels.length) {
      const legend = labels.join('   ·   ');
      const legendHeight = wrap(legend, available, 16).length * 16 * 1.32;
      text(
        legend,
        { x: margin, y: top - 10, w: available, h: legendHeight + 1 },
        16,
        body,
      );
      top += legendHeight + 8;
    }
  }
  const bottom = 644;
  const areaHeight = bottom - top;
  const n = slide.items.length;
  const itemText = (
    item: PresentationSlide['items'][number],
    box: Box,
    titleSize = 25,
    fill = body,
  ) => {
    const headingHeight = Math.max(
      titleSize * 1.32,
      wrap(item.title, box.w, titleSize).length * titleSize * 1.32,
    );
    text(item.title, { ...box, h: headingHeight + 2 }, titleSize, ink, true);
    text(
      item.body,
      { ...box, y: box.y + headingHeight + 15, h: box.h - headingHeight - 15 },
      23,
      fill,
    );
  };
  if (
    slide.layout === 'architecture' ||
    slide.layout === 'table' ||
    slide.layout === 'steps'
  ) {
    const gap = slide.layout === 'architecture' ? (n >= 5 ? 4 : 13) : 0;
    const labelWidth =
      available * (slide.layout === 'architecture' ? 0.29 : 0.34);
    const rowSpace = areaHeight - gap * (n - 1);
    // Give each row the height its heading and body need at a shared font size.
    // Equal-height rows waste space on short entries and clip longer ones.
    let rowFont = 22;
    const measureRows = () =>
      slide.items.map(
        (item) =>
          Math.max(
            29,
            wrap(item.title, labelWidth - 78, rowFont + 1).length *
              (rowFont + 1) *
              1.32,
            wrap(item.body, available - labelWidth - 54, rowFont).length *
              rowFont *
              1.32,
          ) + 14,
      );
    let rowHeights = measureRows();
    while (
      rowHeights.reduce((sum, h) => sum + h, 0) > rowSpace &&
      rowFont > 19
    ) {
      rowFont--;
      rowHeights = measureRows();
    }
    const required = rowHeights.reduce((sum, h) => sum + h, 0);
    if (required > rowSpace)
      throw new PresentationError(
        `Slide ${index + 1}: table rows need more space.`,
        422,
      );
    const extra = (rowSpace - required) / Math.max(n, 1);
    let nextY = top;
    const boxes: Box[] = [];
    slide.items.forEach((item, i) => {
      const y = nextY;
      const rowHeight = rowHeights[i]! + extra;
      nextY += rowHeight + gap;
      const layer = slide.layout === 'architecture';
      const bx = layer ? margin + 22 : margin;
      const box = { x: bx, y, w: available - (layer ? 22 : 0), h: rowHeight };
      boxes.push(box);
      if (layer) {
        rect(box, i % 2 ? palette.air : NEUTRAL.fill);
        rect({ x: bx, y, w: 4, h: rowHeight }, palette.accent);
      } else line(margin, y, width - margin, y, NEUTRAL.line, false, 1);
      text(
        String(i + 1).padStart(2, '0'),
        { x: bx + 14, y: y + 6, w: 38, h: 29 },
        19,
        palette.accent,
        true,
      );
      text(
        item.title,
        { x: bx + 66, y: y + 6, w: labelWidth - 78, h: rowHeight - 12 },
        rowFont + 1,
        ink,
        true,
      );
      text(
        item.body,
        {
          x: bx + labelWidth + 18,
          y: y + 6,
          w: available - labelWidth - 54,
          h: rowHeight - 12,
        },
        rowFont,
        body,
      );
    });
    if (slide.layout === 'architecture') {
      // Explicit source relations run along the layer rail; no invented dependencies.
      slide.edges.forEach((edge, i) => {
        const a = slide.items.findIndex((x) => x.id === edge.from),
          b = slide.items.findIndex((x) => x.id === edge.to);
        if (a < 0 || b < 0) return;
        const x = margin + 6 - (i % 3) * 6;
        const ya = boxes[a]!.y + boxes[a]!.h / 2,
          yb = boxes[b]!.y + boxes[b]!.h / 2;
        line(margin + 20, ya, x, ya);
        line(x, ya, x, yb);
        line(x, yb, margin + 20, yb, palette.accent, true);
      });
    }
  } else if (slide.layout === 'flow' || slide.layout === 'cycle') {
    const cols = n <= 3 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const gapX = 48;
    const legends: Array<{ text: string; x: number; row: number; w: number }> =
      [];
    let legendX = 0,
      legendRow = 0;
    slide.edges.forEach((edge, i) => {
      if (!edge.label) return;
      const caption = `${i + 1} / ${edge.label}`;
      const w = Math.min(available, caption.length * 14 + 12);
      if (legendX + w > available) {
        legendRow++;
        legendX = 0;
      }
      legends.push({ text: caption, x: legendX, row: legendRow, w });
      legendX += w + 10;
    });
    const legendHeight = legends.length ? (legendRow + 1) * 26 : 0;
    const gapY = Math.max(68, legendHeight + 24);
    const bw = (available - gapX * (cols - 1)) / Math.max(cols, 1);
    const bh = rows === 1 ? 240 : (areaHeight - gapY) / 2;
    const cycle = slide.layout === 'cycle';
    const boxes = slide.items.map((_, i) => {
      const row = Math.floor(i / cols),
        col = row % 2 ? cols - 1 - (i % cols) : i % cols;
      return {
        x: margin + col * (bw + gapX),
        y:
          top +
          row * (bh + gapY) +
          (rows === 1
            ? (areaHeight - bh) / 2
            : cycle && col > 0 && col < cols - 1
              ? row
                ? 12
                : -12
              : 0),
        w: bw,
        h: bh,
      };
    });
    const ids = new Map(slide.items.map((item, i) => [item.id, i]));
    const usedRoutes: Point[][] = [];
    const labelBoxes: Box[] = [];
    const legendY =
      rows === 1 ? bottom - legendHeight : top + bh + (gapY - legendHeight) / 2;
    const legendBoxes = legends.map((caption) => ({
      x: margin + caption.x,
      y: legendY + caption.row * 26,
      w: caption.w,
      h: 24,
    }));
    for (const [edgeIndex, edge] of slide.edges.entries()) {
      const a = boxes[ids.get(edge.from)!],
        b = boxes[ids.get(edge.to)!];
      if (!a || !b) continue;
      const route = routeConnection(a, b, boxes, usedRoutes);
      usedRoutes.push(route);
      route
        .slice(1)
        .forEach((p, i) =>
          line(
            route[i]!.x,
            route[i]!.y,
            p.x,
            p.y,
            palette.accent,
            i === route.length - 2,
          ),
        );
      if (edge.label) {
        const segments = route
          .slice(1)
          .map((q, i) => ({
            p: route[i]!,
            q,
            length: Math.abs(q.x - route[i]!.x) + Math.abs(q.y - route[i]!.y),
          }))
          .sort((a, b) => b.length - a.length);
        let placement: Box | undefined;
        let labelAnchor: Point | undefined;
        const overlaps = (a: Box, b: Box) =>
          a.x < b.x + b.w + 2 &&
          a.x + a.w > b.x - 2 &&
          a.y < b.y + b.h + 2 &&
          a.y + a.h > b.y - 2;
        for (const { p, q, length } of segments) {
          for (const candidateWidth of [24]) {
            const lw =
              p.y === q.y
                ? Math.min(candidateWidth, length - 8)
                : candidateWidth;
            if (lw < 24) continue;
            const lh = 24;
            if (p.x === q.x && lh > length - 6) continue;
            for (const fraction of [0.5, 0.25, 0.75]) {
              for (const offset of [
                0, -14, 14, -26, 26, -38, 38, -60, 60, -88, 88, -128, 128,
              ]) {
                const anchor = {
                  x: p.x + (q.x - p.x) * fraction,
                  y: p.y + (q.y - p.y) * fraction,
                };
                const candidate = {
                  x: anchor.x - lw / 2 + (p.x === q.x ? offset : 0),
                  y: anchor.y - lh / 2 + (p.y === q.y ? offset : 0),
                  w: lw,
                  h: lh,
                };
                if (
                  candidate.x < 0 ||
                  candidate.y < top - 26 ||
                  candidate.x + lw > width ||
                  candidate.y + lh > 658
                )
                  continue;
                if (
                  [...boxes, ...labelBoxes, ...legendBoxes].some((box) =>
                    overlaps(candidate, box),
                  )
                )
                  continue;
                placement = candidate;
                labelAnchor = anchor;
                break;
              }
              if (placement) break;
            }
            if (placement) break;
          }
          if (placement) break;
        }
        if (!placement)
          throw new PresentationError(
            `Slide ${index + 1}: connection labels need more room; use fewer edges or split the process.`,
            422,
          );
        labelBoxes.push(placement);
        if (labelAnchor)
          line(
            labelAnchor.x,
            labelAnchor.y,
            placement.x + placement.w / 2,
            placement.y + placement.h / 2,
            NEUTRAL.line,
            false,
            1,
          );
        rect(placement, NEUTRAL.white);
        text(
          String(edgeIndex + 1),
          { ...placement, x: placement.x + 2, w: placement.w - 4 },
          14,
          ink,
          false,
          'center',
        );
      }
    }
    for (const [i, caption] of legends.entries()) {
      const box = legendBoxes[i]!;
      rect(box, NEUTRAL.white);
      text(caption.text, box, 14, body);
    }
    boxes.forEach((box, i) => {
      rect(
        box,
        i === 0 ? palette.light : NEUTRAL.white,
        i === 0 ? palette.accent : NEUTRAL.line,
        cycle ? 'ellipse' : 'rect',
      );
      const inset = cycle ? 26 : 18;
      itemText(
        slide.items[i]!,
        {
          x: box.x + inset,
          y: box.y + 16,
          w: box.w - inset * 2,
          h: box.h - 32,
        },
        23,
      );
    });
  } else if (slide.layout === 'timeline') {
    const gap = 24,
      bw = (available - gap * (n - 1)) / Math.max(n, 1);
    line(margin, top + 35, width - margin, top + 35, palette.accent, false, 2);
    slide.items.forEach((item, i) => {
      const x = margin + i * (bw + gap);
      rect(
        { x, y: top + 28, w: 14, h: 14 },
        palette.accent,
        undefined,
        'ellipse',
      );
      text(
        String(i + 1).padStart(2, '0'),
        { x, y: top - 2, w: bw, h: 26 },
        19,
        ink,
      );
      itemText(item, { x, y: top + 66, w: bw, h: areaHeight - 66 }, 25);
    });
  } else if (slide.layout === 'metrics') {
    const bw = available / Math.max(n, 1);
    slide.items.forEach((item, i) => {
      const x = margin + i * bw;
      if (i) line(x - 16, top, x - 16, bottom, NEUTRAL.line, false, 1);
      text(
        item.title,
        { x, y: top + 10, w: bw - 34, h: 148 },
        66,
        i === 0 ? palette.accent : ink,
        false,
      );
      text(
        item.body,
        { x, y: top + 175, w: bw - 34, h: areaHeight - 175 },
        23,
        body,
      );
    });
  } else if (slide.layout === 'editorial' && n > 2) {
    // A document ledger keeps complete paragraphs when multiple small cards would overflow.
    const copy = slide.items
      .map(
        (item, i) =>
          `${String(i + 1).padStart(2, '0')} / ${item.title} — ${item.body}`,
      )
      .join('\n');
    rect({ x: margin, y: top, w: 4, h: areaHeight }, palette.accent);
    text(
      copy,
      { x: margin + 25, y: top, w: available - 25, h: areaHeight },
      23,
      body,
    );
  } else {
    const isMatrix = slide.layout === 'matrix';
    const dense = slide.layout === 'editorial';
    const cols = dense
      ? Math.min(2, n)
      : isMatrix
        ? 2
        : n > 3
          ? 2
          : Math.min(n, 3);
    const rows = Math.ceil(n / Math.max(cols, 1));
    const gap = dense ? 54 : 34;
    const bw = (available - gap * (cols - 1)) / Math.max(cols, 1);
    const bh = (areaHeight - 24 * (rows - 1)) / rows;
    slide.items.forEach((item, i) => {
      const x = margin + (i % cols) * (bw + gap),
        y = top + Math.floor(i / cols) * (bh + 24);
      const comparison = slide.layout === 'comparison';
      const pad = isMatrix || comparison ? 22 : 0;
      if (isMatrix || comparison)
        rect({ x, y, w: bw, h: bh }, i % 2 ? NEUTRAL.fill : palette.air);
      line(
        x + pad,
        y + (pad || 2),
        x + bw - pad,
        y + (pad || 2),
        i === 0 ? palette.accent : NEUTRAL.line,
        false,
        i === 0 ? 3 : 1,
      );
      itemText(
        item,
        { x: x + pad, y: y + pad + 23, w: bw - pad * 2, h: bh - pad * 2 - 23 },
        dense ? 27 : 25,
      );
    });
  }
  return scene;
}

type Point = { x: number; y: number };
function routeConnection(
  a: Box,
  b: Box,
  boxes: Box[],
  usedRoutes: Point[][],
): Point[] {
  if (a === b)
    return [
      { x: a.x + a.w, y: a.y + a.h / 2 },
      { x: a.x + a.w + 24, y: a.y + a.h / 2 },
      { x: a.x + a.w + 24, y: a.y - 24 },
      { x: a.x + a.w / 2, y: a.y - 24 },
      { x: a.x + a.w / 2, y: a.y },
    ];
  const ports = (box: Box) => [
    { x: box.x + box.w / 2, y: box.y },
    { x: box.x + box.w / 2, y: box.y + box.h },
    { x: box.x, y: box.y + box.h / 2 },
    { x: box.x + box.w, y: box.y + box.h / 2 },
    ...[-30, 30].flatMap((offset) => [
      { x: box.x, y: box.y + box.h / 2 + offset },
      { x: box.x + box.w, y: box.y + box.h / 2 + offset },
      { x: box.x + box.w / 2 + offset, y: box.y },
      { x: box.x + box.w / 2 + offset, y: box.y + box.h },
    ]),
  ];
  const crosses = (p: Point, q: Point) =>
    boxes.some((box) =>
      p.x === q.x
        ? p.x > box.x + 0.1 &&
          p.x < box.x + box.w - 0.1 &&
          Math.max(p.y, q.y) > box.y + 0.1 &&
          Math.min(p.y, q.y) < box.y + box.h - 0.1
        : p.y > box.y + 0.1 &&
          p.y < box.y + box.h - 0.1 &&
          Math.max(p.x, q.x) > box.x + 0.1 &&
          Math.min(p.x, q.x) < box.x + box.w - 0.1,
    );
  const candidates: Point[][] = [];
  for (const start of ports(a))
    for (const end of ports(b)) {
      candidates.push(
        [start, { x: end.x, y: start.y }, end],
        [start, { x: start.x, y: end.y }, end],
      );
      for (const box of boxes) {
        for (const x of [box.x - 24, box.x + box.w + 24])
          candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
        for (const y of [box.y - 27, box.y + box.h + 27])
          candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
      }
    }
  const valid = candidates
    .map((points) =>
      points.filter(
        (p, i) => !i || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y,
      ),
    )
    .filter((points) =>
      points.slice(1).every((p, i) => !crosses(points[i]!, p)),
    );
  const length = (points: Point[]) =>
    points.slice(1).reduce((sum, p, i) => {
      const q = points[i]!;
      let overlap = 0;
      for (const used of usedRoutes)
        for (let j = 1; j < used.length; j += 1) {
          const u = used[j - 1]!;
          const v = used[j]!;
          if (p.x === q.x && u.x === v.x && Math.abs(p.x - u.x) < 1)
            overlap += Math.max(
              0,
              Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) -
                Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y)),
            );
          if (p.y === q.y && u.y === v.y && Math.abs(p.y - u.y) < 1)
            overlap += Math.max(
              0,
              Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) -
                Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x)),
            );
        }
      return (
        sum + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + 15 + overlap * 20
      );
    }, 0);
  valid.sort((left, right) => length(left) - length(right));
  if (!valid[0])
    throw new PresentationError(
      'Diagram is too complex. Use fewer connections.',
      422,
    );
  return valid[0];
}

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );
export function presentationSceneSvg(scene: PresentationScene): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0L7 3.5L0 7Z" fill="context-stroke"/></marker></defs>${scene.elements
    .map((e) => {
      if (e.kind === 'text')
        return `<text fill="#${e.color}" font-family="${e.font},PingFang SC,Noto Sans CJK SC,sans-serif" font-size="${e.size}" font-weight="${e.bold ? 600 : 400}" text-anchor="${e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}">${e.lines.map((t, i) => `<tspan x="${e.x + (e.align === 'center' ? e.w / 2 : e.align === 'right' ? e.w : 0)}" y="${e.y + e.size + i * e.size * 1.32}">${xml(t)}</tspan>`).join('')}</text>`;
      if (e.kind === 'line')
        return `<line x1="${e.x}" y1="${e.y}" x2="${e.x2}" y2="${e.y2}" stroke="#${e.color}" stroke-width="${e.width}"${e.arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
      const style = `fill="#${e.fill}" stroke="${e.stroke ? `#${e.stroke}` : 'none'}" stroke-width="1"`;
      return e.kind === 'ellipse'
        ? `<ellipse cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}" ${style}/>`
        : `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" ${style}/>`;
    })
    .join('')}</svg>`;
}

export async function renderPresentation(
  deck: PresentationDeck,
  options: PresentationOptions,
): Promise<{ pptx: Buffer; previews: string[]; html: string }> {
  const scenes = deck.slides.map((slide, i) =>
    buildPresentationScene(slide, options, i, deck.slides.length),
  );
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: 'NIKI',
    width: scenes[0]!.width / 96,
    height: 7.5,
  });
  pptx.layout = 'NIKI';
  pptx.author = 'Niki';
  pptx.subject = deck.title;
  pptx.title = deck.title;
  pptx.company = 'Niki';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  scenes.forEach((scene, i) => {
    const slide = pptx.addSlide();
    for (const e of scene.elements) {
      if (e.kind === 'text')
        slide.addText(e.lines.join('\n'), {
          x: e.x / 96,
          y: e.y / 96,
          w: e.w / 96,
          h: e.h / 96,
          fontFace: e.font,
          fontSize: e.size * 0.75,
          bold: e.bold,
          color: e.color,
          lang: 'zh-CN',
          align: e.align,
          valign: 'top',
          margin: 0,
          breakLine: false,
          lineSpacingMultiple: 1.05,
          paraSpaceAfter: e.size * 0.24,
          fit: 'shrink',
        });
      else if (e.kind === 'line')
        slide.addShape(pptx.ShapeType.line, {
          x: Math.min(e.x, e.x2) / 96,
          y: Math.min(e.y, e.y2) / 96,
          w: Math.abs(e.x2 - e.x) / 96,
          h: Math.abs(e.y2 - e.y) / 96,
          flipH: e.x2 < e.x,
          flipV: e.y2 < e.y,
          line: {
            color: e.color,
            width: e.width * 0.75,
            endArrowType: e.arrow ? 'triangle' : 'none',
          },
        });
      else
        slide.addShape(
          e.kind === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect,
          {
            x: e.x / 96,
            y: e.y / 96,
            w: e.w / 96,
            h: e.h / 96,
            fill: { color: e.fill },
            line: { color: e.stroke ?? e.fill, width: e.stroke ? 0.75 : 0 },
          },
        );
    }
    const item = deck.slides[i]!;
    const relations = item.edges
      .map(
        (e) =>
          `${item.items.find((i) => i.id === e.from)?.title} → ${item.items.find((i) => i.id === e.to)?.title}${e.label ? ': ' + e.label : ''}`,
      )
      .join('\n');
    slide.addNotes(
      [
        item.notes,
        relations,
        ...(item.sourceRefs ?? []).map((ref) =>
          deck.sourceBlocks?.[ref - 1]
            ? `[原文 / Source ${ref}]\n${deck.sourceBlocks[ref - 1]}`
            : '',
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  });
  return {
    pptx: (await pptx.write({
      outputType: 'nodebuffer',
      compression: true,
    })) as Buffer,
    previews: scenes.map(presentationSceneSvg),
    html: presentationHtml(deck, scenes),
  };
}

/** Reuse the repository's tested deck runtime for keyboard, fullscreen-scale and PDF printing. */
function presentationHtml(
  deck: PresentationDeck,
  scenes: PresentationScene[],
): string {
  const framework = DECK_SKELETON_HTML.replaceAll(
    '1920',
    String(scenes[0]!.width),
  ).replaceAll('1080', String(scenes[0]!.height));
  const start = framework.indexOf('      <!-- SLOT: slides');
  const end = framework.indexOf('    </div>\n  </div>', start);
  const sections = scenes
    .map(
      (scene, i) =>
        `<section class="slide${i ? '' : ' active'}" data-screen-label="${xml(deck.slides[i]!.title)}"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${presentationSceneSvg(scene).replace('<svg ', '<svg style="width:100%;height:100%;object-fit:contain" ')}</div></section>`,
    )
    .join('\n');
  return (framework.slice(0, start) + sections + '\n' + framework.slice(end))
    .replace('<!-- SLOT: deck title -->', xml(deck.title))
    .replace('</head>', '<link rel="icon" href="data:,"></head>');
}
