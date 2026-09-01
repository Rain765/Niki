// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  copyOrSharePreparedImageFileMock,
  createProjectMock,
  deleteProjectFileMock,
  fetchAgentsMock,
  fetchChatRunStatusMock,
  fetchDaemonConfigMock,
  fetchProjectFilesMock,
  getProjectMock,
  listMessagesMock,
  listProjectMediaTasksMock,
  listProjectRunsMock,
  listProjectsMock,
  logoutMock,
  prepareImageFileMock,
  reattachDaemonRunMock,
  resolveDirectLoanPosterProjectMock,
  savePreparedImageFileMock,
  saveMessageMock,
  startDirectLoanPosterProjectMock,
  startProjectMediaTaskMock,
  streamViaDaemonMock,
  uploadProjectFilesMock,
  waitForMediaTaskMock,
} = vi.hoisted(() => ({
  copyOrSharePreparedImageFileMock: vi.fn(),
  createProjectMock: vi.fn(),
  deleteProjectFileMock: vi.fn(),
  fetchAgentsMock: vi.fn(),
  fetchChatRunStatusMock: vi.fn(),
  fetchDaemonConfigMock: vi.fn(),
  fetchProjectFilesMock: vi.fn(),
  getProjectMock: vi.fn(),
  listMessagesMock: vi.fn(),
  listProjectMediaTasksMock: vi.fn(),
  listProjectRunsMock: vi.fn(),
  listProjectsMock: vi.fn(),
  logoutMock: vi.fn(),
  prepareImageFileMock: vi.fn(),
  reattachDaemonRunMock: vi.fn(),
  resolveDirectLoanPosterProjectMock: vi.fn(),
  savePreparedImageFileMock: vi.fn(),
  saveMessageMock: vi.fn(),
  startDirectLoanPosterProjectMock: vi.fn(),
  startProjectMediaTaskMock: vi.fn(),
  streamViaDaemonMock: vi.fn(),
  uploadProjectFilesMock: vi.fn(),
  waitForMediaTaskMock: vi.fn(),
}));

vi.mock('../../src/auth/NikiAuth', () => ({
  useNikiAuth: () => ({
    user: { id: 'user-1', name: 'Tester', role: 'admin' },
    logout: logoutMock,
  }),
}));

vi.mock('../../src/components/home-hero/direct-loan-posters', () => ({
  resolveDirectLoanPosterProject: resolveDirectLoanPosterProjectMock,
  startDirectLoanPosterProject: startDirectLoanPosterProjectMock,
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: fetchChatRunStatusMock,
  listProjectRuns: listProjectRunsMock,
  reattachDaemonRun: reattachDaemonRunMock,
  streamViaDaemon: streamViaDaemonMock,
}));

vi.mock('../../src/providers/media', () => ({
  listProjectMediaTasks: listProjectMediaTasksMock,
  startProjectMediaTask: startProjectMediaTaskMock,
  waitForMediaTask: waitForMediaTaskMock,
}));

vi.mock('../../src/providers/registry', () => ({
  deleteProjectFile: deleteProjectFileMock,
  fetchAgents: fetchAgentsMock,
  fetchProjectFiles: fetchProjectFilesMock,
  projectFileDownloadUrl: (projectId: string, name: string) => (
    `/api/projects/${projectId}/raw/${name}?download=1`
  ),
  projectFileUrl: (projectId: string, name: string) => (
    `/api/projects/${projectId}/raw/${name}`
  ),
  uploadProjectFiles: uploadProjectFilesMock,
}));

vi.mock('../../src/state/config', () => ({
  fetchDaemonConfig: fetchDaemonConfigMock,
}));

vi.mock('../../src/state/projects', () => ({
  createProject: createProjectMock,
  getProject: getProjectMock,
  listMessages: listMessagesMock,
  listProjects: listProjectsMock,
  saveMessage: saveMessageMock,
}));

