import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { Page } from 'playwright-core';
import type JSZip from 'jszip';

type Font = {
  familyName: string; fullName: string; postscriptName: string; numGlyphs: number;
  directory: { tables: Record<string, { length: number }> };
  variationAxes: Record<string, { min: number; default: number; max: number }>;
  getVariation: (axes: Record<string, number>) => Font;
  hasGlyphForCodePoint: (code: number) => boolean;
  getGlyph: (id: number) => {
    advanceWidth: number;
    _getContours: () => Array<Array<{ x: number; y: number; onCurve: boolean }>>;
    _getMetrics: () => { leftBearing: number };
  };
  _getTableStream: (name: string) => { readBuffer: (length: number) => Uint8Array };
};
const fontkit = createRequire(import.meta.url)('fontkit') as { create: (bytes: Buffer, name?: string) => Font };
const run = promisify(execFile);
const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const keyOf = (s: { family: string; weight: number; italic: boolean }) => JSON.stringify([s.family, s.weight, s.italic]);
type SourceStyle = { family: string; weight: number; italic: boolean; characters: string; ids: number[] };
type Face = { family: string; eot?: Buffer; font: Font; bold?: boolean; italic?: boolean; warning?: string };
export type NativeFontMap = Record<string, Record<string, { family: string; bold: boolean; italic: boolean }>>;

const googleFamilies: Record<string, [string, string, string?]> = {
  Inter: ['inter', 'Inter[opsz,wght].ttf', 'Inter-Italic[opsz,wght].ttf'],
  'Noto Sans SC': ['notosanssc', 'NotoSansSC[wght].ttf'],
  'Noto Serif SC': ['notoserifsc', 'NotoSerifSC[wght].ttf'],
  'JetBrains Mono': ['jetbrainsmono', 'JetBrainsMono[wght].ttf', 'JetBrainsMono-Italic[wght].ttf'],
  'IBM Plex Mono': ['ibmplexmono', 'IBMPlexMono-Regular.ttf', 'IBMPlexMono-Italic.ttf'],
  'Playfair Display': ['playfairdisplay', 'PlayfairDisplay[wght].ttf', 'PlayfairDisplay-Italic[wght].ttf'],
  'Space Grotesk': ['spacegrotesk', 'SpaceGrotesk[wght].ttf'],
  'Archivo Black': ['archivoblack', 'ArchivoBlack-Regular.ttf'],
  'Source Serif 4': ['sourceserif4', 'SourceSerif4[opsz,wght].ttf', 'SourceSerif4-Italic[opsz,wght].ttf'],
};
const downloads = new Map<string, Promise<Buffer>>();
const preparedFaces = new Map<string, { promise: Promise<Omit<Face, 'font'>>; bytes: number }>();
let preparedBytes = 0;
let systemFonts: Promise<Map<string, string>> | undefined;

