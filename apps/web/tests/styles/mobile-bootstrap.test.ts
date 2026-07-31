import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(
  new URL('../../src/index.css', import.meta.url),
  'utf8',
);

describe('mobile bootstrap styles', () => {
  it('does not block first paint on an external font stylesheet', () => {
    expect(indexCss).not.toMatch(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i);
  });

  it('keeps a visible full-screen bootstrap surface while client code loads', () => {
    const bootstrapRule = indexCss.match(/\.locale-bootstrap\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(bootstrapRule).toContain('min-height: 100dvh;');
    expect(bootstrapRule).toContain('display: flex;');
    expect(bootstrapRule).toContain('background: var(--bg-app);');
  });
});
