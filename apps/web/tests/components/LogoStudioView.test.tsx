// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LogoFinalization } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { LogoStudioView } from '../../src/components/LogoStudioView';

const {
  createProjectMock,
  listProjectsMock,
  fetchProjectFilesMock,
  listProjectMediaTasksMock,
  startProjectMediaTaskMock,
  waitForMediaTaskMock,
  fetchLogoFinalizationsMock,
  finalizeLogoDirectionMock,
} = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  listProjectsMock: vi.fn(),
  fetchProjectFilesMock: vi.fn(),
  listProjectMediaTasksMock: vi.fn(),
  startProjectMediaTaskMock: vi.fn(),
  waitForMediaTaskMock: vi.fn(),
  fetchLogoFinalizationsMock: vi.fn(),
  finalizeLogoDirectionMock: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createProject: createProjectMock,
  listProjects: listProjectsMock,
}));
vi.mock('../../src/providers/media', () => ({
  listProjectMediaTasks: listProjectMediaTasksMock,
  startProjectMediaTask: startProjectMediaTaskMock,
  waitForMediaTask: waitForMediaTaskMock,
}));
vi.mock('../../src/providers/registry', () => ({
  fetchProjectFiles: fetchProjectFilesMock,
  projectFileUrl: (_projectId: string, name: string) => `/files/${name}`,
}));
vi.mock('../../src/providers/logo', () => ({
  fetchLogoFinalizations: fetchLogoFinalizationsMock,
  finalizeLogoDirection: finalizeLogoDirectionMock,
}));

const taskOutputs = new Map<string, string>();