async function systemFontFiles() {
  if (!systemFonts) systemFonts = (async () => {
    const files = new Map<string, string>();
    if (process.platform === 'darwin') {
      const { stdout } = await run('/usr/sbin/system_profiler', ['SPFontsDataType', '-json'], { maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
      const catalog = JSON.parse(stdout) as { SPFontsDataType: Array<{ path: string; enabled: string; typefaces?: Array<{ _name: string; enabled: string }> }> };
      for (const file of catalog.SPFontsDataType) for (const face of file.typefaces ?? []) {
        if (file.enabled === 'yes' && face.enabled === 'yes' && !files.has(face._name)) files.set(face._name, file.path);
      }
    } else {
      const { stdout } = await run('fc-list', ['--format', '%{postscriptname}\t%{file}\n'], { timeout: 15_000 });
      for (const line of stdout.trim().split('\n')) {
        const [names, file] = line.split('\t');
        if (file) for (const name of names?.split(',') ?? []) files.set(name, file);
      }
    }
    return files;
  })().catch(error => { systemFonts = undefined; throw error; });
  return systemFonts;
}

function tablesOf(font: Font) {
  return Object.fromEntries(Object.entries(font.directory.tables).map(([name, table]) =>
    [name, Buffer.from(font._getTableStream(name).readBuffer(table.length))]));
}

function checksum(bytes: Buffer) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    let word = 0;
    for (let j = 0; j < 4; j++) word = (word << 8) | (bytes[i + j] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

function sfnt(tables: Record<string, Buffer>): Buffer {
  const names = Object.keys(tables).sort();
  const count = names.length, power = 2 ** Math.floor(Math.log2(count));
  const data = Buffer.alloc(12 + count * 16 + names.reduce((size, name) => size + Math.ceil(tables[name]!.length / 4) * 4, 0));
  data.writeUInt32BE(tables['CFF '] || tables.CFF2 ? 0x4f54544f : 0x00010000);
  data.writeUInt16BE(count, 4); data.writeUInt16BE(power * 16, 6);
  data.writeUInt16BE(Math.log2(power), 8); data.writeUInt16BE(count * 16 - power * 16, 10);
  let offset = 12 + count * 16, headOffset = 0;
  for (const [i, name] of names.entries()) {
    const bytes = Buffer.from(tables[name]!);
    if (name === 'head') { bytes.writeUInt32BE(0, 8); headOffset = offset; }
    const record = 12 + i * 16;
    data.write(name, record, 4, 'ascii'); data.writeUInt32BE(checksum(bytes), record + 4);
    data.writeUInt32BE(offset, record + 8); data.writeUInt32BE(bytes.length, record + 12);
    bytes.copy(data, offset); offset += Math.ceil(bytes.length / 4) * 4;
  }
  data.writeUInt32BE((0xb1b0afba - checksum(data)) >>> 0, headOffset + 8);
  return data;
}

function renameFace(table: Buffer, family: string) {
  const count = table.readUInt16BE(2), strings = table.readUInt16BE(4);
  const records: Buffer[] = [], values: Buffer[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const record = Buffer.from(table.subarray(6 + i * 12, 18 + i * 12));
    const platform = record.readUInt16BE(0), id = record.readUInt16BE(6);
    const replacement = [1, 4, 16].includes(id) ? family : [2, 17].includes(id) ? 'Regular'
      : [3, 6].includes(id) ? family.replace(/[^A-Za-z0-9-]/g, '') : undefined;
    const value = replacement === undefined
      ? table.subarray(strings + record.readUInt16BE(10), strings + record.readUInt16BE(10) + record.readUInt16BE(8))
      : platform === 0 || platform === 3 ? Buffer.from(replacement, 'utf16le').swap16() : Buffer.from(replacement, 'ascii');
    record.writeUInt16BE(value.length, 8); record.writeUInt16BE(offset, 10);
    records.push(record); values.push(value); offset += value.length;
  }
  const header = Buffer.alloc(6); header.writeUInt16BE(count, 2); header.writeUInt16BE(6 + count * 12, 4);
  return Buffer.concat([header, ...records, ...values]);
}

function staticOutlines(font: Font, tables: Record<string, Buffer>) {
  // Keep point order and glyph IDs so cmap and layout-table references remain valid.
  const glyphs: Buffer[] = [], offsets = Buffer.alloc((font.numGlyphs + 1) * 4), metrics = Buffer.alloc(font.numGlyphs * 4);
  let offset = 0, maxPoints = 0, maxContours = 0;
  for (let id = 0; id < font.numGlyphs; id++) {
    const glyph = font.getGlyph(id);
    const contours = glyph._getContours().map(contour => contour.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.onCurve })));
    const points = contours.flat();
    const bytes = Buffer.alloc(12 + contours.length * 2 + points.length * 5);
    bytes.writeInt16BE(contours.length);
    if (points.length) {
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((v, i) => bytes.writeInt16BE(v, 2 + i * 2));
    }
    let end = -1;
    contours.forEach((c, i) => { end += c.length; bytes.writeUInt16BE(end, 10 + i * 2); });
    const flags = 12 + contours.length * 2;
    let previousX = 0, previousY = 0;
    points.forEach((p, i) => {
      bytes[flags + i] = Number(p.on);
      bytes.writeInt16BE(p.x - previousX, flags + points.length + i * 2);
      bytes.writeInt16BE(p.y - previousY, flags + points.length * 3 + i * 2);
      previousX = p.x; previousY = p.y;
    });
    offsets.writeUInt32BE(offset, id * 4); offset += bytes.length; glyphs.push(bytes);
    metrics.writeUInt16BE(Math.round(glyph.advanceWidth), id * 4);
    metrics.writeInt16BE(Math.round(glyph._getMetrics().leftBearing), id * 4 + 2);
    maxPoints = Math.max(maxPoints, points.length); maxContours = Math.max(maxContours, contours.length);
  }
  offsets.writeUInt32BE(offset, font.numGlyphs * 4);
  tables.glyf = Buffer.concat(glyphs); tables.loca = offsets; tables.hmtx = metrics;
  tables.head!.writeInt16BE(1, 50); tables.hhea!.writeUInt16BE(font.numGlyphs, 34);
  tables.maxp!.writeUInt16BE(maxPoints, 6); tables.maxp!.writeUInt16BE(maxContours, 8);
  for (const position of [10, 12, 26, 28, 30]) tables.maxp!.writeUInt16BE(0, position);
  for (const tag of ['fvar', 'gvar', 'avar', 'HVAR', 'VVAR', 'MVAR', 'STAT', 'cvar', 'DSIG', 'fpgm', 'prep', 'cvt ']) delete tables[tag];
}

