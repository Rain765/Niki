import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/home/lite-image-home.css', import.meta.url),
  'utf8',
);
const controlsCss = readFileSync(
  new URL('../../src/styles/ui-controls.css', import.meta.url),
  'utf8',
);

describe('LiteImageHome mobile selects', () => {
  it('uses the canonical custom selector instead of a page-specific native select', () => {
    const triggerRule =
      css.match(/\.lite-image-home__composer \.od-control-select__trigger\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(triggerRule).toContain('min-height: 38px;');
    expect(css).not.toMatch(/\.lite-image-home__composer select\s*\{/);
    expect(controlsCss).toContain('.od-control-select__trigger');
  });

  it('uses the shared two-column mobile filter grid', () => {
    expect(controlsCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.od-filter-grid\.od-filter-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(controlsCss).toMatch(
      /\.od-filter-grid > \.od-filter-grid__wide,[\s\S]*?grid-column: 1 \/ -1;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 680px\)[\s\S]*?\.lite-image-home__composer\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
