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
  patchProjectMock,
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
  patchProjectMock: vi.fn(),
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
  patchProject: patchProjectMock,
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
import { I18nProvider } from '../../src/i18n';

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
  patchProjectMock.mockResolvedValue(null);
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

function selectWorkspace(name: 'Posters' | 'Videos' | 'Documents' | 'Voice') {
  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
  fireEvent.click(within(navigation).getByRole('button', { name }));
}

async function fillValidVideoDraft(title = 'How to apply') {
  selectWorkspace('Videos');
  fireEvent.click(screen.getByTestId('loan-video-editor-mode'));
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
  it('uses a standard top navigation with a persistent Chinese and English switch', () => {
    render(
      <I18nProvider initial="zh-CN">
        <PosterApp />
      </I18nProvider>,
    );

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getByRole('button', { name: '海报' })).toBeTruthy();
    expect(within(navigation).getByRole('button', { name: '视频' })).toBeTruthy();
    expect(within(navigation).getByRole('button', { name: '文档' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: '品牌' })).toBeTruthy();
    expect(within(navigation).getByRole('button', { name: '语音' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '海报生成设置' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '产品' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '类型' }).textContent).toContain('防欺诈');
    expect(screen.getByRole('combobox', { name: '数量' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '比例' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '生成海报' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /最新一批/ }).getAttribute('aria-selected')).toBe('true');
    const historyTab = screen.getByRole('tab', { name: /历史生成/ });
    fireEvent.click(historyTab);
    expect(screen.getByRole('tabpanel', { name: /历史生成/ }).textContent).toContain('暂无历史生成记录。');
    expect(screen.queryByText('Product')).toBeNull();

    const language = screen.getByRole('group', { name: '界面语言' });
    expect(within(language).getByRole('button', { name: '中文' }).getAttribute('aria-pressed'))
      .toBe('true');
    fireEvent.click(within(language).getByRole('button', { name: 'English' }));

    expect(window.localStorage.getItem('open-design:locale')).toBe('en');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Generate loan posters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Product' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate posters' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Latest batch/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /History/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('产品')).toBeNull();
  });

  it('regenerates from an approved page plan without reopening the editor', async () => {
    const savedProject = {
      ...project,
      id: 'saved-video-project',
      name: 'ZamLoan · 操作教学 · How to apply',
      skillId: 'hyperframes',
      updatedAt: 30,
      metadata: {
        kind: 'video' as const,
        videoModel: 'hyperframes-html',
        videoAspect: '9:16' as const,
        videoLength: 30,
        loanVideoPreset: {
          version: 1 as const,
          brand: 'zamloan' as const,
          purpose: 'tutorial' as const,
        },
      },
    };
    let videoReady = false;
    listProjectsMock.mockResolvedValue([savedProject]);
    fetchProjectFilesMock.mockImplementation(async () => [{
      name: videoReady
        ? String(startProjectMediaTaskMock.mock.calls.at(-1)?.[1]?.output)
        : 'zamloan-tutorial-approved.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 2_048,
      mtime: videoReady ? 40 : 20,
    }]);
    patchProjectMock.mockResolvedValue({
      ...savedProject,
      metadata: { ...savedProject.metadata, videoAspect: '3:4' },
    });
    waitForMediaTaskMock.mockImplementation(async () => {
      videoReady = true;
      return {
        taskId: 'video-task-1',
        status: 'done',
        startedAt: 31,
        endedAt: 40,
        progress: [],
        nextSince: 0,
      };
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/raw/.hyperframes-cache/loan-video-fast/storyboard.json')) {
        return new Response(JSON.stringify({
          version: 2,
          title: 'How to apply',
          product: 'zamloan',
          language: 'en',
          aspectRatio: '9:16',
          durationSeconds: 30,
          narration: false,
          subtitles: true,
          backgroundRef: '.od-inputs/background.png',
          scenes: [{
            id: 'intro',
            index: 1,
            screenshotAttachmentIndex: 1,
            screenshotOriginalName: 'intro.png',
            assetRef: '.od-inputs/intro.png',
            text: '',
            captionEnabled: false,
            voiceoverEnabled: false,
            terminal: true,
            presentation: 'full',
          }],
          transitions: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (url === '/api/projects/project-1') {
        return new Response(JSON.stringify({ project }), { status: 200 });
      }
      if (url === '/api/auth/users') {
        return new Response(JSON.stringify({ users: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<PosterApp />);
    selectWorkspace('Videos');
    const quickGenerate = await screen.findByTestId('loan-video-quick-generate');
    await waitFor(() => expect((quickGenerate as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('combobox', { name: 'Purpose' }));
    fireEvent.click(screen.getByRole('option', { name: 'Loan guide' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Aspect ratio' }));
    fireEvent.click(screen.getByRole('option', { name: '3:4' }));
    fireEvent.click(quickGenerate);

    await waitFor(() => expect(startProjectMediaTaskMock).toHaveBeenCalledOnce());
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(patchProjectMock).toHaveBeenCalledWith(
      'saved-video-project',
      expect.objectContaining({
        metadata: expect.objectContaining({ videoAspect: '3:4' }),
      }),
    );
    expect(startProjectMediaTaskMock).toHaveBeenCalledWith(
      'saved-video-project',
      expect.objectContaining({
        surface: 'video',
        model: 'hyperframes-html',
        output: expect.stringMatching(/^zamloan-loan-guide-[a-z0-9]{8}\.mp4$/),
        loanVideoStoryboard: expect.objectContaining({ aspectRatio: '3:4' }),
      }),
    );
  });

  it('starts tutorial video generation directly without an agent turn', async () => {
    fetchProjectFilesMock.mockResolvedValue([{
      name: 'zamloan-how-to-apply.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 1_024,
      mtime: 10,
    }]);
    render(<PosterApp />);

    await fillValidVideoDraft();
    const initialHref = window.location.href;

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
    render(<PosterApp />);
    await fillValidVideoDraft('Retry this tutorial');
    const initialHref = window.location.href;

    fireEvent.click(screen.getByTestId('loan-video-generate'));
    expect(await screen.findByText('Provider rejected the video request.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('loan-video-editor-mode'));
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
    expect(screen.getByTestId('poster-app-video-generation-status').className)
      .toContain('od-toast--error');
    expect((screen.getByTestId('loan-video-editor-mode') as HTMLButtonElement).disabled).toBe(false);
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

    selectWorkspace('Videos');

    expect(await screen.findByText(
      'The video task finished without producing a durable MP4. Submit again to retry.',
    )).toBeTruthy();
    expect(reattachDaemonRunMock).not.toHaveBeenCalled();
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('poster-app-video-generation-status').className)
      .toContain('od-toast--error');
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

    selectWorkspace('Videos');

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

    selectWorkspace('Videos');

    await waitFor(() => expect(waitForMediaTaskMock).toHaveBeenCalledOnce());
    expect(startProjectMediaTaskMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(
      (await screen.findByTestId('poster-app-video-result')).getAttribute('src'),
    ).toBe('/api/projects/restored-video-project/raw/restored-video.mp4');
    expect(screen.queryByTestId('poster-app-video-generation-status')).toBeNull();
  });

  it('renders the existing poster options unchanged in custom selects and defaults to anti-fraud', () => {
    render(<PosterApp />);

    expect(screen.getByRole('heading', { name: 'Generate loan posters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    const selectOptions = (label: string) => {
      const trigger = screen.getByRole('combobox', { name: label });
      fireEvent.click(trigger);
      const listbox = screen.getByRole('listbox', { name: label });
      const options = within(listbox).getAllByRole('option').map((option) => option.textContent);
      fireEvent.keyDown(trigger, { key: 'Escape' });
      return { options, trigger };
    };

    const product = selectOptions('Product');
    expect(product.options).toEqual(['Zamloan', 'Biumoney']);
    expect(product.trigger.getAttribute('value')).toBe('zamloan');
    const type = selectOptions('Type');
    expect(type.options).toEqual(['Acquisition', 'Anti-fraud']);
    expect(type.trigger.getAttribute('value')).toBe('anti-fraud');
    const quantity = selectOptions('Quantity');
    expect(quantity.options).toEqual(['1', '2', '3', '4']);
    expect(quantity.trigger.getAttribute('value')).toBe('1');
    const ratio = selectOptions('Ratio');
    expect(ratio.options).toEqual(['3:4', '1:1', '16:9']);
    expect(ratio.trigger.getAttribute('value')).toBe('3:4');
    expect(screen.queryByText(/Landscape|Square|Portrait/)).toBeNull();
  });

  it('switches from the top navigation while preserving the poster form state', async () => {
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /Biumoney/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    fireEvent.click(screen.getByRole('option', { name: /Acquisition/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Quantity' }));
    fireEvent.click(screen.getByRole('option', { name: /3/ }));
    selectWorkspace('Videos');

    expect(screen.getByRole('heading', { name: 'Generate a business video' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tutorial video generator' })).toBeTruthy();
    expect(screen.getByTestId('loan-video-quick-mode')).toBeTruthy();
    expect(screen.getByTestId('loan-video-editor-mode')).toBeTruthy();
    expect(screen.queryByTestId('loan-video-editor-settings')).toBeNull();
    await waitFor(() => {
      expect(screen.queryByTestId('poster-app-video-generation-status')).toBeNull();
    });
    expect(screen.queryByRole('region', { name: 'Poster generation settings' })).toBeNull();

    selectWorkspace('Posters');

    expect(screen.getByRole('region', { name: 'Poster generation settings' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Product' }).getAttribute('value'))
      .toBe('biumoney');
    expect(screen.getByRole('combobox', { name: 'Type' }).getAttribute('value'))
      .toBe('acquisition');
    expect(screen.getByRole('combobox', { name: 'Quantity' }).getAttribute('value'))
      .toBe('3');
  });

  it('opens Document Search from the top navigation', () => {
    render(<PosterApp />);

    selectWorkspace('Documents');

    expect(screen.getByRole('heading', { name: 'Document Search' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What do you want to find?' })).toBeTruthy();
    expect(screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    })).toBeTruthy();
    expect(window.location.search).toBe('?mode=documents');
    expect(screen.queryByRole('region', { name: 'Poster generation settings' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Tutorial video generator' })).toBeNull();
  });

  it('opens Daily English Practice from the top navigation', () => {
    render(<PosterApp />);

    selectWorkspace('Voice');
    expect(screen.getByRole('heading', { name: 'Daily English Practice' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '10 classic life scenarios' })).toBeTruthy();
    expect(window.location.search).toBe('?mode=english');
  });

  it('keeps all workspaces in a stable top-navigation order and links to Logo Studio', () => {
    render(<PosterApp />);

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(Array.from(navigation.children).map((item) => item.textContent)).toEqual([
      'Posters',
      'Videos',
      'Documents',
      'Logo',
      'Voice',
    ]);
    expect(within(navigation).getByRole('link', { name: 'Logo' }).getAttribute('href')).toBe('/logo');
  });

  it('renders Logo Studio as a light Niki creation page', () => {
    render(<PosterApp initialMode="logo" />);

    expect(screen.getByRole('heading', { name: 'Logo Studio' })).toBeTruthy();
    expect(screen.queryByText('Build a mark worth remembering.')).toBeNull();
    expect(screen.getByRole('region', { name: 'Brand brief' })).toBeTruthy();
    expect(document.querySelector('.poster-app')?.classList.contains('is-logo')).toBe(true);
  });

  it('keeps the page title separate from navigation controls', () => {
    render(<PosterApp />);

    const title = screen.getByRole('heading', { name: 'Generate loan posters' });
    expect(title.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('listbox', { name: 'Creation mode' })).toBeNull();
  });

  it('submits anti-fraud with the unchanged default controls', async () => {
    startDirectLoanPosterProjectMock.mockResolvedValue({ projectId: 'project-1' });
    render(<PosterApp />);

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
    expect(await screen.findByRole('dialog', { name: 'Account management' })).toBeTruthy();
  });

  it('shows a gallery placeholder immediately while restoring the server project', () => {
    resolveDirectLoanPosterProjectMock.mockReturnValue(new Promise(() => undefined));
    render(<PosterApp />);
    expect(screen.getByText('Loading recent posters…')).toBeTruthy();
  });

  it('does not show a generation status while restoring an existing project', async () => {
    render(<PosterApp />);
    await screen.findByRole('img', { name: 'biumoney-poster-20260804-001.png' });

    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
    expect(screen.queryByText('Ready to generate')).toBeNull();
    expect(screen.queryByText('Loading posters…')).toBeNull();
  });

  it('keeps an initial project restore failure silent', async () => {
    resolveDirectLoanPosterProjectMock.mockRejectedValue(new Error('Restore unavailable'));
    render(<PosterApp />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recent posters…')).toBeNull();
    });
    expect(screen.queryByText('Restore unavailable')).toBeNull();
    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
    expect(document.querySelector('.poster-app__notice')).toBeNull();
  });

  it('shows a one-line generation status only after clicking generate', async () => {
    startDirectLoanPosterProjectMock.mockResolvedValue({ projectId: 'project-1' });
    render(<PosterApp />);

    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Generate posters' }));

    const generationStatus = await screen.findByTestId('poster-app-generation-status');
    expect(within(generationStatus).getByText('Generating posters…')).toBeTruthy();
    expect(generationStatus.querySelector('.od-toast-message')).toBeTruthy();
    expect(generationStatus.querySelector('strong')).toBeNull();
    expect(generationStatus.querySelector('p')).toBeNull();
  });

  it('keeps a generation failure visible until the user dismisses it', async () => {
    startDirectLoanPosterProjectMock.mockRejectedValue(new Error('Provider unavailable'));
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate posters' }));
    const generationStatus = await screen.findByTestId('poster-app-generation-status');
    expect(within(generationStatus).getByText('Generation failed: Provider unavailable')).toBeTruthy();
    expect(generationStatus.className).toContain('od-toast--error');
    fireEvent.click(within(generationStatus).getByRole('button', { name: 'Close status' }));
    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
  });

  it('shows and automatically dismisses a successful generation after 3 seconds', async () => {
    const completedProject = {
      ...project,
      metadata: {
        kind: 'image' as const,
        directGeneration: {
          kind: 'loan-poster' as const,
          expectedOutputs: 1,
          status: 'complete' as const,
          activeBatchId: 'batch-current',
          batches: [{
            id: 'batch-current',
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
    startDirectLoanPosterProjectMock.mockImplementation(async (_options, onProjectCreated) => {
      onProjectCreated?.(completedProject);
      return { projectId: 'project-1' };
    });
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    render(<PosterApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate posters' }));
    const generationStatus = await screen.findByTestId('poster-app-generation-status');
    await within(generationStatus).findByText('1 poster generated');
    const autoDismissCall = setTimeoutSpy.mock.calls
      .filter(([, delay]) => delay === 3_000)
      .at(-1);
    expect(autoDismissCall).toBeTruthy();

    act(() => {
      if (typeof autoDismissCall?.[0] === 'function') autoDismissCall[0]();
    });

    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
  });

  it('does not restore an old asynchronous generation failure as a status', async () => {
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
    render(<PosterApp />);
    await screen.findByText('3:4 × 0');

    expect(screen.queryByText('Provider rejected the foreground request.')).toBeNull();
    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
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

    const latestTab = await screen.findByRole('tab', { name: /Latest batch/ });
    const historyTab = screen.getByRole('tab', { name: /History/ });
    expect(latestTab.getAttribute('aria-selected')).toBe('true');
    expect(historyTab.getAttribute('aria-selected')).toBe('false');
    expect(within(latestTab).getByText('1:1 × 1')).toBeTruthy();
    expect(within(historyTab).getByText('2')).toBeTruthy();

    const latestPanel = screen.getByRole('tabpanel', { name: /Latest batch/ });
    const newestImage = within(latestPanel).getByRole('img', {
      name: 'biumoney-poster-20260804-003.png',
    });
    expect(newestImage.getAttribute('loading')).toBe('eager');
    expect(newestImage.closest('button')?.className).toContain('is-square');
    expect(screen.queryByTestId('poster-app-generation-status')).toBeNull();
    expect(screen.queryByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    })).toBeNull();

    fireEvent.click(historyTab);
    expect(historyTab.getAttribute('aria-selected')).toBe('true');
    expect(latestTab.getAttribute('aria-selected')).toBe('false');

    const historyPanel = screen.getByRole('tabpanel', { name: /History/ });
    const olderImage = within(historyPanel).getByRole('img', {
      name: 'biumoney-poster-20260804-002.png',
    });
    expect(olderImage.getAttribute('loading')).toBe('lazy');
    expect(olderImage.closest('button')?.className).toContain('is-landscape');

    fireEvent.keyDown(historyTab, { key: 'ArrowLeft' });
    expect(latestTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(latestTab, { key: 'ArrowLeft' });
    expect(historyTab.getAttribute('aria-selected')).toBe('true');
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