/** Full static instances keep the original glyph IDs, shaping tables and editable character repertoire. */
export function staticFont(font: Font, weight: number, italic: boolean) {
  let selected = font;
  if (font.variationAxes.wght) selected = font.getVariation({ wght: Math.max(font.variationAxes.wght.min, Math.min(font.variationAxes.wght.max, weight)) });
  if (!font.directory.tables['OS/2']) return {
    family: selected.fullName, font: selected,
    warning: `字体 ${font.familyName} 需在接收设备上安装`,
  } satisfies Face;
  const originalOs2 = Buffer.from(font._getTableStream('OS/2').readBuffer(font.directory.tables['OS/2']!.length));
  const permission = originalOs2.readUInt16BE(8);
  if (permission & (2 | 4 | 512)) return {
    family: selected.fullName, font: selected,
    bold: weight >= 600 && originalOs2.readUInt16BE(4) < 600,
    italic: italic && !(originalOs2.readUInt16BE(62) & 1),
    warning: `字体 ${font.familyName} 需在接收设备上安装`,
  } satisfies Face;
  const tables = tablesOf(font);
  if (font.variationAxes.wght) staticOutlines(selected, tables);
  const weightNames: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  const family = `${font.familyName.replace(/ (Thin|ExtraLight|Regular)$/i, '')} ${weightNames[weight] ?? weight}${italic ? ' Italic' : ''}`;
  tables.name = renameFace(tables.name!, family);
  tables['OS/2']!.writeUInt16BE(weight, 4);
  // Each weight has its own regular family, avoiding Office's four-style limitation.
  tables['OS/2']!.writeUInt16BE((tables['OS/2']!.readUInt16BE(62) & ~0x21) | 0x40, 62);
  tables.head!.writeUInt16BE(tables.head!.readUInt16BE(44) & ~3, 44);
  const bytes = sfnt(tables), os2 = tables['OS/2']!;
  const header = Buffer.alloc(82);
  header.writeUInt32LE(bytes.length, 4); header.writeUInt32LE(0x00020001, 8);
  os2.copy(header, 16, 32, 42); header[26] = 1;
  header.writeUInt32LE(weight, 28); header.writeUInt16LE(permission, 32); header.writeUInt16LE(0x504c, 34);
  for (let i = 0; i < 4; i++) header.writeUInt32LE(os2.readUInt32BE(42 + i * 4), 36 + i * 4);
  if (os2.length >= 86) for (let i = 0; i < 2; i++) header.writeUInt32LE(os2.readUInt32BE(78 + i * 4), 52 + i * 4);
  const headOffset = bytes.readUInt32BE(12 + Object.keys(tables).sort().indexOf('head') * 16 + 8);
  header.writeUInt32LE(bytes.readUInt32BE(headOffset + 8), 60);
  const strings = [family, 'Regular', 'Version 1.0', family].map(name => {
    const value = Buffer.from(name, 'utf16le'), length = Buffer.alloc(2), padding = Buffer.alloc(2);
    length.writeUInt16LE(value.length); return Buffer.concat([length, value, padding]);
  });
  const eot = Buffer.concat([header, ...strings, Buffer.alloc(2), bytes]);
  eot.writeUInt32LE(eot.length);
  return { family, eot, font } satisfies Face;
}

