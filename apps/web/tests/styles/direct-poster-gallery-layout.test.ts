import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/index.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('direct poster gallery layout', () => {
  it('shrink-wraps the main image frame to the selected image ratio', () => {
    const frame = rule('.direct-poster-result-open');
    const image = rule('.direct-poster-result-open img');

    expect(frame).toContain('width: fit-content;');
    expect(frame).toContain('max-width: 100%;');
    expect(image).toContain('width: auto;');
    expect(image).toContain('max-width: 100%;');
    expect(image).toContain('height: auto;');
  });
});
