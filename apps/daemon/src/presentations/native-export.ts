import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { inspectNativePresentation } from './native-inspection.js';
import { NATIVE_EXPORT_CAPTURE, type ExportBox, type ExportColor, type ExportText, type NativeExportSlide } from './native-export-scene.js';
import { normalizePresentationPackage } from './render.js';

const PptxGenJS = createRequire(import.meta.url)('pptxgenjs') as typeof import('pptxgenjs').default;
const px = (value: number) => value / 96;
const pt = (value: number) => value * .75;
const bounds = (b: ExportBox) => ({ x: px(b.x), y: px(b.y), w: px(b.w), h: px(b.h) });
const fill = (c: ExportColor) => ({ color: c.hex, transparency: Math.round((1 - c.alpha) * 100) });
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function textBody(box: ExportText): string {
  const paragraphs = box.lines.map((line, i) => {
    const prev = box.lines[i - 1];
    const fontSize = line.runs[0]!.style.size;
    const spacing = prev ? line.baseline - prev.baseline : fontSize * 1.18;
    const margin = Math.max(0, Math.round((line.x - box.x) * 9525));
    const properties = `<a:pPr marL="${margin}" indent="0" algn="l"><a:lnSpc><a:spcPts val="${Math.round(pt(Math.max(spacing, 1)) * 100)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>`;
    const runs = line.runs.map(({ text, style: s }) => {
      const font = xml(s.font);
      const alpha = s.color.alpha < .999 ? `<a:alpha val="${Math.round(s.color.alpha * 100000)}"/>` : '';
      return `<a:r><a:rPr lang="zh-CN" sz="${Math.round(pt(s.size) * 100)}" b="${Number(s.bold)}" i="${Number(s.italic)}" u="${s.underline ? 'sng' : 'none'}" cap="${s.caps ? 'all' : 'none'}" spc="${Math.round(pt(s.spacing) * 100)}"><a:solidFill><a:srgbClr val="${s.color.hex}">${alpha}</a:srgbClr></a:solidFill><a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:rPr><a:t xml:space="preserve">${xml(text)}</a:t></a:r>`;
    }).join('');
    return `<a:p>${properties}${runs}</a:p>`;
  }).join('');
  return `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`;
}