function prepareFace(bytes: Buffer, postscript: string | undefined, weight: number, italic: boolean): Promise<Omit<Face, 'font'>> {
  const key = JSON.stringify([createHash('sha256').update(bytes).digest('hex'), postscript, weight, italic]);
  const cached = preparedFaces.get(key);
  if (cached) { preparedFaces.delete(key); preparedFaces.set(key, cached); return cached.promise; }
  const source = import.meta.url.endsWith('.ts');
  const worker = new Worker(new URL(source ? './native-font-worker.ts' : './native-font-worker.js', import.meta.url), {
    workerData: { bytes, postscript, weight, italic },
    ...(source ? { execArgv: ['--import', createRequire(import.meta.url).resolve('tsx/esm')] } : {}),
  });
  const promise = new Promise<Omit<Face, 'font'>>((resolve, reject) => {
    let finished = false;
    worker.once('message', (result: Omit<Face, 'font'> & { error?: string }) => {
      finished = true;
      if (result.error) reject(new Error(result.error));
      else resolve({ ...result, ...(result.eot ? { eot: Buffer.from(result.eot) } : {}) });
    });
    worker.once('error', reject);
    worker.once('exit', code => { if (!finished) reject(new Error(`字体处理进程退出 (${code})`)); });
  });
  const entry = { promise, bytes: 0 };
  preparedFaces.set(key, entry);
  void promise.then(result => {
    entry.bytes = result.eot?.length ?? 1;
    preparedBytes += entry.bytes;
    for (const [oldKey, old] of preparedFaces) {
      if (preparedBytes <= 256 * 1024 * 1024) break;
      if (old.bytes) { preparedFaces.delete(oldKey); preparedBytes -= old.bytes; }
    }
  }, () => { preparedFaces.delete(key); });
  return promise;
}

export class NativeExportFonts {
  private faces = new Map<string, Promise<Face>>();
  private used = new Map<string, Face>();
  readonly warnings = new Set<string>();

