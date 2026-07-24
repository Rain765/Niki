import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/ndesign-system.css', import.meta.url), 'utf8');

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('Ndesign shadow tokens', () => {
  it('uses soft neutral shadows instead of black shadows in light mode', () => {
    const light = cssBlock(':root');
    const shadowTokens = light
      .split('\n')
      .filter((line) => line.includes('--shadow'))
      .join('\n');

    expect(shadowTokens).toContain('--shadow-color: #1d2129;');
    expect(shadowTokens).toContain('rgba(29, 33, 41, 0.06)');
    expect(shadowTokens).not.toContain('rgba(0, 0, 0');
  });

  it('keeps strong black shadows in explicit dark mode', () => {
    const dark = cssBlock("[data-theme='dark']");

    expect(dark).toContain('--shadow-color: #000000;');
    expect(dark).toContain('rgba(0, 0, 0, 0.5)');
  });
});

describe('home hero light field', () => {
  it('lets the art-directed hero inherit the active theme', () => {
    const hero = cssBlock('.entry-main__inner--home .home-hero');

    expect(hero).toContain('color-scheme: inherit;');
    expect(hero).toContain('background: var(--home-hero-background);');
    expect(hero).not.toContain('--text-strong:');
  });

  it('uses the theme-specific projection behind the homepage title', () => {
    const title = cssBlock('.entry-main__inner--home .home-hero__title');
    const light = cssBlock(':root');
    const dark = cssBlock("[data-theme='dark']");

    expect(title).toContain('text-shadow: var(--home-hero-title-shadow);');
    expect(light).toContain(
      '--home-hero-title-shadow: 0 2px 30px rgba(255, 255, 255, 0.82);',
    );
    expect(dark).toContain(
      '--home-hero-title-shadow: 0 2px 28px rgba(254, 82, 0, 0.42);',
    );
  });

  it('uses clean white occlusion bands over stronger light-mode orange illumination', () => {
    const light = cssBlock(':root');
    const dark = cssBlock("[data-theme='dark']");

    expect(light).toContain('--home-hero-field-opacity: 0.92;');
    expect(light).toContain('--home-hero-grid-opacity: 0.26;');
    expect(light).toContain(
      '--home-hero-occlusion-strong: rgba(255, 255, 255, 0.72);',
    );
    expect(dark).toContain('--home-hero-occlusion-strong: rgba(0, 0, 0, 0.27);');
  });

  it('uses Hermes Orange 6 with white foregrounds on brand-filled controls', () => {
    const light = cssBlock(':root');
    const dark = cssBlock("[data-theme='dark']");

    expect(light).toContain('--accent: #fe5200;');
    expect(light).toContain('--accent-contrast: #ffffff;');
    expect(dark).toContain('--accent-contrast: #ffffff;');
    expect(light).toContain('--bg-app: #ffffff;');
    expect(light).toContain('--text-muted: #4e5969;');
    expect(light).toContain('--border: #c9cdd4;');
  });
});