export async function writeNativePptx(pages: NativeExportSlide[], title: string): Promise<Buffer> {
  const canvas = pages[0];
  if (!canvas) throw new Error('文稿没有可导出的幻灯片');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'Native', width: px(canvas.width), height: px(canvas.height) });
  pptx.layout = 'Native';
  pptx.title = title;
  pptx.author = 'Niki';
  const textBoxes = pages.map((page, index) => {
    if (Math.abs(page.width - canvas.width) > 1 || Math.abs(page.height - canvas.height) > 1)
      throw new Error(`第 ${index + 1} 页：画布尺寸与前页不一致`);
    const slide = pptx.addSlide();
    slide.background = fill(page.background);
    const texts: ExportText[] = [];
    for (const element of page.elements) {
      if (element.kind === 'text') {
        const first = element.lines[0]!;
        const size = first.runs[0]!.style.size;
        const y = Math.max(0, first.baseline - size * .96);
        texts.push(element);
        slide.addText(element.lines.map(line => line.runs.map(r => r.text).join('')).join('\n'), {
          ...bounds({ ...element, y, w: Math.max(2, Math.min(canvas.width - element.x, element.w + 24)), h: Math.max(2, Math.min(canvas.height - y, element.y + element.h - y + 12)) }),
          objectName: `Editable text ${texts.length}`, margin: 0, fontFace: first.runs[0]!.style.font, fontSize: pt(size),
        });
      } else if (element.kind === 'shape') {
        if (!element.fill.alpha && (!element.stroke.alpha || !element.strokeWidth)) continue;
        const points = element.points?.map(p => 'close' in p ? p : { ...p, x: px(p.x), y: px(p.y) });
        const radius = Math.min(element.w, element.h) / 2;
        const type = element.dash ? pptx.ShapeType.line : points ? ('custGeom' as Parameters<typeof slide.addShape>[0])
          : element.radius >= radius && Math.abs(element.w - element.h) < 1 ? pptx.ShapeType.ellipse
          : element.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
        slide.addShape(type, {
          ...bounds(element), fill: fill(element.fill),
          line: element.stroke.alpha && element.strokeWidth ? { ...fill(element.stroke), width: pt(element.strokeWidth), ...(element.dash ? { dashType: 'dash' as const } : {}) } : { type: 'none' },
          ...(points ? { points } : {}),
          ...(element.radius && radius ? { rectRadius: Math.min(1, element.radius / radius) } : {}),
          ...(element.shadow ? { shadow: {
            type: 'outer' as const, color: element.shadow.color.hex, opacity: element.shadow.color.alpha,
            blur: Math.min(100, pt(element.shadow.blur / 2)), offset: Math.min(200, pt(Math.hypot(element.shadow.x, element.shadow.y))),
            angle: (Math.atan2(element.shadow.y, element.shadow.x) * 180 / Math.PI + 360) % 360,
          } } : {}),
        });
      } else if (element.kind === 'image') {
        if (!element.data) throw new Error(`第 ${index + 1} 页：图片无法导出`);
        slide.addImage({ ...bounds(element), data: element.data });
      } else {
        const rows = element.rows.map(row => row.map(cell => ({
          text: cell.text,
          options: {
            fill: fill(cell.fill), color: cell.style.color.hex, fontFace: cell.style.font,
            fontSize: pt(cell.style.size), bold: cell.style.bold, italic: cell.style.italic,
            colspan: cell.colspan, rowspan: cell.rowspan,
          },
        })));
        slide.addTable(rows, {
          ...bounds(element), autoPage: false, margin: 0,
          ...(element.widths.length ? { colW: element.widths.map(px) } : {}),
          rowH: element.heights.map(px), valign: 'middle',
        });
      }
    }
    if (page.notes) slide.addNotes(page.notes);
    return texts;
  });
  const buffer = await normalizePresentationPackage(await pptx.write({ outputType: 'nodebuffer', compression: true }) as Buffer);
  const zip = await JSZip.loadAsync(buffer);
  for (const [index, boxes] of textBoxes.entries()) {
    const name = `ppt/slides/slide${index + 1}.xml`;
    const part = zip.file(name);
    if (!part) throw new Error(`第 ${index + 1} 页：导出文件缺少幻灯片`);
    let count = 0;
    const contents = (await part.async('string')).replace(/<p:sp>[\s\S]*?<\/p:sp>/g, block => {
      const id = /\bname="Editable text (\d+)"/.exec(block);
      if (!id) return block;
      const box = boxes[Number(id[1]) - 1];
      if (!box) return block;
      return block.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => { count++; return textBody(box); });
    });
    if (count !== boxes.length) throw new Error(`第 ${index + 1} 页：可编辑文字写入不完整`);
    zip.file(name, contents);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function exportNativePresentation(projectDir: string, entry: string, title: string, onPage: (pages: number) => void) {
  const pages: NativeExportSlide[] = [];
  const cjkSans = process.platform === 'darwin' ? 'PingFang SC' : 'Microsoft YaHei';
  const cjkSerif = process.platform === 'darwin' ? 'Songti SC' : 'SimSun';
  const report = await inspectNativePresentation({
    projectDir, entry, save: async () => {},
    async visitSlide(page, selector, index) {
      try {
        const scene = await page.evaluate<NativeExportSlide>(`(${NATIVE_EXPORT_CAPTURE})(${JSON.stringify({ selector, index, cjkSans, cjkSerif })})`);
        for (const element of scene.elements) {
          if (element.kind !== 'image') continue;
          if (element.data) continue;
          if (element.decoration) {
            const x = Math.max(0, element.x), y = Math.max(0, element.y);
            const w = Math.min(element.x + element.w, scene.width) - x;
            const h = Math.min(element.y + element.h, scene.height) - y;
            await page.evaluate(`(() => {
              const properties = ${JSON.stringify(element.decoration)};
              const style = document.createElement('style');
              style.id = 'niki-export-background-style';
              style.textContent = 'html,body{background:transparent!important}body *{visibility:hidden!important}#niki-export-background{visibility:visible!important}';
              const target = document.createElement('div');
              target.id = 'niki-export-background';
              Object.assign(target.style, {position:'fixed',left:'${x}px',top:'${y}px',width:'${w}px',height:'${h}px',zIndex:'2147483647',pointerEvents:'none'});
              for(const [key,value] of Object.entries(properties)) target.style.setProperty(key,value);
              document.head.append(style); document.body.append(target);
            })()`);
            try {
              const png = await page.locator('#niki-export-background').screenshot({ timeout: 5000, omitBackground: true });
              element.data = `image/png;base64,${png.toString('base64')}`;
              Object.assign(element, { x, y, w, h });
            } finally {
              await page.evaluate("document.getElementById('niki-export-background')?.remove();document.getElementById('niki-export-background-style')?.remove()");
            }
          } else {
            const image = page.locator(selector).nth(index).locator(`[data-niki-export-image="${element.index}"]`);
            const png = await image.screenshot({ timeout: 5000 });
            element.data = `image/png;base64,${png.toString('base64')}`;
          }
        }
        pages.push(scene);
        onPage(pages.length);
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : '无法读取排版';
        throw new Error(`第 ${index + 1} 页：${message?.replace(/^page\.evaluate: (?:Error: )?/, '')}`);
      }
    },
  });
  if (report.stale) throw new Error('文稿在导出期间已修改，请重新导出');
  if (report.failedResources.some(resource => /\.(css|m?js|svg|png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(resource)))
    throw new Error('文稿资源未加载完整，请修复后重新导出');
  const pptx = await writeNativePptx(pages, title);
  return { pptx, report, pages: pages.length, warnings: [...new Set(pages.flatMap(p => p.warnings))] };
}
