// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '../../src/components/Button';

afterEach(cleanup);

describe('Button', () => {
  it('applies the shared variant and size classes', () => {
    render(<Button variant="primary" size="compact">Generate</Button>);
    const button = screen.getByRole('button', { name: 'Generate' });
    expect(button.className).toContain('od-button--primary');
    expect(button.className).toContain('od-button--compact');
  });

  it('disables the control and exposes busy state while loading', () => {
    render(<Button loading>Generate</Button>);
    const button = screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.className).toContain('is-loading');
  });
});
