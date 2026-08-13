import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentCss = readFileSync(
  new URL('../../src/styles/home/loan-video.css', import.meta.url),
  'utf8',
);
const posterCss = readFileSync(
  new URL('../../app/poster.css', import.meta.url),
  'utf8',
);

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function rules(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1])
    .join('\n');
}

describe('loan video UI', () => {
  it('positions the custom select chevron away from the right edge', () => {
    const select = rule(componentCss, '.loan-video-field select');

    expect(select).toContain('appearance: none;');
    expect(select).toContain('padding-right: 40px;');
    expect(select).toContain('background-position: right 14px center;');
  });

  it('uses a dark step header above a borderless transparent body', () => {
    const step = rule(posterCss, '.poster-app__video .loan-video-step');
    const toolbar = rule(posterCss, '.poster-app__video .loan-video-step__toolbar');
    const body = rule(posterCss, '.poster-app__video .loan-video-step__body');
    const fields = rule(
      posterCss,
      '.poster-app__video .loan-video-step .loan-video-field input,\n'
        + '.poster-app__video .loan-video-step .loan-video-field select,\n'
        + '.poster-app__video .loan-video-step .loan-video-field textarea',
    );

    expect(step).toContain('background: transparent;');
    expect(toolbar).toContain('background: var(--poster-text-primary);');
    expect(toolbar).toContain('color: var(--poster-text-inverse);');
    expect(body).toContain('padding: 0;');
    expect(body).toContain('background: transparent;');
    expect(fields).toContain('background-color: var(--poster-panel-muted);');
  });

  it('keeps upload actions inside the image with hover, pressed, and focus states', () => {
    const empty = rule(componentCss, '.loan-video-screenshot__empty');
    const upload = rules(componentCss, '.loan-video-screenshot__upload');
    const hover = rule(componentCss, '.loan-video-screenshot__empty:hover');
    const pressed = rule(componentCss, '.loan-video-screenshot__upload:active');
    const focus = rule(
      componentCss,
      '.loan-video-screenshot__empty:focus-visible,\n.loan-video-screenshot__upload:focus-visible',
    );

    expect(empty).toContain('cursor: pointer;');
    expect(upload).toContain('position: absolute;');
    expect(upload).toContain('bottom: 10px;');
    expect(hover).toContain('background: color-mix(');
    expect(pressed).toContain('transform: scale(0.98);');
    expect(focus).toContain('outline: 2px solid var(--accent);');
  });
});
