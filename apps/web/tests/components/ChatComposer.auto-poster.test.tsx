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
    if (url === '/brand/zambia-support/zamloan-logo.svg') {
      return new Response(new Blob(['zamloan-logo'], { type: 'image/svg+xml' }), {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
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
    skillId: 'loan-poster-skill-v1-1',
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

    expect(
      screen.getByTestId('chat-send-menu-panel').parentElement?.classList.contains(
        'composer-add__portal',
      ),
    ).toBe(true);
    expect(screen.getByTestId('chat-resource-picker')).toBeTruthy();
    expect(screen.getByTestId('chat-attach')).toBeTruthy();

    fireEvent.click(screen.getByTestId('chat-resource-picker'));
    expect(screen.getByRole('tab', { name: 'Plugins' })).toBeTruthy();
  });

  it('places the single manage-pets action directly in the context section', () => {
    const onOpenPetSettings = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onAdoptPet={vi.fn()}
        onTogglePet={vi.fn()}
        onOpenPetSettings={onOpenPetSettings}
      />,
    );

    fireEvent.click(screen.getByTestId('chat-send-menu'));

    const managePets = screen.getByTestId('chat-manage-pets');
    expect(
      managePets.closest('.composer-add__section')
        ?.querySelector('.composer-add__section-label')
        ?.textContent,
    ).toBe('Context surfaces');
    expect(screen.getAllByText('Manage Pets')).toHaveLength(1);

    fireEvent.click(managePets);
    expect(onOpenPetSettings).toHaveBeenCalledOnce();
  });

  it('opens product settings from a product tag outside the composer overflow boundary', () => {
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

    fireEvent.click(screen.getByTestId('chat-auto-poster-product-zamloan'));

    expect(
      screen.getByTestId('chat-auto-poster-menu').parentElement?.classList.contains(
        'auto-poster-filter__portal',
      ),
    ).toBe(true);
    expect(screen.getByTestId('chat-auto-poster-size-option-1:1')).toBeTruthy();
    expect(screen.getByTestId('chat-auto-poster-count-option-2')).toBeTruthy();
  });

  it('places product tags above the capsule composer', () => {
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

    const controls = screen.getByTestId('chat-auto-poster-controls');
    const shell = screen.getByTestId('chat-composer').querySelector('.composer-shell');

    expect(controls.nextElementSibling).toBe(shell);
    expect(shell?.classList.contains('composer-shell--capsule')).toBe(true);
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe(
      'Choose product, ratio, and quantity. Generate in one click',
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('40px');
  });

  it('matches the mobile home composer with inline settings and one-click generation', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 680px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
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

    const composer = screen.getByTestId('chat-composer');
    fireEvent.click(screen.getByTestId('chat-auto-poster-product-zamloan'));

    const menu = screen.getByTestId('chat-auto-poster-menu');
    expect(composer.contains(menu)).toBe(true);
    expect(menu.closest('.auto-poster-filter__portal')).toBeNull();
    expect(composer.classList.contains('is-settings-open')).toBe(true);

    fireEvent.click(screen.getByTestId('chat-auto-poster-generate'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('chat-auto-poster-menu')).toBeNull();
    expect(composer.classList.contains('is-settings-open')).toBe(false);
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

    fireEvent.change(screen.getByTestId('chat-auto-poster-brand'), {
      target: { value: 'biumoney' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-count'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-size'), {
      target: { value: '1:1' },
    });
    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    expect(mockedUploadProjectFiles).not.toHaveBeenCalled();
    expect(mockedPatchProject).toHaveBeenCalledWith(
      'project-1',
      { skillId: 'loan-poster-skill-v1-1' },
    );
    expect(onProjectSkillChange).toHaveBeenCalledWith('loan-poster-skill-v1-1');

    const [prompt, attachments, commentAttachments, meta] = onSend.mock.calls[0]!;
    expect(prompt).toContain('Generate exactly 10 BiuMoney Zambia loan posters now.');
    expect(prompt).toContain('- format: `1:1` (1:1 square)');
    expect(prompt).toContain('`biumoney-poster-01.png` through `biumoney-poster-10.png`');
    expect(attachments).toEqual([]);
    expect(commentAttachments).toEqual([]);
    expect(meta).toEqual({
      skillIds: ['loan-poster-skill-v1-1'],
      context: { skillIds: ['loan-poster-skill-v1-1'] },
    });
  });

  it('shows preparation feedback without dumping the generated prompt into the textarea', async () => {
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
    fireEvent.click(screen.getByTestId('chat-send'));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(screen.getByTestId('chat-auto-poster-status').textContent).toContain(
        'Generating 3 posters',
      );
    });
    expect(textarea.value).toBe('');
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
    expect(prompt).toContain('- format: `1:1` (1:1 square)');
    expect(prompt).not.toContain('BiuMoney');
    expect(textarea.value).toBe('');
    expect(screen.queryByTestId('chat-auto-poster-status')).toBeNull();
  });

  it('keeps one-click generation available without typed content', () => {
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

    const send = screen.getByTestId('chat-send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(send.dataset.action).toBe('generate');

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Create a campaign poster' },
    });
    expect(send.disabled).toBe(false);
    expect(send.dataset.action).toBe('send');
  });

  it('remembers count and aspect settings independently for each product', () => {
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

    fireEvent.change(screen.getByTestId('chat-auto-poster-count'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('chat-auto-poster-size'), {
      target: { value: '1:1' },
    });

    fireEvent.click(screen.getByTestId('chat-auto-poster-product-biumoney'));
    expect((screen.getByTestId('chat-auto-poster-count') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByTestId('chat-auto-poster-size') as HTMLSelectElement).value).toBe('16:9');

    fireEvent.change(screen.getByTestId('chat-auto-poster-count'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByTestId('chat-auto-poster-product-zamloan'));

    expect((screen.getByTestId('chat-auto-poster-count') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByTestId('chat-auto-poster-size') as HTMLSelectElement).value).toBe('1:1');
  });
});

// Deck creation must never fall through to the poster generator on an empty send.
it('keeps deck conversations free of poster controls and empty generation actions', () => {
  const onSend = vi.fn();
  render(<ChatComposer projectId="deck-1" projectMetadata={{ kind: 'deck' }} projectFiles={[]} streaming={false} onEnsureProject={async () => 'deck-1'} onSend={onSend} onStop={vi.fn()} />);
  expect(screen.queryByTestId('chat-auto-poster-product-biumoney')).toBeNull();
  const send = screen.getByTestId('chat-send') as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.click(send);
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Refine slide 2' } });
  expect(send.disabled).toBe(false);
  expect(send.dataset.action).toBe('send');
});
