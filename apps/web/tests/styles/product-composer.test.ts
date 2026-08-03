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

  it('uses the orange accent for configured one-click generation actions', () => {
    expect(ndesignCss).toMatch(
      /\.composer-send--arrow\[data-action=['"]generate['"]\][^{]*\{[^}]*background:\s*var\(--accent\)[^}]*color:\s*var\(--accent-contrast\)/s,
    );
    expect(ndesignCss).toMatch(
      /\.auto-poster-filter__generate-action\s*\{[^}]*border-radius:\s*999px[^}]*background:\s*var\(--accent\)[^}]*color:\s*var\(--accent-contrast\)/s,
    );
  });

  it('shows a single generation action while mobile poster settings are open', () => {
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.auto-poster-filter__portal\s+\.auto-poster-filter__menu\s*\{[\s\S]*bottom:\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.home-hero__input-card\.is-settings-open\s+\.home-hero__capsule\s*\{[^}]*display:\s*none/s,
    );
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.pane\.is-direct-loan-poster\s*>\s*\.composer\.is-settings-open\s+\.composer-shell--capsule\s*\{[^}]*display:\s*none/s,
    );
  });

  it('keeps product tags unframed and pins the poster composer on mobile', () => {
    expect(ndesignCss).toMatch(
      /\.home-hero__auto-poster,[\s\S]*\.entry-main__inner--home\s+\.home-hero__auto-poster\s*\{[^}]*background:\s*transparent/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.pane\.is-direct-loan-poster\s*>\s*\.composer\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/s,
    );
    expect(ndesignCss).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.composer-auto-poster\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s,
    );
  });

  it('uses one centered mobile column for poster status, media and actions', () => {
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.direct-poster-status\s*\{[^}]*width:\s*100%[^}]*margin:\s*0[^}]*padding:\s*12px 16px/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.direct-poster-result\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.direct-poster-result-open\s+img\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*max-height:\s*min\(62dvh,\s*680px\)/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.direct-poster-result\s+figcaption\s*\{[^}]*align-items:\s*center[^}]*text-align:\s*center/s,
    );
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*\.pane\.is-direct-loan-poster\s+\.chat-log\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior-y:\s*contain/s,
    );
  });
});
