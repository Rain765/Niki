// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePresentationResult } from '../../src/poster/NativePresentationResult';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/components/NativePresentationPreview',()=>({NativePresentationPreview:({name,revision,editingDisabled}:{name:string;revision:string;editingDisabled:boolean})=><div data-testid="deck" data-revision={revision} data-locked={editingDisabled}>{name}</div>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('shows real generation skeletons and keeps the original conversation mounted when the deck arrives',async()=>{
 let completed=false;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:completed?[{name:'index.html',kind:'html',mtime:10,size:100}]:[]}:{runs:[{id:'r',status:completed?'succeeded':'running',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 await screen.findByRole('status',{name:'正在生成文稿'});
 const workspace=screen.getByTitle('生成与修改工作区');
 expect(workspace).toBeTruthy();
 completed=true;
 expect((await screen.findByTestId('deck',{}, {timeout:5000})).textContent).toBe('index.html');
 expect(screen.queryByRole('status',{name:'正在生成文稿'})).toBeNull();
 expect(screen.getByTitle('生成与修改工作区')).toBe(workspace);
 expect(workspace.parentElement?.hidden).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'生成与修改'}));
 expect(workspace.parentElement?.hidden).toBe(false);
});
it('shows the original interaction when a run pauses without an artifact, not a perpetual skeleton',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json(input.includes('/files')?{files:[]}:{runs:[{id:'r',status:'succeeded',createdAt:1}]})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 await waitFor(()=>expect(screen.getByTitle('生成与修改工作区')).toBeTruthy());
 expect(screen.queryByRole('status')).toBeNull();
});
it('reports connection failures without claiming that generation is running',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 render(<I18nProvider defaultLocale="zh-CN"><NativePresentationResult projectId="p"/></I18nProvider>);
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.queryByRole('status')).toBeNull();
});
