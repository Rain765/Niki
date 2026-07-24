import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const marker = '/* Workspaces use one continuous app canvas.';
const openBarsMarker = '/* Open structural bars keep their separators';

describe('workspace structural backgrounds', () => {
  it('keeps large workspace containers transparent without flattening navigation or controls', () => {
    const sectionStart = indexCss.lastIndexOf(marker);
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = indexCss.indexOf(openBarsMarker, sectionStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);

    const section = indexCss.slice(sectionStart, sectionEnd);
    expect(section).toContain('.app > .split,');
    expect(section).toContain('.app .split-chat-slot > .pane,');
    expect(section).toContain('.app .chat-log,');
    expect(section).toContain('.app .df-body {');
    expect(section).toContain('background: transparent;');

    expect(section).not.toContain('.app > .app-chrome-header');
    expect(section).not.toContain('.app .chat-header');
    expect(section).not.toContain('.app .ws-tabs-shell');
    expect(section).not.toContain('.app .composer');
  });

  it('matches open bars to their canvas while keeping their component structure', () => {
    const sectionStart = indexCss.lastIndexOf(openBarsMarker);
    expect(sectionStart).toBeGreaterThan(-1);

    const section = indexCss.slice(sectionStart);
    expect(section).toContain('.entry-main--scroll .tab-panel-toolbar {');
    expect(section).toContain('background: var(--bg);');
    expect(section).toContain('.app > .app-chrome-header,');
    expect(section).toContain('.app .chat-header,');
    expect(section).toContain('.app .composer,');
    expect(section).toContain('.app .ws-tabs-shell,');
    expect(section).toContain('.app .df-controls-row {');
    expect(section).toContain('background: var(--bg-app);');
    expect(section).not.toContain('background: var(--bg-panel);');
  });
});