  private async face(name: string, postscript: string, style: SourceStyle, custom: boolean): Promise<Face> {
    const id = JSON.stringify([custom ? name : postscript, style.weight, style.italic]);
    let loading = this.faces.get(id);
    if (!loading) {
      loading = (async () => {
        const definition = Object.entries(googleFamilies).find(([family]) => name === family || name.startsWith(family + ' '));
        let bytes: Buffer, font: Font;
        if (custom && definition) {
          const [, [directory, normal, italic]] = definition;
          let file = style.italic && italic ? italic : normal;
          if (directory === 'ibmplexmono') {
            const names: Record<number, string> = {100:'Thin',200:'ExtraLight',300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold'};
            const weight = names[Math.max(100, Math.min(700, Math.round(style.weight / 100) * 100))]!;
            file = `IBMPlexMono-${style.italic ? weight === 'Regular' ? 'Italic' : weight + 'Italic' : weight}.ttf`;
          }
          const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${directory}/${encodeURIComponent(file)}`;
          let download = downloads.get(url);
          if (!download) {
            download = fetch(url, { signal: AbortSignal.timeout(60_000) }).then(async response => {
              if (!response.ok) throw new Error(`字体 ${name} 加载失败`);
              return Buffer.from(await response.arrayBuffer());
            }).catch(error => { downloads.delete(url); throw error; });
            downloads.set(url, download);
          }
          bytes = await download; font = fontkit.create(bytes);
        } else {
          let file = (await systemFontFiles()).get(postscript);
          if (!file && process.platform === 'darwin') {
            const safe = name.replace(/[^A-Za-z0-9 -]/g, '');
            const base = postscript.split('-')[0]!.replace(/[^A-Za-z0-9 .]/g, '');
            for (const candidate of [`/System/Library/Fonts/${safe}.ttc`, `/System/Library/Fonts/${base}.ttc`]) {
              if (await stat(candidate).then(s => s.isFile()).catch(() => false)) { file = candidate; break; }
            }
          }
          if (!file) throw new Error(`无法读取原字体 ${postscript}`);
          let read = downloads.get(file);
          if (!read) { read = readFile(file); downloads.set(file, read); }
          bytes = await read; font = fontkit.create(bytes, bytes.toString('ascii', 0, 4) === 'ttcf' ? postscript : undefined);
        }
        return { ...await prepareFace(bytes, custom && definition ? undefined : postscript, style.weight, style.italic), font };
      })();
      this.faces.set(id, loading);
    }
    const face = await loading;
    this.used.set(face.family, face);
    if (face.warning) this.warnings.add(face.warning);
    return face;
  }

  async capture(page: Page, selector: string, index: number): Promise<NativeFontMap> {
    const styles = await page.evaluate<SourceStyle[]>(`(() => {
      const slide=document.querySelectorAll(${JSON.stringify(selector)})[${index}], groups=new Map();let id=0;
      for(const el of [slide,...slide.querySelectorAll('*')]) {
        if(el.closest('.notes,.speaker-notes,script,style,template,[hidden]')) continue;
        const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('');
        if(!text.trim()||!el.getClientRects().length)continue;
        const s=getComputedStyle(el);let visible=true,opacity=1;
        for(let parent=el;parent&&parent!==slide.parentElement;parent=parent.parentElement){
          const p=getComputedStyle(parent);opacity*=Number(p.opacity);
          if(p.visibility!=='visible'||p.display==='none'||opacity<.01){visible=false;break;}
        }
        if(!visible)continue;
        const style={family:s.fontFamily,weight:Number(s.fontWeight)||400,italic:s.fontStyle==='italic'};
        const key=JSON.stringify([style.family,style.weight,style.italic]);
        const group=groups.get(key)||{...style,characters:'',ids:[]};group.characters+=text;
        el.setAttribute('data-niki-export-font',${index}+'-'+id);group.ids.push(id++);groups.set(key,group);
      }
      return [...groups.values()];
    })()`);
    const session = await page.context().newCDPSession(page);
    const result: NativeFontMap = {};
    try {
      await session.send('DOM.enable'); await session.send('CSS.enable');
      const { root } = await session.send('DOM.getDocument');
      for (const style of styles) {
        const sources = new Map<string, { familyName: string; postScriptName: string; isCustomFont: boolean }>();
        for (const id of style.ids) {
          const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-niki-export-font="${index}-${id}"]` });
          if (!nodeId) continue;
          const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
          for (const font of fonts) sources.set(font.postScriptName, font);
        }
        const originalOrder = style.family.split(',').map(n => n.trim().replace(/^['"]|['"]$/g, ''));
        const fonts = [...sources.values()].sort((a, b) => {
          const rank = (name: string) => { const i = originalOrder.findIndex(f => name === f || name.startsWith(f + ' ')); return i < 0 ? 100 : i; };
          return rank(a.familyName) - rank(b.familyName);
        });
        const faces = await Promise.all(fonts.map(f => this.face(f.familyName, f.postScriptName, style, f.isCustomFont)));
        const characters: NativeFontMap[string] = {};
        for (const char of new Set(style.characters)) {
          if (/\p{Cf}/u.test(char) || (!char.trim() && char !== ' ')) continue;
          const face = faces.find(f => f.font.hasGlyphForCodePoint(char.codePointAt(0)!));
          if (!face) throw new Error(`原字体 ${style.family} 缺少字符 ${char}`);
          characters[char] = { family: face.family, bold: face.bold ?? false, italic: face.italic ?? false };
        }
        result[keyOf(style)] = characters;
      }
    } finally { await session.detach(); }
    return result;
  }

  async embed(zip: JSZip) {
    const fonts = [...this.used.values()].filter(f => f.eot);
    if (!fonts.length) return;
    const relationships = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
    const entries = fonts.map((face, index) => {
      const id = `rIdNikiFont${index + 1}`, name = `fonts/font-${createHash('sha256').update(face.eot!).digest('hex').slice(0, 16)}.fntdata`;
      zip.file('ppt/' + name, face.eot!);
      return { relation: `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${name}"/>`,
        entry: `<p:embeddedFont><p:font typeface="${xml(face.family)}"/><p:regular r:id="${id}"/></p:embeddedFont>` };
    });
    zip.file('ppt/_rels/presentation.xml.rels', relationships.replace('</Relationships>', entries.map(e => e.relation).join('') + '</Relationships>'));
    const presentation = await zip.file('ppt/presentation.xml')!.async('string');
    zip.file('ppt/presentation.xml', presentation.replace(/<p:presentation\b[^>]*>/, root => root
      .replace(/\s(?:embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, '')
      .replace('>', ' embedTrueTypeFonts="1" saveSubsetFonts="0">'))
      .replace(/<p:notesSz\b[^>]*\/>/, match => match + `<p:embeddedFontLst>${entries.map(e => e.entry).join('')}</p:embeddedFontLst>`));
    const types = await zip.file('[Content_Types].xml')!.async('string');
    zip.file('[Content_Types].xml', types.replace('</Types>', '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>'));
  }
}
