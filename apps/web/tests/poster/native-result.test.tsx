// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativePresentationResult } from '../../src/poster/NativePresentationResult';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/components/NativePresentationPreview',()=>({NativePresentationPreview:({name,revision,editingDisabled,onRevise}:{name:string;revision:string;editingDisabled:boolean;onRevise:()=>void})=><div data-testid="deck" data-revision={revision} data-locked={editingDisabled}>{name}<button onClick={onRevise}>修改文稿</button></div>}));
beforeEach(()=>{ HTMLDialogElement.prototype.showModal=function(){this.open=true;}; HTMLDialogElement.prototype.close=function(){this.open=false;}; });
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('shows real generation skeletons and keeps the original conversation mounted when the deck arrives',async()=>{
 let completed=false;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:completed?[{name:'index.html',kind:'html',mtime:10,size:100}]:[]}:{runs:[{id:'r',status:completed?'succeeded':'running',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 await screen.findByRole('status',{name:'正在生成 PPT…'});
 const workspace=screen.getByTitle('生成与修改工作区');
 expect(workspace).toBeTruthy();
 expect(workspace.parentElement?.hidden).toBe(true);
 completed=true;
 expect((await screen.findByTestId('deck',{}, {timeout:5000})).textContent).toContain('index.html');
 expect(screen.queryByRole('status',{name:'正在生成 PPT…'})).toBeNull();
 expect(screen.getByTitle('生成与修改工作区')).toBe(workspace);
 expect(workspace.parentElement?.hidden).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'修改文稿'}));
 expect(workspace.parentElement?.hidden).toBe(false);
});
it('shows the original interaction when a run pauses without an artifact, not a perpetual skeleton',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:[]}:{runs:[{id:'r',status:'succeeded',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 await waitFor(()=>expect(screen.getByTitle('生成与修改工作区')).toBeTruthy());
 expect(screen.queryByText('需要确认后继续')).toBeNull();
 expect(screen.getByRole('button',{name:'查看进度'})).toBeTruthy();
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(screen.getByTitle('生成与修改工作区').parentElement?.hidden).toBe(true);
});
it('reports connection failures without claiming that generation is running',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.queryByRole('status')).toBeNull();
});

it('opens a real question in a dialog, preserves its answer on failure, and closes on success', async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:[]}:{runs:[{id:'r',status:'running',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 const frame=await screen.findByTitle('生成与修改工作区') as HTMLIFrameElement;
 expect(screen.queryByRole('button',{name:'确认与修改'})).toBeNull();
 const question={id:'q1',questions:[{question:'这份文稿主要给谁看？',multiSelect:false,options:[{label:'管理层'},{label:'研发团队'}]}]};
 const emit=(data:object,source:Window|null=frame.contentWindow)=>fireEvent(window,new MessageEvent('message',{origin:location.origin,source,data:{projectId:'p',...data}}));
 emit({type:'niki:ppt:question',question},window);
 expect(screen.queryByRole('dialog')).toBeNull();
 emit({type:'niki:ppt:question',question});
 expect(await screen.findByRole('dialog',{name:'确认内容'})).toBeTruthy();
 expect(screen.getByText('这份文稿主要给谁看？')).toBeTruthy();
 expect(frame.parentElement?.hidden).toBe(true);
 const post=vi.spyOn(frame.contentWindow!,'postMessage');
 fireEvent.click(screen.getByRole('button',{name:'研发团队'}));
 fireEvent.click(screen.getByRole('button',{name:'继续生成'}));
 expect(post).toHaveBeenCalledWith({type:'niki:ppt:answer',projectId:'p',id:'q1',content:'这份文稿主要给谁看？\n研发团队'},location.origin);
 emit({type:'niki:ppt:answer-result',id:'q1',ok:false});
 expect(screen.getByRole('alert').textContent).toContain('选择已保留');
 expect(screen.getByRole('button',{name:'研发团队'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'关闭'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'回答问题'}));
 expect(screen.getByRole('button',{name:'研发团队'}).getAttribute('aria-pressed')).toBe('true');
 emit({type:'niki:ppt:answer-result',id:'q1',ok:true});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.getByTitle('生成与修改工作区')).toBe(frame);
});

it('keeps copied template scaffolding behind the loader until the first generation settles',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:[{name:'index.html',mtime:1,size:100}]}:{runs:[{id:'r',status:'running',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 expect(await screen.findByRole('status',{name:'正在生成 PPT…'})).toBeTruthy();
 expect(screen.queryByTestId('deck')).toBeNull();
 expect(screen.getByTitle('生成与修改工作区').parentElement?.hidden).toBe(true);
});
