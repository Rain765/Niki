export type ExportBox = { x: number; y: number; w: number; h: number };
export type ExportColor = { hex: string; alpha: number };
type TextStyle = {
  font: string; sourceFamily: string; weight: number; sourceItalic: boolean; size: number; bold: boolean; italic: boolean; underline: boolean;
  caps: boolean; spacing: number; color: ExportColor;
};
export type ExportText = ExportBox & { kind: 'text'; lines: Array<{
  x: number; baseline: number; lineHeight: number; runs: Array<{ text: string; style: TextStyle }>;
}> };
type ExportShape = ExportBox & {
  kind: 'shape'; fill: ExportColor; stroke: ExportColor; strokeWidth: number; radius: number;
  dash?: boolean;
  shadow?: { color: ExportColor; x: number; y: number; blur: number };
  points?: Array<{ x: number; y: number; moveTo?: boolean } | { close: true }>;
};
type ExportImage = ExportBox & { kind: 'image'; index: number; data?: string; decoration?: Record<string, string> };
type ExportCell = { text: string; fill: ExportColor; style: TextStyle; colspan: number; rowspan: number };
type ExportTable = ExportBox & { kind: 'table'; rows: ExportCell[][]; widths: number[]; heights: number[] };
export type NativeExportSlide = {
  width: number; height: number; background: ExportColor; notes: string;
  elements: Array<ExportText | ExportShape | ExportImage | ExportTable>;
  warnings: string[];
};

