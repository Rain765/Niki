// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativePresentationPreview } from '../../src/components/NativePresentationPreview';
import { I18nProvider } from '../../src/i18n';
import { loadNativeDeck, NativeDeckPendingError } from '../../src/presentations/native-viewer';
vi.mock('../../src/presentations/native-viewer',async importOriginal=>({...await importOriginal<typeof import('../../src/presentations/native-viewer')>(),loadNativeDeck:vi.fn(),nativeDeckSrcdoc:()=>'<html></html>'}));
vi.mock('../../src/components/NativePresentationInspectionPanel',()=>({NativePresentationInspectionPanel:()=>null}));
vi.mock('../../src/components/NativePresentationEditor',()=>({NativePresentationEditor:({initialPage,onClose}:{initialPage:number;onClose:()=>void})=><button onClick={onClose}>Editing {initialPage}</button>}));
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
 vi.mocked(loadNativeDeck).mockResolvedValue({source:'',name:'index.html',titles:['开场','架构','流程'],width:1280,height:720});
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});
async function mount(){
 const {container}=render(<I18nProvider defaultLocale="zh-CN"><NativePresentationPreview projectId="p" name="index.html"/></I18nProvider>);
 await waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());
 await act(async()=>{});
 const frame=container.querySelector('iframe')!;
 return {container,frame};
}
function state(frame:HTMLIFrameElement,index:number){act(()=>window.dispatchEvent(new window.MessageEvent('message',{source:frame.contentWindow,data:{type:'niki:ppt:state',index}})));}
it('accepts navigation state only from its own iframe and supports inline arrows, jumps and current-slide editing',async()=>{
 const {frame}=await mount();
 const post=vi.spyOn(frame.contentWindow!,'postMessage');
 act(()=>window.dispatchEvent(new window.MessageEvent('message',{source:window,data:{type:'niki:ppt:state',index:2}})));
 expect(screen.getByRole('button',{name:'下一页'}).hasAttribute('disabled')).toBe(true);
 state(frame,1);
 expect((screen.getByRole('spinbutton',{name:'跳转页码'}) as HTMLInputElement).value).toBe('2');
 fireEvent.click(screen.getByRole('button',{name:'下一页'}));
 expect(post).toHaveBeenLastCalledWith({type:'niki:ppt:command',action:'next',index:undefined},'*');
 const jump=screen.getByRole('spinbutton',{name:'跳转页码'});
 fireEvent.change(jump,{target:{value:'3'}});fireEvent.keyDown(jump,{key:'Enter'});
 expect(post).toHaveBeenLastCalledWith({type:'niki:ppt:command',action:'goto',index:2},'*');
 state(frame,99);
 expect(sessionStorage.getItem('native-ppt-position:p:index.html')).toBe('1');
 fireEvent.click(screen.getByRole('button',{name:'编辑本页'}));
 expect(screen.getByText('Editing 1')).toBeTruthy();
});
it('keeps the same iframe and reading position through fullscreen/sidebar switches',async()=>{
 const {container,frame}=await mount();state(frame,1);
 const post=vi.spyOn(frame.contentWindow!,'postMessage');
 fireEvent.click(screen.getByRole('button',{name:'全屏'}));
 expect(screen.getByRole('navigation',{name:'页面目录'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/03.*流程/}));
 expect(post).toHaveBeenLastCalledWith({type:'niki:ppt:command',action:'goto',index:2},'*');
 state(frame,2);
 fireEvent.click(screen.getByRole('button',{name:'切换页面目录'}));
 expect(screen.queryByRole('navigation',{name:'页面目录'})).toBeNull();
 fireEvent.keyDown(screen.getByTestId('native-presentation-preview'),{key:'Escape'});
 expect(screen.getByRole('button',{name:'全屏'})).toBeTruthy();
 expect(container.querySelector('iframe')).toBe(frame);
 expect((screen.getByRole('spinbutton',{name:'跳转页码'}) as HTMLInputElement).value).toBe('3');
 expect(document.body.style.overflow).toBe('');
});
it('turns load failures into a retryable error instead of an endless skeleton',async()=>{
 vi.mocked(loadNativeDeck).mockRejectedValueOnce(new Error('读取失败'));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationPreview projectId="p" name="index.html"/></I18nProvider>);
 expect(await screen.findByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
 await waitFor(()=>expect(loadNativeDeck).toHaveBeenCalledTimes(2));
});

it('keeps incomplete slides in the loader and automatically reads the finished deck',async()=>{
 vi.useFakeTimers();
 try {
  vi.mocked(loadNativeDeck).mockRejectedValueOnce(new NativeDeckPendingError());
  const {container,unmount}=render(<I18nProvider defaultLocale="zh-CN"><NativePresentationPreview projectId="p" name="index.html"/></I18nProvider>);
  await act(async()=>{});
  expect(screen.getByRole('status',{name:'正在加载文稿'})).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button',{name:'重新加载'})).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  expect(loadNativeDeck).toHaveBeenCalledTimes(2);
  expect(container.querySelector('iframe')).not.toBeNull();
  unmount();
  await vi.advanceTimersByTimeAsync(3000);
  expect(loadNativeDeck).toHaveBeenCalledTimes(2);
 } finally {vi.useRealTimers();}
});
