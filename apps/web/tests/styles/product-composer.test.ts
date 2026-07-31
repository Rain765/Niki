import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(
  new URL('../../src/index.css', import.meta.url),
  'utf8',
);
const ndesignCss = readFileSync(
  new URL('../../src/styles/ndesign-system.css', import.meta.url),
  'utf8',
);

describe('product composer responsive styles', () => {
  it('renders the home and chat inputs as capsules', () => {
    expect(indexCss).toMatch(/\.composer-shell--capsule\s*\{[^}]*border-radius:\s*999px/s);
    expect(ndesignCss).toMatch(/\.home-hero__capsule\s*\{[^}]*border-radius:\s*999px/s);
  });

  it('keeps product settings as a bottom sheet on mobile', () => {
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.auto-poster-filter__portal\s+\.auto-poster-filter__menu\s*\{[\s\S]*bottom:\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
  });
});
