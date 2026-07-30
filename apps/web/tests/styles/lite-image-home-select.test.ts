import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/home/lite-image-home.css', import.meta.url),
  'utf8',
);

describe('LiteImageHome mobile selects', () => {
  it('renders one compact chevron instead of repeating the global select image', () => {
    const selectRule =
      css.match(/\.lite-image-home__composer select\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(selectRule).toContain('background-repeat: no-repeat;');
    expect(selectRule).toContain('background-size: 10px 10px;');
    expect(selectRule).not.toContain('background: transparent;');
  });
});
