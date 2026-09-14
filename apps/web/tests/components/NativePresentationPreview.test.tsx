// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePresentationPreview } from '../../src/components/NativePresentationPreview';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/providers/registry', () => ({ projectFileUrl: (id:string,name:string)=>`/api/projects/${id}/files/${name}` }));
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
it('exposes the same local inspection API and actual screenshots without claiming visual acceptance', async()=>{
 const fetchMock=vi.fn().mockResolvedValue(Response.json({id:"r1",projectId:"p1",status:"completed",report:{version:1,entry:'index.html',sourceHash:'abc',stale:false,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/r/report.json',blockedResources:[],slides:[{page:1,text:'Title',screenshot:'native-review/r/page-01.png',issues:[{kind:'dim-text',text:'Title'}]}]}}));
 vi.stubGlobal('fetch',fetchMock);
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationPreview projectId="p1" name="index.html"/></I18nProvider>);
 fireEvent.click(screen.getByRole('button',{name:'检查文稿'}));
 expect((await screen.findByRole('status')).textContent).toContain('1 项待核对');
 expect(screen.getByRole('link',{name:'第 1 页 ↗'}).getAttribute('href')).toBe('/api/projects/p1/files/native-review/r/page-01.png');
 expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/native-presentation/inspect',expect.objectContaining({method:'POST',body:JSON.stringify({entry:'index.html'})}));
 expect(screen.queryByText(/验收通过/)).toBeNull();
});

it('resumes the existing inspection when review-file writes remount the viewer', async () => {
  sessionStorage.setItem('native-ppt-inspection:p1:index.html', 'running-job');
  const fetchMock=vi.fn().mockResolvedValue(Response.json({id:'running-job',projectId:'p1',status:'completed',report:{version:1,entry:'index.html',sourceHash:'abc',stale:false,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/r/report.json',blockedResources:[],slides:[]}}));
  vi.stubGlobal('fetch',fetchMock);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationPreview projectId="p1" name="index.html"/></I18nProvider>);
  expect(await screen.findByRole('link',{name:'检查记录 ↗'},{timeout:3000})).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/native-presentation/inspections/running-job',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(fetchMock.mock.calls.every(([,options])=>options?.method !== 'POST')).toBe(true);
});
