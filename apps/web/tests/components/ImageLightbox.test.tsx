// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageLightbox } from '../../src/components/ImageLightbox';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (
    key: string,
    vars?: Record<string, string | number>,
  ) => vars?.name ? `${key} ${vars.name}` : key,
}));

const images: ProjectFile[] = [
  {
    name: 'poster-01.png',
    path: 'poster-01.png',
    size: 1024,
    mtime: 1,
    kind: 'image',
    mime: 'image/png',
  },
  {
    name: 'poster-02.png',
    path: 'poster-02.png',
    size: 2048,
    mtime: 2,
    kind: 'image',
    mime: 'image/png',
  },
];

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('ClipboardItem', class TestClipboardItem {
    constructor(public readonly data: Record<string, Blob>) {}
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: vi.fn(async () => undefined),
      writeText: vi.fn(async () => undefined),
    },
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ImageLightbox', () => {
  it('shows the original image with download, share, preview, and delete actions', () => {
    render(
      <ImageLightbox
        projectId="project-1"
        images={images}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn(async () => true)}
      />,
    );

    const dialog = screen.getByTestId('image-lightbox');
    expect(within(dialog).getByText('1 / 2')).toBeTruthy();
    expect(screen.getByTestId('image-lightbox-image').getAttribute('src')).toBe(
      '/api/projects/project-1/image-preview/poster-01.png?variant=preview&v=1',
    );
    expect(within(dialog).getByTestId('image-lightbox-footer-download').tagName).toBe('BUTTON');
    expect(within(dialog).getByRole('button', { name: 'common.share' })).toBeTruthy();
    expect(within(dialog).getByTestId('image-lightbox-footer-download')).toBeTruthy();
    expect(within(dialog).getByTestId('image-lightbox-footer-copy')).toBeTruthy();
    expect(within(dialog).getByTestId('image-lightbox-footer-preview')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'common.edit' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'designFiles.delete' })).toBeTruthy();
    expect(within(dialog).getByTestId('image-lightbox-image-skeleton')).toBeTruthy();
  });

  it('keeps a mobile preview placeholder until the image load event', () => {
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const image = screen.getByTestId('image-lightbox-image');
    const skeleton = screen.getByTestId('image-lightbox-image-skeleton');
    expect(image.getAttribute('src')).toContain('/image-preview/poster-01.png');
    expect(skeleton.classList.contains('is-hidden')).toBe(false);

    fireEvent.load(image);
    expect(skeleton.classList.contains('is-hidden')).toBe(true);
  });

  it('copies the image blob instead of the image link', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('image-lightbox-footer-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/poster-01.png',
      { credentials: 'include' },
    );
    expect(screen.getByText('imageViewer.imageCopied')).toBeTruthy();
  });

  it('downloads a blob without navigating to the raw image viewer', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('image-lightbox-footer-download'));

    await waitFor(() => expect(screen.getByText('imageViewer.downloadStarted')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/poster-01.png',
      { credentials: 'include' },
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('navigates images, zooms, traps focus, and restores the trigger focus on close', () => {
    const onActiveNameChange = vi.fn();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <ImageLightbox
        projectId="project-1"
        images={images}
        activeName="poster-01.png"
        onActiveNameChange={onActiveNameChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('image-lightbox-next'));
    expect(onActiveNameChange).toHaveBeenCalledWith('poster-02.png');

    fireEvent.doubleClick(screen.getByTestId('image-lightbox-image').parentElement!);
    expect(screen.getByTestId('image-lightbox-image').getAttribute('style')).toContain('scale(2)');

    const close = screen.getByRole('button', { name: 'common.close' });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('image-lightbox-footer-preview'));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('falls back to copying the image link when system share is unavailable', async () => {
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.share' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://localhost:3000/api/projects/project-1/raw/poster-01.png',
      );
    });
    expect(screen.getByText('imageViewer.linkCopied')).toBeTruthy();
  });

  it('keeps sharing usable when clipboard and native share are unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error('blocked'); }) },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });

    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.share' }));

    await waitFor(() => {
      expect(screen.getByTestId('image-lightbox-share-fallback')).toBeTruthy();
    });
    expect(screen.getByTestId('image-lightbox-share-url').getAttribute('value')).toContain(
      '/api/projects/project-1/raw/poster-01.png',
    );
  });

  it('previews the active image in a read-only social post mock', () => {
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('image-lightbox-footer-preview'));

    const feed = screen.getByTestId('image-post-preview-feed');
    expect(within(feed).getByRole('img', { name: 'poster-01.png' }).getAttribute('src')).toBe(
      '/api/projects/project-1/image-preview/poster-01.png?variant=preview&v=1',
    );
    expect(screen.getByTestId('image-lightbox')).toBeTruthy();
  });

  it('confirms deletion and closes after the file is removed', async () => {
    const onDelete = vi.fn(async () => true);
    const onClose = vi.fn();
    render(
      <ImageLightbox
        projectId="project-1"
        images={images.slice(0, 1)}
        activeName="poster-01.png"
        onActiveNameChange={vi.fn()}
        onClose={onClose}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'designFiles.delete' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('poster-01.png'));
    expect(window.confirm).toHaveBeenCalledWith(
      'workspace.deleteFileConfirm poster-01.png',
    );
    expect(onClose).toHaveBeenCalled();
  });
});
