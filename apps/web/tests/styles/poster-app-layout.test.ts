import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NIKI_POSTER_COLOR_VALUES,
  NIKI_POSTER_COLOR_VARIABLES,
} from '../../src/poster/color-tokens';

const css = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
  'utf8',
);
const controlsCss = readFileSync(
  new URL('../../src/styles/ui-controls.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function rules(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1])
    .join('\n');
}

function mediaRules(query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  if (start === -1) return '';

  return css.slice(start);
}

function controlRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return controlsCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function controlMediaRules(query: string): string {
  const start = controlsCss.indexOf(`@media ${query} {`);
  if (start === -1) return '';

  return controlsCss.slice(start);
}

describe('poster app image layout', () => {
  it('uses two mobile filter columns and keeps the generate action full width', () => {
    const mobile = controlMediaRules('(max-width: 760px)');
    const tablet = controlMediaRules('(max-width: 1100px)');

    expect(mobile).toMatch(
      /\.od-generation-toolbar\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(mobile).toMatch(
      /\.od-generation-toolbar > \.od-button:last-child\s*{[^}]*grid-column:\s*1 \/ -1;/s,
    );
    expect(tablet).toMatch(
      /\.od-generation-toolbar > \.od-button:last-child\s*{[^}]*grid-column:\s*1 \/ -1;/s,
    );
  });

  it('uses a stable sticky top navigation without repeated page-title blocks', () => {
    const app = rule('.poster-app');
    const topbar = rule('.poster-app__topbar');
    const topbarInner = rule('.poster-app__topbar-inner');
    const navigation = rule('.poster-app__primary-nav');
    const content = rule('.poster-app__content');

    expect(topbar).toContain('position: sticky;');
    expect(topbar).toContain('top: 0;');
    expect(app).toContain('--poster-shell-width: 1040px;');
    expect(topbarInner).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
    expect(topbarInner).toContain('width: min(100%, var(--poster-shell-width));');
    expect(navigation).toContain('display: grid;');
    expect(navigation).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(navigation).toContain('width: 100%;');
    expect(content).toContain('width: min(100%, var(--poster-shell-width));');
    expect(css).not.toMatch(/\.poster-app\.is-(?:documents|english) \.poster-app__content\s*{/);
    expect(css).not.toContain('.poster-app__page-header');
    expect(css).not.toContain('.poster-app__eyebrow');
  });

  it('uses a compact shared type scale for the remaining large interface copy', () => {
    const app = rule('.poster-app');
    const documentHero = rule('.document-search__hero h2');
    const documentProjectTitle = rule('.document-project > header h2');
    const lessonTitle = rules('.english-lesson__intro h2');
    const wordTitle = rule('.english-word-sheet__word-row strong');
    const ieltsHero = rule('.ielts-coach__header h2');

    expect(app).toContain('--poster-type-display: clamp(28px, 3.4vw, 36px);');
    expect(app).toContain('--poster-type-title: clamp(24px, 2.7vw, 30px);');
    expect(app).toContain('--poster-type-feature: clamp(21px, 2.3vw, 26px);');
    expect(documentHero).toContain('font-size: var(--poster-type-display);');
    expect(documentProjectTitle).toContain('font-size: var(--poster-type-title);');
    expect(lessonTitle).toContain('font-size: var(--poster-type-feature);');
    expect(wordTitle).toContain('font-size: var(--poster-type-title);');
    expect(ieltsHero).toContain('font-size: var(--poster-type-feature);');
  });

  it('uses standard tabs and transparent compact headers on the voice page', () => {
    const tabs = rule('.english-practice__mode-switch');
    const tab = rule('.english-practice__mode-switch button');
    const activeMarker = rule('.english-practice__mode-switch button::after');
    const scenarioHeader = rule('.english-practice__hero');
    const ieltsHeader = rule('.ielts-coach__header');
    const mobile = mediaRules('(max-width: 760px)');

    expect(tabs).toContain('border-bottom: 1px solid var(--poster-line-divide);');
    expect(tabs).not.toContain('background:');
    expect(tab).toContain('background: transparent;');
    expect(activeMarker).toContain('background: var(--poster-accent);');
    expect(scenarioHeader).not.toContain('background:');
    expect(scenarioHeader).not.toContain('border-radius:');
    expect(ieltsHeader).not.toContain('background:');
    expect(ieltsHeader).not.toContain('border-radius:');
    expect(mobile).toMatch(
      /\.english-practice__mode-switch\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
  });

  it('distributes mobile navigation across five equal content-width tabs', () => {
    const mobile = mediaRules('(max-width: 760px)');

    expect(mobile).toMatch(
      /\.poster-app__topbar-inner\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s,
    );
    expect(mobile).toMatch(
      /\.poster-app__primary-nav\s*{[^}]*grid-row:\s*2;[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*100%;/s,
    );
    expect(mobile).not.toMatch(/\.poster-app__primary-nav\s*{[^}]*overflow-x:\s*auto;/s);
    expect(mobile).toMatch(
      /\.poster-app__primary-nav > button,\s*\.poster-app__primary-nav > a\s*{[^}]*width:\s*100%;[^}]*min-height:\s*48px;/s,
    );
    expect(mobile).toMatch(
      /\.poster-app__primary-nav > button::after,\s*\.poster-app__primary-nav > a::after\s*{[^}]*right:\s*6px;[^}]*left:\s*6px;/s,
    );
    expect(mobile).toMatch(
      /\.poster-app__topbar-actions\s*{[^}]*grid-row:\s*1;[^}]*grid-column:\s*2;/s,
    );
  });

  it('uses the standardized fill system with custom select controls', () => {
    const root = rule(':root');
    const select = controlRule('.od-control-select__trigger');

    expect(root).toContain('color-scheme: light;');
    expect(root).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-0']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill0,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-1']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill1,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-3']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill3,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-4']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill4,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-7']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill7,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-bg']).toBe(
      'var(--poster-fill-0)',
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-panel-muted']).toBe(
      'var(--poster-fill-1)',
    );
    expect(select).toContain('background: var(--od-control-fill);');
    expect(select).toContain('color: var(--od-control-text);');
    expect(select).toContain('border: 0;');
  });

  it('uses borderless fill layers for the generator and account controls', () => {
    const app = rule('.poster-app');
    const generator = controlRule('.od-generation-toolbar');
    const select = controlRule('.od-control-select__trigger');
    const account = rule('.poster-app__account');
    const accountMenu = rule('.poster-app__account-menu');

    expect(app).toContain('background: var(--poster-fill-0);');
    expect(generator).toContain('border: 0;');
    expect(generator).toContain('border-radius: 16px;');
    expect(generator).toContain('background: var(--poster-panel-muted, var(--bg-subtle));');
    expect(select).toContain('border: 0;');
    expect(select).toContain('border-radius: var(--od-control-radius);');
    expect(select).toContain('background: var(--od-control-fill);');
    expect(account).toContain('border: 0;');
    expect(account).toContain('border-radius: 8px;');
    expect(account).toContain('background: var(--poster-fill-0);');
    expect(accountMenu).toContain('border: 0;');
    expect(accountMenu).toContain('background: var(--poster-fill-0);');
  });

  it('scopes translucent dark feedback to Niki while preserving shared toast defaults', () => {
    const status = controlRule('.od-toast');
    const posterStatus = rule('.poster-app .od-toast');

    expect(status).toContain('background: var(--od-control-fill);');
    expect(status).toContain('box-shadow: 0 12px 32px');
    expect(status).not.toContain('backdrop-filter:');
    expect(posterStatus).toContain('background: var(--poster-toast-bg);');
    expect(posterStatus).toContain('color: var(--poster-toast-text);');
    expect(posterStatus).toContain('-webkit-backdrop-filter: blur(2px);');
    expect(posterStatus).toContain('backdrop-filter: blur(2px);');
    expect(posterStatus).toContain('box-shadow: none;');
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-toast-bg'])
      .toBe('color-mix(in srgb, var(--poster-fill-7) 48%, transparent)');
    expect(controlRule('.od-toast.has-indicator .od-toast-message'))
      .toContain('grid-template-columns: 20px minmax(0, 1fr);');
    expect(controlRule('.od-toast-indicator.is-loading'))
      .toContain('animation: od-toast-spin 900ms linear infinite;');
    expect(controlMediaRules('(prefers-reduced-motion: reduce)'))
      .toMatch(/\.od-toast-indicator\.is-loading\s*{\s*animation: none;/);
    expect(rule('.poster-app .od-toast-dismiss:hover:not(:disabled)'))
      .toContain('color: var(--poster-toast-text);');
    expect(rule('.poster-app .od-toast-dismiss:focus-visible'))
      .toContain('outline: 2px solid var(--poster-toast-text);');
  });

  it('lets each card own its aspect ratio without cropping the image', () => {
    const poster = rule('.poster-app__poster');
    const posterAndSkeleton = rule('.poster-app__poster,\n.poster-app__poster-skeleton');
    const select = controlRule('.od-control-select__trigger');
    const square = rule('.poster-app__poster.is-square');
    const portrait = rule('.poster-app__poster.is-portrait');
    const image = rules('.poster-app__poster img');

    expect(poster).toContain('aspect-ratio: 16 / 9;');
    expect(poster).toContain('cursor: pointer;');
    expect(posterAndSkeleton).toContain('border: 0;');
    expect(posterAndSkeleton).toContain('border-radius: 0;');
    expect(select).toContain('border-radius: var(--od-control-radius);');
    expect(square).toContain('aspect-ratio: 1;');
    expect(portrait).toContain('aspect-ratio: 3 / 4;');
    expect(image).toContain('object-fit: contain;');
    expect(image).not.toContain('aspect-ratio: 16 / 9;');
  });

  it('adds token-based hover, pressed, and focus states to generated posters', () => {
    const overlay = rule('.poster-app__poster::before');
    const hover = rule('.poster-app__poster:hover::before');
    const pressed = rule('.poster-app__poster:active::before');
    const pressedPoster = rule('.poster-app__poster:active');
    const focus = rule('.poster-app__poster:focus-visible');

    expect(overlay).toContain('background: transparent;');
    expect(overlay).toContain('transition: background-color 140ms');
    expect(hover).toContain('background: color-mix(in srgb, var(--poster-fill-7) 12%, transparent);');
    expect(pressed).toContain('background: color-mix(in srgb, var(--poster-fill-7) 24%, transparent);');
    expect(pressed).toContain('transition-duration: 80ms;');
    expect(pressedPoster).toContain('transform: scale(0.99);');
    expect(pressedPoster).toContain('transition-duration: 80ms;');
    expect(focus).toContain('outline: 2px solid var(--poster-line-active);');
  });

  it('fits the preview image inside the full stage without changing its ratio', () => {
    const preview = rule('.poster-preview');
    const picture = rule('.poster-preview__stage picture');
    const image = rule('.poster-preview__stage img');

    expect(preview).toContain('background: color-mix(in srgb, var(--poster-fill-7) 80%, transparent);');
    expect(preview).toContain('backdrop-filter: blur(18px) saturate(1.15);');
    expect(preview).toContain('-webkit-backdrop-filter: blur(18px) saturate(1.15);');
    expect(picture).toContain('width: 100%;');
    expect(picture).toContain('height: 100%;');
    expect(image).toContain('width: auto;');
    expect(image).toContain('height: auto;');
    expect(image).toContain('min-width: 0;');
    expect(image).toContain('min-height: 0;');
    expect(image).toContain('max-width: 100%;');
    expect(image).toContain('max-height: 100%;');
    expect(image).toContain('object-fit: contain;');
  });

  it('uses aligned circular icon controls in the preview header and footer', () => {
    const headerButton = rule('.poster-preview__header button');
    const footer = rules('.poster-preview__footer');
    const footerButton = rule('.poster-preview__footer button');
    const controls = rule('.poster-preview__header button,\n.poster-preview__footer button');
    const hoverControls = rule('.poster-preview__header button:hover:not(:disabled),\n.poster-preview__footer button:hover:not(:disabled)');
    const pressedControls = rule('.poster-preview__header button:active:not(:disabled),\n.poster-preview__footer button:active:not(:disabled)');
    const focusedControls = rule('.poster-preview__header button:focus-visible,\n.poster-preview__footer button:focus-visible');

    expect(headerButton).toContain('width: 48px;');
    expect(headerButton).toContain('height: 48px;');
    expect(headerButton).toContain('border-radius: 999px;');
    expect(headerButton).toContain('border: 0;');
    expect(headerButton).toContain('background: color-mix(in srgb, var(--poster-fill-0) 64%, transparent);');
    expect(headerButton).toContain('color: var(--poster-fill-7);');
    expect(footer).toContain('border-top: 0;');
    expect(footer).toContain('background: transparent;');
    expect(footer).toContain('gap: 80px;');
    expect(footer).toContain('gap: 32px;');
    expect(footerButton).toContain('width: 52px;');
    expect(footerButton).toContain('height: 52px;');
    expect(footerButton).toContain('border-radius: 999px;');
    expect(footerButton).toContain('border: 0;');
    expect(footerButton).toContain('background: color-mix(in srgb, var(--poster-fill-0) 64%, transparent);');
    expect(footerButton).toContain('color: var(--poster-fill-7);');
    expect(controls).toContain('cursor: pointer;');
    expect(controls).toContain('background-color 140ms');
    expect(hoverControls).toContain('background: color-mix(in srgb, var(--poster-fill-0) 80%, transparent);');
    expect(pressedControls).toContain('background: var(--poster-fill-0);');
    expect(pressedControls).toContain('transform: scale(0.97);');
    expect(pressedControls).toContain('transition-duration: 80ms;');
    expect(focusedControls).toContain('outline: none;');
    expect(focusedControls).toContain('box-shadow: 0 0 0 3px color-mix(in srgb, var(--poster-fill-0) 48%, transparent);');
  });

  it('uses a two-column mobile result tab bar with a token-based active state', () => {
    const tabs = rule('.poster-app__result-tabs');
    const tab = rule('.poster-app__result-tabs > button');
    const active = rule('.poster-app__result-tabs > button.is-active');
    const activeIndicator = rule('.poster-app__result-tabs > button.is-active::after');
    const mobile = mediaRules('(max-width: 760px)');

    expect(tabs).toContain('display: flex;');
    expect(tab).toContain('color: var(--poster-muted);');
    expect(active).toContain('color: var(--poster-text);');
    expect(activeIndicator).toContain('opacity: 1;');
    expect(mobile).toMatch(
      /\.poster-app__result-tabs\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
  });

  it('opens large white poster menus below borderless triggers', () => {
    const triggerHover = controlRule('.od-control-select__trigger:hover:not(:disabled),\n.od-control-select__trigger[aria-expanded=\'true\']');
    const triggerFocus = controlRule('.od-control-select__trigger:focus-visible');
    const openTriggerFocus = controlRule('.od-control-select__trigger[aria-expanded=\'true\']:focus-visible');
    const menu = controlRule('.od-control-select__menu');
    const portalMenu = controlRule('.od-control-select__menu.portal');
    const option = controlRule('.od-control-select__menu .od-select-option');
    const optionHover = controlRule('.od-control-select__menu .od-select-option:hover:not(:disabled),\n.od-control-select__menu .od-select-option.active:not(:disabled)');

    expect(triggerHover).toContain('border: 0;');
    expect(triggerHover).toContain('outline: none;');
    expect(triggerHover).toContain('box-shadow: none;');
    expect(triggerFocus).toContain('outline: 2px solid var(--od-control-focus);');
    expect(openTriggerFocus).toContain('outline: none;');
    expect(menu).toContain('padding: 8px;');
    expect(menu).toContain('background: var(--od-control-fill);');
    expect(menu).toContain('color: var(--od-control-text);');
    expect(menu).toContain('z-index: 9000;');
    expect(portalMenu).toContain('position: fixed;');
    expect(option).toContain('min-height: 44px;');
    expect(option).toContain('display: grid;');
    expect(option).toContain('font-size: 14px;');
    expect(optionHover).toContain('background: var(--od-control-hover);');
    expect(optionHover).toContain('color: var(--od-control-text);');
  });

  it('keeps generation feedback compact and readable', () => {
    const status = controlRule('.od-toast');
    const posterStatus = rule('.poster-app .od-toast');
    const message = controlRule('.od-toast-message');

    expect(status).toContain('align-items: start;');
    expect(status).toContain('width: min(560px, calc(100% - 32px));');
    expect(posterStatus).toContain('align-items: center;');
    expect(message).toContain('font-weight: 700;');
  });
});
