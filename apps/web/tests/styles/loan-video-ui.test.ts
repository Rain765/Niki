import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentCss = readFileSync(
  new URL('../../src/styles/home/loan-video.css', import.meta.url),
  'utf8',
);
const posterCss = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
  'utf8',
);

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function rules(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1])
    .join('\n');
}

describe('loan video UI', () => {
  it('positions the custom select chevron away from the right edge', () => {
    const select = rule(componentCss, '.loan-video-field select');

    expect(select).toContain('appearance: none;');
    expect(select).toContain('padding-right: 40px;');
    expect(select).toContain('background-position: right 14px center;');
  });

  it('uses a dark step header above a borderless transparent body', () => {
    const step = rule(posterCss, '.poster-app__video .loan-video-step');
    const toolbar = rule(posterCss, '.poster-app__video .loan-video-step__toolbar');
    const body = rule(posterCss, '.poster-app__video .loan-video-step__body');
    const fields = rule(
      posterCss,
      '.poster-app__video .loan-video-step .loan-video-field input,\n'
        + '.poster-app__video .loan-video-step .loan-video-field select,\n'
        + '.poster-app__video .loan-video-step .loan-video-field textarea',
    );

    expect(step).toContain('background: transparent;');
    expect(toolbar).toContain('background: var(--poster-text-primary);');
    expect(toolbar).toContain('color: var(--poster-text-inverse);');
    expect(body).toContain('padding: 0;');
    expect(body).toContain('background: transparent;');
    expect(fields).toContain('background-color: var(--poster-panel-muted);');
  });

  it('keeps upload actions inside the image with hover, pressed, and focus states', () => {
    const empty = rule(componentCss, '.loan-video-screenshot__empty');
    const upload = rules(componentCss, '.loan-video-screenshot__upload');
    const hover = rule(componentCss, '.loan-video-screenshot__empty:hover');
    const pressed = rule(componentCss, '.loan-video-screenshot__upload:active');
    const focus = rule(
      componentCss,
      '.loan-video-screenshot__empty:focus-visible,\n.loan-video-screenshot__upload:focus-visible',
    );

    expect(empty).toContain('cursor: pointer;');
    expect(upload).toContain('position: absolute;');
    expect(upload).toContain('bottom: 10px;');
    expect(hover).toContain('background: color-mix(');
    expect(pressed).toContain('transform: scale(0.98);');
    expect(focus).toContain('outline: 2px solid var(--accent);');
  });

  it('aligns step content and upload surfaces without responsive dead space', () => {
    const step = rule(componentCss, '.loan-video-step');
    const body = rule(componentCss, '.loan-video-step__body');
    const screenshot = rules(componentCss, '.loan-video-screenshot');
    const media = rules(componentCss, '.loan-video-screenshot__media');
    const tapHint = rule(componentCss, '.loan-video-screenshot__tap-hint');

    expect(step).toContain('display: grid;');
    expect(step).toContain('row-gap: 12px;');
    expect(body).toContain('align-items: stretch;');
    expect(screenshot).toContain('position: relative;');
    expect(screenshot).toContain('min-height: 0;');
    expect(screenshot).toContain('height: 100%;');
    expect(screenshot).toContain('aspect-ratio: 9 / 16;');
    expect(screenshot).toContain('width: 100%;');
    expect(screenshot).toContain('justify-self: stretch;');
    expect(screenshot).not.toContain('width: min(240px, 100%);');
    expect(media).toContain('position: absolute;');
    expect(media).toContain('inset: 0;');
    expect(media).toContain('aspect-ratio: auto;');
    expect(tapHint).toContain('position: absolute;');
    expect(tapHint).toContain('pointer-events: none;');
  });

  it('replaces the inline add action with a compact upload and progress control', () => {
    const manage = rule(componentCss, '.loan-video-steps__manage');
    const count = rule(componentCss, '.loan-video-steps__count');

    expect(manage).toContain('flex: 0 0 auto;');
    expect(manage).toContain('min-height: 38px;');
    expect(count).toContain('border-radius: 999px;');
    expect(count).toContain('font-variant-numeric: tabular-nums;');
  });

  it('uses an animated, independently scrolling right drawer on desktop', () => {
    const root = rule(componentCss, '.loan-video-drawer-root');
    const openRoot = rule(componentCss, '.loan-video-drawer-root.is-open');
    const backdrop = rule(componentCss, '.loan-video-drawer__backdrop');
    const drawer = rules(componentCss, '.loan-video-drawer');
    const openDrawer = rules(componentCss, '.loan-video-drawer-root.is-open .loan-video-drawer');
    const header = rule(componentCss, '.loan-video-drawer__header');
    const body = rule(componentCss, '.loan-video-drawer__body');

    expect(root).toContain('position: fixed;');
    expect(root).toContain('visibility: hidden;');
    expect(root).toContain('pointer-events: none;');
    expect(openRoot).toContain('visibility: visible;');
    expect(openRoot).toContain('pointer-events: auto;');
    expect(backdrop).toContain('opacity: 0;');
    expect(drawer).toContain('width: min(620px, calc(100vw - 32px));');
    expect(drawer).toContain('transform: translateX(100%);');
    expect(openDrawer).toContain('transform: translateX(0);');
    expect(header).toContain('grid-template-columns: 40px minmax(0, 1fr) auto;');
    expect(body).toContain('overflow: auto;');
    expect(body).toContain('overscroll-behavior: contain;');
  });

  it('promotes the drawer to a safe-area-aware full-screen sheet on mobile', () => {
    const drawer = rules(componentCss, '.loan-video-drawer');
    const openDrawer = rules(componentCss, '.loan-video-drawer-root.is-open .loan-video-drawer');
    const header = rules(componentCss, '.loan-video-drawer__header');
    const body = rules(componentCss, '.loan-video-drawer__body');
    const manage = rules(componentCss, '.loan-video-steps__manage');

    expect(drawer).toContain('width: 100%;');
    expect(drawer).toContain('transform: translateY(100%);');
    expect(openDrawer).toContain('transform: translateY(0);');
    expect(header).toContain('env(safe-area-inset-left)');
    expect(header).toContain('env(safe-area-inset-right)');
    expect(body).toContain('env(safe-area-inset-bottom)');
    expect(manage).toContain('width: 100%;');
  });
});
