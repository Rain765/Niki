// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  copyOrShareImageBlobMock,
  resolveDirectLoanPosterProjectMock,
  saveImageBlobMock,
  startDirectLoanPosterProjectMock,
} = vi.hoisted(() => ({
  copyOrShareImageBlobMock: vi.fn(),
  resolveDirectLoanPosterProjectMock: vi.fn(),
  saveImageBlobMock: vi.fn(),
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
  copyOrShareImageBlob: copyOrShareImageBlobMock,
  fetchImageBlob: vi.fn(),
  saveImageBlob: saveImageBlobMock,
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
  copyOrShareImageBlobMock.mockResolvedValue('copied');
  saveImageBlobMock.mockResolvedValue('downloaded');
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
    fireEvent.click(screen.getByRole('button', { name: '复制图片' }));

    await waitFor(() => {
      expect(copyOrShareImageBlobMock).toHaveBeenCalledWith(
        '/api/projects/project-1/raw/biumoney-poster-20260804-001.png',
        'biumoney-poster-20260804-001.png',
        'image/png',
      );
    });
    expect(await screen.findByText('图片已复制')).toBeTruthy();
  });
});
