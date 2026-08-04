// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyOrShareImageBlob,
  saveImageBlob,
} from '../../src/lib/image-file-actions';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mobile image file actions', () => {
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
