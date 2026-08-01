// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
} from '../../src/state/projects';
import {
  fetchPreviewComments,
  fetchProjectFiles,
} from '../../src/providers/registry';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: ({
    openRequest,
  }: {
    openRequest: { name: string; nonce: number } | null;
  }) => (
    <div
      data-testid="file-workspace"
      data-open-request={openRequest?.name ?? ''}
    />
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ initialDraft }: { initialDraft?: string }) => (
    <textarea
      data-testid="chat-composer-input"
      readOnly
      value={initialDraft ?? ''}
    />
  ),
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project = (id: string, pendingPrompt?: string): Project => ({
  id,
  name: `Project ${id}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  ...(pendingPrompt ? { pendingPrompt } : {}),
});

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

function renderProjectView(
  currentProject: Project,
  onClearPendingPrompt = vi.fn(),
) {
  return render(
    <ProjectView
      project={currentProject}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={onClearPendingPrompt}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

describe('ProjectView pending prompt seeding', () => {
  beforeEach(() => {
    mockedListConversations.mockImplementation(async (projectId) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('prefills chat once when the project has a pending prompt and requests persistence clear', async () => {
    const onClearPendingPrompt = vi.fn();
    renderProjectView(project('with-prompt', 'Use this prompt'), onClearPendingPrompt);

    await waitFor(() => {
      expect(composerValue()).toBe('Use this prompt');
    });
    expect(onClearPendingPrompt).toHaveBeenCalledTimes(1);
  });

  it('does not prefill when re-entering a project after the pending prompt was cleared', async () => {
    renderProjectView(project('cleared'));

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });

  it('clears but never displays legacy direct-poster execution prompts', async () => {
    const onClearPendingPrompt = vi.fn();
    renderProjectView({
      ...project('direct-poster', 'Internal media execution instructions'),
      skillId: 'loan-poster-skill-v1-1',
      metadata: { kind: 'image' },
    }, onClearPendingPrompt);

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
    expect(onClearPendingPrompt).toHaveBeenCalledTimes(1);
  });

  it('starts direct-poster projects with the design workspace collapsed', async () => {
    const view = renderProjectView({
      ...project('direct-poster-collapsed'),
      skillId: 'loan-poster-skill-v1-1',
      metadata: { kind: 'image' },
    });

    await waitFor(() => {
      expect(view.container.querySelector('.split')?.className).toContain(
        'split-workspace-collapsed',
      );
    });
    expect(view.container.querySelector('.app')?.className).toContain(
      'app--direct-poster',
    );
    expect(screen.getByTestId('project-surface-switch').closest('header')?.className)
      .toContain('direct-poster-topbar');

    fireEvent.click(screen.getByTestId('project-mobile-design-files-toggle'));

    expect(view.container.querySelector('.split')?.className).not.toContain(
      'split-workspace-collapsed',
    );
    expect(screen.getByTestId('project-mobile-design-files-toggle')
      .getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByTestId('project-chat-surface-tab'));

    expect(view.container.querySelector('.split')?.className).toContain(
      'split-workspace-collapsed',
    );
    expect(screen.getByTestId('project-chat-surface-tab')
      .getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the secondary file workspace tucked when a poster is shown in chat', async () => {
    mockedFetchProjectFiles.mockResolvedValue([{
      name: 'zamloan-poster-01.png',
      size: 1_913_840,
      mtime: 2,
      kind: 'image',
      mime: 'image/png',
    }]);

    const view = renderProjectView({
      ...project('direct-poster-with-output'),
      skillId: 'loan-poster-skill-v1-1',
      metadata: {
        kind: 'image',
        directGeneration: {
          kind: 'loan-poster',
          expectedOutputs: 1,
          outputPrefix: 'zamloan-poster',
        },
      },
    });

    await waitFor(() => {
      expect(view.container.querySelector('.split')?.className).toContain(
        'split-workspace-collapsed',
      );
    });
    expect(screen.getByTestId('file-workspace').dataset.openRequest).toBe('');
  });

  it('does not leak a prior project prompt into a template project without one', async () => {
    const first = project('source', 'Old seed');
    const second = {
      ...project('template'),
      metadata: { kind: 'template' as const, templateId: 'tmpl-1' },
    };
    const view = renderProjectView(first);

    await waitFor(() => {
      expect(composerValue()).toBe('Old seed');
    });

    view.rerender(
      <ProjectView
        project={second}
        routeFileName={null}
        config={config}
        agents={[]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });
});

function composerValue(): string {
  return (screen.getByTestId('chat-composer-input') as HTMLTextAreaElement)
    .value;
}
