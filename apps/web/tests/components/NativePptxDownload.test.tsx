// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { NativePptxDownload } from '../../src/components/NativePptxDownload';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:fixture'; }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
const file = '/api/projects/p/native-presentation/pptx/file/hash';
const ready = { id: 'job', status: 'ready', pages: 18, downloadUrl: file, warnings: [] };
const download = () => new Response('PK-fixture', { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } });
const view = (autoDownload: boolean, revision = '1') => <I18nProvider defaultLocale="zh-CN"><NativePptxDownload projectId="p" entry="index.html" revision={revision} disabled={false} autoDownload={autoDownload}/></I18nProvider>;

it('exports historical decks only on request and invalidates the download when the version changes', async () => {
  const fetcher = vi.fn(async (url: string) => url === file ? download() : Response.json(ready));
  vi.stubGlobal('fetch', fetcher);
  const { rerender } = render(view(false));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '下载 .pptx' }));
  expect((await screen.findByRole('link', { name: '下载 .pptx' })).getAttribute('href')).toBe(file);
  rerender(view(false, '2'));
  expect(screen.queryByRole('link', { name: '下载 .pptx' })).toBeNull();
  expect(screen.getByRole('button', { name: '下载 .pptx' })).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/pptx'))).toHaveLength(1);
});

it('attempts one download for a freshly generated deck and leaves the manual link available', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === file ? download() : Response.json(ready)));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { rerender } = render(view(true));
  await screen.findByRole('link', { name: '下载 .pptx' });
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  rerender(view(true, '2'));
  expect(click).toHaveBeenCalledTimes(1);
});

it('keeps the user on the preview and offers retry if the source changes before download', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === file
    ? Response.json({ error: '文稿已更新，请重新导出' }, { status: 409 })
    : Response.json(ready)));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  render(view(false));
  fireEvent.click(screen.getByRole('button', { name: '下载 .pptx' }));
  expect((await screen.findByRole('alert')).textContent).toBe('文稿已更新，请重新导出');
  expect(screen.getByRole('button', { name: '重试导出' })).toBeTruthy();
});
