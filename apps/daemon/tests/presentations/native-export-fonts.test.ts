import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { staticFont, NativeExportFonts } from '../../src/presentations/native-export-fonts.js';

type TestFont = Parameters<typeof staticFont>[0] & {
  characterSet: number[];
  glyphForCodePoint: (code: number) => { advanceWidth: number; bbox: { minX: number; minY: number; maxX: number; maxY: number } };
};
const fontkit = createRequire(import.meta.url)('fontkit') as { create: (bytes: Buffer) => TestFont };
const source = () => readFile(new URL('../fixtures/fonts/Inter-variable-sample.ttf', import.meta.url));

it('embeds full static 200 and 900 instances with preserved characters, metrics and composite outlines', async () => {
  const original = fontkit.create(await source());
  const widths: number[] = [];
  for (const weight of [200, 900]) {
    const result = staticFont(original, weight, false);
    expect(result.eot).toBeDefined();
    const eot = result.eot!;
    expect(eot.readUInt32LE(0)).toBe(eot.length);
    expect(eot.readUInt16LE(34)).toBe(0x504c);
    const bytes = eot.subarray(eot.length - eot.readUInt32LE(4));
    const restored = fontkit.create(bytes);
    expect(restored.familyName).toBe(`Inter ${weight === 200 ? 'ExtraLight' : 'Black'}`);
    expect(restored.variationAxes).toEqual({});
    expect(restored.characterSet).toEqual(original.characterSet);
    const expected = original.getVariation({ wght: weight }) as TestFont;
    for (const code of original.characterSet) {
      const before = expected.glyphForCodePoint(code), after = restored.glyphForCodePoint(code);
      expect(Math.abs(after.advanceWidth - before.advanceWidth)).toBeLessThanOrEqual(1);
      for (const axis of ['minX', 'minY', 'maxX', 'maxY'] as const) {
        if (Number.isFinite(before.bbox[axis])) expect(Math.abs(after.bbox[axis] - before.bbox[axis])).toBeLessThanOrEqual(1.1);
      }
    }
    widths.push(restored.glyphForCodePoint(87).bbox.maxX - restored.glyphForCodePoint(87).bbox.minX);
  }
  expect(widths[1]).toBeGreaterThan(widths[0]!);
});

it('keeps a preview-only font editable through its installed face without embedding restricted font data', async () => {
  const bytes = await source();
  const original = fontkit.create(bytes);
  const font = Object.create(original) as TestFont;
  font._getTableStream = name => {
    const stream = original._getTableStream(name);
    return { readBuffer(length) {
      const data = Buffer.from(stream.readBuffer(length));
      if (name === 'OS/2') data.writeUInt16BE(4, 8);
      return data;
    } };
  };
  const result = staticFont(font, 400, false);
  expect(result.eot).toBeUndefined();
  expect(result.warning).toContain('需在接收设备上安装');
});

it('updates existing embedding attributes without creating invalid duplicate attributes', async () => {
  const fonts = new NativeExportFonts();
  const result = staticFont(fontkit.create(await source()), 200, false);
  // Exercise the final package independently from browser font collection.
  (fonts as unknown as { used: Map<string, typeof result> }).used.set(result.family, result);
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', '<p:presentation saveSubsetFonts="1" embedTrueTypeFonts="0"><p:notesSz cx="1" cy="1"/></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships></Relationships>');
  zip.file('[Content_Types].xml', '<Types></Types>');
  await fonts.embed(zip);
  const xml = await zip.file('ppt/presentation.xml')!.async('string');
  expect(xml.match(/saveSubsetFonts=/g)).toHaveLength(1);
  expect(xml.match(/embedTrueTypeFonts=/g)).toHaveLength(1);
  expect(xml).toContain('embedTrueTypeFonts="1"');
  expect(xml).toContain('Inter ExtraLight');
  expect(Object.keys(zip.files).filter(name => name.endsWith('.fntdata'))).toHaveLength(1);
});
