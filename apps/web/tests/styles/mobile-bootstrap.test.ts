import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(
  new URL('../../src/index.css', import.meta.url),
  'utf8',
);
const rootLayout = readFileSync(
  new URL('../../app/layout.tsx', import.meta.url),
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

  it('ships a dark first-paint shell before external CSS and client JavaScript load', () => {
    expect(rootLayout).toContain("themeColor: '#08090b'");
    expect(rootLayout).toContain("id='niki-first-paint'");
    expect(rootLayout).toMatch(/:where\(html,\s*body\)\s*\{[^}]*background:\s*#08090b/s);
    expect(rootLayout).toMatch(
      /:where\(\.niki-auth,\s*\.poster-app\)\s*\{[^}]*min-height:\s*100dvh/s,
    );
  });

  it('does not load the full workspace styles on the poster-only root route', () => {
    expect(rootLayout).toContain("import './poster.css';");
    expect(rootLayout).not.toContain("../src/index.css");
    expect(rootLayout).not.toContain("../src/styles/home/index.css");
    expect(rootLayout).not.toContain("../src/styles/ndesign-system.css");
  });

  it('keeps the Feishu login action responsive while OAuth navigation starts', () => {
    expect(indexCss).toMatch(
      /\.niki-auth button:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.985\)/s,
    );
    expect(indexCss).toMatch(
      /\.niki-auth \.niki-auth__primary-button\.is-loading\s*\{[^}]*opacity:\s*1/s,
    );
    expect(indexCss).toMatch(
      /\.niki-auth__button-spinner\s*\{[^}]*animation:\s*locale-bootstrap-spin 700ms linear infinite/s,
    );
  });
});
