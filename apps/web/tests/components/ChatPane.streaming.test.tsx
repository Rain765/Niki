// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX } from '../../src/design-system-auto-prompt';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ streaming, message }: { streaming: boolean; message: ChatMessage }) => (
    <output data-testid={`assistant-streaming-${message.id}`}>{streaming ? 'streaming' : 'idle'}</output>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(({ streaming }: { streaming: boolean }, _ref) => (
    <output data-testid="composer-streaming">{streaming ? 'streaming' : 'idle'}</output>
  )),
}));

afterEach(() => {
  cleanup();
});

describe('ChatPane streaming state', () => {
  it('renders user turns with the chat bubble styling hook', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate a simple sign-in page',
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const bubble = screen.getByText('Generate a simple sign-in page');
    expect(bubble.classList.contains('user-bubble')).toBe(true);
    expect(bubble.closest('.msg.user')).not.toBeNull();
  });

  it('summarizes auto-sent design-system workspace prompts', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: `${DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX}
Use the files in this project as the design system source for future projects.
Expected output:
- A clear DESIGN.md with all generated rules.`,
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Creating design system workspace')).toBeTruthy();
    expect(screen.queryByText(DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: 'chat.copyPrompt' })).toBeNull();
  });

  it('keeps composer idle while active-run messages still render as streaming', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'still running',
        createdAt: 1,
        runId: 'run-1',
        runStatus: 'running',
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByTestId('composer-streaming').textContent).toBe('idle');
    expect(screen.getByTestId('assistant-streaming-assistant-1').textContent).toBe('streaming');
  });

  it('shows direct poster progress instead of unrelated image starter prompts', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[{
          name: 'zamloan-poster-01.png',
          size: 1024,
          mtime: 1,
          kind: 'image',
          mime: 'image/png',
        }]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 2,
            outputPrefix: 'zamloan-poster',
            status: 'queued',
            requestedAt: Date.now(),
          },
        }}
      />,
    );

    expect(screen.getByTestId('direct-poster-status').textContent).toContain('1/2');
    expect(
      screen.getByTestId('direct-poster-result-image-zamloan-poster-01.png')
        .getAttribute('src'),
    ).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-01.png?variant=preview&v=1',
    );
    expect(
      screen.getByTestId('direct-poster-result-image-zamloan-poster-01.png')
        .closest('picture')
        ?.querySelector('source[media="(max-width: 900px)"]')
        ?.getAttribute('srcset'),
    ).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-01.png?variant=mobile&v=1',
    );
    expect(screen.queryByText('Editorial portrait')).toBeNull();
    expect(screen.queryByText('Product hero')).toBeNull();
    expect(screen.queryByText('Flat illustration')).toBeNull();
    expect(screen.queryByTestId('conversation-history-trigger')).toBeNull();
  });

  it('keeps completed direct poster batches visible when the project has historical messages', () => {
    render(
      <ChatPane
        messages={[{
          id: 'historical-user-message',
          role: 'user',
          content: 'An older poster prompt',
          createdAt: 1,
        }]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[{
          name: 'biumoney-poster-20260803-011.png',
          size: 1024,
          mtime: 11,
          kind: 'image',
          mime: 'image/png',
        }]}
        projectFilesInitialized
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 1,
            outputPrefix: 'biumoney-poster',
            status: 'complete',
            activeBatchId: 'batch-5',
            batches: [{
              id: 'batch-5',
              status: 'complete',
              requestedAt: 1,
              completedAt: 2,
              expectedOutputs: 1,
              outputNames: ['biumoney-poster-20260803-011.png'],
            }],
          },
        }}
      />,
    );

    expect(screen.getByTestId('direct-poster-batch-batch-5').textContent)
      .toContain('已完成 1 张');
    expect(
      screen.getByTestId('direct-poster-result-image-biumoney-poster-20260803-011.png'),
    ).not.toBeNull();
    expect(screen.queryByText('An older poster prompt')).toBeNull();
  });

  it('shows the poster shape immediately while the project file list hydrates', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        projectFilesInitialized={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 1,
            outputPrefix: 'biumoney-poster',
            status: 'complete',
            activeBatchId: 'batch-6',
            batches: [{
              id: 'batch-6',
              status: 'complete',
              requestedAt: 1,
              completedAt: 2,
              expectedOutputs: 1,
              outputNames: ['biumoney-poster-20260803-012.png'],
              aspectRatio: '1:1',
            }],
          },
        }}
      />,
    );

    const skeleton = screen.getByTestId('direct-poster-hydration-skeleton-batch-6');
    expect(skeleton.classList.contains('is-square')).toBe(true);
    expect(screen.getByText('第 1 批 · 正在加载海报')).toBeTruthy();
  });

  it('keeps the poster skeleton visible while an active batch hydrates', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        projectFilesInitialized={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 3,
            outputPrefix: 'zamloan-poster',
            status: 'queued',
            activeBatchId: 'batch-active',
            requestedAt: Date.now(),
            batches: [{
              id: 'batch-active',
              status: 'queued',
              expectedOutputs: 3,
              requestedAt: Date.now(),
              outputNames: [],
              aspectRatio: '16:9',
            }],
          },
        }}
      />,
    );

    expect(screen.getByTestId('direct-poster-hydration-skeleton-batch-active')).toBeTruthy();
    expect(screen.queryByText('正在生成贷款海报')).toBeNull();
  });

  it('keeps an image skeleton visible until the preview loads and offers retry on failure', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[{
          name: 'biumoney-poster-20260803-012.png',
          size: 1024,
          mtime: 11,
          kind: 'image',
          mime: 'image/png',
        }]}
        projectFilesInitialized
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 1,
            outputPrefix: 'biumoney-poster',
            status: 'complete',
            activeBatchId: 'batch-6',
            batches: [{
              id: 'batch-6',
              status: 'complete',
              requestedAt: 1,
              completedAt: 2,
              expectedOutputs: 1,
              outputNames: ['biumoney-poster-20260803-012.png'],
              aspectRatio: '1:1',
            }],
          },
        }}
      />,
    );

    const image = screen.getByTestId(
      'direct-poster-result-image-biumoney-poster-20260803-012.png',
    );
    const skeleton = screen.getByTestId(
      'direct-poster-image-skeleton-biumoney-poster-20260803-012.png',
    );
    expect(skeleton.classList.contains('is-hidden')).toBe(false);
    expect(image.getAttribute('loading')).toBe('eager');
    expect(image.getAttribute('fetchpriority')).toBe('high');

    fireEvent.error(image);
    expect(screen.getByText('图片加载失败，点击重试')).toBeTruthy();
    fireEvent.click(screen.getByTestId('direct-poster-open-biumoney-poster-20260803-012.png'));
    expect(
      screen.getByTestId('direct-poster-result-image-biumoney-poster-20260803-012.png')
        .getAttribute('src'),
    ).toContain('&v=12');

    fireEvent.load(
      screen.getByTestId('direct-poster-result-image-biumoney-poster-20260803-012.png'),
    );
    expect(skeleton.classList.contains('is-hidden')).toBe(true);
  });

  it('shows a minimal centered loading state before the first direct poster arrives', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 1,
            outputPrefix: 'zamloan-poster',
            status: 'queued',
            requestedAt: Date.now(),
          },
        }}
      />,
    );

    const status = screen.getByTestId('direct-poster-status');
    expect(status.classList.contains('is-loading')).toBe(true);
    expect(status.textContent).toBe('正在生成贷款海报');
    expect(screen.queryByLabelText(/海报生成进度/)).toBeNull();
  });

  it('shows one selected poster with a vertical thumbnail switcher', () => {
    const onEditProjectImage = vi.fn();
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[
          {
            name: 'zamloan-poster-01.png',
            size: 1024,
            mtime: 1,
            kind: 'image',
            mime: 'image/png',
          },
          {
            name: 'zamloan-poster-02.png',
            size: 1024,
            mtime: 2,
            kind: 'image',
            mime: 'image/png',
          },
        ]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditProjectImage={onEditProjectImage}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 2,
            outputPrefix: 'zamloan-poster',
          },
        }}
      />,
    );

    expect(
      screen.getByTestId('direct-poster-result-image-zamloan-poster-01.png'),
    ).not.toBeNull();
    const selectedImage = screen.getByTestId(
      'direct-poster-result-image-zamloan-poster-01.png',
    );
    const result = selectedImage.closest('.direct-poster-result');
    expect(result?.querySelector('.direct-poster-result-overlay-actions')?.children)
      .toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }));
    expect(onEditProjectImage).toHaveBeenCalledWith('zamloan-poster-01.png');
    expect(screen.queryByLabelText(/海报生成进度/)).toBeNull();
    expect(
      screen.queryByTestId('direct-poster-result-image-zamloan-poster-02.png'),
    ).toBeNull();

    fireEvent.click(
      screen.getByTestId('direct-poster-thumbnail-zamloan-poster-02.png'),
    );

    const switchedImage = screen.getByTestId(
      'direct-poster-result-image-zamloan-poster-02.png',
    );
    expect(switchedImage).not.toBe(selectedImage);
    expect(switchedImage.getAttribute('src')).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-02.png?variant=preview&v=2',
    );
    expect(
      switchedImage.closest('picture')
        ?.querySelector('source[media="(max-width: 900px)"]')
        ?.getAttribute('srcset'),
    ).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-02.png?variant=mobile&v=2',
    );
    expect(
      screen.getByTestId('direct-poster-thumbnail-zamloan-poster-01.png')
        .getAttribute('src'),
    ).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-01.png?variant=thumbnail&v=1',
    );
    expect(
      screen.getByRole('button', { name: '查看第 2 张海报' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(
      screen.getByTestId('direct-poster-open-zamloan-poster-02.png'),
    );
    expect(screen.getByTestId('image-lightbox-image').getAttribute('src')).toBe(
      '/api/projects/project-1/image-preview/zamloan-poster-02.png?variant=preview&v=2',
    );
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.queryByText('designFiles.addToCanvas')).toBeNull();
    expect(screen.queryByText('common.rename')).toBeNull();
  });

  it('keeps each direct generation batch separate and appends the active loader last', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[
          {
            name: 'zamloan-poster-20260731-001.png',
            size: 1024,
            mtime: 1,
            kind: 'image',
            mime: 'image/png',
          },
          {
            name: 'zamloan-poster-20260731-002.png',
            size: 1024,
            mtime: 2,
            kind: 'image',
            mime: 'image/png',
          },
        ]}
        projectFilesInitialized
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 3,
            outputPrefix: 'zamloan-poster',
            status: 'queued',
            requestedAt: Date.now(),
            activeBatchId: 'batch-2',
            batches: [
              {
                id: 'batch-1',
                status: 'complete',
                requestedAt: Date.now() - 60_000,
                completedAt: Date.now() - 30_000,
                expectedOutputs: 2,
                outputNames: [
                  'zamloan-poster-20260731-001.png',
                  'zamloan-poster-20260731-002.png',
                ],
              },
              {
                id: 'batch-2',
                status: 'queued',
                requestedAt: Date.now(),
                expectedOutputs: 1,
                outputNames: ['zamloan-poster-20260731-003.png'],
              },
            ],
          },
        }}
      />,
    );

    const firstBatch = screen.getByTestId('direct-poster-batch-batch-1');
    const activeBatch = screen.getByTestId('direct-poster-batch-batch-2');
    expect(firstBatch.textContent).toContain('第 1 批');
    expect(firstBatch.textContent).toContain('已完成 2 张');
    expect(firstBatch.querySelectorAll('.direct-poster-thumbnails button')).toHaveLength(2);
    expect(activeBatch.textContent).toContain('第 2 批');
    expect(activeBatch.textContent).toContain('正在生成');
    expect(
      firstBatch.compareDocumentPosition(activeBatch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('surfaces an interrupted direct generation instead of spinning forever', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        projectFilesInitialized
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1-1"
        projectMetadata={{
          kind: 'image',
          directGeneration: {
            kind: 'loan-poster',
            expectedOutputs: 1,
            outputPrefix: 'zamloan-poster',
            status: 'queued',
            requestedAt: Date.now() - 16 * 60_000,
            queuedAt: Date.now() - 16 * 60_000,
          },
        }}
      />,
    );

    const status = screen.getByTestId('direct-poster-status');
    expect(status.classList.contains('is-failed')).toBe(true);
    expect(status.textContent).toContain('海报生成已中断');
    expect(status.textContent).toContain('请重新生成');
  });

  it('renders a stopped pinned todo after a terminal run without a final TodoWrite', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 1,
        startedAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                {
                  content: 'Build prototype',
                  status: 'in_progress',
                  activeForm: 'Building prototype',
                },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ],
      },
    ];

    const { container } = render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('0/2')).toBeTruthy();
    expect(container.querySelector('.todo-stopped')?.textContent).toContain('Build prototype');
    expect(container.querySelector('.todo-in_progress')).toBeNull();
    expect(container.querySelector('.op-todo-current')).toBeNull();
  });
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Conversation 1',
    createdAt: 1,
    updatedAt: 1,
  },
];

const projectMetadata: ProjectMetadata = {
  kind: 'prototype',
};
