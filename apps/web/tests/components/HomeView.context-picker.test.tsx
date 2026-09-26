// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  type InstalledPluginRecord,
  type SkillSummary,
} from '@open-design/contracts';
import { HomeView } from '../../src/components/HomeView';

const SKILL: SkillSummary = {
  id: 'prototype-lab',
  name: 'Prototype Lab',
  description: 'Create a focused prototype.',
  triggers: ['prototype', 'flow'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Design a focused onboarding prototype.',
  aggregatesExamples: false,
};

function makePlugin(id: string, title: string): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind: 'bundled',
    source: `/tmp/${id}`,
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '1.0.0',
      description: `${title} fixture`,
      tags: ['fixture'],
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: {
          query: `Hydrated query from ${title}`,
        },
      },
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeView context picker', () => {
  it('does not request plugin or MCP registries before extensions are loaded', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const onLoadExtensions = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        extensionsRequested={false}
        onLoadExtensions={onLoadExtensions}
      />,
    );

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('plugins-home-section')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-send-menu'));
    fireEvent.click(screen.getByTestId('home-hero-load-extensions'));
    expect(onLoadExtensions).toHaveBeenCalledTimes(1);
  });

  it('creates a branded image project with the selected count and aspect ratio without typed input', async () => {
    const mediaPlugin = makePlugin('od-media-generation', 'Media Generation');
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const value = String(url);
      if (value === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [mediaPlugin] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value === '/brand/zambia-support/z-reference.png') {
        return new Response(new Blob(['z-reference'], { type: 'image/png' }), { status: 200 });
      }
      if (value === '/api/projects') {
        return new Response(JSON.stringify({
          project: { id: 'direct-poster-project', name: 'Zamloan Loan Posters' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value === '/api/projects/direct-poster-project/upload?visibility=internal') {
        return new Response(JSON.stringify({
          files: [{ path: '.od-inputs/loan-poster-z-reference.png' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value === '/api/projects/direct-poster-project/media/generate') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          surface: 'image',
          model: 'gpt-image-2',
          quality: 'low',
          aspect: '1:1',
          image: '.od-inputs/loan-poster-z-reference.png',
        });
        return new Response(JSON.stringify({ task: { id: 'media-task' } }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value === '/api/projects/direct-poster-project' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          project: {
            id: 'direct-poster-project',
            name: 'Zamloan Loan Posters',
            ...body,
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'direct-poster-project' });
    const onSubmit = vi.fn();
    const onOpenProject = vi.fn();
    const onProjectCreated = vi.fn();

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={onOpenProject}
        onProjectCreated={onProjectCreated}
        onViewAllProjects={() => undefined}
      />,
    );

    const button = await screen.findByTestId('home-hero-auto-poster-generate');
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByTestId('home-hero-auto-poster-count'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('home-hero-auto-poster-size'), {
      target: { value: '1:1' },
    });
    fireEvent.change(screen.getByTestId('home-hero-auto-poster-brand'), {
      target: { value: 'biumoney' },
    });
    fireEvent.click(button);

    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'direct-poster-project' }),
    ));
    expect(onOpenProject).toHaveBeenCalledWith('direct-poster-project');
    expect(screen.getByTestId('home-auto-poster-status').textContent).toContain(
      'Zamloan Loan Posters',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    const mediaRequests = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/projects/direct-poster-project/media/generate',
    );
    expect(mediaRequests).toHaveLength(3);
  });

  it('stages pasted files on Home and submits them as first-turn context', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();
    const file = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    expect(screen.queryByTestId('home-hero-attach')).toBeNull();
    fireEvent.click(screen.getByTestId('home-hero-send-menu'));
    expect(screen.getByTestId('home-hero-attach')).toBeTruthy();
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => expect(screen.getByText('brief.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      attachments: [file],
    }));
  });

  it('adds multiple @ plugins as context without applying or hydrating their query', async () => {
    const plugins = [
      makePlugin('chart-plugin', 'Chart Plugin'),
      makePlugin('deck-plugin', 'Deck Plugin'),
    ];
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    fireEvent.change(input, { target: { value: 'Build @chart' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /chart plugin/i }));

    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toBe('Build @Chart Plugin');
      expect(screen.getByTestId('home-hero-context-plugin-chart-plugin')).toBeTruthy();
    });

    fireEvent.change(input, { target: { value: `${(input as HTMLTextAreaElement).value} @deck` } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /deck plugin/i }));

    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toBe('Build @Chart Plugin @Deck Plugin');
      expect(screen.getByTestId('home-hero-context-plugin-chart-plugin')).toBeTruthy();
      expect(screen.getByTestId('home-hero-context-plugin-deck-plugin')).toBeTruthy();
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
    expect((input as HTMLTextAreaElement).value).not.toContain('Hydrated query');

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Build @Chart Plugin @Deck Plugin',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      contextPlugins: [
        expect.objectContaining({ id: 'chart-plugin', title: 'Chart Plugin' }),
        expect.objectContaining({ id: 'deck-plugin', title: 'Deck Plugin' }),
      ],
    }));
  });

  it('binds a selected home skill to the created project payload', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        skills={[SKILL]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    fireEvent.change(input, { target: { value: '@proto' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /prototype lab/i }));

    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toBe('@Prototype Lab');
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '@Prototype Lab',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: SKILL.id,
      projectKind: 'prototype',
    }));
  });
});
