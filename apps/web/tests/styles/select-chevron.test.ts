import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/ndesign-system.css', import.meta.url),
  'utf8',
);

describe('native select chevron', () => {
  it('does not reset the global one-chevron background with a shorthand', () => {
    const controls =
      [...css.matchAll(/input,\s*textarea,\s*select\s*\{([^}]*)\}/g)]
        .map((match) => match[1] ?? '')
        .find((block) => block.includes('border-radius: var(--radius);')) ?? '';

    expect(controls).toContain('background-color: var(--bg-panel);');
    expect(controls).not.toContain('background: var(--bg-panel);');
  });
});
