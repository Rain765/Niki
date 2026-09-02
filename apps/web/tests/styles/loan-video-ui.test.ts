import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NIKI_POSTER_COLOR_VARIABLES } from '../../src/poster/color-tokens';

const componentCss = readFileSync(
  new URL('../../src/styles/home/loan-video.css', import.meta.url),
  'utf8',
);
const posterCss = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
  'utf8',
);
const controlsCss = readFileSync(
  new URL('../../src/styles/ui-controls.css', import.meta.url),
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
  it('styles the video listbox trigger and keeps its white portal menu in the viewport', () => {
    const select = rule(componentCss, '.loan-video-select');
    const trigger = rule(componentCss, '.loan-video-select__trigger');
    const menu = rule(componentCss, '.loan-video-select__menu');
    const portalMenu = [
      menu,
      rule(componentCss, '.loan-video-select__menu.portal'),
    ].join('\n');
    const option = rule(componentCss, '.loan-video-select__menu .od-select-option');

    expect.soft(select).toContain('width: 100%;');
    expect.soft(trigger).toContain('width: 100%;');
    expect.soft(trigger).toContain('display: grid;');
    expect.soft(trigger).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect.soft(trigger).toContain('align-items: center;');
    expect(trigger).toContain('padding: 9px 14px 9px 11px;');
    expect(trigger).toContain('background: var(--bg-subtle);');
    expect.soft(portalMenu).toContain('position: fixed;');
    expect.soft(portalMenu).toMatch(/z-index:\s*\d+;/);
    expect(menu).toContain('max-width: calc(100vw - 24px);');
    expect(menu).toContain('background: var(--poster-fill-0, var(--bg-panel));');
    expect.soft(option).toContain('width: 100%;');
  });

  it('keeps homepage controls flat while preserving focus and a portal-safe menu shadow', () => {
    const globalComponentCss = componentCss.slice(0, componentCss.indexOf('@media'));
    const globalPosterCss = posterCss.slice(0, posterCss.indexOf('@media'));
    const flatHomepageControls = rule(
      globalPosterCss,
      '.poster-app__video .loan-video-composer__settings .loan-video-field input:focus,\n'
        + '.poster-app__video .loan-video-composer__settings .loan-video-select__trigger:focus,\n'
        + ".poster-app__video .loan-video-composer__settings .loan-video-select__trigger[aria-expanded='true']",
    );
    const visibleHomepageFocus = rule(
      globalPosterCss,
      '.poster-app__video .loan-video-composer__settings .loan-video-field input:focus-visible,\n'
        + '.poster-app__video .loan-video-composer__settings .loan-video-select__trigger:focus-visible',
    );
    const menu = rule(globalComponentCss, '.loan-video-select__menu');

    expect(flatHomepageControls).toContain('box-shadow: none;');
    expect.soft(visibleHomepageFocus).toContain('outline: 2px solid var(--accent);');
    expect.soft(visibleHomepageFocus).toContain('outline-offset: 2px;');
    expect(visibleHomepageFocus).toContain('box-shadow: none;');
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-mask-dark']).toBeDefined();
    expect(menu).toContain(
      'box-shadow: 0 16px 40px color-mix(in srgb, var(--poster-mask-dark) 15%, transparent);',
    );
    expect(menu).not.toContain('var(--text-strong)');
  });

  it('puts the title above five equal-width video filters', () => {
    const desktopCss = componentCss.slice(0, componentCss.indexOf('@media'));
    const settings = rule(desktopCss, '.loan-video-composer__settings');
    const title = rule(desktopCss, '.loan-video-field--wide');

    expect.soft(settings).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect.soft(title).toContain('grid-column: 1 / -1;');
  });

  it('lets the video composer fill its page content area', () => {
    const video = rule(posterCss, '.poster-app__video');
    const videoHero = rule(posterCss, '.poster-app__video .loan-video-hero');

    expect.soft(video).toContain('width: 100%;');
    expect.soft(videoHero).toContain('width: 100%;');
  });

  it('keeps the three quick selects and generate action in one desktop toolbar', () => {
    const toolbar = rule(componentCss, '.loan-video-quick');
    const sharedToolbar = rule(controlsCss, '.od-generation-toolbar');
    const generate = rule(componentCss, '.loan-video-quick__generate');

    expect.soft(toolbar).toContain('grid-template-columns:');
    expect.soft(toolbar).toContain('minmax(210px, 1.15fr)');
    expect.soft(sharedToolbar).toContain('align-items: end;');
    expect.soft(generate).toContain('min-width: 0;');
    expect(componentCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.loan-video-quick\s*{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
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
    expect(screenshot).toContain(
      'aspect-ratio: var(--loan-video-screenshot-aspect, 9 / 16);',
    );
    expect(screenshot).toContain('width: 100%;');
    expect(screenshot).toContain('justify-self: stretch;');
    expect(screenshot).not.toContain('width: min(240px, 100%);');
    expect(media).toContain('position: absolute;');
    expect(media).toContain('inset: 0;');
    expect(media).toContain('aspect-ratio: auto;');
    expect(tapHint).toContain('position: absolute;');
    expect(tapHint).toContain('pointer-events: none;');
  });

  it('uses the natural uploaded ratio on mobile while keeping a bounded empty state', () => {
    const screenshot = rules(componentCss, '.loan-video-screenshot');

    expect(screenshot).toContain(
      'aspect-ratio: var(--loan-video-screenshot-aspect, 9 / 16);',
    );
    expect(screenshot).toContain('max-height: min(72vh, 680px);');
    expect(screenshot).toContain('width: 100%;');
    expect(
      rule(componentCss, ".loan-video-screenshot[data-image-orientation='landscape']"),
    ).toContain('max-height: none;');
  });

  it('styles independent copy switches and a compact next-step control', () => {
    const delivery = rule(componentCss, '.loan-video-step__delivery');
    const toggle = rule(componentCss, '.loan-video-step__toggle');
    const transition = rule(componentCss, '.loan-video-step__transition');
    const options = rule(componentCss, '.loan-video-step__advance-options');
    const inactivePicker = rule(
      componentCss,
      ".loan-video-tap-picker[aria-disabled='true']",
    );

    expect(delivery).toContain('flex-wrap: wrap;');
    expect(toggle).toContain('background: var(--bg-subtle);');
    expect(transition).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(options).toContain('display: inline-flex;');
    expect(inactivePicker).toContain('cursor: default;');
  });

  it('keeps transition previews compact, canvas-safe, and motion-accessible', () => {
    const preview = rule(componentCss, '.loan-video-transition-preview');
    const toggle = rule(componentCss, '.loan-video-transition-preview__toggle');
    const stage = rule(componentCss, '.loan-video-transition-preview__stage');
    const canvasImage = rule(componentCss, '.loan-video-transition-preview__canvas img');
    const caption = rule(componentCss, '.loan-video-transition-preview__caption');
    const reducedMotion = rule(
      componentCss,
      '.loan-video-transition-preview__stage.is-reduced-motion .loan-video-transition-preview__canvas.is-next',
    );

    expect(preview).toContain('grid-column: 1 / -1;');
    expect(toggle).toContain('justify-self: end;');
    expect(stage).toContain('aspect-ratio: 16 / 10;');
    expect(canvasImage).toContain('object-fit: contain;');
    expect(caption).toContain('bottom: 10px;');
    expect(caption).toContain('white-space: nowrap;');
    expect(caption).toContain('text-overflow: ellipsis;');
    expect(reducedMotion).toContain('opacity: 1;');
    expect(componentCss).toContain('@media (prefers-reduced-motion: reduce)');
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
    const footer = rule(componentCss, '.loan-video-drawer__footer');

    expect(root).toContain('position: fixed;');
    expect(root).toContain('visibility: hidden;');
    expect(root).toContain('pointer-events: none;');
    expect(openRoot).toContain('visibility: visible;');
    expect(openRoot).toContain('pointer-events: auto;');
    expect(backdrop).toContain('opacity: 0;');
    expect(drawer).toContain('width: min(620px, calc(100vw - 32px));');
    expect(drawer).toContain('grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(drawer).toContain('transform: translateX(100%);');
    expect(openDrawer).toContain('transform: translateX(0);');
    expect(header).toContain('grid-template-columns: 40px minmax(0, 1fr) auto;');
    expect(body).toContain('overflow: auto;');
    expect(body).toContain('overscroll-behavior: contain;');
    expect(footer).toContain('border-top: 1px solid var(--border-soft);');
    expect(footer).toContain('env(safe-area-inset-bottom)');
  });

  it('promotes the drawer to a safe-area-aware full-screen sheet on mobile', () => {
    const drawer = rules(componentCss, '.loan-video-drawer');
    const openDrawer = rules(componentCss, '.loan-video-drawer-root.is-open .loan-video-drawer');
    const header = rules(componentCss, '.loan-video-drawer__header');
    const body = rules(componentCss, '.loan-video-drawer__body');
    const footer = rules(componentCss, '.loan-video-drawer__footer');
    const manage = rules(componentCss, '.loan-video-steps__manage');

    expect(drawer).toContain('width: 100%;');
    expect(drawer).toContain('transform: translateY(100%);');
    expect(openDrawer).toContain('transform: translateY(0);');
    expect(header).toContain('env(safe-area-inset-left)');
    expect(header).toContain('env(safe-area-inset-right)');
    expect(body).toContain('padding:');
    expect(footer).toContain('env(safe-area-inset-bottom)');
    expect(manage).toContain('width: 100%;');
  });

  it('reuses the poster shimmer with every video aspect ratio and in-image status copy', () => {
    const loading = rule(posterCss, '.poster-app__video-loading');
    const loadingCopy = rule(posterCss, '.poster-app__video-loading-copy');
    const mobilePortrait = rule(posterCss, '.poster-app__poster-skeleton.is-mobile-portrait');
    const landscape = rule(posterCss, '.poster-app__poster-skeleton.is-landscape');

    expect(loading).toContain('width: min(100%, 720px);');
    expect(loadingCopy).toContain('display: grid;');
    expect(mobilePortrait).toContain('aspect-ratio: 9 / 16;');
    expect(landscape).toContain('aspect-ratio: 16 / 9;');
  });
});
