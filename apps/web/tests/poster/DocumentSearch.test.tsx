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
    vi.spyOn(window, 'open').mockImplementation(() => null);
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

  it('opens a pasted Feishu link directly without calling search', () => {
    render(<DocumentSearch />);
    const input = screen.getByRole('textbox', {
      name: 'Search Feishu documents or paste a link',
    });
    fireEvent.change(input, {
      target: { value: 'https://acme.feishu.cn/docx/DirectDoc123' },
    });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(window.open).toHaveBeenCalledWith(
      'https://acme.feishu.cn/docx/DirectDoc123',
      '_blank',
      'noopener,noreferrer',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
