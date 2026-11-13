import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const helperPath = path.join(repoRoot, 'deploy/scripts/niki-runtime-static-compat.zsh');

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function writeAsset(release: string, relativePath: string, content: string) {
  const target = path.join(release, 'apps/web/.next/static', relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

test('carries only the previous release assets without overwriting the new build', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'niki-static-compat-'));
  const previous = path.join(root, 'previous');
  const next = path.join(root, 'next');

  await writeAsset(previous, 'chunks/old.js', 'old chunk');
  await writeAsset(previous, 'chunks/shared.js', 'previous shared chunk');
  await writeAsset(previous, 'chunks/older-compat.js', 'older compatibility chunk');
  await writeFile(
    path.join(previous, '.niki-static-assets'),
    ['chunks/old.js', 'chunks/shared.js', ''].join('\n'),
  );
  await writeAsset(next, 'chunks/new.js', 'new chunk');
  await writeAsset(next, 'chunks/shared.js', 'current shared chunk');

  execFileSync('/bin/zsh', ['-c', [
    `source ${shellQuote(helperPath)}`,
    `snapshot_niki_static_assets ${shellQuote(next)}`,
    `carry_forward_niki_static_assets ${shellQuote(previous)} ${shellQuote(next)}`,
  ].join('\n')]);

  assert.equal(await readFile(path.join(next, 'apps/web/.next/static/chunks/old.js'), 'utf8'), 'old chunk');
  assert.equal(
    await readFile(path.join(next, 'apps/web/.next/static/chunks/shared.js'), 'utf8'),
    'current shared chunk',
  );
  await assert.rejects(readFile(path.join(next, 'apps/web/.next/static/chunks/older-compat.js')));
  assert.equal(
    await readFile(path.join(next, '.niki-static-assets'), 'utf8'),
    ['chunks/new.js', 'chunks/shared.js', ''].join('\n'),
  );
});

test('falls back to all previous static files for releases without a manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'niki-static-compat-fallback-'));
  const previous = path.join(root, 'previous');
  const next = path.join(root, 'next');

  await writeAsset(previous, 'chunks/old.js', 'old chunk');
  await writeAsset(previous, 'media/brand.woff2', 'font');
  await writeAsset(next, 'chunks/new.js', 'new chunk');

  execFileSync('/bin/zsh', ['-c', [
    `source ${shellQuote(helperPath)}`,
    `carry_forward_niki_static_assets ${shellQuote(previous)} ${shellQuote(next)}`,
  ].join('\n')]);

  assert.equal(await readFile(path.join(next, 'apps/web/.next/static/chunks/old.js'), 'utf8'), 'old chunk');
  assert.equal(await readFile(path.join(next, 'apps/web/.next/static/media/brand.woff2'), 'utf8'), 'font');
});
