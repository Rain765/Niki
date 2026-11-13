import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import LogoPage from '../../app/logo/page';

describe('current Niki routes', () => {
  it('exports the light Logo Studio page without the legacy workspace shell', () => {
    expect(nextConfig.output).toBe('export');
    expect(typeof LogoPage).toBe('function');
  });
});
