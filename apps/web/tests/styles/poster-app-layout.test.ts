import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
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

describe('poster app image layout', () => {
  it('uses the standardized fill system with dark selected controls', () => {
    const root = rule(':root');
    const selected = rule('.poster-app__segmented button.is-active');

    expect(root).toContain('color-scheme: light;');
    expect(root).toContain('--poster-fill-0: #ffffff;');
    expect(root).toContain('--poster-fill-1: #f7f8fa;');
    expect(root).toContain('--poster-fill-3: #f2f3f5;');
    expect(root).toContain('--poster-fill-4: #e5e6eb;');
    expect(root).toContain('--poster-fill-7: #1d2129;');
    expect(root).toContain('--poster-bg: var(--poster-fill-0);');
    expect(root).toContain('--poster-panel-muted: var(--poster-fill-1);');
    expect(selected).toContain('background: var(--poster-text-primary);');
    expect(selected).toContain('color: var(--poster-text-inverse);');
  });

  it('uses borderless fill layers for the generator and account controls', () => {
    const app = rule('.poster-app');
    const generator = rule('.poster-app__generator');
    const segmented = rule('.poster-app__segmented');
    const account = rule('.poster-app__account');
    const accountMenu = rule('.poster-app__account-menu');

    expect(app).toContain('background: var(--poster-fill-0);');
    expect(generator).toContain('border: 0;');
    expect(generator).toContain('border-radius: 16px;');
    expect(generator).toContain('background: var(--poster-panel-muted);');
    expect(segmented).toContain('border-radius: 12px;');
    expect(segmented).toContain('background: var(--poster-fill-0);');
    expect(account).toContain('border: 0;');
    expect(account).toContain('border-radius: 8px;');
    expect(account).toContain('background: var(--poster-fill-0);');
    expect(accountMenu).toContain('border: 0;');
    expect(accountMenu).toContain('background: var(--poster-fill-0);');
  });

  it('keeps the floating status readable without blurring the page title', () => {
    const status = rule('.poster-app__status');

    expect(status).toContain('background: color-mix(in srgb, var(--poster-fill-0) 68%, transparent);');
    expect(status).toContain('box-shadow: 0 12px 32px');
    expect(status).not.toContain('backdrop-filter:');
    expect(status).not.toContain('-webkit-backdrop-filter:');
  });

  it('lets each card own its aspect ratio without cropping the image', () => {
    const poster = rule('.poster-app__poster');
    const posterAndSkeleton = rule('.poster-app__poster,\n.poster-app__poster-skeleton');
    const segmentedButton = rule('.poster-app__segmented button');
    const square = rule('.poster-app__poster.is-square');
    const portrait = rule('.poster-app__poster.is-portrait');
    const image = rules('.poster-app__poster img');

    expect(poster).toContain('aspect-ratio: 16 / 9;');
    expect(poster).toContain('cursor: pointer;');
    expect(posterAndSkeleton).toContain('border: 0;');
    expect(posterAndSkeleton).toContain('border-radius: 0;');
    expect(segmentedButton).toContain('border-radius: 12px;');
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

  it('keeps poster history interaction lighter than filter controls', () => {
    const root = rule(':root');
    const historyHover = rule('.poster-app__history-toggle:hover');
    const historyPressed = rule('.poster-app__history-toggle:active');
    const filterHover = rule('.poster-app__segmented button:not(.is-active):hover');

    expect(root).toContain('--poster-history-hover: var(--poster-fill-2);');
    expect(root).toContain('--poster-history-pressed: var(--poster-fill-4);');
    expect(root).toContain('--poster-control-hover: var(--poster-fill-3);');
    expect(root).toContain('--poster-control-pressed: var(--poster-fill-4);');
    expect(historyHover).toContain('background: var(--poster-history-hover);');
    expect(historyPressed).toContain('background: var(--poster-history-pressed);');
    expect(filterHover).toContain('background: var(--poster-control-hover);');
  });
});
