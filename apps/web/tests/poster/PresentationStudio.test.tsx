// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PresentationJob } from '@open-design/contracts';
import { PresentationStudio } from '../../src/poster/PresentationStudio';
import { I18nProvider } from '../../src/i18n';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const deck = (projectId: string): PresentationJob => ({
  projectId,
  revision: 1,
  status: 'complete',
  sourceName: `${projectId}.md`,
  createdAt: 1,
  updatedAt: 1,
  options: { palette: 'blue', ratio: '16:9', pageCount: 'auto', prompt: '' },
  previews: ['slide-1.svg', 'slide-2.svg'],
  pptx: 'deck.pptx',
  html: 'deck.html',
  deck: {
    title: projectId,
    slides: [1, 2].map((n) => ({
      title: `${projectId} page ${n}`,
      subtitle: '',
      layout: 'overview',
      items: [],
      edges: [],
      notes: '',
    })),
  },
});
function mount(onNavigationLockChange?: (locked: boolean) => void) {
  return render(
    <I18nProvider initial="zh-CN">
      <PresentationStudio onNavigationLockChange={onNavigationLockChange} />
    </I18nProvider>,
  );
}
function upload(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(['Example document'], 'example.md', { type: 'text/markdown' }),
      ],
    },
  });
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ presentations: [] })),
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('removes an uploaded document and disables generation without losing settings', async () => {
  const { container } = mount();
  upload(container);
  expect(
    (screen.getByRole('button', { name: /生成演示文稿/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '移除文档' }));
  expect(screen.queryByText('example.md')).toBeNull();
  expect(
    (screen.getByRole('button', { name: /生成演示文稿/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it('keeps the document and chosen options after a failed upload so the user can retry', async () => {
  vi.mocked(fetch).mockImplementation(async (_url, init) =>
    init?.method === 'POST'
      ? json({ error: 'Upload unavailable' }, 503)
      : json({ presentations: [] }),
  );
  const { container } = mount();
  upload(container);
  fireEvent.click(screen.getByRole('button', { name: /生成演示文稿/ }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('example.md')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: /生成演示文稿/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it('shows the server rendering stage instead of a generic generation message', async () => {
  const job = { ...deck('rendering-deck'), status: 'rendering' as const };
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url) === '/api/presentations'
      ? json({ presentations: [{ ...job, title: 'Rendering' }] })
      : json(job),
  );
  mount();
  expect(
    await screen.findByRole('heading', { name: '正在排版与导出' }),
  ).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull(); // No invented percentage.
});

it('never displays the previous deck while a different history item is loading', async () => {
  let resolveSecond!: (r: Response) => void;
  const second = new Promise<Response>((resolve) => {
    resolveSecond = resolve;
  });
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url) === '/api/presentations')
      return json({
        presentations: ['first', 'second'].map((id) => ({
          ...deck(id),
          title: id,
        })),
      });
    return String(url).includes('/second/') ? second : json(deck('first'));
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '当前文稿' }));
  expect(await screen.findByRole('heading', { name: 'first' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /我的文稿/ }));
  fireEvent.click(screen.getByRole('button', { name: /second/ }));
  expect(screen.queryByRole('heading', { name: 'first' })).toBeNull();
  expect(screen.getByRole('heading', { name: '正在打开文稿' })).toBeTruthy();
  resolveSecond(json(deck('second')));
  expect(await screen.findByRole('heading', { name: 'second' })).toBeTruthy();
});

it('protects unsaved edits and only uses arrow navigation outside editable controls', async () => {
  const job = deck('review');
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url) === '/api/presentations'
      ? json({ presentations: [{ ...job, title: 'review' }] })
      : json(job),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '当前文稿' }));
  await screen.findByRole('heading', { name: 'review' });
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: '编辑与原文' }));
  fireEvent.click(screen.getByRole('button', { name: /编辑本页/ }));
  expect(screen.getByText(/本页有未保存的修改/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('textbox', { name: '标题' }), {
    key: 'ArrowLeft',
  });
  expect(screen.getByText('2 / 2')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole('link', { name: /下载 PPTX/ })).toBeNull();
});

it('protects uploaded files and editable page plans across the global navigation boundary', async () => {
  const locked = vi.fn();
  const first = mount(locked);
  upload(first.container);
  await waitFor(() => expect(locked).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole('button', { name: '移除文档' }));
  await waitFor(() => expect(locked).toHaveBeenLastCalledWith(false));
  first.unmount();
  const job = {
    ...deck('planned'),
    status: 'awaiting-plan' as const,
    plan: deck('planned').deck,
  };
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url) === '/api/presentations'
      ? json({ presentations: [{ ...job, title: 'planned' }] })
      : json(job),
  );
  mount(locked);
  await screen.findByRole('heading', { name: '先确认每一页要讲什么' });
  fireEvent.change(screen.getByRole('textbox', { name: '页面标题' }), {
    target: { value: 'Revised planned title' },
  });
  await waitFor(() => expect(locked).toHaveBeenLastCalledWith(true));
  expect(
    (screen.getByRole('button', { name: /我的文稿/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '恢复原计划' }));
  await waitFor(() => expect(locked).toHaveBeenLastCalledWith(false));
});

it('blocks normal export for unresolved source errors and offers targeted repair', async () => {
  const job: PresentationJob = {
    ...deck('blocked'),
    quality: {
      version: '2',
      status: 'blocked',
      checkedAt: 1,
      renderedPages: 2,
      facts: { total: 1, candidates: 0, missing: 1 },
      issues: [
        {
          code: 'semantic-contradicted',
          severity: 'error',
          page: 2,
          message: 'Wrong amount',
        },
      ],
    },
  };
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url) === '/api/presentations'
      ? json({ presentations: [{ ...job, title: 'blocked' }] })
      : json(job),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '当前文稿' }));
  expect(await screen.findByText('Wrong amount')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /下载 PPTX/ })).toBeNull();
  expect(screen.getByRole('button', { name: '修复第 2 页' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '记录人工验收' })).toBeNull();
});
