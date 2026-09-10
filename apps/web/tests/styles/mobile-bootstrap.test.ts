import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NIKI_POSTER_COLOR_CSS,
  NIKI_POSTER_THEME_COLOR,
} from '../../src/poster/color-tokens';

const indexCss = readFileSync(
  new URL('../../src/index.css', import.meta.url),
  'utf8',
);
const rootLayout = readFileSync(
  new URL('../../app/layout.tsx', import.meta.url),
  'utf8',
);
const posterCss = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
  'utf8',
);

describe('mobile bootstrap styles', () => {
  it('does not block first paint on an external font stylesheet', () => {
    expect(indexCss).not.toMatch(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i);
  });

  it('keeps a visible full-screen bootstrap surface while client code loads', () => {
    const bootstrapRule = indexCss.match(/\.locale-bootstrap\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(bootstrapRule).toContain('min-height: 100dvh;');
    expect(bootstrapRule).toContain('display: grid;');
    expect(bootstrapRule).toContain('place-items: center;');
    expect(bootstrapRule).toContain('background: var(--bg-app);');
  });

  it('ships a light first-paint shell before external CSS and client JavaScript load', () => {
    expect(NIKI_POSTER_THEME_COLOR).toBe('#ffffff');
    expect(rootLayout).toContain('themeColor: NIKI_POSTER_THEME_COLOR');
    expect(rootLayout).toContain("id='niki-color-tokens'");
    expect(rootLayout).toContain("id='niki-first-paint'");
    expect(NIKI_POSTER_COLOR_CSS).toContain('--poster-bg: var(--poster-fill-0);');
    expect(rootLayout).toMatch(
      /:where\(html,\s*body\)\s*\{[^}]*background:\s*var\(--poster-bg\)/s,
    );
    expect(rootLayout).toMatch(
      /:where\(\.niki-auth,\s*\.poster-app\)\s*\{[^}]*min-height:\s*100dvh/s,
    );
    expect(rootLayout).toMatch(
      /:where\(\.locale-bootstrap\)\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*display:\s*grid;[^}]*place-items:\s*center;/s,
    );
    expect(rootLayout).toMatch(
      /:where\(\.locale-bootstrap__spinner\)\s*\{[^}]*display:\s*inline-block;[^}]*animation:\s*niki-first-paint-spin 700ms linear infinite;/s,
    );
  });

  it('keeps the login card borderless across first paint and both style entrypoints', () => {
    expect(rootLayout).toMatch(
      /:where\(\.niki-auth__card\)\s*\{[^}]*border:\s*0;/s,
    );
    expect(posterCss).toMatch(/\.niki-auth__card\s*\{[^}]*border:\s*0;/s);
    expect(indexCss).toMatch(/\.niki-auth__card\s*\{[^}]*border:\s*0;/s);
  });

  it('does not load the full workspace styles on the poster-only root route', () => {
    expect(rootLayout).toContain("import './poster.css';");
    expect(rootLayout).not.toContain("../src/index.css");
    expect(rootLayout).not.toContain("../src/styles/home/index.css");
    expect(rootLayout).not.toContain("../src/styles/ndesign-system.css");
  });

  it('keeps the Feishu login action responsive while OAuth navigation starts', () => {
    expect(posterCss).toMatch(
      /\.niki-auth button:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.985\)/s,
    );
    expect(posterCss).toMatch(
      /\.niki-auth \.niki-auth__primary-button\.is-loading\s*\{[^}]*opacity:\s*1/s,
    );
    expect(posterCss).toMatch(
      /\.niki-auth__button-spinner\s*\{[^}]*animation:\s*poster-spin 700ms linear infinite/s,
    );
  });

  it('uses neutral color tokens for secondary login actions and password visibility', () => {
    expect(posterCss).toMatch(
      /\.niki-auth \.niki-auth__text-button:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--poster-control-hover\);[^}]*color:\s*var\(--poster-text-secondary\);/s,
    );
    expect(posterCss).toMatch(
      /\.niki-auth \.niki-auth__text-button:active:not\(:disabled\)\s*\{[^}]*background:\s*var\(--poster-control-pressed\);[^}]*color:\s*var\(--poster-text-secondary\);/s,
    );
    expect(posterCss).toMatch(
      /\.niki-auth \.niki-auth__password-visibility\s*\{[^}]*color:\s*var\(--poster-text-placeholder\);/s,
    );
    expect(indexCss).toMatch(
      /\.niki-auth \.niki-auth__text-button:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--bg-subtle\);[^}]*color:\s*var\(--text-muted\);/s,
    );
    expect(indexCss).toMatch(
      /\.niki-auth \.niki-auth__password-visibility\s*\{[^}]*color:\s*var\(--text-muted\);/s,
    );
  });
});
