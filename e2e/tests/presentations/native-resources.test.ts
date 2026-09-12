import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';
import { NATIVE_PRESENTATION_RESOURCES } from '@open-design/contracts';

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
