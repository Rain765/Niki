// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  copyOrSharePreparedImageFileMock,
  logoutMock,
  prepareImageFileMock,
  resolveDirectLoanPosterProjectMock,
  savePreparedImageFileMock,
  startDirectLoanPosterProjectMock,
} = vi.hoisted(() => ({
  copyOrSharePreparedImageFileMock: vi.fn(),
  logoutMock: vi.fn(),
  prepareImageFileMock: vi.fn(),
  resolveDirectLoanPosterProjectMock: vi.fn(),
  savePreparedImageFileMock: vi.fn(),
  startDirectLoanPosterProjectMock: vi.fn(),
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
  resolveDirectLoanPosterProjectMock.mockResolvedValue(project);
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

describe('PosterApp mobile-safe flow', () => {
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
