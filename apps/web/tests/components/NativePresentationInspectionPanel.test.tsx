// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePresentationInspectionPanel } from '../../src/components/NativePresentationInspectionPanel';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/providers/registry', () => ({ projectFileUrl: (id:string,name:string)=>`/api/projects/${id}/files/${name}` }));
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
it('exposes the same local inspection API and actual screenshots without claiming visual acceptance', async()=>{
 const fetchMock=vi.fn().mockResolvedValue(Response.json({id:"r1",projectId:"p1",status:"completed",report:{version:1,entry:'index.html',sourceHash:'abc',stale:false,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/r/report.json',blockedResources:[],slides:[{page:1,text:'Title',screenshot:'native-review/r/page-01.png',issues:[{kind:'dim-text',text:'Title'}]}]}}));
 vi.stubGlobal('fetch',fetchMock);
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationInspectionPanel projectId="p1" name="index.html"/></I18nProvider>);
 fireEvent.click(screen.getByRole('button',{name:'检查文稿'}));
 expect(await screen.findByText(/1 项待核对/)).toBeTruthy();
 fireEvent.click(screen.getByText('检查记录',{exact:true}));
 expect(screen.getByRole('link',{name:'第 1 页 ↗'}).getAttribute('href')).toBe('/api/projects/p1/files/native-review/r/page-01.png');
 expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/native-presentation/inspect',expect.objectContaining({method:'POST',body:JSON.stringify({entry:'index.html'})}));
 expect(screen.queryByText(/验收通过/)).toBeNull();
});

it('resumes the existing inspection when review-file writes remount the viewer', async () => {
  sessionStorage.setItem('native-ppt-inspection:p1:index.html', 'running-job');
  const fetchMock=vi.fn().mockResolvedValue(Response.json({id:'running-job',projectId:'p1',status:'completed',report:{version:1,entry:'index.html',sourceHash:'abc',stale:false,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/r/report.json',blockedResources:[],slides:[]}}));
  vi.stubGlobal('fetch',fetchMock);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationInspectionPanel projectId="p1" name="index.html"/></I18nProvider>);
  fireEvent.click(await screen.findByText('检查记录',{exact:true},{timeout:3000}));
  expect(screen.getByRole('link',{name:'检查记录 ↗'})).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/native-presentation/inspections/running-job',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(fetchMock.mock.calls.every(([,options])=>options?.method !== 'POST')).toBe(true);
});

it('automatically checks stable output and checks again after the content revision changes', async()=>{
 const report={version:1,entry:'index.html',sourceHash:'abc',stale:false,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/report.json',blockedResources:[],failedResources:[],slides:[{page:1,text:'Title',screenshot:'native-review/page-01.png',issues:[]}]};
 const fetchMock=vi.fn().mockResolvedValue(Response.json({id:'auto',projectId:'p',status:'completed',report}));
 vi.stubGlobal('fetch',fetchMock);
 const {rerender}=render(<I18nProvider defaultLocale="zh-CN"><NativePresentationInspectionPanel projectId="p" name="index.html" auto revision="first"/></I18nProvider>);
 expect(await screen.findByText(/视觉与内容仍需核对/)).toBeTruthy();
 expect(fetchMock).toHaveBeenCalledTimes(1);
 fetchMock.mockResolvedValue(Response.json({id:'edited',projectId:'p',status:'completed',report:{...report,sourceHash:'def'}}));
 rerender(<I18nProvider defaultLocale="zh-CN"><NativePresentationInspectionPanel projectId="p" name="index.html" auto revision="edited"/></I18nProvider>);
 expect(await screen.findByText(/视觉与内容仍需核对/)).toBeTruthy();
 expect(fetchMock).toHaveBeenCalledTimes(2);
 expect(sessionStorage.getItem('native-ppt-inspection:p:index.html')).toBe('edited');
});


it('automatically replaces a shared inspection that went stale during an edit', async()=>{
 const report={version:1,entry:'index.html',sourceHash:'old',stale:true,visualReviewRequired:true,viewport:{width:1280,height:720},reportFile:'native-review/old.json',blockedResources:[],failedResources:[],slides:[]};
 const fetchMock=vi.fn()
  .mockResolvedValueOnce(Response.json({id:'shared',projectId:'p',status:'completed',report}))
  .mockResolvedValueOnce(Response.json({id:'fresh',projectId:'p',status:'completed',report:{...report,stale:false,sourceHash:'new'}}));
 vi.stubGlobal('fetch',fetchMock);
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationInspectionPanel projectId="p" name="index.html" auto revision="edited"/></I18nProvider>);
 expect(await screen.findByText(/视觉与内容仍需核对/)).toBeTruthy();
 expect(screen.queryByText('文稿已更新，请重新检查')).toBeNull();
 expect(fetchMock).toHaveBeenCalledTimes(2);
 expect(sessionStorage.getItem('native-ppt-inspection:p:index.html')).toBe('fresh');
});