vi.mock('../../src/lib/image-file-actions', () => ({
  canSharePreparedImageFile: vi.fn(() => true),
  copyOrSharePreparedImageFile: copyOrSharePreparedImageFileMock,
  prepareImageFile: prepareImageFileMock,
  savePreparedImageFile: savePreparedImageFileMock,
  sharePreparedImageFile: vi.fn(),
}));

import { PosterApp } from '../../src/poster/PosterApp';

const project = {
  id: 'project-1',
  name: 'BiuMoney 贷款海报',
  skillId: 'loan-poster-skill-v1-1',
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
  metadata: {
    kind: 'image' as const,
    directGeneration: {
      kind: 'loan-poster' as const,
      expectedOutputs: 1,
      status: 'complete' as const,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  resolveDirectLoanPosterProjectMock.mockResolvedValue(project);
  createProjectMock.mockResolvedValue({
    project: {
      ...project,
      id: 'video-project-1',
      name: 'ZamLoan · How to apply',
      skillId: 'hyperframes',
      metadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
        videoAspect: '9:16',
        videoLength: 30,
      },
    },
    conversationId: 'video-conversation-1',
  });
  fetchAgentsMock.mockResolvedValue([{
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    available: true,
  }]);
  fetchDaemonConfigMock.mockResolvedValue({
    agentId: 'codex',
    agentModels: { codex: { model: 'gpt-5', reasoning: 'medium' } },
  });
  fetchProjectFilesMock.mockResolvedValue([]);
  deleteProjectFileMock.mockResolvedValue(true);
  fetchChatRunStatusMock.mockResolvedValue(null);
  getProjectMock.mockResolvedValue(null);
  listMessagesMock.mockResolvedValue([]);
  listProjectMediaTasksMock.mockResolvedValue({ tasks: [] });
  listProjectRunsMock.mockResolvedValue([]);
  listProjectsMock.mockResolvedValue([]);
  reattachDaemonRunMock.mockResolvedValue(undefined);
  saveMessageMock.mockResolvedValue(undefined);
  startProjectMediaTaskMock.mockResolvedValue({
    taskId: 'video-task-1',
    status: 'queued',
    startedAt: 10,
  });
  uploadProjectFilesMock.mockResolvedValue({
    uploaded: [
      { path: '.od-inputs/generated-intro.png', name: 'intro.png', kind: 'image' },
      { path: '.od-inputs/generated-background.png', name: 'background.png', kind: 'image' },
      { path: '.od-inputs/generated-c.png', name: 'screen-1.png', kind: 'image' },
      { path: '.od-inputs/generated-a.png', name: 'screen-2.png', kind: 'image' },
      { path: '.od-inputs/generated-b.png', name: 'screen-3.png', kind: 'image' },
      { path: '.od-inputs/generated-outro.png', name: 'outro.png', kind: 'image' },
    ],
    failed: [],
  });
  streamViaDaemonMock.mockImplementation(async (options) => {
    options.onRunCreated?.('video-run-1');
    options.onRunStatus?.('queued');
    options.onRunStatus?.('running');
    options.onRunStatus?.('succeeded');
    options.handlers.onDone('Video rendered.');
  });
  waitForMediaTaskMock.mockResolvedValue({
    taskId: 'video-task-1',
    status: 'done',
    startedAt: 10,
    endedAt: 20,
    progress: [],
    nextSince: 0,
  });
  prepareImageFileMock.mockResolvedValue(new File(['png'], 'biumoney-poster-20260804-001.png', {
    type: 'image/png',
  }));
  copyOrSharePreparedImageFileMock.mockResolvedValue('copied');
  savePreparedImageFileMock.mockResolvedValue('downloaded');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/projects/project-1/files') {
      return new Response(JSON.stringify({
        files: [{
          name: 'biumoney-poster-20260804-001.png',
          kind: 'image',
          mime: 'image/png',
          size: 100,
          mtime: 2,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/projects/project-1') {
      return new Response(JSON.stringify({ project }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/auth/users') {
      return new Response(JSON.stringify({ users: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fillValidVideoDraft(title = 'How to apply') {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
  fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));
  await waitFor(() => {
    expect((screen.getByTestId('loan-video-generate') as HTMLButtonElement).disabled).toBe(false);
  });
  fireEvent.change(screen.getByTestId('loan-video-title'), {
    target: { value: title },
  });
  fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
  for (const role of ['intro', 'background', 'outro']) {
    fireEvent.change(screen.getByTestId(`loan-video-${role}`), {
      target: {
        files: [new File([role], `${role}.png`, { type: 'image/png' })],
      },
    });
  }
  for (let index = 1; index <= 3; index += 1) {
    fireEvent.change(screen.getByTestId(`loan-video-text-${index}`), {
      target: { value: `Step ${index}` },
    });
    fireEvent.change(screen.getByTestId(`loan-video-screenshot-${index}`), {
      target: {
        files: [new File([`screen-${index}`], `screen-${index}.png`, { type: 'image/png' })],
      },
    });
    fireEvent.click(screen.getByTestId(`loan-video-advance-auto-${index}`));
  }
}

describe('PosterApp mobile-safe flow', () => {
  it('starts tutorial video generation directly without an agent turn', async () => {
    fetchProjectFilesMock.mockResolvedValue([{
      name: 'zamloan-how-to-apply.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 1_024,
      mtime: 10,
    }]);
    const initialHref = window.location.href;
    render(<PosterApp />);

    await fillValidVideoDraft();

    fireEvent.click(screen.getByTestId('loan-video-generate'));

    await waitFor(() => expect(startProjectMediaTaskMock).toHaveBeenCalledOnce());
    expect(window.location.href).toBe(initialHref);
    expect(createProjectMock).toHaveBeenCalledWith(expect.not.objectContaining({
      pendingPrompt: expect.anything(),
    }));
    expect(uploadProjectFilesMock).toHaveBeenCalledWith(
      'video-project-1',
      expect.arrayContaining([
        expect.objectContaining({ name: 'intro.png' }),
        expect.objectContaining({ name: 'background.png' }),
        expect.objectContaining({ name: 'screen-1.png' }),
        expect.objectContaining({ name: 'screen-2.png' }),
        expect.objectContaining({ name: 'screen-3.png' }),
        expect.objectContaining({ name: 'outro.png' }),
      ]),
      { visibility: 'internal' },
    );
    expect(startProjectMediaTaskMock).toHaveBeenCalledWith(
      'video-project-1',
      expect.objectContaining({
        surface: 'video',
        model: 'hyperframes-html',
        output: 'zamloan-how-to-apply.mp4',
        loanVideoStoryboard: expect.objectContaining({
          title: 'How to apply',
          backgroundRef: '.od-inputs/generated-background.png',
          scenes: expect.arrayContaining([
            expect.objectContaining({
              assetRef: '.od-inputs/generated-intro.png',
              presentation: 'full',
            }),
            expect.objectContaining({ assetRef: '.od-inputs/generated-c.png' }),
            expect.objectContaining({ assetRef: '.od-inputs/generated-a.png' }),
            expect.objectContaining({ assetRef: '.od-inputs/generated-b.png' }),
            expect.objectContaining({
              assetRef: '.od-inputs/generated-outro.png',
              presentation: 'full',
            }),
          ]),
        }),
      }),
    );
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
    expect(saveMessageMock).not.toHaveBeenCalled();
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe(
      '/api/projects/video-project-1/raw/zamloan-how-to-apply.mp4',
    );
  });

  it('shows prior MP4s in collapsible history and deletes them in place', async () => {
    const latestVideo = {
      name: 'zamloan-latest.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 2_048,
      mtime: 20,
    };
    const previousVideo = {
      name: 'zamloan-previous.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 1_024,
      mtime: 10,
    };
    let previousExists = true;
    fetchProjectFilesMock.mockImplementation(async () => (
      previousExists ? [latestVideo, previousVideo] : [latestVideo]
    ));
    deleteProjectFileMock.mockImplementation(async (_projectId, name) => {
      if (name !== previousVideo.name) return false;
      previousExists = false;
      return true;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PosterApp />);
    await fillValidVideoDraft('Video history tutorial');

    fireEvent.click(screen.getByTestId('loan-video-generate'));

    await screen.findByTestId('poster-app-video-result');
    fireEvent.click(screen.getByRole('button', { name: 'Expand video history' }));
    const history = screen.getByRole('region', { name: 'Video history' });
    const previousCard = within(history).getByText(previousVideo.name).closest('article');
    expect(previousCard).toBeTruthy();
    fireEvent.click(within(previousCard as HTMLElement).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteProjectFileMock).toHaveBeenCalledWith(
      'video-project-1',
      previousVideo.name,
    ));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Video history' })).toBeNull());
  });

  it('keeps a failed video task on the page and allows an in-place retry', async () => {
    let videoReady = false;
    fetchProjectFilesMock.mockImplementation(async () => videoReady
      ? [{
          name: 'zamloan-retried-video.mp4',
          kind: 'video',
          mime: 'video/mp4',
          size: 2_048,
          mtime: 20,
        }]
      : []);
    startProjectMediaTaskMock
      .mockRejectedValueOnce(new Error('Provider rejected the video request.'))
      .mockResolvedValueOnce({ taskId: 'video-task-retry', status: 'queued', startedAt: 20 });
    waitForMediaTaskMock.mockImplementation(async () => {
      videoReady = true;
      return {
        taskId: 'video-task-retry',
        status: 'done',
        startedAt: 20,
        endedAt: 30,
        progress: [],
        nextSince: 0,
      };
    });
    const initialHref = window.location.href;
    render(<PosterApp />);
    await fillValidVideoDraft('Retry this tutorial');

    fireEvent.click(screen.getByTestId('loan-video-generate'));
    expect(await screen.findByText('Provider rejected the video request.')).toBeTruthy();
    expect((screen.getByTestId('loan-video-generate') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    await waitFor(() => expect(startProjectMediaTaskMock).toHaveBeenCalledTimes(2));
    expect(window.location.href).toBe(initialHref);
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe('/api/projects/video-project-1/raw/zamloan-retried-video.mp4');
  });

  it('fails a completed task that finishes without producing an MP4', async () => {
    fetchProjectFilesMock.mockResolvedValue([]);
    render(<PosterApp />);
    await fillValidVideoDraft('Missing output tutorial');

    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(await screen.findByText(
      'The video task finished without producing a durable MP4. Submit again to retry.',
    )).toBeTruthy();
    expect(screen.getByTestId('poster-app-video-generation-status').className).toContain('is-failed');
    expect((screen.getByTestId('loan-video-generate') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('poster-app-video-result')).toBeNull();
  });

  it('restores a completed task without an MP4 as failed instead of waiting forever', async () => {
    const restoredProject = {
      ...project,
      id: 'restored-missing-video-project',
      name: 'ZamLoan · Missing restored video',
      skillId: 'hyperframes',
      updatedAt: 50,
      metadata: {
        kind: 'video' as const,
        videoModel: 'hyperframes-html',
        videoAspect: '9:16',
        videoLength: 30,
      },
    };
    const restoredTask = {
      taskId: 'restored-missing-video-task',
      status: 'done',
      startedAt: 40,
      endedAt: 45,
      elapsed: 0,
      surface: 'video',
      model: 'hyperframes-html',
      progress: [],
      progressCount: 0,
      nextSince: 0,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      taskId: restoredTask.taskId,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    listProjectMediaTasksMock.mockResolvedValue({ tasks: [restoredTask] });
    fetchProjectFilesMock.mockResolvedValue([]);
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    expect(await screen.findByText(
      'The video task finished without producing a durable MP4. Submit again to retry.',
    )).toBeTruthy();
    expect(reattachDaemonRunMock).not.toHaveBeenCalled();
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('poster-app-video-generation-status').className).toContain('is-failed');
  });

  it('restores an active video shimmer with its saved ratio, phase, and elapsed time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200_000);
    const restoredProject = {
      ...project,
      id: 'restored-loading-video-project',
      name: 'ZamLoan · Loading tutorial',
      skillId: 'hyperframes',
      createdAt: 25_000,
      updatedAt: 80_000,
      metadata: {
        kind: 'video' as const,
        videoModel: 'hyperframes-html',
        videoAspect: '1:1' as const,
        videoLength: 30,
      },
    };
    const restoredTask = {
      taskId: 'restored-loading-video-task',
      status: 'running',
      startedAt: 75_000,
      elapsed: 5,
      surface: 'video',
      model: 'hyperframes-html',
      progress: [],
      progressCount: 0,
      nextSince: 0,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      taskId: restoredTask.taskId,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    listProjectMediaTasksMock.mockResolvedValue({ tasks: [restoredTask] });
    fetchProjectFilesMock.mockResolvedValue([]);
    waitForMediaTaskMock.mockImplementation(() => new Promise(() => {}));
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    const loading = await screen.findByTestId('poster-app-video-loading');
    expect(loading.className).toContain('is-square');
    expect(loading.getAttribute('data-aspect-ratio')).toBe('1:1');
    expect(within(loading).getByText('Generating tutorial video')).toBeTruthy();
    expect(within(loading).getByText('Elapsed 2m 05s')).toBeTruthy();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
  });

  it('reattaches an active video task after refresh without posting a duplicate task', async () => {
    const restoredProject = {
      ...project,
      id: 'restored-video-project',
      name: 'ZamLoan · Restored tutorial',
      skillId: 'hyperframes',
      updatedAt: 50,
      metadata: {
        kind: 'video' as const,
        videoModel: 'hyperframes-html',
        videoAspect: '9:16',
        videoLength: 30,
      },
    };
    let videoReady = false;
    const restoredTask = {
      taskId: 'restored-video-task',
      status: 'running',
      startedAt: 40,
      elapsed: 5,
      surface: 'video',
      model: 'hyperframes-html',
      progress: [],
      progressCount: 0,
      nextSince: 0,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      taskId: restoredTask.taskId,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    listProjectMediaTasksMock.mockResolvedValue({ tasks: [restoredTask] });
    listProjectsMock.mockResolvedValue([]);
    fetchProjectFilesMock.mockImplementation(async () => videoReady
      ? [{
          name: 'restored-video.mp4',
          kind: 'video',
          mime: 'video/mp4',
          size: 4_096,
          mtime: 60,
        }]
      : []);
    waitForMediaTaskMock.mockImplementation(async () => {
      videoReady = true;
      return {
        taskId: restoredTask.taskId,
        status: 'done',
        startedAt: 40,
        endedAt: 45,
        progress: [],
        nextSince: 0,
      };
    });
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    await waitFor(() => expect(waitForMediaTaskMock).toHaveBeenCalledOnce());
    expect(startProjectMediaTaskMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe('/api/projects/restored-video-project/raw/restored-video.mp4');
  });

  it('renders the existing poster options unchanged as selects and defaults to acquisition', () => {
    render(<PosterApp />);

    expect(screen.getByRole('heading', { name: 'Generate Loan Posters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    const product = screen.getByRole('combobox', { name: 'Product' }) as HTMLSelectElement;
    const type = screen.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement;
    const quantity = screen.getByRole('combobox', { name: 'Quantity' }) as HTMLSelectElement;
    const ratio = screen.getByRole('combobox', { name: 'Ratio' }) as HTMLSelectElement;

    expect(Array.from(product.options, (option) => option.textContent)).toEqual([
      'Zamloan',
      'Biumoney',
    ]);
    expect(product.value).toBe('zamloan');
    expect(Array.from(type.options, (option) => option.textContent)).toEqual(['引流', '防欺诈']);
    expect(type.value).toBe('acquisition');
    expect(Array.from(quantity.options, (option) => option.textContent)).toEqual(['1', '2', '3', '4']);
    expect(quantity.value).toBe('1');
    expect(Array.from(ratio.options, (option) => option.textContent)).toEqual(['3:4', '1:1', '16:9']);
    expect(ratio.value).toBe('3:4');
    expect(screen.queryByText(/Landscape|Square|Portrait/)).toBeNull();
  });

  it('switches from the title menu while preserving the poster form state', () => {
    render(<PosterApp />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Product' }), {
      target: { value: 'biumoney' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'anti-fraud' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Quantity' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    expect(screen.getByRole('heading', { name: 'Generate Tutorial Videos' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tutorial video generator' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Poster generation settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Generate Tutorial Videos' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Loan Posters/ }));

    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Product' }) as HTMLSelectElement).value)
      .toBe('biumoney');
    expect((screen.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement).value)
      .toBe('anti-fraud');
    expect((screen.getByRole('combobox', { name: 'Quantity' }) as HTMLSelectElement).value)
      .toBe('3');
  });

  it('opens Document Search from the title menu', () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Document Search/ }));

    expect(screen.getByRole('heading', { name: 'Document Search' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What do you want to find?' })).toBeTruthy();
    expect(screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    })).toBeTruthy();
    expect(window.location.search).toBe('?mode=documents');
    expect(screen.queryByRole('region', { name: 'Poster generation settings' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Tutorial video generator' })).toBeNull();
  });

  it('opens Daily English Practice from the title menu', () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    const options = within(screen.getByRole('listbox', { name: 'Creation mode' }))
      .getAllByRole('option');
    const englishOption = options.find((option) => option.textContent?.includes('Daily English Practice'));
    expect(englishOption?.textContent).toContain('Practice real-life English conversations');

    fireEvent.click(englishOption!);
    expect(screen.getByRole('heading', { name: 'Daily English Practice' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '10 个经典生活场景' })).toBeTruthy();
    expect(window.location.search).toBe('?mode=english');
  });

  it('places Logo Studio last in the title menu and links to its page', () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    const options = within(screen.getByRole('listbox', { name: 'Creation mode' }))
      .getAllByRole('option');
    const logoOption = options.at(-1);

    expect(logoOption?.textContent).toContain('Logo Studio');
    expect(logoOption?.textContent).toContain('Create a focused identity system');
    expect(logoOption?.getAttribute('href')).toBe('/logo');
  });

  it('renders Logo Studio as a light Niki creation page', () => {
    render(<PosterApp initialMode="logo" />);

    expect(screen.getByRole('heading', { name: 'Logo Studio' })).toBeTruthy();
    expect(screen.queryByText('Build a mark worth remembering.')).toBeNull();
    expect(screen.getByRole('region', { name: 'Brand brief' })).toBeTruthy();
    expect(document.querySelector('.poster-app')?.classList.contains('is-logo')).toBe(true);
  });

  it('keeps the mode chevron in the title flow', () => {
    render(<PosterApp />);

    const title = screen.getByRole('heading', { name: 'Generate Loan Posters' });
    const trigger = screen.getByRole('button', { name: 'Generate Loan Posters' });

    expect(title.querySelector('svg')).toBeTruthy();
    expect(trigger.children).toHaveLength(1);
  });

  it('submits the selected poster type with the unchanged default controls', async () => {
    startDirectLoanPosterProjectMock.mockResolvedValue({ projectId: 'project-1' });
    render(<PosterApp />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'anti-fraud' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate posters' }));

    await waitFor(() => {
      expect(startDirectLoanPosterProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '3:4',
          brand: 'zamloan',
          count: 1,
          purpose: 'anti-fraud',
        }),
        expect.any(Function),
      );
    });
  });

  it('opens administrator account management without logging out', async () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Tester' }));

    expect(logoutMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }));
    expect(await screen.findByRole('dialog', { name: '账号管理' })).toBeTruthy();
  });

  it('shows a gallery placeholder immediately while restoring the server project', () => {
    resolveDirectLoanPosterProjectMock.mockReturnValue(new Promise(() => undefined));
    render(<PosterApp />);
    expect(screen.getByText('Loading recent posters…')).toBeTruthy();
  });

  it('automatically dismisses the current generation status after 10 seconds', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    render(<PosterApp />);
    await screen.findByText('1 poster generated in this batch');

    const generationStatus = screen.getByTestId('poster-app-generation-status');
    const autoDismissCall = setTimeoutSpy.mock.calls
      .filter(([, delay]) => delay === 10_000)
      .at(-1);
    expect(autoDismissCall).toBeTruthy();
    expect(generationStatus.className).not.toContain('is-dismissed');

    act(() => {
      if (typeof autoDismissCall?.[0] === 'function') autoDismissCall[0]();
    });

    expect(generationStatus.className).toContain('is-dismissed');
    expect(generationStatus.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps an asynchronous generation failure visible until the user dismisses it', async () => {
    const failedProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 1,
          status: 'failed' as const,
          activeBatchId: 'batch-failed',
          batches: [{
            id: 'batch-failed',
            status: 'failed' as const,
            requestedAt: 10,
            failedAt: 20,
            expectedOutputs: 1,
            outputNames: ['zamloan-poster-20260813-001.png'],
            brand: 'zamloan' as const,
            aspectRatio: '3:4' as const,
            lastError: 'Provider rejected the foreground request.',
          }],
        },
      },
    };
    resolveDirectLoanPosterProjectMock.mockResolvedValue(failedProject);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1') {
        return new Response(JSON.stringify({ project: failedProject }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(<PosterApp />);
    await screen.findByText('Provider rejected the foreground request.');

    const generationStatus = screen.getByTestId('poster-app-generation-status');
    const lastAutoDismissCall = setTimeoutSpy.mock.calls
      .filter(([, delay]) => delay === 10_000)
      .at(-1);
    act(() => {
      if (typeof lastAutoDismissCall?.[0] === 'function') lastAutoDismissCall[0]();
    });
    expect(generationStatus.className).not.toContain('is-dismissed');
  });

  it('restores the server image and shows copy confirmation above the preview', async () => {
    render(<PosterApp />);
    const poster = await screen.findByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    });
    fireEvent.click(poster.closest('button')!);
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Copy image' }) as HTMLButtonElement).disabled)
        .toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));

    await waitFor(() => {
      expect(copyOrSharePreparedImageFileMock).toHaveBeenCalledWith(expect.any(File));
    });
    expect(await screen.findByText('Image copied')).toBeTruthy();
  });

  it('shows only circular icon actions in the poster preview', async () => {
    render(<PosterApp />);
    const poster = await screen.findByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    });
    fireEvent.click(poster.closest('button')!);

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Save image' }) as HTMLButtonElement).disabled)
        .toBe(false);
    });

    const preview = screen.getByRole('dialog', {
      name: 'biumoney-poster-20260804-001.png',
    });
    const actions = ['Close', 'Share', 'Save image', 'Copy image', 'Delete'];
    for (const name of actions) {
      const button = within(preview).getByRole('button', { name });
      expect(button.textContent).toBe('');
    }
    expect(within(preview).queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('prepares the original before enabling the first mobile-browser save click', async () => {
    let resolvePrepared!: (file: File) => void;
    prepareImageFileMock.mockReturnValue(new Promise<File>((resolve) => {
      resolvePrepared = resolve;
    }));
    render(<PosterApp />);
    const poster = await screen.findByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    });

    fireEvent.click(poster.closest('button')!);

    const preparingButton = screen.getByRole('button', { name: 'Preparing original…' });
    expect((preparingButton as HTMLButtonElement).disabled).toBe(true);
    expect(prepareImageFileMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/biumoney-poster-20260804-001.png?v=2',
      'biumoney-poster-20260804-001.png',
      'image/png',
    );

    const prepared = new File(['png'], 'biumoney-poster-20260804-001.png', {
      type: 'image/png',
    });
    await act(async () => resolvePrepared(prepared));

    const saveButton = await screen.findByRole('button', { name: 'Save image' });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savePreparedImageFileMock).toHaveBeenCalledWith(prepared);
    });
  });

  it('pins the newest batch above collapsed history with its own ratio and count', async () => {
    const batchedProject = {
      ...project,
      updatedAt: 30,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 3,
          status: 'complete' as const,
          activeBatchId: 'batch-new',
          batches: [{
            id: 'batch-old',
            status: 'complete' as const,
            requestedAt: 10,
            completedAt: 20,
            expectedOutputs: 2,
            outputNames: [
              'biumoney-poster-20260804-001.png',
              'biumoney-poster-20260804-002.png',
            ],
            brand: 'biumoney' as const,
            aspectRatio: '16:9' as const,
          }, {
            id: 'batch-new',
            status: 'complete' as const,
            requestedAt: 30,
            completedAt: 40,
            expectedOutputs: 1,
            outputNames: ['biumoney-poster-20260804-003.png'],
            brand: 'biumoney' as const,
            aspectRatio: '1:1' as const,
          }],
        },
      },
    };
    const files = [{
      name: 'biumoney-poster-20260804-001.png',
      kind: 'image',
      mime: 'image/png',
      size: 100,
      mtime: 10,
    }, {
      name: 'biumoney-poster-20260804-002.png',
      kind: 'image',
      mime: 'image/png',
      size: 100,
      mtime: 20,
    }, {
      name: 'biumoney-poster-20260804-003.png',
      kind: 'image',
      mime: 'image/png',
      size: 100,
      mtime: 40,
    }];
    resolveDirectLoanPosterProjectMock.mockResolvedValue(batchedProject);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({ files }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1') {
        return new Response(JSON.stringify({ project: batchedProject }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<PosterApp />);

    const latestRegion = await screen.findByRole('region', { name: 'Latest batch' });
    const newestImage = within(latestRegion).getByRole('img', {
      name: 'biumoney-poster-20260804-003.png',
    });
    expect(newestImage.getAttribute('loading')).toBe('eager');
    expect(newestImage.closest('button')?.className).toContain('is-square');
    expect(within(latestRegion).getByText('1:1 × 1').className).toBe('poster-app__section-meta');
    expect(screen.getByText('1 poster generated in this batch')).toBeTruthy();
    expect(screen.queryByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    })).toBeNull();

    const generationStatus = screen.getByTestId('poster-app-generation-status');
    fireEvent.click(within(generationStatus).getByRole('button', { name: 'Close status' }));
    expect(generationStatus.className).toContain('is-dismissed');
    expect(generationStatus.getAttribute('aria-hidden')).toBe('true');

    const historyToggle = screen.getByRole('button', { name: 'Expand poster history' });
    expect(historyToggle.querySelector('svg')).toBeTruthy();
    expect(historyToggle.querySelector('.poster-app__history-toggle-icon')).toBeTruthy();
    expect(within(historyToggle).getByText('Poster history').className).toBe('poster-app__section-title');
    expect(within(historyToggle).getByText('(2)').className).toBe('poster-app__section-meta');
    fireEvent.click(historyToggle);
    expect(screen.getByRole('button', { name: 'Collapse poster history' })).toBeTruthy();

    const historyRegion = screen.getByRole('region', { name: 'Poster history' });
    const olderImage = within(historyRegion).getByRole('img', {
      name: 'biumoney-poster-20260804-002.png',
    });
    expect(olderImage.getAttribute('loading')).toBe('lazy');
    expect(olderImage.closest('button')?.className).toContain('is-landscape');
  });

  it('renders portrait batches without forcing a landscape card', async () => {
    const portraitProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 1,
          status: 'complete' as const,
          activeBatchId: 'batch-portrait',
          batches: [{
            id: 'batch-portrait',
            status: 'complete' as const,
            requestedAt: 10,
            completedAt: 20,
            expectedOutputs: 1,
            outputNames: ['biumoney-poster-20260804-001.png'],
            brand: 'biumoney' as const,
            aspectRatio: '3:4' as const,
          }],
        },
      },
    };
    resolveDirectLoanPosterProjectMock.mockResolvedValue(portraitProject);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({
          files: [{
            name: 'biumoney-poster-20260804-001.png',
            kind: 'image',
            mime: 'image/png',
            size: 100,
            mtime: 2,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/projects/project-1') {
        return new Response(JSON.stringify({ project: portraitProject }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<PosterApp />);

    const portraitImage = await screen.findByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    });
    expect(portraitImage.closest('button')?.className).toContain('is-portrait');
  });
});