/** Runs in the isolated Chromium document. All coordinates are CSS pixels. */
export const NATIVE_EXPORT_CAPTURE = String.raw`function captureNativeExportSlide({ selector, index, fontMap }) {
    const slide = document.querySelectorAll(selector)[index];
    if (!slide)
        throw new Error('Slide not found');
    const root = slide.getBoundingClientRect();
    if (root.width < 10 || root.height < 10 || Math.abs(root.left) > 3 || Math.abs(root.top) > 3)
        throw new Error('幻灯片未切换到画布');
    const exclude = '.notes,.speaker-notes,script,style,template,[hidden]';
    const noColor = { hex: '000000', alpha: 0 };
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const colors = new Map();
    const color = (str, opacity = 1) => {
        if (str === 'none' || str === 'transparent')
            return noColor;
        let paint = colors.get(str);
        if (!paint) {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = 'transparent';
            ctx.fillStyle = str;
            ctx.fillRect(0, 0, 1, 1);
            const rgba = ctx.getImageData(0, 0, 1, 1).data;
            paint = { hex: Array.from(rgba.slice(0, 3), c => c.toString(16).padStart(2, '0')).join(''), alpha: rgba[3] / 255 };
            colors.set(str, paint);
        }
        return { hex: paint.hex, alpha: paint.alpha * opacity };
    };
    const rect = (r) => ({ x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height });
    const styles = new Map();
    const styleOf = (element) => {
        let style = styles.get(element);
        if (!style) {
            style = getComputedStyle(element);
            styles.set(element, style);
        }
        return style;
    };
    const opacity = (element) => {
        if (element.closest(exclude))
            return 0;
        let value = 1;
        for (let e = element; e && e !== slide.parentElement; e = e.parentElement) {
            const style = styleOf(e);
            if (style.display === 'none' || style.visibility !== 'visible')
                return 0;
            value *= Number(style.opacity);
        }
        return value;
    };
    const merge = (front, back) => {
        const a = front.alpha;
        const hex = [0, 2, 4].map(i => Math.round(
            parseInt(front.hex.slice(i, i + 2), 16) * a + parseInt(back.hex.slice(i, i + 2), 16) * (1 - a)
        ).toString(16).padStart(2, '0')).join('');
        return { hex, alpha: 1 };
    };
    const textColor = (element, str) => {
        const foreground = color(str, opacity(element));
        if (foreground.alpha >= .999) return foreground;
        const ancestors = [];
        for (let e = element; e; e = e.parentElement) ancestors.push(e);
        let background = { hex: 'ffffff', alpha: 1 };
        for (const e of ancestors.reverse()) background = merge(color(styleOf(e).backgroundColor), background);
        return merge(foreground, background);
    };
    const textStyle = (element, text = element.textContent ?? '') => {
        const style = styleOf(element);
        const weight = Number(style.fontWeight) || 400;
        const italic = style.fontStyle === 'italic';
        const map = fontMap[JSON.stringify([style.fontFamily, weight, italic])] ?? {};
        const face = map[Array.from(text).find(char => char.trim())] ?? Object.values(map)[0];
        if (!face && text.trim()) throw new Error('没有读取到原字体');
        return {
            font: face?.family ?? style.fontFamily.split(',')[0].replace(/['"]/g,''),
            sourceFamily: style.fontFamily, weight, sourceItalic: italic,
            size: parseFloat(style.fontSize), bold: face?.bold ?? false, italic: face?.italic ?? false,
            underline: style.textDecorationLine.includes('underline'), caps: style.textTransform === 'uppercase',
            spacing: parseFloat(style.letterSpacing) || 0, color: textColor(element, style.color),
        };
    };
    const elements = [];
    const warnings = new Set();
    const getBox = (el) => rect(el.getBoundingClientRect());
    const inCanvas = (b) => b.w >= 0.05 && b.h >= 0.05 && b.x + b.w > 0 && b.y + b.h > 0 && b.x < root.width && b.y < root.height;
    const addShape = (box, fill, stroke = noColor, strokeWidth = 0, radius = 0) => {
        if (inCanvas(box) && (fill.alpha || stroke.alpha && strokeWidth))
            elements.push({ kind: 'shape', ...box, fill, stroke, strokeWidth, radius });
    };
    const backgrounds = [slide, slide.parentElement, document.body].map(e => color(styleOf(e).backgroundColor));
    const background = backgrounds.find(c => c.alpha > 0) ?? { hex: 'ffffff', alpha: 1 };
    const backgroundImage = (element, box) => {
        const css = styleOf(element);
        if (css.backgroundImage === 'none' && css.maskImage === 'none' || !inCanvas(box)) return false;
        const decoration = {};
        for (const key of ['background-image', 'background-size', 'background-repeat', 'background-position', 'background-origin', 'background-clip', 'border-radius'])
            decoration[key] = css.getPropertyValue(key);
        if (css.maskImage !== 'none') {
            for (const key of ['background-color','mask-image','mask-size','mask-repeat','mask-position','mask-origin','mask-clip','mask-mode','mask-composite'])
                decoration[key] = css.getPropertyValue(key);
        }
        decoration.opacity = String(opacity(element));
        elements.push({ kind: 'image', ...box, index: elements.length, decoration });
        warnings.add('网页背景纹理已转为独立图片');
        return true;
    };
    backgroundImage(slide, { x: 0, y: 0, w: root.width, h: root.height });
    const svgItems = 'path,rect,circle,ellipse,polygon,polyline,line';
    for (const el of Array.from(slide.querySelectorAll('*'))) {
        const alpha = opacity(el);
        if (alpha < 0.01)
            continue;
        const css = styleOf(el);
        const box = getBox(el);
        if (el.closest('table') && el.tagName !== 'TABLE')
            continue;
        if (el instanceof SVGGeometryElement) {
            if (!el.matches(svgItems) || el.closest('defs,clipPath,mask,marker,symbol'))
                continue;
            const matrix = el.getScreenCTM();
            const length = el.getTotalLength();
            if (!matrix || !length)
                continue;
            if (css.fill.startsWith('url(') || css.stroke.startsWith('url('))
                throw new Error('SVG 渐变图形暂不能转换为可编辑对象');
            const samples = Math.min(160, Math.max(2, Math.ceil(length / 3)));
            const points = Array.from({ length: samples + 1 }, (_, n) => {
                const p = el.getPointAtLength(length * n / samples).matrixTransform(matrix);
                return { x: p.x - root.left, y: p.y - root.top };
            });
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            const fill = color(css.fill, alpha * Number(css.fillOpacity));
            const stroke = color(css.stroke, alpha * Number(css.strokeOpacity));
            const strokeWidth = (parseFloat(css.strokeWidth) || 0) * Math.hypot(matrix.a, matrix.b);
            if (css.markerEnd !== 'none') {
                const end = points.at(-1), before = points[Math.max(0, points.length - 4)];
                const angle = Math.atan2(end.y - before.y, end.x - before.x), size = Math.max(5, strokeWidth * 3);
                const sides = [-0.5, 0.5].map(a => ({
                    x: end.x - size * Math.cos(angle + a), y: end.y - size * Math.sin(angle + a),
                }));
                elements.push({ kind: 'shape', x: 0, y: 0, w: root.width, h: root.height, fill: stroke, stroke: noColor, strokeWidth: 0, radius: 0, points: [end, ...sides, { close: true }] });
            }
            const path = points.map((p, i) => ({
                x: p.x - x, y: p.y - y,
                ...(i && Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > Math.max(4, length / samples * 2) ? { moveTo: true } : {}),
            }));
            if (fill.alpha || /[zZ]\s*$/.test(el.getAttribute('d') ?? '') || el.matches('rect,circle,ellipse,polygon'))
                path.push({ close: true });
            elements.push({ kind: 'shape', x, y, w: Math.max(.1, Math.max(...xs) - x), h: Math.max(.1, Math.max(...ys) - y), fill, stroke, strokeWidth, radius: 0, points: path });
            continue;
        }
        if (!(el instanceof HTMLElement) || !inCanvas(box))
            continue;
        if (el instanceof HTMLImageElement) {
            if (!el.complete || !el.naturalWidth)
                throw new Error('图片未能加载');
            const imageIndex = elements.length;
            el.setAttribute('data-niki-export-image', String(imageIndex));
            elements.push({ kind: 'image', ...box, index: imageIndex });
            continue;
        }
        if (el instanceof HTMLCanvasElement) {
            if (el.getAttribute('aria-hidden') !== 'true' && !el.matches('.ascii-bg,.bg,#bg-grid,.ppt-annotation-layer'))
                throw new Error('Canvas 图形没有可编辑的数据源');
            if (el.width && el.height) {
                const snapshot = document.createElement('canvas');
                snapshot.width = el.width; snapshot.height = el.height;
                const paint = snapshot.getContext('2d');
                paint.globalAlpha = alpha;
                paint.drawImage(el, 0, 0);
                elements.push({kind:'image',...box,index:elements.length,data:snapshot.toDataURL('image/png')});
            }
            warnings.add('网页背景动效已静态化');
            continue;
        }
        if (el instanceof HTMLTableElement) {
            const rows = Array.from(el.rows).filter(row => opacity(row) >= 0.01);
            const regular = rows.find(row => Array.from(row.cells).every(c => c.colSpan === 1 && c.rowSpan === 1));
            const widths = regular ? Array.from(regular.cells, c => getBox(c).w) : [];
            const cells = rows.map(row => Array.from(row.cells, cell => ({
                text: cell.innerText, fill: color(styleOf(cell).backgroundColor, alpha), style: textStyle(cell),
                colspan: cell.colSpan, rowspan: cell.rowSpan,
            })));
            elements.push({ kind: 'table', ...box, rows: cells, widths, heights: rows.map(row => getBox(row).h) });
            continue;
        }
        const edges = ['top', 'right', 'bottom', 'left'];
        const borders = edges.map(edge => ({
            edge,
            width: css.getPropertyValue('border-' + edge + '-style') === 'none' ? 0 : parseFloat(css.getPropertyValue('border-' + edge + '-width')),
            color: color(css.getPropertyValue('border-' + edge + '-color'), alpha),
        }));
        const top = borders[0];
        const uniform = borders.every(b => b.width === top.width && b.color.hex === top.color.hex && b.color.alpha === top.color.alpha);
        addShape(box, css.maskImage === 'none' ? color(css.backgroundColor, alpha) : noColor, uniform ? top.color : noColor, uniform ? top.width : 0, parseFloat(css.borderTopLeftRadius) || 0);
        const shadow = /^((?:rgba?|color)\([^)]+\)) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/.exec(css.boxShadow);
        const last = elements.at(-1);
        if (shadow && last?.kind === 'shape' && last.x === box.x && last.y === box.y && last.w === box.w && last.h === box.h)
            last.shadow = { color: color(shadow[1], alpha), x: Number(shadow[2]), y: Number(shadow[3]), blur: Number(shadow[4]) };
        if (backgroundImage(el, box) && uniform && top.width && top.color.alpha) {
            if (last?.kind === 'shape') { last.stroke = noColor; last.strokeWidth = 0; }
            addShape(box, noColor, top.color, top.width, parseFloat(css.borderTopLeftRadius) || 0);
        }
        for (const edge of uniform ? [] : borders) {
            const vertical = edge.edge === 'left' || edge.edge === 'right';
            addShape({
                x: box.x + (edge.edge === 'right' ? box.w - edge.width : 0),
                y: box.y + (edge.edge === 'bottom' ? box.h - edge.width : 0),
                w: vertical ? edge.width : box.w, h: vertical ? box.h : edge.width,
            }, edge.color);
        }
        for (const pseudo of ['::before', '::after']) {
            const p = getComputedStyle(el, pseudo);
            if (p.content !== '""' || p.position !== 'absolute')
                continue;
            const proxy = document.createElement('span');
            for (const key of p) proxy.style.setProperty(key, p.getPropertyValue(key));
            proxy.style.content = 'normal';
            el.append(proxy);
            try {
                const b = getBox(proxy), paint = alpha * Number(p.opacity);
                addShape(b, color(p.backgroundColor, paint), noColor, 0, parseFloat(p.borderTopLeftRadius) || 0);
                if (p.backgroundImage.startsWith('repeating-linear-gradient(to right') && b.h <= 2) {
                    elements.push({kind:'shape',...b,fill:noColor,stroke:color(p.color,paint),strokeWidth:b.h,radius:0,dash:true});
                } else backgroundImage(proxy, b);
            } finally { proxy.remove(); }
        }
    }
    const groups = new Map();
    const scrollAreas = new Map();
    const scrollArea = (element) => {
        for (let parent = element; parent && parent !== slide; parent = parent.parentElement) {
            const css = styleOf(parent);
            if (!/(auto|scroll)/.test(css.overflowX + css.overflowY)
                || parent.scrollHeight <= parent.clientHeight && parent.scrollWidth <= parent.clientWidth) continue;
            if (!scrollAreas.has(parent)) {
                const box = getBox(parent);
                const left = parseFloat(css.paddingLeft) || 0, top = parseFloat(css.paddingTop) || 0;
                const horizontal = left + (parseFloat(css.paddingRight) || 0);
                const vertical = top + (parseFloat(css.paddingBottom) || 0);
                const scale = Math.min(1,
                    (parent.clientWidth - horizontal) / Math.max(1, parent.scrollWidth - horizontal),
                    (parent.clientHeight - vertical) / Math.max(1, parent.scrollHeight - vertical));
                scrollAreas.set(parent, { x: box.x + left, y: box.y + top, scale });
                warnings.add('可滚动内容已按原区域缩小排版');
            }
            return scrollAreas.get(parent);
        }
    };
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || opacity(el) < 0.01 || el.closest('table,svg defs'))
            continue;
        let group = el;
        while (group.parentElement && group.parentElement !== slide && /^(inline|contents)/.test(styleOf(group).display))
            group = group.parentElement;
        const css = styleOf(el);
        const style = textStyle(el, '');
        const area = scrollArea(el);
        const scale = area?.scale ?? 1;
        if (style.size < 1)
            continue;
        ctx.font = [css.fontStyle, css.fontWeight, css.fontSize, css.fontFamily].join(' ');
        const ascent = ctx.measureText('Ag').fontBoundingBoxAscent;
        const range = document.createRange();
        const glyphs = groups.get(group) ?? [];
        groups.set(group, glyphs);
        for (let i = 0; i < node.length;) {
            const char = String.fromCodePoint(node.data.codePointAt(i));
            range.setStart(node, i);
            i += char.length;
            range.setEnd(node, i);
            const box = rect(range.getBoundingClientRect());
            if (area) {
                box.x = area.x + (box.x - area.x) * scale;
                box.y = area.y + (box.y - area.y) * scale;
                box.w *= scale; box.h *= scale;
            }
            if (box.w < .02 || !box.h)
                continue;
            if (!inCanvas(box) && char.trim())
                throw new Error('正文超出页面边界');
            glyphs.push({
                text: /[\t\r\n]/.test(char) ? ' ' : char, box,
                baseline: box.y + ascent * scale, lineHeight: (parseFloat(css.lineHeight) || style.size * 1.2) * scale,
                style: { ...textStyle(el,char), size: style.size * scale, spacing: style.spacing * scale },
            });
        }
    }
    for (const glyphs of groups.values()) {
        const rows = [];
        for (const glyph of glyphs) {
            const last = rows.at(-1);
            if (!last || Math.abs(last[0].baseline - glyph.baseline) > Math.max(3, glyph.style.size * .15))
                rows.push([glyph]);
            else
                last.push(glyph);
        }
        const lines = [];
        const boxes = [];
        for (const row of rows) {
            while (row[0]?.text === ' ')
                row.shift();
            while (row.at(-1)?.text === ' ')
                row.pop();
            if (!row.length)
                continue;
            const first = row[0];
            const runs = [];
            for (const glyph of row) {
                const last = runs.at(-1);
                if (last && JSON.stringify(last.style) === JSON.stringify(glyph.style)) {
                    last.text += glyph.text;
                    last.right = glyph.box.x + glyph.box.w;
                } else
                    runs.push({ text: glyph.text, style: glyph.style, left: glyph.box.x, right: glyph.box.x + glyph.box.w });
                boxes.push(glyph.box);
            }
            const fitted = runs.map(({ text, style, left, right }) => {
                ctx.font = [style.sourceItalic ? 'italic' : 'normal', style.weight, style.size + 'px', style.sourceFamily].join(' ');
                const count = Array.from(text).length;
                const natural = ctx.measureText(style.caps ? text.toUpperCase() : text).width;
                const spacing = count > 1 ? Math.max(-style.size * .12, (right - left - natural) / count) : style.spacing;
                return { text, style: { ...style, spacing } };
            });
            lines.push({ x: Math.min(...row.map(g => g.box.x)), baseline: first.baseline, lineHeight: first.lineHeight, runs: fitted });
        }
        if (!lines.length)
            continue;
        const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
        const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
        elements.push({ kind: 'text', x, y, w: right - x, h: bottom - y, lines });
    }
    if (!elements.length)
        throw new Error('页面没有可转换内容');
    const noteParts = Array.from(slide.querySelectorAll('.notes,.speaker-notes')).map(e => e.innerText?.trim() || e.textContent?.trim() || '').filter(Boolean);
    const attributeNote = slide.getAttribute('data-notes');
    if (attributeNote) noteParts.push(attributeNote);
    const sourceNotes = Array.isArray(window.__SPEAKER_NOTES__) ? window.__SPEAKER_NOTES__ : [];
    const speaker = (slide.dataset.slideId && sourceNotes.find(n => n && typeof n === 'object' && n.id === slide.dataset.slideId)) || sourceNotes[index];
    if (speaker) {
        if (typeof speaker === 'string') noteParts.push(speaker);
        else for (const field of ['title', 'purpose', 'talk', 'transition']) {
            const value = speaker[field];
            if (Array.isArray(value)) noteParts.push(...value.filter(v => typeof v === 'string'));
            else if (typeof value === 'string') noteParts.push(value);
        }
    }
    const notes = noteParts.join('\n\n');
    return { width: root.width, height: root.height, background, notes, elements, warnings: [...warnings] };
}`;
