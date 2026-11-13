// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentSearch,
  parseFeishuDocumentUrl,
} from '../../src/poster/DocumentSearch';
import { I18nProvider } from '../../src/i18n';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function workspaceProject() {
  return {
    id: 'documents-project',
    name: 'Product documents',
    skillId: null,
    designSystemId: null,
    metadata: {
      kind: 'other',
      documentWorkspace: { version: 1, source: 'feishu' },
    },
    createdAt: 100,
    updatedAt: 200,
  };
}

describe('DocumentSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recognizes supported Feishu document links without accepting lookalike hosts', () => {
    expect(parseFeishuDocumentUrl('https://acme.feishu.cn/docx/AbCdEf123')).toBe(
      'https://acme.feishu.cn/docx/AbCdEf123',
    );
    expect(parseFeishuDocumentUrl('https://acme.feishu.cn/wiki/AbCdEf123')).toBe(
      'https://acme.feishu.cn/wiki/AbCdEf123',
    );
    expect(parseFeishuDocumentUrl(
      'https://biu-tech.feishu.cn/docx/JEQKdwxl3oeWARxEl9mcj5F1nPh 总结下',
    )).toBe(
      'https://biu-tech.feishu.cn/docx/JEQKdwxl3oeWARxEl9mcj5F1nPh',
    );
    expect(parseFeishuDocumentUrl('https://feishu.cn.evil.test/docx/AbCdEf123')).toBeNull();
  });

  it('renders the complete workspace chrome in Chinese', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input) === '/api/projects') return jsonResponse({ projects: [] });
      return jsonResponse({}, 404);
    });

    render(
      <I18nProvider initial="zh-CN">
        <DocumentSearch />
      </I18nProvider>,
    );

    expect(screen.getByRole('textbox', { name: '搜索飞书文档或粘贴链接' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '你想查找什么？' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /新建对话/ })).toBeTruthy();
    expect(await screen.findByText('文档项目会显示在这里。')).toBeTruthy();
    expect(screen.queryByText('New chat')).toBeNull();
    expect(screen.queryByText('Projects')).toBeNull();
  });

  it('uses one input for keyword search and renders matching documents', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/projects') return jsonResponse({ projects: [] });
      if (url === '/api/feishu/documents/search') {
        return jsonResponse({
          query: 'launch plan',
          results: [{
            title: '<h>Launch</h> plan',
            summary: 'The rollout and owner list',
            url: 'https://acme.feishu.cn/docx/LaunchPlan123',
            ownerName: 'Rain',
            updatedAt: 1_786_944_000,
          }],
          total: 1,
          hasMore: false,
        });
      }
      return jsonResponse({}, 404);
    });

    render(<DocumentSearch />);
    const input = screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    });
    fireEvent.change(input, { target: { value: 'launch plan' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/feishu/documents/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'launch plan', pageSize: 12 }),
      }),
    ));
    expect(
      (await screen.findByRole('link', { name: /Launch plan/ })).getAttribute('href'),
    ).toBe('https://acme.feishu.cn/docx/LaunchPlan123');
  });

  it('reads a pasted Feishu link without calling document search', async () => {
    const document = {
      url: 'https://acme.feishu.cn/docx/DirectDoc123',
      documentId: 'DirectDoc123',
      sourceType: 'docx',
      title: 'Direct document',
      content: 'This content came from the pasted link.',
      truncated: false,
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/projects' && method === 'GET') {
        return jsonResponse({ projects: [] });
      }
      if (url === '/api/feishu/documents/read') return jsonResponse(document);
      if (url === '/api/projects' && method === 'POST') {
        return jsonResponse({
          project: workspaceProject(),
          conversationId: 'conversation-1',
        });
      }
      if (url === '/api/projects/documents-project/conversations/conversation-1'
        && method === 'PATCH') {
        return jsonResponse({
          conversation: {
            id: 'conversation-1',
            projectId: 'documents-project',
            title: 'Direct document',
            createdAt: 100,
            updatedAt: 200,
          },
        });
      }
      if (url.includes('/messages/') && method === 'PUT') {
        return jsonResponse({ message: {} });
      }
      return jsonResponse({}, 404);
    });

    render(<DocumentSearch />);
    const input = screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    });
    fireEvent.change(input, {
      target: { value: 'https://acme.feishu.cn/docx/DirectDoc123 summarize this' },
    });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/feishu/documents/read',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://acme.feishu.cn/docx/DirectDoc123',
        }),
      }),
    ));
    expect(await screen.findByText('Direct document')).toBeTruthy();
    expect(screen.getAllByText('This content came from the pasted link.')).toHaveLength(2);
    expect(vi.mocked(fetch).mock.calls.some(
      ([url]) => String(url).includes('/search'),
    )).toBe(false);
  });

  it('restores saved summaries from the Recent navigation', async () => {
    const project = workspaceProject();
    const conversation = {
      id: 'conversation-1',
      projectId: project.id,
      title: 'Saved launch plan',
      createdAt: 100,
      updatedAt: Date.now(),
    };
    const savedDocument = {
      url: 'https://acme.feishu.cn/docx/SavedDoc123',
      documentId: 'SavedDoc123',
      sourceType: 'docx',
      title: 'Saved launch plan',
      content: 'The full saved source document.',
      truncated: false,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/projects') return jsonResponse({ projects: [project] });
      if (url === `/api/projects/${project.id}/conversations`) {
        return jsonResponse({ conversations: [conversation] });
      }
      if (url.endsWith('/messages')) {
        return jsonResponse({
          messages: [{
            id: 'user-1',
            role: 'user',
            content: 'Summarize this document',
            createdAt: 100,
          }, {
            id: 'assistant-1',
            role: 'assistant',
            content: 'A saved summary.',
            createdAt: 101,
            events: [{
              kind: 'raw',
              line: `niki-feishu-document:${JSON.stringify(savedDocument)}`,
            }],
          }],
        });
      }
      return jsonResponse({}, 404);
    });

    render(<DocumentSearch />);
    expect(await screen.findByRole('button', { name: /Saved launch plan/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Saved launch plan/ }));

    expect(await screen.findByText('A saved summary.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in Feishu/ }).getAttribute('href')).toBe(
      savedDocument.url,
    );
  });
});