function generatedFiles() {
  return [...taskOutputs.values()].map((name, index) => ({
    name,
    size: 1_024 + index,
    mtime: index + 1,
    kind: 'image',
    mime: 'image/png',
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  taskOutputs.clear();
  listProjectsMock.mockResolvedValue([]);
  listProjectMediaTasksMock.mockResolvedValue({ tasks: [] });
  fetchLogoFinalizationsMock.mockResolvedValue({ finalizations: [] });
  startProjectMediaTaskMock.mockImplementation(async (_projectId, request) => {
    const taskId = `task-${taskOutputs.size + 1}`;
    taskOutputs.set(taskId, request.output);
    return { taskId, status: 'queued', startedAt: Date.now() };
  });
  waitForMediaTaskMock.mockImplementation(async (taskId) => ({
    taskId,
    status: 'done',
    startedAt: Date.now(),
    endedAt: Date.now(),
    progress: [],
    nextSince: 0,
    file: { name: taskOutputs.get(taskId) },
  }));
  fetchProjectFilesMock.mockImplementation(async () => generatedFiles());
  createProjectMock.mockResolvedValue({
    project: { id: 'logo-project-1' },
    conversationId: 'conversation-1',
    appliedPluginSnapshotId: 'snapshot-1',
  });
});

describe('LogoStudioView', () => {
  it('builds the brief and moves four generated files into history instead of the preview', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {
        brandName: 'Northstar',
        industry: 'Climate analytics',
        audience: '',
        personality: ['precise'],
        architecture: 'combination',
        palette: ['#FF5A1F'],
        applications: ['web'],
        avoid: [],
        notes: '',
      },
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageModel: 'gpt-image-2', imageAspect: '1:1', skipDiscoveryBrief: true },
        pluginId: 'od-media-generation',
        pluginInputs: { mediaKind: 'image', aspect: '1:1' },
      },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    const history = await screen.findByRole('region', { name: 'Generation history' });
    expect(fetchMock).toHaveBeenCalledWith('/api/logo/brief', expect.objectContaining({ method: 'POST' }));
    expect(createProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        pendingPrompt: 'Use $logo-generator',
        metadata: expect.objectContaining({ imageModel: 'gpt-image-2' }),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(startProjectMediaTaskMock).toHaveBeenCalledTimes(4);
    expect(startProjectMediaTaskMock).toHaveBeenCalledWith(
      'logo-project-1',
      expect.objectContaining({ surface: 'image', model: 'gpt-image-2', aspect: '1:1' }),
    );
    const mediaRequests = startProjectMediaTaskMock.mock.calls.map(([, request]) => request);
    expect(new Set(mediaRequests.map((request) => request.output)).size).toBe(4);
    expect(new Set(mediaRequests.map((request) => request.prompt)).size).toBe(4);
    expect(waitForMediaTaskMock).toHaveBeenCalledTimes(4);
    expect(within(history).getAllByRole('img', { name: /Northstar Logo direction/ })).toHaveLength(4);
    expect(screen.queryByTestId('logo-result-grid')).toBeNull();
    expect(screen.getByRole('img', { name: 'Northstar mark preview' })).toBeTruthy();
  });

  it('reports media generation failures instead of claiming completion', async () => {
    startProjectMediaTaskMock.mockRejectedValueOnce(new Error('Image provider is unavailable.'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {},
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageModel: 'gpt-image-2', imageAspect: '1:1', skipDiscoveryBrief: true },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Image provider is unavailable'));
    expect(screen.queryByText('Generation complete. Four images are ready.')).toBeNull();
    expect(screen.queryByTestId('logo-generation-skeleton')).toBeNull();
  });

  it('restores all persisted logo projects after a reload without relying on local storage', async () => {
    for (let index = 1; index <= 4; index += 1) {
      taskOutputs.set(`task-${index}`, `logo-direction-${String(index).padStart(2, '0')}.png`);
    }
    listProjectsMock.mockResolvedValue([{
      id: 'logo-project-1',
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      designSystemId: null,
      createdAt: 2,
      updatedAt: 2,
    }]);
    listProjectMediaTasksMock.mockResolvedValue({
      tasks: Array.from({ length: 4 }, (_, index) => ({
        taskId: `task-${index + 1}`,
        status: 'done',
        startedAt: index + 1,
        endedAt: index + 2,
        elapsed: 1,
        progress: [],
        progressCount: 0,
        nextSince: 0,
        surface: 'image',
        model: 'gpt-image-2',
      })),
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    const history = await screen.findByRole('region', { name: 'Generation history' });
    expect(within(history).getAllByRole('img', { name: /Northstar Logo direction/ })).toHaveLength(4);
    expect(screen.queryByTestId('logo-result-grid')).toBeNull();
    expect(startProjectMediaTaskMock).not.toHaveBeenCalled();
  });

  it('lists multiple persisted batches newest first', async () => {
    const projects = [
      {
        id: 'older-logo',
        name: 'Atlas Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        createdAt: 100,
        updatedAt: 100,
      },
      {
        id: 'newer-logo',
        name: 'AMIZ Logo actual generation',
        skillId: 'logo-generator',
        designSystemId: null,
        createdAt: 200,
        updatedAt: 200,
      },
      {
        id: 'not-a-logo',
        name: 'Poster project',
        skillId: 'loan-poster-generator',
        designSystemId: null,
        createdAt: 300,
        updatedAt: 300,
      },
    ];
    listProjectsMock.mockResolvedValue(projects);
    fetchProjectFilesMock.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      name: `logo-direction-${String(index + 1).padStart(2, '0')}.png`,
      size: 1_024 + index,
      mtime: index + 1,
      kind: 'image',
      mime: 'image/png',
    })));
    listProjectMediaTasksMock.mockResolvedValue({
      tasks: Array.from({ length: 4 }, (_, index) => ({
        taskId: `task-${index + 1}`,
        status: 'done',
        startedAt: index + 1,
        endedAt: index + 2,
        elapsed: 1,
        progress: [],
        progressCount: 0,
        nextSince: 0,
        surface: 'image',
        model: 'gpt-image-2',
      })),
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    const history = await screen.findByRole('region', { name: 'Generation history' });
    const batches = within(history).getAllByRole('article');
    expect(batches).toHaveLength(2);
    expect(batches[0]?.textContent).toContain('AMIZ Logo actual generation');
    expect(batches[1]?.textContent).toContain('Atlas Logo');
    expect(history.textContent).not.toContain('Poster project');
  });

  it('turns a selected history direction into a persisted downloadable brand kit', async () => {
    listProjectsMock.mockResolvedValue([{
      id: 'logo-project-1',
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      designSystemId: null,
      createdAt: 200,
      updatedAt: 200,
    }]);
    fetchProjectFilesMock.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      name: `logo-direction-${String(index + 1).padStart(2, '0')}.png`,
      size: 1_024 + index,
      mtime: index + 1,
      kind: 'image',
      mime: 'image/png',
    })));
    listProjectMediaTasksMock.mockResolvedValue({ tasks: [] });
    finalizeLogoDirectionMock.mockResolvedValue({
      id: 'final-123',
      projectId: 'logo-project-1',
      conversationId: 'conversation-123',
      direction: 2,
      sourceFile: 'logo-direction-02.png',
      outputRoot: 'logo/final/final-123',
      expectedOutputs: ['logo.svg'],
      outputFiles: ['logo/final/final-123/logo.svg'],
      status: 'complete',
      requestedAt: 300,
      notes: 'Keep the diagonal cut.',
      archiveUrl: '/api/projects/logo-project-1/archive?root=logo%2Ffinal%2Ffinal-123',
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    await screen.findByRole('region', { name: 'Generation history' });
    fireEvent.click(screen.getByRole('button', { name: 'Select Northstar Logo direction 2' }));
    fireEvent.change(screen.getByLabelText('Refinement notes'), {
      target: { value: 'Keep the diagonal cut.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refine and build brand kit' }));

    await waitFor(() => expect(finalizeLogoDirectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'logo-project-1',
        direction: 2,
        notes: 'Keep the diagonal cut.',
      }),
      expect.any(Object),
    ));
    const download = await screen.findByRole('link', { name: 'Download brand kit' });
    expect(download.getAttribute('href')).toContain('logo%2Ffinal%2Ffinal-123');
  });

  it('shows brand-kit skeletons immediately and fills them as refinement files arrive', async () => {
    listProjectsMock.mockResolvedValue([{
      id: 'logo-project-1',
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      designSystemId: null,
      createdAt: 200,
      updatedAt: 200,
    }]);
    fetchProjectFilesMock.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      name: `logo-direction-${String(index + 1).padStart(2, '0')}.png`,
      size: 1_024 + index,
      mtime: index + 1,
      kind: 'image',
      mime: 'image/png',
    })));
    const expectedOutputs = [
      'logo.svg',
      'logo-dark.svg',
      'logo-mono.svg',
      'favicon.ico',
      'apple-touch-icon.png',
      'og-image.png',
      'BRAND.md',
    ];
    const preparedFinalization: LogoFinalization = {
      id: 'final-123',
      projectId: 'logo-project-1',
      conversationId: 'conversation-123',
      clientRequestId: 'logo-finalize:final-123',
      direction: 2,
      sourceFile: 'logo-direction-02.png',
      outputRoot: 'logo/final/final-123',
      expectedOutputs,
      outputFiles: [],
      status: 'running',
      requestedAt: 300,
      notes: '',
      prompt: 'Refine the selected direction.',
    };
    let refinementOptions: {
      onProgress?: (finalization: LogoFinalization) => void;
    } | undefined;
    let finishRefinement: (() => void) | undefined;
    const refinementGate = new Promise<void>((resolve) => { finishRefinement = resolve; });
    finalizeLogoDirectionMock.mockImplementation(async (_input, options) => {
      refinementOptions = options;
      await refinementGate;
      return {
        ...preparedFinalization,
        outputFiles: expectedOutputs.map((name) => `${preparedFinalization.outputRoot}/${name}`),
        status: 'complete',
        archiveUrl: '/api/projects/logo-project-1/archive?root=logo%2Ffinal%2Ffinal-123',
      };
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    await screen.findByRole('region', { name: 'Generation history' });
    fireEvent.click(screen.getByRole('button', { name: 'Select Northstar Logo direction 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refine and build brand kit' }));

    const skeleton = await screen.findByTestId('logo-refinement-skeleton');
    expect(skeleton.textContent).toContain('0/7');
    expect(within(skeleton).getAllByTestId('logo-refinement-asset')).toHaveLength(7);

    await act(async () => {
      refinementOptions?.onProgress?.({
        ...preparedFinalization,
        outputFiles: [`${preparedFinalization.outputRoot}/logo.svg`],
      });
    });

    expect(skeleton.textContent).toContain('1/7');
    expect(within(skeleton).getByRole('img', { name: 'logo.svg ready' })).toBeTruthy();

    await act(async () => finishRefinement?.());
    await waitFor(() => expect(screen.queryByTestId('logo-refinement-skeleton')).toBeNull());
    expect(await screen.findByRole('link', { name: 'Download brand kit' })).toBeTruthy();
  });

  it('shows a four-direction skeleton until logo generation finishes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {},
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageModel: 'gpt-image-2', imageAspect: '1:1', skipDiscoveryBrief: true },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    let finishGeneration: (() => void) | undefined;
    const generationGate = new Promise<void>((resolve) => { finishGeneration = resolve; });
    waitForMediaTaskMock.mockImplementation(async (taskId) => {
      await generationGate;
      return {
        taskId,
        status: 'done',
        startedAt: Date.now(),
        endedAt: Date.now(),
        progress: [],
        nextSince: 0,
        file: { name: taskOutputs.get(taskId) },
      };
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    const skeleton = await screen.findByTestId('logo-generation-skeleton');
    expect(skeleton.textContent).toContain('Generating 4 directions');
    expect((screen.getByRole('button', { name: 'Generating…' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finishGeneration?.());

    await waitFor(() => expect(screen.queryByTestId('logo-generation-skeleton')).toBeNull());
    const history = screen.getByRole('region', { name: 'Generation history' });
    expect(within(history).getAllByRole('img', { name: /Northstar Logo direction/ })).toHaveLength(4);
    expect((screen.getByRole('button', { name: 'Generate 4 directions' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the user on the form when required fields are empty', () => {
    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));
    expect(screen.getByRole('alert').textContent).toContain('brand name and industry');
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('opens a custom color picker and updates the selected palette color', () => {
    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Starting palette 1' }));
    expect(screen.getByRole('dialog', { name: 'Color picker for Starting palette 1' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '1F4E5B80' } });
    expect(screen.getByRole('button', { name: 'Starting palette 1' }).textContent).toContain('#1F4E5B80');
    expect((screen.getByLabelText('Opacity') as HTMLInputElement).value).toBe('50');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Color picker for Starting palette 1' })).toBeNull();
  });
});
