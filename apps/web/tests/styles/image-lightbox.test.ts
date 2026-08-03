import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/image-lightbox.css', import.meta.url),
  'utf8',
);

describe('image lightbox responsive layout', () => {
  it('uses a safe-area-aware full-screen workbench with touch gestures', () => {
    expect(css).toMatch(
      /\.image-lightbox\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s,
    );
    expect(css).toMatch(
      /\.image-lightbox__header\s*\{[^}]*env\(safe-area-inset-top/s,
    );
    expect(css).toMatch(
      /\.image-lightbox__stage\s*\{[^}]*touch-action:\s*none/s,
    );
    expect(css).toMatch(
      /\.image-lightbox__footer\s*\{[^}]*env\(safe-area-inset-bottom/s,
    );
  });

  it('uses decisive ease-out motion and disables it when requested', () => {
    expect(css).toContain('200ms cubic-bezier(0.23, 1, 0.32, 1)');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
