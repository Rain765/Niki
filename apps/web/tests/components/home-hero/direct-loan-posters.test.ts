// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { buildLoanPosterScenePromptsMock } = vi.hoisted(() => ({
  buildLoanPosterScenePromptsMock: vi.fn((_options?: unknown) => ['scene one', 'scene two']),
}));

vi.mock('../../../src/components/home-hero/zambia-posters', () => ({
  autoPosterBrandLabel: () => 'Zamloan',
  autoPosterUsesZReference: (brand: string) => brand === 'zamloan',
  buildLoanPosterScenePrompts: buildLoanPosterScenePromptsMock,
  buildLoanPosterScenePlans: (options: unknown) => (
    buildLoanPosterScenePromptsMock(options).map((prompt, index) => ({
      prompt,
      logoAnchor: index % 2 === 0 ? 'left' : 'right',
    }))
  ),
  LOAN_POSTER_SKILL_ID: 'loan-poster-skill-v1-1',
  loadZamloanLogo: async () => new File(['logo'], 'zamloan-logo.svg', {
    type: 'image/svg+xml',
  }),
  loadZambiaPosterReference: async () => new File(['reference'], 'reference.png', {
    type: 'image/png',
  }),
}));

import {
  DirectLoanPosterRequestError,
  isDirectLoanPosterAuthenticationError,
  resolveDirectLoanPosterProject,
  startDirectLoanPosterProject,
} from '../../../src/components/home-hero/direct-loan-posters';

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  buildLoanPosterScenePromptsMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('startDirectLoanPosterProject', () => {
  const project = {
    id: 'project-1',
    name: 'Zamloan 贷款海报',
    skillId: 'loan-poster-skill-v1-1',
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
  };

  it('restores the newest server project when this device has no local pointer', async () => {
    const olderProject = {
      ...project,
      id: 'older-project',
      updatedAt: 10,
      metadata: {
        kind: 'image' as const,
        directGeneration: { kind: 'loan-poster' as const },
      },
    };
    const newestProject = {
      ...olderProject,
      id: 'newest-project',
      updatedAt: 20,
    };
    window.localStorage.setItem(
      'niki:direct-loan-poster:last-project:user-1',
      'older-project',
    );
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/projects/older-project') {
        return new Response(JSON.stringify({ project: olderProject }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      expect(String(input)).toBe('/api/projects');
      return new Response(JSON.stringify({
        projects: [olderProject, newestProject],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await expect(resolveDirectLoanPosterProject('user-1')).resolves.toMatchObject({
      id: 'newest-project',
    });
    expect(window.localStorage.getItem(
      'niki:direct-loan-poster:last-project:user-1',
    )).toBe('newest-project');
  });

  it('reuses the newest server project for a scoped mobile session', async () => {
    buildLoanPosterScenePromptsMock.mockReturnValueOnce(['scene one']);
    const reusableProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 0,
          outputPrefix: 'biumoney-poster',
          outputPrefixes: ['biumoney-poster'],
          batchCount: 0,
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [reusableProject] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { metadata: unknown; updatedAt: number };
        return new Response(JSON.stringify({
          project: { ...reusableProject, metadata: body.metadata, updatedAt: body.updatedAt },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/media/generate') {
        return new Response(JSON.stringify({ task: { id: 'task-1' } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'biumoney',
      sessionScope: 'user-1',
    })).resolves.toEqual({ projectId: 'project-1' });

    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input) === '/api/projects' && init?.method === 'POST',
    )).toBe(false);
  });

  it('creates one project and dispatches low-quality image jobs without an agent run', async () => {
    const today = new Date();
    const compactDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify(
          init?.method === 'POST' ? { project } : { projects: [] },
        ), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        return new Response(JSON.stringify({ files: [{ path: '.od-inputs/reference.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/media/generate')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.quality).toBe('low');
        expect(body.model).toBe('gpt-image-2');
        expect(body.overlayLogo).toBe('.od-inputs/reference.png');
        expect(body.overlayLogoAnchor).toMatch(/^(left|right)$/);
        expect(body.output).toMatch(
          new RegExp(`^zamloan-poster-${compactDate}-00[12]\\.png$`),
        );
        return new Response(JSON.stringify({ task: { id: 'task-1' } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: unknown;
          updatedAt: number;
        };
        return new Response(JSON.stringify({
          project: {
            ...project,
            metadata: body.metadata,
            updatedAt: body.updatedAt,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    await expect(startDirectLoanPosterProject({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
    })).resolves.toEqual({ projectId: 'project-1' });

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain('/api/runs');
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/projects' && init?.method === 'POST',
    );
    const createBody = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>;
    expect(createBody).not.toHaveProperty('pendingPrompt');
    expect(createBody).not.toHaveProperty('pluginId');
    expect(createBody).not.toHaveProperty('pluginInputs');
    expect(createBody.metadata).toMatchObject({
      directGeneration: {
        kind: 'loan-poster',
        expectedOutputs: 0,
        outputPrefix: 'zamloan-poster',
        status: 'preparing',
        activeBatchId: 'project-1',
        batches: [{
          id: 'project-1',
          status: 'preparing',
          expectedOutputs: 2,
          outputNames: [],
          brand: 'zamloan',
          aspectRatio: '16:9',
        }],
      },
    });
    const queuedPatch = fetchMock.mock.calls
      .filter(([input, init]) => (
        String(input) === '/api/projects/project-1' && init?.method === 'PATCH'
      ))
      .map(([, init]) => JSON.parse(String(init?.body)) as {
        metadata: { directGeneration: { status?: string; batches?: unknown[] } };
      })
      .find((body) => body.metadata.directGeneration.status === 'queued');
    expect(queuedPatch?.metadata.directGeneration.batches).toEqual([
      expect.objectContaining({
        id: 'project-1',
        status: 'queued',
        expectedOutputs: 2,
        outputNames: [
          `zamloan-poster-${compactDate}-001.png`,
          `zamloan-poster-${compactDate}-002.png`,
        ],
      }),
    ]);
    expect(buildLoanPosterScenePromptsMock).toHaveBeenCalledWith(expect.objectContaining({
      variationSeed: 'project-1',
      variationOffset: 0,
    }));
    const mediaBodies = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith('/media/generate'))
      .map(([, init]) => JSON.parse(String(init?.body)) as { overlayLogoAnchor?: string });
    expect(mediaBodies.map((body) => body.overlayLogoAnchor)).toEqual(['left', 'right']);
  });

  it('does not upload or pass the Z reference for BiuMoney generation', async () => {
    buildLoanPosterScenePromptsMock.mockReturnValueOnce(['scene one']);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify(
          init?.method === 'POST' ? { project } : { projects: [] },
        ), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        throw new Error('BiuMoney must not upload the Z reference');
      }
      if (url.endsWith('/media/generate')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty('image');
        expect(body.output).toMatch(/^biumoney-poster-\d{8}-001\.png$/);
        return new Response(JSON.stringify({ task: { id: 'task-1' } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: unknown;
          updatedAt: number;
        };
        return new Response(JSON.stringify({
          project: {
            ...project,
            metadata: body.metadata,
            updatedAt: body.updatedAt,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    await expect(startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'biumoney',
    })).resolves.toEqual({ projectId: 'project-1' });
  });

  it('opens the project immediately after creation while media setup continues', async () => {
    buildLoanPosterScenePromptsMock.mockReturnValueOnce(['scene one']);
    let resolveUpload!: (response: Response) => void;
    const uploadGate = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const onProjectCreated = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify(
          init?.method === 'POST' ? { project } : { projects: [] },
        ), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        const uploadCalls = fetchMock.mock.calls.filter(([input]) => (
          String(input).includes('/upload?visibility=internal')
        ));
        if (uploadCalls.length === 1) return uploadGate;
        return new Response(JSON.stringify({ files: [{ path: '.od-inputs/logo.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/media/generate')) {
        return new Response(JSON.stringify({ taskId: 'task-1', status: 'running' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: unknown;
          updatedAt: number;
        };
        return new Response(JSON.stringify({
          project: {
            ...project,
            metadata: body.metadata,
            updatedAt: body.updatedAt,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    const generation = startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    }, onProjectCreated);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'project-1',
      metadata: expect.objectContaining({
        directGeneration: expect.objectContaining({
          status: 'preparing',
          expectedOutputs: 0,
        }),
      }),
    }));

    resolveUpload(new Response(JSON.stringify({
      files: [{ path: '.od-inputs/reference.png' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(generation).resolves.toEqual({ projectId: 'project-1' });
    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'project-1',
      metadata: expect.objectContaining({
        directGeneration: expect.objectContaining({
          status: 'queued',
          expectedOutputs: 1,
        }),
      }),
    }));
  });

  it('reuses todays direct-generation project until the user starts a new chat', async () => {
    let resolveFiles!: (response: Response) => void;
    const fileGate = new Promise<Response>((resolve) => {
      resolveFiles = resolve;
    });
    const onProjectCreated = vi.fn();
    const today = new Date();
    const dateKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const compactDate = dateKey.replaceAll('-', '');
    const reusableProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 1,
          outputPrefix: 'zamloan-poster',
          outputPrefixes: ['zamloan-poster'],
          sessionDate: dateKey,
          batchCount: 1,
        },
      },
    };
    const patchedProject = {
      ...reusableProject,
      updatedAt: 2,
      metadata: {
        ...reusableProject.metadata,
        directGeneration: {
          ...reusableProject.metadata.directGeneration,
          expectedOutputs: 3,
          batchCount: 2,
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [reusableProject] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files') {
        return fileGate;
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: {
            directGeneration: {
              expectedOutputs: number;
              batchCount: number;
              status: string;
            };
          };
        };
        const isPreparing = body.metadata.directGeneration.status === 'preparing';
        expect(body.metadata.directGeneration).toMatchObject(isPreparing ? {
          expectedOutputs: 1,
          batchCount: 1,
          status: 'preparing',
        } : {
          expectedOutputs: 3,
          batchCount: 2,
          status: 'queued',
        });
        return new Response(JSON.stringify({
          project: isPreparing
            ? {
              ...reusableProject,
              metadata: body.metadata,
              updatedAt: 2,
            }
            : patchedProject,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        return new Response(JSON.stringify({ files: [{ path: '.od-inputs/reference.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/media/generate')) {
        const body = JSON.parse(String(init?.body)) as { output: string };
        expect(body.output).toMatch(
          new RegExp(`^zamloan-poster-${compactDate}-00[23]\\.png$`),
        );
        return new Response(JSON.stringify({ task: { id: body.output } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const generation = startDirectLoanPosterProject({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
    }, onProjectCreated);

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(
        ([input]) => String(input) === '/api/projects/project-1/files',
      )).toBe(true);
    });
    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'project-1',
      metadata: expect.objectContaining({
        directGeneration: expect.objectContaining({
          status: 'preparing',
        }),
      }),
    }));

    resolveFiles(new Response(JSON.stringify({
      files: [{
        name: `zamloan-poster-${compactDate}-001.png`,
        kind: 'image',
        size: 100,
        mtime: 1,
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(generation).resolves.toEqual({ projectId: 'project-1' });

    expect(buildLoanPosterScenePromptsMock).toHaveBeenCalledWith(expect.objectContaining({
      variationSeed: 'project-1',
      variationOffset: 1,
    }));
    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input) === '/api/projects' && init?.method === 'POST',
    )).toBe(false);
    expect(window.localStorage.getItem('niki:direct-loan-poster:last-project')).toBe('project-1');
  });

  it('creates a fresh chat and continues generation when the reusable project cannot be updated', async () => {
    const today = new Date();
    const dateKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const reusableProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 1,
          outputPrefix: 'zamloan-poster',
          outputPrefixes: ['zamloan-poster'],
          sessionDate: dateKey,
          batchCount: 1,
        },
      },
    };
    const freshProject = {
      ...project,
      id: 'project-2',
      name: 'Zamloan 贷款海报',
      updatedAt: 2,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects' && init?.method !== 'POST') {
        return new Response(JSON.stringify({ projects: [reusableProject] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          error: 'project_not_writable',
          message: 'Project belongs to a previous account.',
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects' && init?.method === 'POST') {
        return new Response(JSON.stringify({ project: freshProject }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-2/upload?visibility=internal')) {
        return new Response(JSON.stringify({ files: [{ path: '.od-inputs/reference.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-2/media/generate') {
        return new Response(JSON.stringify({ task: { id: 'task-2' } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-2' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          project: {
            ...freshProject,
            metadata: {
              kind: 'image',
              directGeneration: {
                kind: 'loan-poster',
                status: 'queued',
                expectedOutputs: 1,
              },
            },
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-2' });

    await expect(startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    })).resolves.toEqual({ projectId: 'project-2' });

    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input) === '/api/projects' && init?.method === 'POST',
    )).toBe(true);
    expect(fetchMock.mock.calls.some(
      ([input, init]) => (
        String(input) === '/api/projects/project-2/media/generate'
        && init?.method === 'POST'
      ),
    )).toBe(true);
    expect(window.localStorage.getItem('niki:direct-loan-poster:last-project')).toBe('project-2');
    expect(buildLoanPosterScenePromptsMock).toHaveBeenCalledWith(expect.objectContaining({
      variationSeed: 'project-2',
      variationOffset: 0,
    }));
  });

  it('preserves the gateway authentication failure instead of hiding it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'authentication_required' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )));
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    const generation = startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    await expect(generation).rejects.toMatchObject({
      name: 'DirectLoanPosterRequestError',
      stage: 'create-project',
      status: 401,
      code: 'authentication_required',
    });
    await expect(generation).rejects.toSatisfy(
      (reason: unknown) => isDirectLoanPosterAuthenticationError(reason),
    );
  });

  it('retries a transient Z reference upload failure before starting generation', async () => {
    buildLoanPosterScenePromptsMock.mockReturnValueOnce(['scene one']);
    vi.useFakeTimers();
    let uploadCallCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify(
          init?.method === 'POST' ? { project } : { projects: [] },
        ), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        uploadCallCount += 1;
        if (uploadCallCount === 1) {
          return new Response('socket hang up', { status: 502 });
        }
        return new Response(JSON.stringify({
          files: [{
            path: uploadCallCount === 2
              ? '.od-inputs/reference.png'
              : '.od-inputs/logo.svg',
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: unknown;
          updatedAt: number;
        };
        return new Response(JSON.stringify({
          project: { ...project, metadata: body.metadata, updatedAt: body.updatedAt },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/media/generate')) {
        return new Response(JSON.stringify({ task: { id: 'task-1' } }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    const generation = startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '3:4',
      brand: 'zamloan',
    });
    await vi.runAllTimersAsync();

    await expect(generation).resolves.toEqual({ projectId: 'project-1' });
    expect(uploadCallCount).toBe(3);
    expect(fetchMock.mock.calls.filter(
      ([input]) => String(input).endsWith('/media/generate'),
    )).toHaveLength(1);
  });

  it('identifies a non-retryable Zamloan logo upload failure', async () => {
    buildLoanPosterScenePromptsMock.mockReturnValueOnce(['scene one']);
    let uploadCallCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify(
          init?.method === 'POST' ? { project } : { projects: [] },
        ), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/upload?visibility=internal')) {
        uploadCallCount += 1;
        if (uploadCallCount === 1) {
          return new Response(JSON.stringify({
            files: [{ path: '.od-inputs/reference.png' }],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          error: 'invalid_file',
          message: 'Logo file is invalid.',
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          metadata: unknown;
          updatedAt: number;
        };
        return new Response(JSON.stringify({
          project: { ...project, metadata: body.metadata, updatedAt: body.updatedAt },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    await expect(startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '3:4',
      brand: 'zamloan',
    })).rejects.toEqual(expect.objectContaining<Partial<DirectLoanPosterRequestError>>({
      stage: 'upload-logo',
      status: 422,
      code: 'invalid_file',
      message: '上传 Zamloan Logo 失败（HTTP 422）：Logo file is invalid.',
    }));
    expect(uploadCallCount).toBe(2);
  });

  it('includes the API response detail for non-authentication failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'invalid_project', message: 'Project payload is invalid.' }),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      },
    )));
    vi.stubGlobal('crypto', { randomUUID: () => 'project-1' });

    await expect(startDirectLoanPosterProject({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    })).rejects.toEqual(expect.objectContaining<Partial<DirectLoanPosterRequestError>>({
      status: 422,
      code: 'invalid_project',
      message: '创建海报项目失败（HTTP 422）：Project payload is invalid.',
    }));
  });
});
