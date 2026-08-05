// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiteImageHome } from '../../src/components/LiteImageHome';

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  cleanup();
});

describe('LiteImageHome', () => {
  it('renders the one-click image controls without starting background catalog requests', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    render(<LiteImageHome />);

    expect(screen.getByRole('img', { name: 'Niki' }).getAttribute('src')).toBe('/logo.svg');
    expect(screen.getByRole('heading', { name: 'Generate loan posters in one click' })).toBeTruthy();
    expect(screen.getByText('Choose a quantity, size, and brand. Niki will create a project and start generating.')).toBeTruthy();
    expect(
      screen.queryByText('首页不会预载插件市场、技能库、模板或外部缩略图。'),
    ).toBeNull();
    expect((screen.getByTestId('lite-image-submit') as HTMLButtonElement).disabled).toBe(false);
    const countSelect = screen.getByTestId('lite-image-count') as HTMLSelectElement;
    expect(countSelect.disabled).toBe(false);
    expect(countSelect.value).toBe('1');
    expect([...countSelect.options].map((option) => option.text)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
    expect((screen.getByTestId('lite-image-aspect') as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByTestId('lite-image-brand') as HTMLSelectElement).disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets project creation persist the plugin snapshot before starting generation', async () => {
    const onProjectCreated = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/brand/zambia-support/z-reference.png') {
        return new Response(new Blob(['reference'], { type: 'image/png' }), { status: 200 });
      }
      if (url === '/api/projects') {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.pluginId).toBe('od-media-generation');
        expect(body.name).toBe('Zamloan Loan Posters');
        expect(body.pluginInputs).toMatchObject({
          mediaKind: 'image',
          model: 'gpt-image-2',
        });
        expect(body).not.toHaveProperty('appliedPluginSnapshotId');
        return json({
          project: { id: 'project-1' },
          conversationId: 'conversation-1',
          appliedPluginSnapshotId: 'snapshot-1',
        });
      }
      if (url === '/api/projects/project-1/upload?visibility=internal') {
        expect(init?.method).toBe('POST');
        return json({
          files: [{
            name: 'loan-poster-z-reference.png',
            originalName: 'loan-poster-z-reference.png',
            path: '.od-inputs/loan-poster-z-reference.png',
            size: 9,
          }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LiteImageHome onProjectCreated={onProjectCreated} />);
    fireEvent.click(screen.getByTestId('lite-image-submit'));

    await waitFor(() => {
      expect(onProjectCreated).toHaveBeenCalledWith('project-1');
    });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/brand/zambia-support/z-reference.png',
      '/api/projects',
      '/api/projects/project-1/upload?visibility=internal',
    ]);
    expect(window.sessionStorage.getItem('od:auto-send-first:project-1')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-attachments:project-1')).toContain(
      '.od-inputs/loan-poster-z-reference.png',
    );
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
