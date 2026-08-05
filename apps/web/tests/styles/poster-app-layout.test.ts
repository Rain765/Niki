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
    expect(image).toContain('width: 100%;');
    expect(image).toContain('height: 100%;');
    expect(image).toContain('object-fit: contain;');
  });
});
