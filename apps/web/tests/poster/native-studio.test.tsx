// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import previewAssets from '../../src/poster/native-preview-assets.json';
import { NativePresentationStudio } from '../../src/poster/NativePresentationStudio';
import { prepareNativePresentation } from '../../src/poster/native-presentations';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/providers/registry', () => ({ fetchSkills: async () => [{id:'guizang-ppt-skill',hasBody:true}], fetchDesignTemplates: async () => [{id:'html-ppt',hasBody:true}] }));
vi.mock('../../src/poster/NativePresentationResult', () => ({NativePresentationResult: ({projectId}:{projectId:string}) => <div data-testid={`result-${projectId}`}/> }));
vi.mock('../../src/state/projects', () => ({ listProjects: async () => [], createProject: vi.fn(), patchProject: vi.fn() }));
vi.mock('../../src/poster/native-presentations', async importOriginal => ({...await importOriginal<typeof import('../../src/poster/native-presentations')>(), prepareNativePresentation:vi.fn()}));
function choose(label: string, option: string) { fireEvent.click(screen.getByRole('combobox',{name:label})); fireEvent.click(screen.getByRole('option',{name:option})); }
afterEach(() => {cleanup();vi.clearAllMocks(); window.history.replaceState(null,'','/');});
it('has compact centered navigation and real template selection without legacy or promotional content', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.getByRole('tab',{name:'最新一批'})).toBeTruthy();
  expect(screen.getByRole('tab',{name:/历史生成/})).toBeTruthy();
  expect(screen.getByRole('region',{name:'生成区'}).compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const navigation = screen.getByRole('tablist',{name:'文稿导航'});
  expect(within(navigation).getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryByText('旧版文稿')).toBeNull();
  expect(screen.queryByText('让内容，拥有好的表达。')).toBeNull();
  expect(screen.queryByText('THE ORIGINAL WORKFLOW')).toBeNull();
  fireEvent.click(screen.getByRole('combobox',{name:'模板'}));
  fireEvent.click(screen.getByRole('option',{name:'技术分享'}));
  expect(screen.getByRole('img',{name:'原始模板预览'}).getAttribute('src')).toBe(previewAssets['tech-sharing'].default.thumb);
  expect(document.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('link',{name:/查看原/})).toBeNull();
  choose('创作方式', '设计创作');
  expect(window.location.search).toContain('guizang-ppt-skill');
  choose('风格', '电子杂志');
  expect(screen.getByRole('img',{name:'设计创作风格参考'}).getAttribute('src')).toBe(previewAssets.guizang.default.thumb);
  expect(screen.queryByTitle('原始模板预览')).toBeNull();
  choose('创作方式', '模板创作');
  expect(screen.getByRole('combobox',{name:'模板'}).textContent).toContain('技术分享');
});

