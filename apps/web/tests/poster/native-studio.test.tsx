// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePresentationStudio } from '../../src/poster/NativePresentationStudio';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/providers/registry', () => ({ fetchSkills: async () => [{id:'guizang-ppt-skill',hasBody:true}], fetchDesignTemplates: async () => [{id:'html-ppt',hasBody:true}] }));
vi.mock('../../src/state/projects', () => ({ listProjects: async () => [], createProject: vi.fn(), patchProject: vi.fn() }));
afterEach(() => {cleanup(); window.history.replaceState(null,'','/');});
it('has compact centered navigation and real template selection without legacy or promotional content', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  const navigation = screen.getByRole('tablist',{name:'文稿导航'});
  expect(within(navigation).getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryByText('旧版文稿')).toBeNull();
  expect(screen.queryByText('让内容，拥有好的表达。')).toBeNull();
  expect(screen.queryByText('THE ORIGINAL WORKFLOW')).toBeNull();
  fireEvent.click(screen.getByRole('combobox',{name:'模板'}));
  fireEvent.click(screen.getByRole('option',{name:'技术分享'}));
  expect(screen.getByTitle('原始模板预览').getAttribute('src')).toContain('/templates/full-decks/tech-sharing/index.html');
  fireEvent.click(screen.getByRole('tab',{name:'Guizang'}));
  expect(window.location.search).toContain('guizang-ppt-skill');
  fireEvent.click(screen.getByRole('combobox',{name:'模板'}));
  fireEvent.click(screen.getByRole('option',{name:'电子杂志'}));
  expect(screen.getByTitle('原始模板预览').getAttribute('src')).toContain('/assets/template.html');
  fireEvent.click(screen.getByRole('tab',{name:'HTML PPT Studio'}));
  expect(screen.getByRole('combobox',{name:'模板'}).textContent).toContain('技术分享');
});

it('exposes all original HTML themes and never silently selects weekly-report', async () => {
  render(<I18nProvider defaultLocale="zh-CN"><NativePresentationStudio /></I18nProvider>);
  await waitFor(() => expect(screen.queryByText('模板资源尚未就绪')).toBeNull());
  expect(screen.getByRole('combobox',{name:'模板'}).textContent).toContain('按原流程推荐');
  fireEvent.click(screen.getByRole('combobox',{name:'主题'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(37);
  fireEvent.click(screen.getByRole('option',{name:'arctic-cool'}));
  expect(screen.getByRole('link',{name:'查看原主题 ↗'}).getAttribute('href')).toContain('?preview=5');
  fireEvent.click(screen.getByRole('tab',{name:'Guizang'}));
  expect(screen.getByRole('combobox',{name:'主题'}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('combobox',{name:'模板'}));
  fireEvent.click(screen.getByRole('option',{name:'瑞士国际主义'}));
  fireEvent.click(screen.getByRole('combobox',{name:'主题'}));
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(5);
  expect(screen.queryByRole('option',{name:'arctic-cool'})).toBeNull();
});
