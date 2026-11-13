// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { PptModelSettings } from '../../src/poster/PptModelSettings';
import { pptModelRequest } from '../../src/poster/ppt-model-api';
vi.mock('../../src/poster/ppt-model-api',()=>({pptModelRequest:vi.fn()}));
const config={defaultProvider:'existing' as const,providers:[{provider:'qwen' as const,configured:false,maskedKey:''},{provider:'kimi' as const,configured:false,maskedKey:''},{provider:'deepseek' as const,configured:false,maskedKey:''}]};
beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
  vi.mocked(pptModelRequest).mockResolvedValue(config);
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('saves only the selected key, clears it, preserves other drafts and separates connection testing',async()=>{
  render(<I18nProvider defaultLocale="zh-CN"><PptModelSettings open onClose={()=>{}}/></I18nProvider>);
  await screen.findByRole('heading',{name:'Qwen3.8-Max'});
  const inputs=screen.getAllByPlaceholderText('输入 API Key');
  fireEvent.change(inputs[0]!,{target:{value:'fake-qwen-key'}});fireEvent.change(inputs[1]!,{target:{value:'fake-kimi-draft'}});
  const saved={...config,providers:config.providers.map(item=>item.provider==='qwen'?{...item,configured:true,maskedKey:'••••-key'}:item)};
  vi.mocked(pptModelRequest).mockResolvedValueOnce(saved);
  fireEvent.click(screen.getAllByRole('button',{name:'保存密钥'})[0]!);
  await waitFor(()=>expect(pptModelRequest).toHaveBeenCalledWith('/qwen','PUT',{apiKey:'fake-qwen-key'}));
  await screen.findByText('密钥已保存，请测试连接');
  expect((screen.getByPlaceholderText('输入新密钥以替换') as HTMLInputElement).value).toBe('');
  expect((inputs[1] as HTMLInputElement).value).toBe('fake-kimi-draft');
  expect(pptModelRequest).not.toHaveBeenCalledWith('/qwen/test','POST');
  expect(screen.getByRole('option',{name:'Qwen3.8-Max'}).hasAttribute('disabled')).toBe(true);
});
