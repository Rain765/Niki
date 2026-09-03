// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromptTemplatesTab } from '../../src/components/PromptTemplatesTab';
import type { PromptTemplateSummary } from '../../src/types';

afterEach(cleanup);

const templates: PromptTemplateSummary[] = [
  {
    id: 'one',
    surface: 'image',
    title: 'One',
    summary: 'First template',
    category: 'Campaign',
    source: { repo: 'YouMind-OpenLab/awesome-gpt-image-2', license: 'MIT' },
  },
  {
    id: 'two',
    surface: 'image',
    title: 'Two',
    summary: 'Second template',
    category: 'Product',
    source: { repo: 'nexu-io/open-design', license: 'MIT' },
  },
];

describe('PromptTemplatesTab mobile filter layout', () => {
  it('marks three filters and the result count for the shared grid', () => {
    const { container } = render(
      <PromptTemplatesTab surface="image" templates={templates} onPreview={vi.fn()} />,
    );

    const toolbar = container.querySelector('.prompt-templates-panel > .od-filter-grid');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.querySelectorAll('.od-filter-grid__item')).toHaveLength(3);
    expect(toolbar?.querySelector('.od-filter-grid__wide')).toBeTruthy();
    expect(toolbar?.querySelector('.od-filter-grid__meta')).toBeTruthy();
  });
});
