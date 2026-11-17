// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { NativePresentationDownload } from '../../src/components/NativePresentationDownload';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['pptx','pdf'] as const)('renders the current entry and downloads a %s file rather than the source archive',async format=>{
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  URL.createObjectURL=vi.fn(()=> 'blob:export'); URL.revokeObjectURL=vi.fn();
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=> url.endsWith('/inspect')
    ? Response.json({id:'current',status:'completed'}) : new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'application/octet-stream'}}));
  vi.stubGlobal('fetch',fetcher);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationDownload projectId="batch" entry="final.html"/></I18nProvider>);
  fireEvent.click(screen.getByText(format==='pptx'?'下载 PPTX（图片版）':'下载 PDF'));
  await waitFor(()=>expect(click).toHaveBeenCalled());
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({entry:'final.html'});
  expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({inspectionId:'current',format});
  expect(fetcher.mock.calls.some(([url])=>url.includes('/archive'))).toBe(false);
});
it('reports incomplete or changed final renders without downloading a stale file',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/inspect')?Response.json({id:'current',status:'completed'}):Response.json({error:'Presentation changed'},{status:409})));
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationDownload projectId="batch" entry="final.html"/></I18nProvider>);
  fireEvent.click(screen.getByText('下载 PDF'));
  expect((await screen.findByRole('alert')).textContent).toContain('Presentation changed');
});