it('exposes all original HTML themes and never silently selects weekly-report', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.getByRole('combobox',{name:'模板'}).textContent).toContain('按原流程推荐');
  fireEvent.click(screen.getByRole('combobox',{name:'主题'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(37);
  fireEvent.click(screen.getByRole('option',{name:'arctic-cool'}));
  expect(screen.getByRole('img',{name:'原始模板预览'}).getAttribute('src')).toBe(previewAssets.custom['arctic-cool'].thumb);
  choose('创作方式', '设计创作');
  expect(screen.getByRole('combobox',{name:'主题'}).hasAttribute('disabled')).toBe(true);
  choose('风格', '瑞士国际主义');
  fireEvent.click(screen.getByRole('combobox',{name:'主题'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(5);
  expect(screen.queryByRole('option',{name:'arctic-cool'})).toBeNull();
});

it('keeps both workflow drafts and original submission values through the compact filters', async () => {
  vi.mocked(prepareNativePresentation).mockResolvedValue({id:'created',skillId:'html-ppt'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  const filters=screen.getByRole('region',{name:'创作筛选'});
  expect(Array.from(filters.querySelectorAll('.od-field__label')).map(el=>el.textContent)).toEqual(['创作方式','模板','主题','目标页数','受众 / 场景','分享时长（分钟）']);
  choose('模板','技术分享'); choose('主题','arctic-cool'); choose('目标页数','15');
  fireEvent.change(screen.getByRole('textbox',{name:'受众 / 场景'}),{target:{value:'产品团队'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'分享时长（分钟）'}),{target:{value:'20'}});
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'架构与流程'}});
  const file=new File(['All source facts'], 'source.md', {type:'text/markdown'});
  fireEvent.change(screen.getByLabelText('添加文档'),{target:{files:[file]}});
  choose('创作方式','设计创作'); choose('风格','电子杂志'); choose('主题','Monocle');
  expect((screen.getByRole('textbox',{name:'创作内容'}) as HTMLTextAreaElement).value).toBe('');
  choose('创作方式','模板创作');
  expect(screen.getByRole('combobox',{name:'主题'}).textContent).toContain('arctic-cool');
  expect(screen.getByText('source.md')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'开始创作'}));
  await waitFor(()=>expect(prepareNativePresentation).toHaveBeenCalledWith({skill:'html-ppt',topic:'架构与流程',audience:'产品团队',pages:'15',style:'tech-sharing',theme:'arctic-cool',duration:'20'},file));
});

it('clears incompatible themes when changing design style and submits the original Guizang identifier', async () => {
  vi.mocked(prepareNativePresentation).mockResolvedValue({id:'design',skillId:'guizang-ppt-skill'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  choose('创作方式','设计创作'); choose('风格','电子杂志'); choose('主题','Monocle');
  choose('风格','瑞士国际主义');
  expect(screen.getByRole('combobox',{name:'主题'}).textContent).toContain('按原流程推荐');
  choose('主题','IKB');
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'发布计划'}});
  fireEvent.click(screen.getByRole('button',{name:'开始创作'}));
  await waitFor(()=>expect(prepareNativePresentation).toHaveBeenCalledWith({skill:'guizang-ppt-skill',topic:'发布计划',audience:'',pages:'auto',style:'B · 瑞士国际主义',theme:'IKB',duration:''},null));
});


it('keeps document replacement and removal inside the content composer without losing text', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  const content = screen.getByRole('textbox',{name:'创作内容'});
  const composer = content.parentElement!;
  const input = within(composer).getByLabelText('添加文档');
  fireEvent.change(content,{target:{value:'保留要求'}});
  fireEvent.change(input,{target:{files:[new File(['one'],'first.md')]}});
  fireEvent.change(within(composer).getByLabelText('添加文档'),{target:{files:[new File(['two'],'second.md')]}});
  expect(screen.queryByText('first.md')).toBeNull();
  expect(within(composer).getByText('second.md')).toBeTruthy();
  fireEvent.click(within(composer).getByRole('button',{name:'移除文档'}));
  expect(screen.queryByText('second.md')).toBeNull();
  expect((content as HTMLTextAreaElement).value).toBe('保留要求');
});

it('loads the full preview only when opened and releases it when closed', async () => {
  const showModal = vi.fn(function(this:HTMLDialogElement){this.open=true;});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{value:showModal,configurable:true});
  const close = vi.fn(function(this:HTMLDialogElement){this.open=false;});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{value:close,configurable:true});
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  choose('模板','技术分享'); choose('主题','arctic-cool');
  const asset=previewAssets['tech-sharing']['arctic-cool'];
  expect(document.querySelector(`img[src="${asset.full}"]`)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'放大模板预览'}));
  expect(showModal).toHaveBeenCalledOnce();
  expect(within(screen.getByRole('dialog')).getByRole('img').getAttribute('src')).toBe(asset.full);
  fireEvent.click(screen.getByRole('button',{name:'关闭预览'}));
  expect(close).toHaveBeenCalledOnce();
  expect(document.querySelector(`img[src="${asset.full}"]`)).toBeNull();
  Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype,'close');
});
