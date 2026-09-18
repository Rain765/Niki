import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES } from '@open-design/contracts';
import manifest from '../../src/poster/native-preview-assets.json';

it('ships a small, immutable image for every selectable template/theme without missing or orphaned assets', () => {
  const previews: Record<string, Record<string, {thumb:string;full:string}>> = manifest;
  for (const template of ['custom', ...NATIVE_HTML_TEMPLATES]) {
    for (const theme of ['default', ...NATIVE_HTML_THEMES]) expect(previews[template]?.[theme]).toBeTruthy();
  }
  expect(previews.recommend?.default).toBeTruthy();
  expect(previews.guizang?.default).toBeTruthy();
  const root = fileURLToPath(new URL('../../public/presentation-previews/',import.meta.url));
  const referenced = new Set<string>();
  for (const variants of Object.values(previews)) for (const asset of Object.values(variants)) {
    for (const key of ['thumb','full'] as const) {
      expect(asset[key]).toMatch(/^\/presentation-previews\/[a-f0-9]{20}\.webp$/);
      const name=asset[key].split('/').at(-1)!;
      const bytes=readFileSync(root+name);
      expect(createHash('sha256').update(bytes).digest('hex').slice(0,20)+'.webp').toBe(name);
      expect(bytes.subarray(0,4).toString()).toBe('RIFF');
      expect(bytes.subarray(8,12).toString()).toBe('WEBP');
      expect(bytes.length).toBeLessThan(key==='thumb'?12_000:160_000);
      referenced.add(name);
    }
  }
  expect(readdirSync(root).filter(name=>name.endsWith('.webp')).sort()).toEqual([...referenced].sort());
});
