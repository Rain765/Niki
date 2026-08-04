// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyOrShareImageBlob,
  saveImageBlob,
  savePreparedImageFile,
} from '../../src/lib/image-file-actions';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mobile image file actions', () => {
  it('shares an already prepared file without fetching after the mobile browser click', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error('the click handler must not fetch');
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      canShare: () => true,
      share,
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['png'], 'poster.png', { type: 'image/png' });

    await expect(savePreparedImageFile(file)).resolves.toBe('shared');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'poster.png' });
  });

  it('uses the native file share sheet to save inside a mobile Feishu webview', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone) Mobile Lark/7.0',
      maxTouchPoints: 5,
      canShare: () => true,
      share,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob(['png'], { type: 'image/png' }),
      { status: 200, headers: { 'Content-Type': 'image/png' } },
    )));

    await expect(saveImageBlob('/poster.png', 'poster.png')).resolves.toBe('shared');
    const sharedFile = (share.mock.calls[0]?.[0] as ShareData).files?.[0];
    expect(sharedFile).toBeInstanceOf(File);
    expect(sharedFile?.name).toBe('poster.png');
    expect(sharedFile?.type).toBe('image/png');
  });

  it('falls back to sharing the actual image file when image clipboard is unavailable', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined);
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone) Mobile Lark/7.0',
      maxTouchPoints: 5,
      clipboard: undefined,
      canShare: () => true,
      share,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob(['png'], { type: 'image/png' }),
      { status: 200, headers: { 'Content-Type': 'image/png' } },
    )));

    await expect(copyOrShareImageBlob('/poster.png', 'poster.png')).resolves.toBe('shared');
    const sharedFile = (share.mock.calls[0]?.[0] as ShareData).files?.[0];
    expect(sharedFile).toBeInstanceOf(File);
    expect(sharedFile?.name).toBe('poster.png');
    expect(sharedFile?.type).toBe('image/png');
  });
});

describe('desktop image file actions', () => {
  it('keeps the direct browser download for an already prepared file', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:poster');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.0.0',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const file = new File(['png'], 'poster.png', { type: 'image/png' });

    await expect(savePreparedImageFile(file)).resolves.toBe('downloaded');

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
  });
});
