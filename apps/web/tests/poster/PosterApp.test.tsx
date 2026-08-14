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
  listProjectRunsMock,
  listProjectsMock,
  logoutMock,
  prepareImageFileMock,
  reattachDaemonRunMock,
  resolveDirectLoanPosterProjectMock,
  savePreparedImageFileMock,
  saveMessageMock,
  startDirectLoanPosterProjectMock,
  streamViaDaemonMock,
  uploadProjectFilesMock,
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
  listProjectRunsMock: vi.fn(),
  listProjectsMock: vi.fn(),
  logoutMock: vi.fn(),
  prepareImageFileMock: vi.fn(),
  reattachDaemonRunMock: vi.fn(),
  resolveDirectLoanPosterProjectMock: vi.fn(),
  savePreparedImageFileMock: vi.fn(),
  saveMessageMock: vi.fn(),
  startDirectLoanPosterProjectMock: vi.fn(),
  streamViaDaemonMock: vi.fn(),
  uploadProjectFilesMock: vi.fn(),
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
  listProjectRunsMock.mockResolvedValue([]);
  listProjectsMock.mockResolvedValue([]);
  reattachDaemonRunMock.mockResolvedValue(undefined);
  saveMessageMock.mockResolvedValue(undefined);
  uploadProjectFilesMock.mockResolvedValue({
    uploaded: [
      { path: '.od-inputs/generated-c.png', name: 'screen-1.png', kind: 'image' },
      { path: '.od-inputs/generated-a.png', name: 'screen-2.png', kind: 'image' },
      { path: '.od-inputs/generated-b.png', name: 'screen-3.png', kind: 'image' },
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
  for (let index = 1; index <= 3; index += 1) {
    fireEvent.change(screen.getByTestId(`loan-video-text-${index}`), {
      target: { value: `Step ${index}` },
    });
    fireEvent.change(screen.getByTestId(`loan-video-screenshot-${index}`), {
      target: {
        files: [new File([`screen-${index}`], `screen-${index}.png`, { type: 'image/png' })],
      },
    });
    if (index < 3) fireEvent.click(screen.getByTestId(`loan-video-advance-auto-${index}`));
  }
}

describe('PosterApp mobile-safe flow', () => {
  it('starts tutorial video generation in place and persists the first turn', async () => {
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

    await waitFor(() => expect(streamViaDaemonMock).toHaveBeenCalledOnce());
    expect(window.location.href).toBe(initialHref);
    expect(createProjectMock).toHaveBeenCalledWith(expect.not.objectContaining({
      pendingPrompt: expect.anything(),
    }));
    expect(uploadProjectFilesMock).toHaveBeenCalledWith(
      'video-project-1',
      expect.arrayContaining([
        expect.objectContaining({ name: 'screen-1.png' }),
        expect.objectContaining({ name: 'screen-2.png' }),
        expect.objectContaining({ name: 'screen-3.png' }),
      ]),
      { visibility: 'internal' },
    );
    expect(saveMessageMock).toHaveBeenCalledWith(
      'video-project-1',
      'video-conversation-1',
      expect.objectContaining({
        role: 'user',
        content: expect.stringMatching(
          /How to apply[\s\S]*"assetRef": "\.od-inputs\/generated-c\.png"[\s\S]*"assetRef": "\.od-inputs\/generated-a\.png"[\s\S]*"assetRef": "\.od-inputs\/generated-b\.png"/,
        ),
        attachments: expect.arrayContaining([
          expect.objectContaining({ path: '.od-inputs/generated-c.png' }),
        ]),
      }),
    );
    expect(streamViaDaemonMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'codex',
      projectId: 'video-project-1',
      conversationId: 'video-conversation-1',
      attachments: [
        '.od-inputs/generated-c.png',
        '.od-inputs/generated-a.png',
        '.od-inputs/generated-b.png',
      ],
      model: 'gpt-5',
      reasoning: 'medium',
    }));
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

  it('keeps a failed video run on the page and allows an in-place retry', async () => {
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
    streamViaDaemonMock
      .mockImplementationOnce(async (options) => {
        options.onRunCreated?.('video-run-failed');
        options.onRunStatus?.('queued');
        options.onRunStatus?.('running');
        options.onRunStatus?.('failed');
        options.handlers.onError(new Error('Provider rejected the video request.'));
      })
      .mockImplementationOnce(async (options) => {
        options.onRunCreated?.('video-run-retry');
        options.onRunStatus?.('queued');
        options.onRunStatus?.('running');
        videoReady = true;
        options.onRunStatus?.('succeeded');
        options.handlers.onDone('Video rendered after retry.');
      });
    const initialHref = window.location.href;
    render(<PosterApp />);
    await fillValidVideoDraft('Retry this tutorial');

    fireEvent.click(screen.getByTestId('loan-video-generate'));
    expect(await screen.findByText('Provider rejected the video request.')).toBeTruthy();
    expect((screen.getByTestId('loan-video-generate') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('loan-video-manage-steps'));
    fireEvent.click(screen.getByTestId('loan-video-generate'));

    await waitFor(() => expect(streamViaDaemonMock).toHaveBeenCalledTimes(2));
    expect(window.location.href).toBe(initialHref);
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe('/api/projects/video-project-1/raw/zamloan-retried-video.mp4');
  });

  it('fails a succeeded run that finishes without producing an MP4', async () => {
    fetchProjectFilesMock.mockResolvedValue([]);
    render(<PosterApp />);
    await fillValidVideoDraft('Missing output tutorial');

    fireEvent.click(screen.getByTestId('loan-video-generate'));

    expect(await screen.findByText(
      'The generation run finished without producing an MP4. Submit again to retry.',
    )).toBeTruthy();
    expect(screen.getByTestId('poster-app-video-generation-status').className).toContain('is-failed');
    expect((screen.getByTestId('loan-video-generate') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('poster-app-video-result')).toBeNull();
  });

  it('restores a succeeded run without an MP4 as failed instead of waiting forever', async () => {
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
    const restoredRun = {
      id: 'restored-missing-video-run',
      projectId: restoredProject.id,
      conversationId: 'restored-missing-video-conversation',
      assistantMessageId: 'restored-missing-video-assistant',
      agentId: 'codex',
      status: 'succeeded',
      createdAt: 40,
      updatedAt: 45,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      conversationId: restoredRun.conversationId,
      runId: restoredRun.id,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    fetchChatRunStatusMock.mockResolvedValue(restoredRun);
    fetchProjectFilesMock.mockResolvedValue([]);
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    expect(await screen.findByText(
      'The generation run finished without producing an MP4. Submit again to retry.',
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
    const restoredRun = {
      id: 'restored-loading-video-run',
      projectId: restoredProject.id,
      conversationId: 'restored-loading-video-conversation',
      assistantMessageId: 'restored-loading-video-assistant',
      agentId: 'codex',
      status: 'running',
      createdAt: 75_000,
      updatedAt: 80_000,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      conversationId: restoredRun.conversationId,
      runId: restoredRun.id,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    fetchChatRunStatusMock.mockResolvedValue(restoredRun);
    fetchProjectFilesMock.mockResolvedValue([]);
    reattachDaemonRunMock.mockImplementation(() => new Promise(() => {}));
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

  it('reattaches an active video run after refresh without posting a duplicate run', async () => {
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
    const restoredRun = {
      id: 'restored-video-run',
      projectId: restoredProject.id,
      conversationId: 'restored-video-conversation',
      assistantMessageId: 'restored-video-assistant',
      agentId: 'codex',
      status: 'running',
      createdAt: 40,
      updatedAt: 45,
    } as const;
    window.localStorage.setItem('niki:loan-video:last-project:user-1', JSON.stringify({
      projectId: restoredProject.id,
      conversationId: restoredRun.conversationId,
      runId: restoredRun.id,
    }));
    getProjectMock.mockResolvedValue(restoredProject);
    fetchChatRunStatusMock.mockResolvedValue(restoredRun);
    listProjectsMock.mockResolvedValue([]);
    listProjectRunsMock.mockResolvedValue([]);
    listMessagesMock.mockResolvedValue([{
      id: 'restored-video-assistant',
      role: 'assistant',
      content: '',
      runId: 'restored-video-run',
      runStatus: 'running',
      createdAt: 40,
    }]);
    fetchProjectFilesMock.mockImplementation(async () => videoReady
      ? [{
          name: 'restored-video.mp4',
          kind: 'video',
          mime: 'video/mp4',
          size: 4_096,
          mtime: 60,
        }]
      : []);
    reattachDaemonRunMock.mockImplementation(async (options) => {
      options.onRunStatus?.('running');
      videoReady = true;
      options.onRunStatus?.('succeeded');
      options.handlers.onDone('Restored video rendered.');
    });
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    await waitFor(() => expect(reattachDaemonRunMock).toHaveBeenCalledOnce());
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe('/api/projects/restored-video-project/raw/restored-video.mp4');
  });

  it('defaults to one portrait poster and renders the ratio options in order', () => {
    render(<PosterApp />);

    expect(screen.getByRole('heading', { name: 'Generate Loan Posters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1' }).classList.contains('is-active')).toBe(true);
    expect(screen.queryByText(/\u5f20/)).toBeNull();
    const ratioField = screen.getByText('Ratio').closest('.poster-app__field');
    expect(ratioField).toBeTruthy();
    const ratioButtons = within(ratioField as HTMLElement).getAllByRole('button');
    expect(ratioButtons.map((button) => button.textContent)).toEqual(['3:4', '1:1', '16:9']);
    expect(
      within(ratioField as HTMLElement).getByRole('button', { name: '3:4' }).classList.contains('is-active'),
    ).toBe(true);
    expect(screen.queryByText(/Landscape|Square|Portrait/)).toBeNull();
  });

  it('switches from the title menu while preserving the poster form state', () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Biumoney' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate Loan Posters' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Tutorial Videos/ }));

    expect(screen.getByRole('heading', { name: 'Generate Tutorial Videos' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tutorial video generator' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Poster generation settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Generate Tutorial Videos' }));
    fireEvent.click(screen.getByRole('option', { name: /Generate Loan Posters/ }));

    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Biumoney' }).classList.contains('is-active')).toBe(true);
    expect(screen.getByRole('button', { name: '3' }).classList.contains('is-active')).toBe(true);
  });

  it('keeps the mode chevron in the title flow', () => {
    render(<PosterApp />);

    const title = screen.getByRole('heading', { name: 'Generate Loan Posters' });
    const trigger = screen.getByRole('button', { name: 'Generate Loan Posters' });

    expect(title.querySelector('svg')).toBeTruthy();
    expect(trigger.children).toHaveLength(1);
  });

  it('submits the default portrait ratio as 3:4', async () => {
    startDirectLoanPosterProjectMock.mockResolvedValue({ projectId: 'project-1' });
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate posters' }));

    await waitFor(() => {
      expect(startDirectLoanPosterProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ aspectRatio: '3:4' }),
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
