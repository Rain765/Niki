// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import previewAssets from '../../src/poster/native-preview-assets.json';
import { NativePresentationStudio } from '../../src/poster/NativePresentationStudio';
import { prepareNativePresentation } from '../../src/poster/native-presentations';
import { I18nProvider } from '../../src/i18n';
const auth = vi.hoisted(() => ({ role: 'member' }));
vi.mock('../../src/auth/NikiAuth', () => ({ useNikiAuth: () => ({user: {role: auth.role}}) }));
vi.mock('../../src/poster/ppt-model-api', () => ({ pptModelRequest: async () => ({defaultProvider:'existing',providers:[{provider:'qwen',configured:true,testedAt:1},{provider:'kimi',configured:false},{provider:'deepseek',configured:false}]}) }));
vi.mock('../../src/providers/registry', () => ({ fetchSkills: async () => [{id:'guizang-ppt-skill',hasBody:true}], fetchDesignTemplates: async () => [{id:'html-ppt',hasBody:true}] }));
vi.mock('../../src/poster/NativePresentationResult', () => ({NativePresentationResult: ({projectId}:{projectId:string}) => <div data-testid={`result-${projectId}`}/> }));
vi.mock('../../src/state/projects', () => ({ listProjects: async () => [], createProject: vi.fn(), patchProject: vi.fn() }));
vi.mock('../../src/poster/native-presentations', async importOriginal => ({...await importOriginal<typeof import('../../src/poster/native-presentations')>(), prepareNativePresentation:vi.fn()}));
function choose(label: string, option: string) { fireEvent.click(screen.getByRole('combobox',{name:label})); fireEvent.click(screen.getByRole('option',{name:option})); }
afterEach(() => {auth.role='member';cleanup();vi.clearAllMocks(); window.history.replaceState(null,'','/');});
it('combines every original template and both styles in one filter without workflow or recommendation choices', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.queryByRole('combobox',{name:'创作方式'})).toBeNull();
  expect(screen.queryByRole('textbox',{name:'受众 / 场景'})).toBeNull();
  expect(screen.queryByRole('spinbutton',{name:'分享时长（分钟）'})).toBeNull();
  expect(screen.getByPlaceholderText('主题、受众、场景与重点要求')).toBeTruthy();
  const filters=screen.getByRole('region',{name:'创作筛选'});
  expect(Array.from(filters.querySelectorAll('.od-field__label')).map(el=>el.textContent)).toEqual(['模板与风格','目标页数','创作内容']);
  expect(screen.getByRole('combobox',{name:'模板与风格'}).textContent).toContain('白底编辑风');
  fireEvent.click(screen.getByRole('combobox',{name:'模板与风格'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(18);
  expect(screen.queryByRole('option',{name:/按原流程推荐/})).toBeNull();
  expect(screen.getByRole('option',{name:'电子杂志'})).toBeTruthy();
  expect(screen.getByRole('option',{name:'瑞士国际主义'})).toBeTruthy();
  fireEvent.click(screen.getByRole('option',{name:'技术分享'}));
  expect(screen.getByRole('combobox',{name:'模板与风格'}).querySelector('img')!.getAttribute('src')).toBe(previewAssets['tech-sharing'].default.thumb);
  expect(document.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('link',{name:/查看原/})).toBeNull();
  choose('模板与风格', '电子杂志');
  expect(window.location.search).toContain('guizang-ppt-skill');
  expect(screen.getByRole('combobox',{name:'模板与风格'}).querySelector('img')!.getAttribute('src')).toBe(previewAssets.guizang.default.thumb);
  expect(screen.getByRole('region',{name:'创作筛选'}).compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
  expect((screen.getByRole('textbox',{name:'创作内容'}) as HTMLInputElement).value).toBe('架构与流程');
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
  expect((content as HTMLInputElement).value).toBe('保留要求');
});

it('previews thumbnails lazily on hover or tap without changing the selected template', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  const trigger = screen.getByRole('combobox',{name:'模板与风格'});
  fireEvent.click(trigger);
  const option = screen.getByRole('option',{name:'技术分享'});
  const thumb = option.querySelector('.native-template-option__thumb')!;
  const asset = previewAssets['tech-sharing'].default;
  expect(document.querySelector(`img[src="${asset.full}"]`)).toBeNull();
  fireEvent.mouseEnter(thumb);
  expect(within(await screen.findByRole('tooltip',{name:'技术分享'})).getByRole('img').getAttribute('src')).toBe(asset.full);
  expect(trigger.textContent).toBe('白底编辑风');
  fireEvent.mouseLeave(thumb);
  await waitFor(()=>expect(screen.queryByRole('tooltip')).toBeNull());
  fireEvent.click(thumb);
  expect(await screen.findByRole('tooltip',{name:'技术分享'})).toBeTruthy();
  expect(screen.getByRole('listbox')).toBeTruthy();
  expect(trigger.textContent).toBe('白底编辑风');
  fireEvent.click(thumb);
  await waitFor(()=>expect(screen.queryByRole('tooltip')).toBeNull());
  fireEvent.click(option);
  expect(trigger.textContent).toBe('技术分享');
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('supports keyboard preview and selection while keeping the content and action in the filter row', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  const region=screen.getByRole('region',{name:'创作筛选'});
  expect(within(region).getByRole('textbox',{name:'创作内容'}).tagName).toBe('INPUT');
  expect(within(region).getByRole('button',{name:'开始创作'})).toBeTruthy();
  expect(screen.queryByRole('region',{name:'生成区'})).toBeNull();
  const trigger=screen.getByRole('combobox',{name:'模板与风格'});
  fireEvent.keyDown(trigger,{key:'ArrowDown'});
  expect(await screen.findByRole('tooltip',{name:'白底编辑风'})).toBeTruthy();
  fireEvent.keyDown(trigger,{key:'ArrowDown'});
  expect(await screen.findByRole('tooltip',{name:'电子杂志'})).toBeTruthy();
  fireEvent.keyDown(trigger,{key:'Escape'});
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(trigger.textContent).toBe('白底编辑风');
  fireEvent.keyDown(trigger,{key:'ArrowDown'});
  fireEvent.keyDown(trigger,{key:'ArrowDown'});
  fireEvent.keyDown(trigger,{key:'Enter'});
  expect(trigger.textContent).toBe('电子杂志');
});

it('lets administrators select a verified model without changing template choices', async () => {
  auth.role='admin';
  vi.mocked(prepareNativePresentation).mockResolvedValue({id:'provider-created',skillId:'html-ppt'} as never);
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'生成模型'}).getAttribute('disabled')).toBeNull());
  choose('生成模型','Qwen3.8-Max');
  choose('模板与风格','瑞士国际主义');
  fireEvent.change(screen.getByRole('textbox',{name:'创作内容'}),{target:{value:'保持原版设计'}});
  fireEvent.click(screen.getByRole('button',{name:'开始创作'}));
  await waitFor(()=>expect(prepareNativePresentation).toHaveBeenCalledWith(expect.objectContaining({provider:'qwen',skill:'guizang-ppt-skill',style:'B · 瑞士国际主义'}),null));
});
