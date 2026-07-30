// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GlobalDesignFilesView } from '../../src/components/GlobalDesignFilesView';
import { I18nProvider } from '../../src/i18n';
import type { Project } from '../../src/types';

const { deleteProjectFileMock, fetchProjectFilesMock } = vi.hoisted(() => ({
  deleteProjectFileMock: vi.fn(),
  fetchProjectFilesMock: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => ({
  deleteProjectFile: deleteProjectFileMock,
  fetchProjectFiles: fetchProjectFilesMock,
  projectFileDownloadUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/raw/${fileName}?download=1`,
  projectRawUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/raw/${fileName}`,
}));

describe('GlobalDesignFilesView', () => {
  afterEach(() => {
    fetchProjectFilesMock.mockReset();
    deleteProjectFileMock.mockReset();
    cleanup();
  });

  it('shows generated images as a compact cross-project list', async () => {
    fetchProjectFilesMock.mockResolvedValue([
      {
        name: 'zamloan-poster-01.png',
        size: 2 * 1024 * 1024,
        mtime: Date.UTC(2026, 6, 27, 10, 0),
        kind: 'image',
        mime: 'image/png',
      },
    ]);
    const project = {
      id: 'project-1',
      name: 'Zamloan 贷款海报 2026-07-27',
      updatedAt: Date.UTC(2026, 6, 27, 10, 0),
    } as Project;
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <GlobalDesignFilesView projects={[project]} />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('global-design-files-list')).toBeTruthy();
    });
    expect(container.querySelector('.global-design-files__grid')).toBeNull();
    expect(screen.getByLabelText('#001')).toBeTruthy();
    expect(screen.getByText('zamloan-poster-01.png')).toBeTruthy();
    expect(screen.getByText(project.name)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'zamloan-poster-01.png' }));
    expect(screen.getByRole('dialog', {
      name: /预览 zamloan-poster-01\.png/i,
    })).toBeTruthy();
    expect(screen.getByTestId('global-design-files-preview-image').getAttribute('src'))
      .toContain('/api/projects/project-1/raw/zamloan-poster-01.png');
    expect(screen.getAllByRole('link', { name: /下载 zamloan-poster-01\.png/i }))
      .toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /复制 zamloan-poster-01\.png/i }))
      .toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /删除 zamloan-poster-01\.png/i }))
      .toHaveLength(2);

    expect(screen.getAllByRole('link', { name: /下载 zamloan-poster-01\.png/i })[0]!
      .getAttribute('href'))
      .toBe('/api/projects/project-1/raw/zamloan-poster-01.png?download=1');

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('deletes an image after confirmation and removes the row', async () => {
    fetchProjectFilesMock.mockResolvedValue([{
      name: 'zamloan-poster-01.png',
      size: 1024,
      mtime: Date.UTC(2026, 6, 27, 10, 0),
      kind: 'image',
      mime: 'image/png',
    }]);
    deleteProjectFileMock.mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <I18nProvider initial="zh-CN">
        <GlobalDesignFilesView
          projects={[{
            id: 'project-1',
            name: 'Zamloan 贷款海报 2026-07-27',
            updatedAt: Date.UTC(2026, 6, 27, 10, 0),
          } as Project]}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /删除 zamloan-poster-01\.png/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /删除 zamloan-poster-01\.png/i }));

    await waitFor(() => {
      expect(deleteProjectFileMock).toHaveBeenCalledWith(
        'project-1',
        'zamloan-poster-01.png',
      );
      expect(screen.queryByText('zamloan-poster-01.png')).toBeNull();
    });
  });
});
