// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentSearch,
  parseFeishuDocumentUrl,
} from '../../src/poster/DocumentSearch';

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
    expect(parseFeishuDocumentUrl('https://feishu.cn.evil.test/docx/AbCdEf123')).toBeNull();
  });

  it('uses one input for keyword search and renders matching documents', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
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
    }), { status: 200 }));

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
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      url: 'https://acme.feishu.cn/docx/DirectDoc123',
      documentId: 'DirectDoc123',
      sourceType: 'docx',
      title: 'Direct document',
      content: 'This content came from the pasted link.',
      truncated: false,
    }), { status: 200 }));

    render(<DocumentSearch />);
    const input = screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    });
    fireEvent.change(input, {
      target: { value: 'https://acme.feishu.cn/docx/DirectDoc123' },
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
    expect(screen.getByText('Direct document')).toBeTruthy();
    expect(screen.getByText('This content came from the pasted link.')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(
      ([url]) => String(url).includes('/search'),
    )).toBe(false);
  });
});
