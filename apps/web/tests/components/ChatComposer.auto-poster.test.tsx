// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { uploadProjectFiles } from '../../src/providers/registry';
import { patchProject } from '../../src/state/projects';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(async () => []),
    uploadProjectFiles: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listPlugins: vi.fn(async () => []),
    patchProject: vi.fn(),
  };
});

vi.mock('../../src/state/mcp', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/mcp')>(
    '../../src/state/mcp',
  );
  return {
    ...actual,
    fetchMcpServers: vi.fn(async () => ({ servers: [], templates: [] })),
  };
});

const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);
const mockedPatchProject = vi.mocked(patchProject);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/brand/zambia-support/z-reference.png') {
      return new Response(new Blob(['z-reference'], { type: 'image/png' }), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  mockedUploadProjectFiles.mockResolvedValue({
    uploaded: [{
      path: '.od-inputs/loan-poster-z-reference.png',
      name: 'loan-poster-z-reference.png',
      kind: 'image',
      size: 11,
    }],
    failed: [],
  });
  mockedPatchProject.mockResolvedValue({
    id: 'project-1',
    skillId: 'loan-poster-skill-v1.1',
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatComposer automatic poster controls', () => {
  it('keeps resources and uploads inside the send-button menu', () => {
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('chat-attach')).toBeNull();
    fireEvent.click(screen.getByTestId('chat-send-menu'));

    expect(screen.getByTestId('chat-resource-picker')).toBeTruthy();
    expect(screen.getByTestId('chat-attach')).toBeTruthy();

    fireEvent.click(screen.getByTestId('chat-resource-picker'));
    expect(screen.getByRole('tab', { name: 'Plugins' })).toBeTruthy();
  });

  it('renders the running stop action as a square icon-only button', () => {
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop.classList.contains('stop')).toBe(true);
    expect(stop.textContent).toBe('');
    expect(stop.querySelector('.composer-stop-glyph')).toBeTruthy();
  });

  it('sends the selected batch, aspect ratio, and brand without requiring a draft', async () => {
    const onSend = vi.fn();
    const onProjectSkillChange = vi.fn();

    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        onProjectSkillChange={onProjectSkillChange}
      />,
    );

    fireEvent.change(screen.getByTestId('chat-auto-poster-count'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-size'), {
      target: { value: '1:1' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-brand'), {
      target: { value: 'biumoney' },
    });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    expect(mockedUploadProjectFiles).toHaveBeenCalledWith(
      'project-1',
      [expect.objectContaining({ name: 'loan-poster-z-reference.png' })],
      { visibility: 'internal' },
    );
    expect(mockedPatchProject).toHaveBeenCalledWith(
      'project-1',
      { skillId: 'loan-poster-skill-v1.1' },
    );
    expect(onProjectSkillChange).toHaveBeenCalledWith('loan-poster-skill-v1.1');

    const [prompt, attachments, commentAttachments, meta] = onSend.mock.calls[0]!;
    expect(prompt).toContain('Generate exactly 10 BiuMoney Zambia loan posters now.');
    expect(prompt).toContain('- format: `1:1` (1:1 square)');
    expect(prompt).toContain('`biumoney-poster-01.png` through `biumoney-poster-10.png`');
    expect(attachments).toEqual([
      expect.objectContaining({
        path: '.od-inputs/loan-poster-z-reference.png',
        kind: 'image',
      }),
    ]);
    expect(commentAttachments).toEqual([]);
    expect(meta).toEqual({
      skillIds: ['loan-poster-skill-v1.1'],
      context: { skillIds: ['loan-poster-skill-v1.1'] },
    });
  });

  it('previews and submits a prompt rebuilt from the latest selector values', async () => {
    let resolveUpload!: (value: Awaited<ReturnType<typeof uploadProjectFiles>>) => void;
    mockedUploadProjectFiles.mockReturnValueOnce(new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    const onSend = vi.fn();

    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('chat-auto-poster-count'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-size'), {
      target: { value: '1:1' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-brand'), {
      target: { value: 'biumoney' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-size'), {
      target: { value: '16:9' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-brand'), {
      target: { value: 'zamloan' },
    });
    fireEvent.click(screen.getByTestId('chat-send'));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('Generate exactly 3 Zamloan Zambia loan posters now.');
    });
    expect(textarea.value).toContain('- format: `16:9` (16:9 landscape)');
    expect(onSend).not.toHaveBeenCalled();

    resolveUpload({
      uploaded: [{
        path: '.od-inputs/loan-poster-z-reference.png',
        name: 'loan-poster-z-reference.png',
        kind: 'image',
        size: 11,
      }],
      failed: [],
    });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const [prompt] = onSend.mock.calls[0]!;
    expect(prompt).toContain('Generate exactly 3 Zamloan Zambia loan posters now.');
    expect(prompt).toContain('- format: `16:9` (16:9 landscape)');
    expect(prompt).not.toContain('BiuMoney');
    expect(textarea.value).toBe('');
  });
});
