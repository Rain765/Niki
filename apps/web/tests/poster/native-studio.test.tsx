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
it('combines every original template and both styles in one filter without workflow or recommendation choices', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.queryByRole('combobox',{name:'创作方式'})).toBeNull();
  expect(screen.queryByRole('textbox',{name:'受众 / 场景'})).toBeNull();
  expect(screen.queryByRole('spinbutton',{name:'分享时长（分钟）'})).toBeNull();
  expect(screen.getByText('可补充受众、使用场景和重点要求。')).toBeTruthy();
  const filters=screen.getByRole('region',{name:'创作筛选'});
  expect(Array.from(filters.querySelectorAll('.od-field__label')).map(el=>el.textContent)).toEqual(['模板与风格','目标页数']);
  expect(screen.getByRole('combobox',{name:'模板与风格'}).textContent).toContain('白底编辑风');
  fireEvent.click(screen.getByRole('combobox',{name:'模板与风格'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(18);
  expect(screen.queryByRole('option',{name:/按原流程推荐/})).toBeNull();
  expect(screen.getByRole('option',{name:'电子杂志'})).toBeTruthy();
  expect(screen.getByRole('option',{name:'瑞士国际主义'})).toBeTruthy();
  fireEvent.click(screen.getByRole('option',{name:'技术分享'}));
  expect(screen.getByRole('img',{name:'原始模板预览'}).getAttribute('src')).toBe(previewAssets['tech-sharing'].default.thumb);
  expect(document.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('link',{name:/查看原/})).toBeNull();
  choose('模板与风格', '电子杂志');
  expect(window.location.search).toContain('guizang-ppt-skill');
  expect(screen.getByRole('img',{name:'设计创作风格参考'}).getAttribute('src')).toBe(previewAssets.guizang.default.thumb);
  expect(screen.getByRole('region',{name:'生成区'}).compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('旧版文稿')).toBeNull();
});

it('only shows themes belonging to the selected original template/style and clears incompatible themes', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.queryByRole('combobox',{name:'配色与字体'})).toBeNull();
  choose('模板与风格','自由编排');
  fireEvent.click(screen.getByRole('combobox',{name:'配色与字体'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(37);
  expect(screen.queryByRole('option',{name:/推荐/})).toBeNull();
  fireEvent.click(screen.getByRole('option',{name:'冰川蓝'}));
  choose('模板与风格', '电子杂志');
  expect(screen.getByRole('combobox',{name:'配色与字体'}).textContent).toBe('经典杂志');
  choose('配色与字体','沙丘暖色');
  choose('模板与风格', '瑞士国际主义');
  expect(screen.getByRole('combobox',{name:'配色与字体'}).textContent).toBe('克莱因蓝');
  fireEvent.click(screen.getByRole('combobox',{name:'配色与字体'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(4);
  expect(screen.queryByRole('option',{name:'沙丘暖色'})).toBeNull();
  fireEvent.click(screen.getByRole('option',{name:'克莱因蓝'}));
  choose('模板与风格','技术分享');
  expect(screen.queryByRole('combobox',{name:'配色与字体'})).toBeNull();
});

it('keeps content, file and common settings through cross-workflow template changes and sends original HTML values', async () => {
  vi.mocked(prepareNativePresentation).mockResolvedValue({id:'created',skillId:'html-ppt'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  choose('目标页数','15');
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'架构与流程'}});
  const file=new File(['All source facts'], 'source.md', {type:'text/markdown'});
  fireEvent.change(screen.getByLabelText('添加文档'),{target:{files:[file]}});
  choose('模板与风格','电子杂志');
  expect((screen.getByRole('textbox',{name:'创作内容'}) as HTMLTextAreaElement).value).toBe('架构与流程');
  expect(screen.getByText('source.md')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'补充后的架构与流程'}});
  choose('模板与风格','技术分享');
  expect(screen.getByText('source.md')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'开始创作'}));
  await waitFor(()=>expect(prepareNativePresentation).toHaveBeenCalledWith({skill:'html-ppt',topic:'补充后的架构与流程',audience:'',pages:'15',style:'tech-sharing',theme:'',duration:''},file));
});

it.each([
  ['电子杂志','A · 电子杂志','Monocle'],
  ['瑞士国际主义','B · 瑞士国际主义','IKB'],
])('routes %s through the original Guizang workflow', async (label,style,theme) => {
  vi.mocked(prepareNativePresentation).mockResolvedValue({id:'design',skillId:'guizang-ppt-skill'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  choose('模板与风格',label);
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'发布计划'}});
  fireEvent.click(screen.getByRole('button',{name:'开始创作'}));
  await waitFor(()=>expect(prepareNativePresentation).toHaveBeenCalledWith({skill:'guizang-ppt-skill',topic:'发布计划',audience:'',pages:'auto',style,theme,duration:''},null));
});

it('opens existing Guizang workflow links with an explicit style and theme', async () => {
  window.history.replaceState(null,'','/?pptWorkflow=guizang-ppt-skill');
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.getByRole('combobox',{name:'模板与风格'}).textContent).toBe('电子杂志'));
  expect(screen.getByRole('combobox',{name:'配色与字体'}).textContent).toBe('经典杂志');
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
  choose('模板与风格','技术分享');
  const asset=previewAssets['tech-sharing'].default;
  expect(document.querySelector(`img[src="${asset.full}"]`)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'放大模板预览'}));
  expect(showModal).toHaveBeenCalledOnce();
  expect(within(screen.getByRole('dialog')).getByRole('img').getAttribute('src')).toBe(asset.full);
  fireEvent.click(screen.getByRole('button',{name:'关闭预览'}));
  expect(close).toHaveBeenCalledOnce();
  expect(document.querySelector(`img[src="${asset.full}"]`)).toBeNull();
  Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype,'close');
});
