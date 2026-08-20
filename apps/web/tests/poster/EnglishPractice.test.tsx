// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnglishPractice } from '../../src/poster/EnglishPractice';

class SpeechSynthesisUtteranceStub {
  lang = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public text: string) {}
}

const speechSynthesisStub = {
  cancel: vi.fn(),
  getVoices: vi.fn(() => []),
  speak: vi.fn((utterance: SpeechSynthesisUtteranceStub) => utterance.onend?.()),
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('SpeechSynthesisUtterance', SpeechSynthesisUtteranceStub);
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: speechSynthesisStub,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('EnglishPractice', () => {
  it('shows ten stable life scenarios and opens the complete coffee lesson', () => {
    render(<EnglishPractice />);

    expect(screen.getByRole('heading', { name: '10 个经典生活场景' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /A1|A2|B1/ })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: /咖啡店点餐.*Ordering at a Coffee Shop/ }));

    expect(screen.getByRole('heading', { name: '咖啡店点餐' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'latte' })).toBeTruthy();
    expect(screen.getAllByLabelText(/播放第/)).toHaveLength(12);
  });

  it('opens a contextual word card and saves the word to the vocabulary book', () => {
    render(<EnglishPractice />);
    fireEvent.click(screen.getByRole('button', { name: /咖啡店点餐.*Ordering at a Coffee Shop/ }));
    fireEvent.click(screen.getByRole('button', { name: 'latte' }));

    const card = screen.getByRole('dialog', { name: 'latte 单词卡' });
    expect(within(card).getByText('/ˈlɑːteɪ/')).toBeTruthy();
    expect(within(card).getByText('以浓缩咖啡和蒸奶制成的饮品。')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: '收藏单词' }));
    fireEvent.click(within(card).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '全部场景' }));
    fireEvent.click(screen.getByRole('button', { name: /生词本/ }));

    expect(screen.getByText('latte')).toBeTruthy();
    expect(window.localStorage.getItem('niki:daily-english-practice:v1')).toContain('latte');
  });

  it('supports role play, hidden Chinese, listen-only mode, and playback speed', () => {
    render(<EnglishPractice />);
    fireEvent.click(screen.getByRole('button', { name: /咖啡店点餐.*Ordering at a Coffee Shop/ }));

    fireEvent.click(screen.getByRole('button', { name: '我演 A' }));
    expect(screen.getAllByText('轮到你说')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: /中文/ }));
    expect(screen.queryByText('早上好！请问想点些什么？')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /只听不看/ }));
    expect(screen.getAllByText(/点击播放第/)).toHaveLength(12);

    fireEvent.click(screen.getByRole('button', { name: '1.25×' }));
    fireEvent.click(screen.getByText('点击播放第 1 句'));
    expect(speechSynthesisStub.speak).toHaveBeenCalled();
    expect((speechSynthesisStub.speak.mock.calls.at(-1)?.[0] as SpeechSynthesisUtteranceStub).rate).toBe(1.25);
  });
});
