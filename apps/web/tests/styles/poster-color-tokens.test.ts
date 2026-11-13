import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NIKI_POSTER_COLOR_CSS,
  NIKI_POSTER_COLOR_VALUES,
  NIKI_POSTER_COLOR_VARIABLES,
} from '../../src/poster/color-tokens';

const governedSources = [
  '../../app/poster.css',
  '../../app/account-manager.css',
  '../../app/layout.tsx',
  '../../src/poster/PosterApp.tsx',
  '../../src/auth/PasswordAccountManager.tsx',
].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), 'utf8'),
}));

const concreteColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(/g;
const namedCssColorPattern = /:\s*(?:black|white)\b/gi;

describe('Niki poster color governance', () => {
  it('keeps concrete colors unique and centralized', () => {
    const concreteColors = Object.values(NIKI_POSTER_COLOR_VALUES);

    expect(new Set(concreteColors).size).toBe(concreteColors.length);
    expect('--poster-fill-2' in NIKI_POSTER_COLOR_VARIABLES).toBe(false);
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-fill-6']).toBe(
      NIKI_POSTER_COLOR_VALUES.fill6,
    );
    expect(NIKI_POSTER_COLOR_VARIABLES['--poster-panel-raised']).toBe(
      'var(--poster-fill-3)',
    );
  });

  it('serializes every governed variable into the critical token stylesheet', () => {
    for (const [name, value] of Object.entries(NIKI_POSTER_COLOR_VARIABLES)) {
      expect(NIKI_POSTER_COLOR_CSS).toContain(`${name}: ${value};`);
    }
  });

  it('rejects concrete colors outside the token source', () => {
    for (const { path, source } of governedSources) {
      expect(source.match(concreteColorPattern), path).toBeNull();
      expect(source.match(namedCssColorPattern), path).toBeNull();
    }
  });
});
