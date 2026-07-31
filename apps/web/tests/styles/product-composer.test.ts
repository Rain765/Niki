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

  it('keeps chat settings as a bottom sheet and gives the mobile home an integrated surface', () => {
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.auto-poster-filter__portal\s+\.auto-poster-filter__menu\s*\{[\s\S]*bottom:\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(ndesignCss).toMatch(
      /\.home-hero__input-card\.is-settings-open\s+\.home-hero__capsule\s*\{[^}]*border-top:\s*1px\s+solid\s+var\(--border-soft\)[^}]*border-radius:\s*0\s+0\s+23px\s+23px/s,
    );
  });

  it('keeps product tags unframed and pins the poster composer on mobile', () => {
    expect(ndesignCss).toMatch(
      /\.home-hero__auto-poster,[\s\S]*\.entry-main__inner--home\s+\.home-hero__auto-poster\s*\{[^}]*background:\s*transparent/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.pane\.is-direct-loan-poster\s*>\s*\.composer\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/s,
    );
  });
});
