// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CompetitorGallery,
  filterCompetitorScreenshots,
} from '../../src/components/CompetitorGallery';
import type { CompetitorScreenshot } from '../../src/components/competitor-screenshots';
import { COMPETITOR_SCREENSHOTS } from '../../src/components/competitor-screenshots';

const screenshots: CompetitorScreenshot[] = [
  {
    id: 'alpha-home',
    title: 'Alpha 首页',
    category: '首页',
    brand: 'Alpha Credit',
    tags: ['推荐'],
    src: '/competitors/alpha-home.png',
  },
  {
    id: 'beta-home',
    title: 'Beta 首页',
    category: '首页',
    brand: 'Beta Loan',
    src: '/competitors/beta-home.png',
  },
  {
    id: 'alpha-apply',
    title: 'Alpha 申请页',
    category: '申请流程',
    brand: 'Alpha Credit',
    src: '/competitors/alpha-apply.png',
  },
];

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('CompetitorGallery', () => {
  it('ships the complete reviewed credit-product catalogue', () => {
    const counts = Object.fromEntries(
      Array.from(new Set(COMPETITOR_SCREENSHOTS.map((item) => item.category)))
        .map((category) => [
          category,
          COMPETITOR_SCREENSHOTS.filter((item) => item.category === category).length,
        ]),
    );

    expect(COMPETITOR_SCREENSHOTS).toHaveLength(100);
    expect(counts).toEqual({
      '首页与信贷入口': 10,
      '注册与身份验证': 6,
      '借款申请与资料填写': 7,
      '额度、提额与续借': 15,
      '金额、期限与费用试算': 24,
      '审核结果与放款': 14,
      '合同与条款确认': 4,
      '借款详情与账单管理': 7,
      '还款与支付结果': 13,
    });
    expect(COMPETITOR_SCREENSHOTS.every((item) => (
      item.src.startsWith('https://') && item.sourcePage?.startsWith('https://')
    ))).toBe(true);
  });

  it('filters by category and searchable metadata', () => {
    expect(filterCompetitorScreenshots(screenshots, '首页', '')).toHaveLength(2);
    expect(filterCompetitorScreenshots(screenshots, '全部', '推荐')).toEqual([
      screenshots[0],
    ]);
    expect(filterCompetitorScreenshots(screenshots, '申请流程', 'beta')).toEqual([]);
  });

  it('shows category counts, filters the grid, and clears search', () => {
    render(<CompetitorGallery screenshots={screenshots} />);

    expect(screen.getAllByRole('button', { name: /预览/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /申请流程/ }));
    expect(screen.getAllByRole('button', { name: /预览/ })).toHaveLength(1);
    expect(screen.getByText('Alpha 申请页')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索竞品截图' }), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('没有匹配的截图')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '清除搜索' })[1]!);
    expect(screen.getByText('Alpha 申请页')).toBeTruthy();
  });

  it('opens a lightbox and supports keyboard navigation and escape', () => {
    render(<CompetitorGallery screenshots={screenshots} />);

    fireEvent.click(screen.getByRole('button', { name: '预览 Alpha 首页' }));
    expect(screen.getByTestId('competitor-gallery-lightbox').textContent)
      .toContain('Alpha 首页');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('competitor-gallery-lightbox').textContent)
      .toContain('Beta 首页');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('competitor-gallery-lightbox')).toBeNull();
  });

  it('shows a branded fallback when a remote image cannot load', () => {
    render(<CompetitorGallery screenshots={[screenshots[0]!]} />);

    const image = screen.getByAltText('Alpha 首页') as HTMLImageElement;
    fireEvent.error(image);

    expect(image.hidden).toBe(true);
    expect(screen.getAllByText('Alpha Credit')).toHaveLength(2);
    expect(screen.getByText('点击查看原图')).toBeTruthy();
  });

  it('renders a useful empty state before assets are imported', () => {
    render(<CompetitorGallery screenshots={[]} />);
    expect(screen.getByTestId('competitor-gallery-empty').textContent)
      .toContain('竞品素材待导入');
  });
});
