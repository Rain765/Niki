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
        currentSkillId="loan-poster-skill-v1.1"
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
    ).toBe('/api/projects/project-1/raw/zamloan-poster-01.png?v=1');
    expect(screen.queryByText('Editorial portrait')).toBeNull();
    expect(screen.queryByText('Product hero')).toBeNull();
    expect(screen.queryByText('Flat illustration')).toBeNull();
    expect(screen.queryByTestId('conversation-history-trigger')).toBeNull();
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
        currentSkillId="loan-poster-skill-v1.1"
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
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        currentSkillId="loan-poster-skill-v1.1"
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
    const info = result?.querySelector('.direct-poster-result-info');
    expect(info).toBeTruthy();
    expect(
      selectedImage.compareDocumentPosition(info as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(info?.firstElementChild?.textContent).toBe('zamloan-poster-01.png');
    expect(info?.querySelector('.direct-poster-result-actions')?.children).toHaveLength(3);
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
      '/api/projects/project-1/raw/zamloan-poster-02.png?v=2',
    );
    expect(
      screen.getByRole('button', { name: '查看第 2 张海报' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByText('designFiles.addToCanvas')).toBeNull();
    expect(screen.queryByText('common.rename')).toBeNull();
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
