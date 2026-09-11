import { createRequire } from 'node:module';
import {
  PRESENTATION_PALETTES,
  type PresentationDeck,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { PresentationError } from './content.js';

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
    for (const token of paragraph.match(/[\x20-\x7E]+|[^\x20-\x7E]/gu) ?? [
      '',
    ]) {
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
  const margin = 64;
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
        `Slide ${index + 1}: text is too long for this layout. Shorten it or choose Overview.`,
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
    });
  };
  rect({ x: 0, y: 0, w: width, h: height }, NEUTRAL.white);
  line(margin, 668, width - margin, 668, NEUTRAL.line, false, 1);
  text(
    `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
    { x: width - 154, y: 683, w: 90, h: 25 },
    16,
    NEUTRAL.muted,
    false,
    'right',
  );
  if (slide.layout === 'cover' || slide.layout === 'closing') {
    rect({ x: margin, y: 106, w: 64, h: 7 }, palette.accent);
    text(
      slide.title,
      { x: margin, y: 161, w: available * 0.92, h: 180 },
      64,
      palette.dark,
      true,
    );
    text(
      slide.subtitle,
      { x: margin, y: 367, w: available * 0.85, h: 116 },
      29,
      NEUTRAL.muted,
    );
    // Cover/closing items stay visible as short supporting lines, never discarded.
    if (slide.items.length)
      text(
        slide.items
          .map((item) => `${item.title}${item.body ? `: ${item.body}` : ''}`)
          .join('\n'),
        { x: margin, y: 505, w: available, h: 132 },
        23,
        NEUTRAL.muted,
      );
    return scene;
  }
  rect({ x: margin, y: 47, w: 36, h: 5 }, palette.accent);
  text(
    slide.title,
    { x: margin, y: 69, w: available, h: 112 },
    44,
    palette.dark,
    true,
  );
  text(
    slide.subtitle,
    { x: margin, y: 185, w: available, h: 70 },
    23,
    NEUTRAL.muted,
  );
  const top = 278;
  const bottom = 636;
  const areaHeight = bottom - top;
  const n = slide.items.length;

  if (['flow', 'architecture', 'cycle'].includes(slide.layout)) {
    const cols = n <= 3 ? n : 3;
    const rows = Math.ceil(n / cols);
    const gapX = 54;
    const gapY = 66;
    const bw = (available - gapX * (cols - 1)) / cols;
    const bh = rows === 1 ? 190 : 146;
    const startY = top + (areaHeight - (rows * bh + (rows - 1) * gapY)) / 2;
    const boxes = slide.items.map((_, i) => {
      const row = Math.floor(i / cols);
      const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
      return {
        x: margin + col * (bw + gapX),
        y: startY + row * (bh + gapY),
        w: bw,
        h: bh,
      };
    });
    const ids = new Map(slide.items.map((item, i) => [item.id, i]));
    // Manhattan routes use the clear gutters surrounding nodes. All connections are source-defined.
    const usedRoutes: Point[][] = [];
    for (const edge of slide.edges) {
      const a = boxes[ids.get(edge.from)!]!;
      const b = boxes[ids.get(edge.to)!]!;
      const route = routeConnection(a, b, boxes, usedRoutes);
      usedRoutes.push(route);
      route
        .slice(1)
        .forEach((point, i) =>
          line(
            route[i]!.x,
            route[i]!.y,
            point.x,
            point.y,
            palette.accent,
            i === route.length - 2,
          ),
        );
      if (edge.label) {
        const middle = route
          .slice(1)
          .map((point, i) => ({
            i,
            length:
              Math.abs(point.x - route[i]!.x) + Math.abs(point.y - route[i]!.y),
          }))
          .sort((a, b) => b.length - a.length)[0]!.i;
        const p = route[middle]!;
        const q = route[middle + 1]!;
        const labelWidth = Math.max(40, edge.label.length * 20 + 8);
        const labelBox = {
          x: (p.x + q.x) / 2 - labelWidth / 2,
          y: (p.y + q.y) / 2 - 13,
          w: labelWidth,
          h: 26,
        };
        rect(labelBox, NEUTRAL.white);
        text(edge.label, labelBox, 19, palette.dark, false, 'center');
      }
    }
    boxes.forEach((box, i) => {
      const item = slide.items[i]!;
      rect(
        box,
        i === 0 ? palette.light : NEUTRAL.fill,
        i === 0 ? palette.accent : NEUTRAL.line,
      );
      text(
        item.title,
        { x: box.x + 18, y: box.y + 17, w: box.w - 36, h: 57 },
        26,
        palette.dark,
        true,
      );
      text(
        item.body,
        { x: box.x + 18, y: box.y + 79, w: box.w - 36, h: box.h - 88 },
        21,
        NEUTRAL.muted,
      );
    });
  } else if (slide.layout === 'timeline' || slide.layout === 'steps') {
    const rows = n > 4 ? 2 : 1;
    const cols = Math.ceil(n / rows);
    const gap = 30;
    const bw = (available - gap * (cols - 1)) / cols;
    const bh = areaHeight / rows - 20;
    slide.items.forEach((item, i) => {
      const x = margin + (i % cols) * (bw + gap);
      const y = top + Math.floor(i / cols) * (bh + 20);
      if (i % cols < cols - 1 && i < n - 1)
        line(
          x + 45,
          y + 23,
          x + bw + gap - 8,
          y + 23,
          NEUTRAL.line,
          slide.layout === 'steps',
        );
      rect({ x, y, w: 46, h: 46 }, palette.light, undefined, 'ellipse');
      text(
        String(i + 1).padStart(2, '0'),
        { x: x + 2, y: y + 8, w: 42, h: 30 },
        21,
        palette.dark,
        true,
        'center',
      );
      text(
        item.title,
        { x, y: y + 64, w: bw, h: rows === 1 ? 85 : 55 },
        28,
        palette.dark,
        true,
      );
      text(
        item.body,
        { x, y: y + (rows === 1 ? 167 : 124), w: bw, h: rows === 1 ? 170 : 39 },
        24,
        NEUTRAL.muted,
      );
    });
  } else {
    const cols =
      slide.layout === 'comparison'
        ? n
        : slide.layout === 'matrix'
          ? 2
          : n <= 3
            ? n
            : 3;
    const rows = Math.ceil(n / cols);
    const gap = 38;
    const bw = (available - gap * (cols - 1)) / cols;
    const bh = (areaHeight - 30 * (rows - 1)) / rows;
    slide.items.forEach((item, i) => {
      const x = margin + (i % cols) * (bw + gap);
      const y = top + Math.floor(i / cols) * (bh + 30);
      if (slide.layout === 'matrix')
        rect({ x, y, w: bw, h: bh }, i % 2 ? NEUTRAL.fill : palette.air);
      const pad = slide.layout === 'matrix' ? 20 : 0;
      line(
        x + pad,
        y + 3,
        x + bw - pad,
        y + 3,
        i === 0 ? palette.accent : NEUTRAL.line,
        false,
        i === 0 ? 3 : 1,
      );
      text(
        item.title,
        { x: x + pad, y: y + 24, w: bw - pad * 2, h: rows === 1 ? 102 : 60 },
        30,
        palette.dark,
        true,
      );
      text(
        item.body,
        {
          x: x + pad,
          y: y + (rows === 1 ? 143 : 91),
          w: bw - pad * 2,
          h: bh - (rows === 1 ? 143 : 98),
        },
        25,
        NEUTRAL.muted,
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
        return `<text fill="#${e.color}" font-family="${FONT},PingFang SC,Noto Sans CJK SC,sans-serif" font-size="${e.size}" font-weight="${e.bold ? 600 : 400}" text-anchor="${e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}">${e.lines.map((t, i) => `<tspan x="${e.x + (e.align === 'center' ? e.w / 2 : e.align === 'right' ? e.w : 0)}" y="${e.y + e.size + i * e.size * 1.32}">${xml(t)}</tspan>`).join('')}</text>`;
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
): Promise<{ pptx: Buffer; previews: string[] }> {
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
          fontFace: FONT,
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
    slide.addNotes(deck.slides[i]!.notes);
  });
  return {
    pptx: (await pptx.write({
      outputType: 'nodebuffer',
      compression: true,
    })) as Buffer,
    previews: scenes.map(presentationSceneSvg),
  };
}
