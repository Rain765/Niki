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
    expect(
      screen.queryByText('首页不会预载插件市场、技能库、模板或外部缩略图。'),
    ).toBeNull();
    expect((screen.getByTestId('lite-image-submit') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('lite-image-count') as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByTestId('lite-image-aspect') as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByTestId('lite-image-brand') as HTMLSelectElement).disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets project creation persist the plugin snapshot before starting generation', async () => {
    const onProjectCreated = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/brand/zambia-support/zamloan-logo.svg') {
        return new Response(new Blob(['logo'], { type: 'image/svg+xml' }), {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        });
      }
      if (url === '/api/projects') {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.pluginId).toBe('od-media-generation');
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
            name: 'zamloan-logo.svg',
            originalName: 'zamloan-logo.svg',
            path: '.od-inputs/zamloan-logo.svg',
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
      '/brand/zambia-support/zamloan-logo.svg',
      '/api/projects',
      '/api/projects/project-1/upload?visibility=internal',
    ]);
    expect(window.sessionStorage.getItem('od:auto-send-first:project-1')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-attachments:project-1')).toContain(
      '.od-inputs/zamloan-logo.svg',
    );
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
