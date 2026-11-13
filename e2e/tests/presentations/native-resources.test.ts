import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';
import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES, NATIVE_PRESENTATION_RESOURCES } from '@open-design/contracts';

it('exposes every original full deck and theme in the same order as the original theme gallery', async () => {
  const root = fileURLToPath(new URL('../../../design-templates/html-ppt/', import.meta.url));
  const decks = await readdir(path.join(root, 'templates/full-decks'));
  expect([...NATIVE_HTML_TEMPLATES].sort()).toEqual(decks.sort());
  const themes = (await readdir(path.join(root, 'assets/themes'))).filter(name => name.endsWith('.css')).map(name => name.slice(0, -4));
  expect([...NATIVE_HTML_THEMES].sort()).toEqual(themes.sort());
  const gallery = await readFile(path.join(root, 'templates/theme-showcase.html'), 'utf8');
  const themeArray = gallery.match(/const THEMES = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  const originalOrder = [...themeArray.matchAll(/\['([^']+)'/g)].map(match => match[1]);
  expect(originalOrder).toEqual([...NATIVE_HTML_THEMES]);
});

it('keeps the complete original HTML PPT resource baseline used by the native UI', async () => {
  const root = fileURLToPath(new URL('../../../design-templates/html-ppt/', import.meta.url));
  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
  }
  const files = await walk(root);
  const hashes: Record<string, string> = {};
  for (const file of files.sort()) hashes[path.relative(root, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
  const digest = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  expect(files).toHaveLength(226);
  expect(NATIVE_PRESENTATION_RESOURCES['html-ppt']).toBe(`sha256:${digest}`);
});
