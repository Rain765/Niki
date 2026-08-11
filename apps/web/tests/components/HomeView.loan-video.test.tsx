// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeView } from '../../src/components/HomeView';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/plugins') return json({ plugins: [] });
    if (url === '/api/mcp/servers') return json({ servers: [], templates: [] });
    throw new Error(`unexpected fetch ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('HomeView loan video entry', () => {
  it('keeps the existing poster composer as the default mode', () => {
    renderHome();

    expect(screen.getByTestId('home-mode-poster').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('home-hero-auto-poster-controls')).toBeTruthy();
    expect(screen.queryByTestId('loan-video-composer')).toBeNull();
  });

  it('submits a video project without invoking the poster generation path', () => {
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    fireEvent.click(screen.getByTestId('home-mode-video'));
    expect(screen.queryByTestId('home-hero-auto-poster-controls')).toBeNull();

    fireEvent.change(screen.getByTestId('loan-video-title'), {
      target: { value: 'How to apply' },
    });
    for (let index = 1; index <= 3; index += 1) {
      fireEvent.change(screen.getByTestId(`loan-video-caption-${index}`), {
        target: { value: `Action ${index}` },
      });
      fireEvent.change(screen.getByTestId(`loan-video-screenshot-${index}`), {
        target: {
          files: [new File([`screen-${index}`], `screen-${index}.png`, { type: 'image/png' })],
        },
      });
    }
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      projectName: 'ZamLoan · How to apply',
      pluginId: 'od-media-generation',
      skillId: 'hyperframes',
      projectKind: 'video',
      projectMetadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
        videoAspect: '9:16',
        videoLength: 30,
        skipDiscoveryBrief: true,
      },
    });
    expect(onSubmit.mock.calls[0]?.[0].attachments).toHaveLength(3);
    expect(onSubmit.mock.calls[0]?.[0].prompt).toContain('Storyboard JSON:');
  });
});

function renderHome(
  overrides: Partial<React.ComponentProps<typeof HomeView>> = {},
) {
  return render(
    <HomeView
      projects={[]}
      onSubmit={() => undefined}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
      promptTemplates={[]}
      {...overrides}
    />,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
