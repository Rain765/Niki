// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  copyOrSharePreparedImageFileMock,
  prepareImageFileMock,
  resolveDirectLoanPosterProjectMock,
  savePreparedImageFileMock,
  startDirectLoanPosterProjectMock,
} = vi.hoisted(() => ({
  copyOrSharePreparedImageFileMock: vi.fn(),
  prepareImageFileMock: vi.fn(),
  resolveDirectLoanPosterProjectMock: vi.fn(),
  savePreparedImageFileMock: vi.fn(),
  startDirectLoanPosterProjectMock: vi.fn(),
}));

vi.mock('../../src/auth/NikiAuth', () => ({
  useNikiAuth: () => ({
    user: { id: 'user-1', name: 'Tester' },
    logout: vi.fn(),
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
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PosterApp mobile-safe flow', () => {
  it('shows a gallery placeholder immediately while restoring the server project', () => {
    resolveDirectLoanPosterProjectMock.mockReturnValue(new Promise(() => undefined));
    render(<PosterApp />);
    expect(screen.getByText('正在读取最近海报…')).toBeTruthy();
  });

  it('restores the server image and shows copy confirmation above the preview', async () => {
    render(<PosterApp />);
    const poster = await screen.findByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    });
    fireEvent.click(poster.closest('button')!);
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '复制图片' }) as HTMLButtonElement).disabled)
        .toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: '复制图片' }));

    await waitFor(() => {
      expect(copyOrSharePreparedImageFileMock).toHaveBeenCalledWith(expect.any(File));
    });
    expect(await screen.findByText('图片已复制')).toBeTruthy();
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

    const preparingButton = screen.getByRole('button', { name: '正在准备原图…' });
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

    const saveButton = await screen.findByRole('button', { name: '保存图片' });
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

    const latestRegion = await screen.findByRole('region', { name: '本次生成' });
    const newestImage = within(latestRegion).getByRole('img', {
      name: 'biumoney-poster-20260804-003.png',
    });
    expect(newestImage.getAttribute('loading')).toBe('eager');
    expect(newestImage.closest('button')?.className).toContain('is-square');
    expect(screen.getByText('本批已生成 1 张海报')).toBeTruthy();
    expect(screen.queryByRole('img', {
      name: 'biumoney-poster-20260804-001.png',
    })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '历史海报（2 张）' }));

    const historyRegion = screen.getByRole('region', { name: '历史海报' });
    const olderImage = within(historyRegion).getByRole('img', {
      name: 'biumoney-poster-20260804-002.png',
    });
    expect(olderImage.getAttribute('loading')).toBe('lazy');
    expect(olderImage.closest('button')?.className).toContain('is-landscape');
  });
});
