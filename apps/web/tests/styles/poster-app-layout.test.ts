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
  it('uses a light canvas with black selected controls', () => {
    const root = rule(':root');
    const selected = rule('.poster-app__segmented button.is-active');

    expect(root).toContain('color-scheme: light;');
    expect(root).toContain('--poster-bg: #f7f7f5;');
    expect(root).toContain('--poster-panel: #ffffff;');
    expect(selected).toContain('background: #111111;');
    expect(selected).toContain('color: #ffffff;');
  });

  it('lets each card own its aspect ratio without cropping the image', () => {
    const poster = rule('.poster-app__poster');
    const square = rule('.poster-app__poster.is-square');
    const portrait = rule('.poster-app__poster.is-portrait');
    const image = rules('.poster-app__poster img');

    expect(poster).toContain('aspect-ratio: 16 / 9;');
    expect(square).toContain('aspect-ratio: 1;');
    expect(portrait).toContain('aspect-ratio: 3 / 4;');
    expect(image).toContain('object-fit: contain;');
    expect(image).not.toContain('aspect-ratio: 16 / 9;');
  });

  it('fits the preview image inside the full stage without changing its ratio', () => {
    const picture = rule('.poster-preview__stage picture');
    const image = rule('.poster-preview__stage img');

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
    const footerButton = rule('.poster-preview__footer button');

    expect(headerButton).toContain('width: 48px;');
    expect(headerButton).toContain('height: 48px;');
    expect(headerButton).toContain('border-radius: 999px;');
    expect(footerButton).toContain('width: 52px;');
    expect(footerButton).toContain('height: 52px;');
    expect(footerButton).toContain('border-radius: 999px;');
  });
});
