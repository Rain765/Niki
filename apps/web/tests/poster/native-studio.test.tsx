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
  fireEvent.change(screen.getByLabelText('模板'), {target:{value:'tech-sharing'}});
  expect(screen.getByTitle('原始模板预览').getAttribute('src')).toContain('/templates/full-decks/tech-sharing/index.html');
  fireEvent.click(screen.getByRole('tab',{name:'Guizang'}));
  expect(window.location.search).toContain('guizang-ppt-skill');
  fireEvent.change(screen.getByLabelText('模板'), {target:{value:'A · 电子杂志'}});
  expect(screen.getByTitle('原始模板预览').getAttribute('src')).toContain('/assets/template.html');
  fireEvent.click(screen.getByRole('tab',{name:'HTML PPT Studio'}));
  expect((screen.getByLabelText('模板') as HTMLSelectElement).value).toBe('tech-sharing');
});
