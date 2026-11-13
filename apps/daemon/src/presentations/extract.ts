import path from 'node:path';
import JSZip from 'jszip';
import { analyzePresentationSource } from './analysis.js';
import { extractPresentationDocument } from './content.js';

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const words = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => decode(m[1]!))
    .join('');
/** Retain Word tables as rows/cells and original embedded images, with bounded ZIP reads. */
export async function extractPresentationSource(name: string, buffer: Buffer) {
  let document = await extractPresentationDocument(name, buffer); // includes ZIP size validation
  const assets: { id: string; name: string; data: string }[] = [];
  const warnings: string[] = [];
  if (path.extname(name).toLowerCase() === '.docx') {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    const fragments =
      xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    document = fragments
      .map((fragment) => {
        if (!fragment.startsWith('<w:tbl')) return words(fragment);
        const rows = [...fragment.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(
          (row) =>
            [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) =>
              words(cell[0]).replace(/\|/g, '｜'),
            ),
        );
        const columns = Math.max(0, ...rows.map((r) => r.length));
        const padded = rows.map((row) =>
          Array.from({ length: columns }, (_, i) => row[i] ?? ''),
        );
        if (!padded.length) return '';
        const lines = padded.map((row) => '| ' + row.join(' | ') + ' |');
        lines.splice(
          1,
          0,
          '| ' + Array(columns).fill('---').join(' | ') + ' |',
        );
        return lines.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
    if (/<w:(?:gridSpan|vMerge)\b/.test(xml))
      warnings.push(
        'Word 表格包含合并单元格，已保留单元格文字；生成前请核对跨行/跨列含义。',
      );
    const images = Object.values(zip.files).filter(
      (f) =>
        !f.dir &&
        /^word\/media\//.test(f.name) &&
        /\.(png|jpe?g)$/i.test(f.name),
    );
    let bytes = 0;
    for (const image of images.slice(0, 20)) {
      const data = await image.async('nodebuffer');
      bytes += data.length;
      if (bytes > 12 * 1024 * 1024) {
        warnings.push('文档图片超过预览容量，后续图片未导入。');
        break;
      }
      assets.push({
        id: `image-${assets.length + 1}`,
        name: path.basename(image.name),
        data: `data:image/${/\.png$/i.test(image.name) ? 'png' : 'jpeg'};base64,${data.toString('base64')}`,
      });
    }
    if (images.length > 20)
      warnings.push('最多导入 20 张文档图片，请分章节处理更多图片。');
  }
  const source = analyzePresentationSource(document);
  source.assets = assets;
  source.warnings.push(...warnings);
  return { document, source };
}
