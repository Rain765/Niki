import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/ndesign-system.css', import.meta.url),
  'utf8',
);
const marker = '/* Fill-first component hierarchy';

describe('fill-first component hierarchy', () => {
  it('uses fills instead of borders for enclosed cards and controls', () => {
    const sectionStart = css.lastIndexOf(marker);
    expect(sectionStart).toBeGreaterThan(-1);

    const section = css.slice(sectionStart);
    expect(section).toContain('.entry-main__inner--home .home-hero__input-card {');
    expect(section).toContain('.design-card {');
    expect(section).toContain('.app .composer-shell {');
    expect(section).toContain('.app .action-card,');
    expect(section).toContain('.subtab-pill,');
    expect(section).toContain('border: 0;');
    expect(section).toContain('background: var(--bg-elevated);');
    expect(section).toContain('background: var(--bg-subtle);');
  });

  it('does not flatten drop zones or focus-bearing surfaces', () => {
    const sectionStart = css.lastIndexOf(marker);
    expect(sectionStart).toBeGreaterThan(-1);

    const section = css.slice(sectionStart);
    expect(section).not.toContain('.entry-nav-rail {');
    expect(section).not.toContain('.app .df-drop {');
    expect(section).not.toContain('.app .ws-tabs-shell {');
  });

  it('keeps the project workspace on the page background', () => {
    expect(css).toMatch(
      /\.app \.workspace\s*\{\s*background: var\(--bg-app\);\s*backdrop-filter: none;/,
    );
  });

  it('removes visible navigation and project workspace dividers', () => {
    const sectionStart = css.lastIndexOf(
      '/* Divider-free navigation and project workspace.',
    );
    expect(sectionStart).toBeGreaterThan(-1);

    const section = css.slice(sectionStart);
    expect(section).toContain('.entry-shell--no-header .entry-nav-rail,');
    expect(section).toContain('.app .project-chat-chrome,');
    expect(section).toContain('.app .ws-tabs-shell,');
    expect(section).toContain('.app .df-file-row + .df-file-row .df-cell-name,');
    expect(section).toContain('border-bottom: 0;');
    expect(section).toContain('border-right: 0;');
    expect(section).toContain('border-left: 0;');
    expect(section).toContain('background: transparent;');
  });
});
