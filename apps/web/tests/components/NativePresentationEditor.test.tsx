// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePresentationEditor } from '../../src/components/NativePresentationEditor';
import { I18nProvider } from '../../src/i18n';
import { presentationTextFields, replacePresentationText } from '../../src/edit-mode/presentation-text';
import { fetchProjectFileText, writeProjectTextFile } from '../../src/providers/registry';
vi.mock('../../src/providers/registry', () => ({ fetchProjectFileText: vi.fn(), writeProjectTextFile: vi.fn() }));
afterEach(() => {cleanup(); vi.resetAllMocks();});
const source = '<!doctype html><html><head><style>.dark{color:white;background:black}</style></head><body><section class="slide dark"><h1>标题 <em>重点</em></h1><p>30 → 8</p><aside class="notes">备注不改</aside><svg><text>节点</text></svg></section><script>localStorage.setItem("x", "y")</script></body></html>';
it('edits text without flattening emphasis, changing contrast styles or rewriting runtime', () => {
  const fields = presentationTextFields(source);
  expect(fields.map(f=>f.text)).toEqual(['标题 ', '重点','30 → 8','节点']);
  const output = replacePresentationText(source,[{path:fields[1]!.path,before:'重点',after:'新重点 <安全>'}]);
  expect(output).toContain('<em>新重点 &lt;安全&gt;</em>');
  for (const tag of ['style','script']) expect(output.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]).toBe(source.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]);
  expect(output).toContain('<aside class="notes">备注不改</aside>');
  expect(() => replacePresentationText(source,[{path:fields[0]!.path,before:'错误',after:'x'}])).toThrow();
});
it('saves changed text through the original project file endpoint', async () => {
  vi.mocked(fetchProjectFileText).mockResolvedValue(source); vi.mocked(writeProjectTextFile).mockResolvedValue({name:'index.html'} as never);
  const close=vi.fn(); render(<I18nProvider defaultLocale="zh-CN"><NativePresentationEditor projectId="p" name="index.html" onClose={close}/></I18nProvider>);
  fireEvent.change(await screen.findByLabelText('文案 2'),{target:{value:'修改重点'}});
  fireEvent.click(screen.getByText('保存修改'));
  await waitFor(()=>expect(close).toHaveBeenCalled());
  expect(vi.mocked(writeProjectTextFile).mock.calls[0]![2]).toContain('<em>修改重点</em>');
});
it('reports load failures instead of leaving the editor loading', async () => {
  vi.mocked(fetchProjectFileText).mockRejectedValue(new Error('unavailable'));
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationEditor projectId="p" name="index.html" onClose={vi.fn()}/></I18nProvider>);
  expect((await screen.findByRole('alert')).textContent).toBe('读取失败');
  expect(screen.queryByRole('status')).toBeNull();
});
it('refuses to overwrite a deck updated by an agent during editing', async () => {
  vi.mocked(fetchProjectFileText).mockResolvedValueOnce(source).mockResolvedValueOnce(source+'\n');
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationEditor projectId="p" name="index.html" onClose={vi.fn()}/></I18nProvider>);
  fireEvent.change(await screen.findByLabelText('文案 1'),{target:{value:'新标题'}}); fireEvent.click(screen.getByText('保存修改'));
  expect((await screen.findByRole('alert')).textContent).toContain('其他位置更新');
  expect(writeProjectTextFile).not.toHaveBeenCalled();
});

it('edits the local deck behind an original HTML wrapper', async () => {
  vi.mocked(fetchProjectFileText).mockImplementation(async (_id, name) => name === 'wrapper.html' ? '<iframe src="index.html"></iframe>' : source);
  vi.mocked(writeProjectTextFile).mockResolvedValue({name:'index.html'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationEditor projectId="p" name="wrapper.html" onClose={vi.fn()}/></I18nProvider>);
  fireEvent.change(await screen.findByLabelText('文案 1'),{target:{value:'新标题'}}); fireEvent.click(screen.getByText('保存修改'));
  await waitFor(()=>expect(writeProjectTextFile).toHaveBeenCalled());
  expect(vi.mocked(writeProjectTextFile).mock.calls[0]![1]).toBe('index.html');
});
