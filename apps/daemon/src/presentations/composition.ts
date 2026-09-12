import {
  PRESENTATION_PALETTES,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { PresentationError } from './content.js';
import {
  wrap,
  routeConnection,
  type PresentationScene,
  type Box,
} from './render.js';

/** Registered compositions share a grid, not a repeated card layout. */
export function composePresentation(
  s: PresentationSlide,
  o: PresentationOptions,
  page: number,
  count: number,
): PresentationScene {
  const width = o.ratio === '4:3' ? 960 : o.ratio === '16:10' ? 1152 : 1280;
  const scene: PresentationScene = { width, height: 720, elements: [] };
  const p = PRESENTATION_PALETTES[o.palette],
    id = s.templateId ?? '';
  const dark = ['S01', 'S09', 'S10'].includes(id);
  const fg = dark ? 'FFFFFF' : '1D2129',
    muted = dark ? p.light : '4E5969';
  const M = 52,
    W = width - M * 2;
  const rect = (b: Box, fill: string, stroke?: string) =>
    scene.elements.push({ kind: 'rect', ...b, fill, stroke });
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    arrow = false,
    color: string = p.accent,
  ) =>
    scene.elements.push({
      kind: 'line',
      x,
      y,
      x2,
      y2,
      arrow,
      color,
      width: 1.5,
    });
  const text = (
    value: string,
    b: Box,
    size = 24,
    bold = false,
    color: string = fg,
  ) => {
    if (!value) return;
    const lines = wrap(value, b.w, size);
    if (lines.length * size * 1.32 > b.h + 1)
      throw new PresentationError(
        `Slide ${page + 1}: ${id} text exceeds its readable capacity; split this content.`,
        422,
      );
    scene.elements.push({
      kind: 'text',
      ...b,
      lines,
      size,
      bold,
      color,
      align: 'left',
      font:
        o.style === 'editorial' && size >= 40
          ? 'Noto Serif SC'
          : 'Microsoft YaHei',
    });
  };
  rect({ x: 0, y: 0, w: width, h: 720 }, dark ? p.dark : 'FFFFFF');
  text(
    `${String(page + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
    { x: width - 152, y: 674, w: 104, h: 28 },
    16,
    false,
    muted,
  );
  line(M, 660, width - M, 660, false, dark ? p.accent : 'C9CDD4');

  if (id === 'S10')
    for (let x = width * 0.66; x < width - M; x += 22)
      for (let y = 40; y < 150; y += 22)
        scene.elements.push({
          kind: 'ellipse',
          x,
          y,
          w: 3,
          h: 3,
          fill: p.accent,
        });
  if (['cover', 'closing'].includes(s.layout)) {
    const details = s.items;
    const hasDetails = details.some((item) => item.body);
    text(
      s.title,
      { x: M, y: 100, w: W * 0.9, h: 175 },
      s.title.length > 24 ? 42 : 58,
      true,
    );
    text(s.subtitle, { x: M, y: 284, w: W * 0.86, h: 90 }, 26, false, muted);
    line(M, 68, M + 96, 68, false, p.accent);
    if (hasDetails) {
      const cols = Math.min(2, details.length),
        rows = Math.ceil(details.length / cols),
        h = 242 / rows;
      details.forEach((item, i) => {
        const x = M + ((i % cols) * W) / cols,
          y = 388 + Math.floor(i / cols) * h,
          w = W / cols - 30;
        text(item.title, { x, y, w, h: 40 }, 23, true);
        text(item.body, { x, y: y + 42, w, h: h - 48 }, 22, false, muted);
      });
    } else
      details.forEach((item, i) =>
        text(
          item.title,
          {
            x: M + (i * W) / Math.max(1, details.length),
            y: 564,
            w: W / Math.max(1, details.length) - 16,
            h: 60,
          },
          22,
          true,
          muted,
        ),
      );
    return scene;
  }

  const titleSize = s.title.length > 30 ? 36 : 42;
  text(s.title, { x: M, y: 44, w: W, h: 112 }, titleSize, true);
  const titleLines = wrap(s.title, W, titleSize).length;
  const subtitleY = 48 + titleLines * titleSize * 1.32 + 14;
  const subtitleHeight = s.subtitle ? wrap(s.subtitle, W, 22).length * 29 : 0;
  text(
    s.subtitle,
    { x: M, y: subtitleY, w: W, h: Math.max(30, subtitleHeight) },
    22,
    false,
    muted,
  );
  const top = Math.max(184, subtitleY + subtitleHeight + 26);
  let H = 632 - top;
  if (H < 240)
    throw new PresentationError(
      `Slide ${page + 1}: title and subtitle leave insufficient content space.`,
      422,
    );

  if (s.table) {
    if (s.table.headers.length > 7 || s.table.rows.length > 9)
      throw new PresentationError(
        `Slide ${page + 1}: split the table into at most 7 columns and 9 rows.`,
        422,
      );
    // Size columns and rows from their actual text, rather than stretching sparse tables.
    const weights = s.table.headers.map((header, column) =>
      Math.max(
        7,
        Math.min(
          32,
          Math.max(
            header.length,
            ...s.table!.rows.map((row) => (row[column] ?? '').length),
          ),
        ),
      ),
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const columnWidths = weights.map((weight) => (W * weight) / totalWeight);
    const rowHeights = [s.table.headers, ...s.table.rows].map((row, i) =>
      Math.max(
        i ? 56 : 48,
        ...row.map(
          (value, column) =>
            wrap(value, columnWidths[column]! - 24, 22).length * 29 + 20,
        ),
      ),
    );
    const tableHeight = rowHeights.reduce((sum, height) => sum + height, 0);
    if (tableHeight > H)
      throw new PresentationError(
        `Slide ${page + 1}: table cell needs more space; use fewer rows.`,
        422,
      );
    scene.elements.push({
      kind: 'table',
      x: M,
      y: top,
      w: W,
      h: tableHeight,
      headers: s.table.headers,
      rows: s.table.rows,
      columnWidths,
      rowHeights,
      color: p.dark,
    });
    return scene;
  }
  if (s.chart) {
    const horizontal = s.chart.type === 'bar' && id !== 'S06';
    const labelWidth = horizontal ? 140 : W / s.chart.labels.length - 24;
    const labelHeight = horizontal ? (H - 38) / s.chart.labels.length - 8 : 52;
    if (
      s.chart.labels.some(
        (label) =>
          wrap(label, labelWidth, horizontal ? 22 : 18).length *
            (horizontal ? 29 : 24) >
          labelHeight,
      ) ||
      wrap(s.chart.unit, W, 18).length > 1
    )
      throw new PresentationError(
        `Slide ${page + 1}: chart labels need more space; use fewer categories or a source-backed companion table.`,
        422,
      );
    scene.elements.push({
      kind: 'chart',
      x: M,
      y: top,
      w: W,
      h: H,
      chart: s.chart,
      color: p.accent,
      orientation: id === 'S06' ? 'vertical' : 'horizontal',
    });
    return scene;
  }
  if (s.image && 'data' in s.image && typeof s.image.data === 'string') {
    scene.elements.push({
      kind: 'image',
      x: M,
      y: top,
      w: W * 0.64,
      h: H,
      data: s.image.data,
    });
    text(
      s.image.caption,
      { x: M + W * 0.68, y: top + 12, w: W * 0.32, h: H - 12 },
      24,
      false,
      muted,
    );
    return scene;
  }
  if (s.image)
    throw new PresentationError(
      `Slide ${page + 1}: original image asset is unavailable.`,
      422,
    );
  const items = s.items,
    n = items.length;
  if (!n) return scene;
  if (id === 'H-course' && n >= 2 && n <= 4) {
    rect({ x: M - 16, y: top - 8, w: W + 32, h: 134 }, p.air);
    text(items[0]!.title, { x: M, y: top + 8, w: W, h: 36 }, 22, true, p.dark);
    text(items[0]!.body, { x: M, y: top + 48, w: W, h: 74 }, 28, false, p.dark);
    const rest = items.slice(1),
      cols = Math.min(2, rest.length),
      rowH = (H - 166) / Math.ceil(rest.length / cols);
    rest.forEach((item, i) => {
      const x = M + ((i % cols) * W) / cols,
        y = top + 164 + Math.floor(i / cols) * rowH,
        w = W / cols - 32;
      line(x, y, x + w, y, false, p.accent);
      text(item.title, { x, y: y + 12, w, h: 38 }, 23, true);
      text(item.body, { x, y: y + 54, w, h: rowH - 60 }, 24, false, muted);
    });
    return scene;
  }
  if (id === 'H-exercise' && n === 2) {
    const split = W * 0.58;
    text(
      items[0]!.title,
      { x: M, y: top, w: split - 32, h: 42 },
      23,
      true,
      p.accent,
    );
    text(
      items[0]!.body,
      { x: M, y: top + 62, w: split - 32, h: H - 72 },
      30,
      true,
    );
    rect({ x: M + split, y: top - 8, w: W - split, h: H }, 'F7F8FA');
    text(
      items[1]!.title,
      { x: M + split + 24, y: top + 16, w: W - split - 48, h: 64 },
      23,
      true,
    );
    text(
      items[1]!.body,
      { x: M + split + 24, y: top + 98, w: W - split - 48, h: H - 116 },
      26,
      false,
      muted,
    );
    return scene;
  }
  if (['architecture', 'flow', 'cycle'].includes(s.layout)) {
    const labels = s.edges
      .map((e, i) => (e.label ? `${i + 1}. ${e.label}` : ''))
      .filter(Boolean)
      .join('   ');
    const legendHeight = labels ? wrap(labels, W, 16).length * 22 : 0;
    H -= legendHeight ? legendHeight + 16 : 0;
    const legendY = top + H + 12;
    const groups = s.groups?.length ? s.groups : [{ id: '', title: '' }];
    if (
      items.some(
        (item) => item.group && !s.groups?.some((g) => g.id === item.group),
      )
    )
      throw new PresentationError(
        `Slide ${page + 1}: diagram node references an unknown group.`,
        422,
      );
    if (groups.length > 4 || n > 12)
      throw new PresentationError(
        `Slide ${page + 1}: diagram needs a separate overview and detail page.`,
        422,
      );
    const boxes: Box[] = [];
    if (s.layout === 'cycle') {
      const bw = W / 3.7,
        bh = Math.min(128, H / 3);
      items.forEach((_, i) => {
        const a = (i * Math.PI * 2) / n - Math.PI / 2;
        boxes.push({
          x: M + W / 2 + Math.cos(a) * (W / 2 - bw * 0.65) - bw / 2,
          y: top + H / 2 + Math.sin(a) * (H / 2 - bh * 0.6) - bh / 2,
          w: bw,
          h: bh,
        });
      });
    } else if (s.groups?.length) {
      const horizontal = s.layout === 'architecture';
      groups.forEach((group, gi) => {
        const b = horizontal
          ? {
              x: M,
              y: top + (gi * H) / groups.length,
              w: W,
              h: H / groups.length - 12,
            }
          : {
              x: M + (gi * W) / groups.length,
              y: top,
              w: W / groups.length - 14,
              h: H,
            };
        rect(b, gi % 2 ? p.air : 'F7F8FA', 'C9CDD4');
        text(
          group.title,
          {
            x: b.x + 14,
            y: b.y + 10,
            w: horizontal ? 128 : b.w - 28,
            h: horizontal ? b.h - 20 : 36,
          },
          18,
          true,
          p.dark,
        );
        const indices = items
          .map((item, i) => ({ item, i }))
          .filter(
            ({ item }) => item.group === group.id || (!item.group && gi === 0),
          );
        indices.forEach(({ i }, j) => {
          const cw = horizontal ? (b.w - 158) / indices.length : b.w - 28;
          const regionH = horizontal ? b.h - 12 : (b.h - 58) / indices.length;
          const nodeH = Math.min(140, regionH - (horizontal ? 4 : 12));
          boxes[i] = {
            x: b.x + (horizontal ? 148 : 14) + (horizontal ? j * cw : 0),
            y:
              b.y +
              (horizontal ? 6 : 48) +
              (horizontal ? 0 : j * regionH) +
              Math.max(0, (regionH - nodeH) / 2),
            w: cw - (horizontal ? 22 : 0),
            h: nodeH,
          };
        });
      });
    } else {
      const cols = Math.min(n > 8 ? 4 : 3, n),
        rows = Math.ceil(n / cols);
      items.forEach((_, i) =>
        boxes.push({
          x: M + ((i % cols) * W) / cols,
          y: top + (Math.floor(i / cols) * H) / rows,
          w: W / cols - 28,
          h: Math.min(140, H / rows - 24),
        }),
      );
    }
    items.forEach((item, i) => {
      const b = boxes[i];
      if (!b)
        throw new PresentationError(
          `Slide ${page + 1}: diagram node references an unknown group.`,
          422,
        );
      rect(b, 'FFFFFF', p.accent);
      const headingH = wrap(item.title, b.w - 20, 22).length * 30;
      text(
        item.title,
        {
          x: b.x + 10,
          y: b.y + 8,
          w: b.w - 20,
          h: Math.min(headingH, b.h - 8),
        },
        22,
        true,
        p.dark,
      );
      if (item.body)
        text(
          item.body,
          {
            x: b.x + 10,
            y: b.y + headingH + 12,
            w: b.w - 20,
            h: b.h - headingH - 16,
          },
          18,
          false,
          '4E5969',
        );
    });
    const routes: { x: number; y: number }[][] = [];
    s.edges.forEach((edge, i) => {
      const a = items.findIndex((item) => item.id === edge.from),
        b = items.findIndex((item) => item.id === edge.to);
      if (a < 0 || b < 0)
        throw new PresentationError('Unknown graph endpoint', 422);
      const route = routeConnection(boxes[a]!, boxes[b]!, boxes, routes);
      routes.push(route);
      route
        .slice(1)
        .forEach((q, j) =>
          line(route[j]!.x, route[j]!.y, q.x, q.y, j === route.length - 2),
        );
      if (edge.label) {
        // A keyed legend keeps the original condition legible without hiding arrow direction.
        const mid = route[Math.floor((route.length - 1) / 2)]!;
        text(
          String(i + 1),
          {
            x: Math.max(M, Math.min(width - M - 28, mid.x + 3)),
            y: Math.max(top, Math.min(630, mid.y - 24)),
            w: 30,
            h: 28,
          },
          16,
          true,
          p.dark,
        );
      }
    });
    // Labels live in their own strip, never silently omitted.
    if (labels)
      text(
        labels,
        { x: M, y: legendY, w: W, h: legendHeight },
        16,
        false,
        muted,
      );
    return scene;
  }
  if (s.layout === 'timeline' || s.layout === 'steps') {
    const vertical = id === 'S02' || s.layout === 'steps';
    items.forEach((item, i) => {
      const x = vertical ? M + 60 : M + (i * W) / n,
        y = vertical ? top + (i * H) / n : top + 68;
      const w = vertical ? W - 72 : W / n - 28,
        h = vertical ? H / n : H - 96;
      line(
        vertical ? M + 18 : x,
        vertical ? y : y - 30,
        vertical ? M + 18 : x + W / n - 12,
        vertical ? y + h : y - 30,
      );
      text(
        String(i + 1).padStart(2, '0'),
        { x: vertical ? M : x, y: vertical ? y : top, w: 50, h: 38 },
        26,
        true,
        p.accent,
      );
      text(item.title, { x, y, w, h: 64 }, 25, true);
      text(item.body, { x, y: y + 66, w, h: h - 74 }, 22, false, muted);
    });
    return scene;
  }
  if (['S06', 'S20'].includes(id)) {
    items.forEach((item, i) => {
      const y = top + (i * H) / n,
        h = H / n;
      line(M, y, width - M, y, false, 'C9CDD4');
      text(
        item.title,
        { x: M, y: y + 12, w: W * 0.28, h: h - 20 },
        36,
        true,
        p.accent,
      );
      text(
        item.body,
        { x: M + W * 0.32, y: y + 14, w: W * 0.68, h: h - 24 },
        24,
        false,
        muted,
      );
    });
    return scene;
  }
  const statement = ['S03', 'S10', 'S12'].includes(id);
  const report = ['E-report', 'H-course'].includes(id);
  if (id === 'S12') {
    rect(
      { x: M - 16, y: top - 10, w: W + 32, h: Math.min(128, H / n) },
      p.dark,
    );
  }
  if (report || statement) {
    const primaryW = statement ? W * 0.36 : W * 0.24;
    items.forEach((item, i) => {
      const y = top + (i * H) / n,
        h = H / n;
      if (i)
        line(M, y - 8, width - M, y - 8, false, dark ? p.accent : 'C9CDD4');
      text(
        item.title,
        { x: M, y, w: primaryW - 24, h: h - 16 },
        statement ? 30 : 24,
        true,
        id === 'S12' && i === 0 ? 'FFFFFF' : fg,
      );
      text(
        item.body,
        { x: M + primaryW, y, w: W - primaryW, h: h - 16 },
        24,
        false,
        id === 'S12' && i === 0 ? 'FFFFFF' : muted,
      );
    });
    return scene;
  }
  const cols =
    id === 'S19' && o.ratio !== '4:3'
      ? 4
      : s.layout === 'comparison'
        ? Math.min(3, n)
        : ['S05', 'S13', 'S18'].includes(id)
          ? Math.min(3, n)
          : ['S04', 'S16'].includes(id) && o.ratio !== '4:3'
            ? 3
            : 2;
  const rows = Math.ceil(n / cols),
    gap = 32,
    cellW = (W - gap * (cols - 1)) / cols,
    cellH = (H - gap * (rows - 1)) / rows;
  items.forEach((item, i) => {
    const x = M + (i % cols) * (cellW + gap),
      y = top + Math.floor(i / cols) * (cellH + gap);
    if (['S04', 'S05', 'S13', 'S19'].includes(id))
      rect(
        { x: x - 10, y: y - 6, w: cellW + 20, h: cellH + 4 },
        id === 'S13' && i === 0 ? p.air : 'F7F8FA',
      );
    line(x, y, x + cellW, y, false, p.accent);
    const headingH = wrap(item.title, cellW, 26).length * 35;
    text(item.title, { x, y: y + 16, w: cellW, h: headingH }, 26, true);
    text(
      item.body,
      { x, y: y + 28 + headingH, w: cellW, h: cellH - headingH - 28 },
      24,
      false,
      muted,
    );
  });
  return scene;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function evidenceSvg(
  e: Extract<
    PresentationScene['elements'][number],
    { kind: 'chart' | 'table' | 'image' }
  >,
): string {
  if (e.kind === 'image')
    return `<image x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" href="${esc(e.data)}" preserveAspectRatio="xMidYMid meet"/>`;
  const label = (
    s: string,
    x: number,
    y: number,
    color = '1D2129',
    size = 22,
  ) =>
    `<text x="${x}" y="${y}" font-family="Microsoft YaHei,PingFang SC,sans-serif" font-size="${size}" fill="#${color}">${esc(s)}</text>`;
  if (e.kind === 'table') {
    let y = e.y;
    return [e.headers, ...e.rows]
      .map((row, i) => {
        const rh = e.rowHeights[i]!;
        const rowY = y;
        y += rh;
        let x = e.x;
        return (
          `<rect x="${e.x}" y="${rowY}" width="${e.w}" height="${rh}" fill="#${i === 0 ? e.color : i % 2 ? 'FFFFFF' : 'F7F8FA'}" stroke="#C9CDD4"/>` +
          row
            .map((cell, j) => {
              const cw = e.columnWidths[j]!;
              const cellX = x;
              x += cw;
              const lines = wrap(cell, cw - 24, 22);
              return lines
                .map((s, k) =>
                  label(
                    s,
                    cellX + 12,
                    rowY + (rh - lines.length * 29) / 2 + 22 + k * 29,
                    i ? '1D2129' : 'FFFFFF',
                  ),
                )
                .join('');
            })
            .join('')
        );
      })
      .join('');
  }
  const c = e.chart,
    low = Math.min(0, ...c.values),
    high = Math.max(0, ...c.values),
    span = high - low || 1,
    row = (e.h - 38) / Math.max(c.labels.length, 1);
  const plotX = e.x + 150,
    plotW = e.w - 280,
    zero = plotX - (low / span) * plotW;
  if (c.type === 'bar' && e.orientation === 'vertical') {
    const cell = e.w / c.values.length,
      plotH = e.h - 100,
      zeroY = e.y + 40 + (high / span) * plotH;
    return (
      label(c.unit, e.x, e.y + 22, '4E5969', 18) +
      c.values
        .map((v, i) => {
          const end = e.y + 40 + ((high - v) / span) * plotH,
            x = e.x + i * cell + 18;
          return (
            `<rect x="${x}" y="${Math.min(zeroY, end)}" width="${cell - 50}" height="${Math.abs(zeroY - end)}" fill="#${e.color}"/>` +
            label(String(v), x, end - 10) +
            wrap(c.labels[i]!, cell - 24, 18)
              .map((text, line) =>
                label(text, x, e.y + e.h - 40 + line * 24, '4E5969', 18),
              )
              .join('')
          );
        })
        .join('')
    );
  }
  if (c.type === 'bar')
    return (
      label(c.unit, e.x, e.y + 22, '4E5969', 18) +
      c.labels
        .map((s, i) => {
          const y = e.y + 40 + i * row,
            end = plotX + ((c.values[i]! - low) / span) * plotW;
          return (
            wrap(s, 140, 22)
              .map((text, line) => label(text, e.x, y + 24 + line * 29))
              .join('') +
            `<line x1="${zero}" x2="${zero}" y1="${y}" y2="${y + row}" stroke="#86909C"/><rect x="${Math.min(zero, end)}" y="${y}" width="${Math.abs(end - zero)}" height="${Math.max(8, row * 0.55)}" fill="#${e.color}"/>` +
            label(String(c.values[i]), plotX + plotW + 12, y + 24)
          );
        })
        .join('')
    );
  const pts = c.values.map((v, i) => ({
    x: e.x + 60 + (i * (e.w - 100)) / Math.max(1, c.values.length - 1),
    y: e.y + e.h - 65 - ((v - low) / span) * (e.h - 120),
  }));
  return (
    label(c.unit, e.x, e.y + 20, '4E5969', 18) +
    `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#${e.color}" stroke-width="3"/>` +
    pts
      .map(
        (p, i) =>
          label(String(c.values[i]), p.x - 12, p.y - 12) +
          wrap(c.labels[i]!, e.w / c.labels.length - 24, 18)
            .map((text, line) =>
              label(
                text,
                Math.max(
                  e.x,
                  Math.min(
                    e.x + e.w - (e.w / c.labels.length - 24),
                    p.x - (e.w / c.labels.length - 24) / 2,
                  ),
                ),
                e.y + e.h - 42 + line * 24,
                '4E5969',
                18,
              ),
            )
            .join(''),
      )
      .join('')
  );
}
