// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnglishPractice } from '../../src/poster/EnglishPractice';
import { I18nProvider } from '../../src/i18n';

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
  const renderPractice = () => render(
    <I18nProvider initial="zh-CN">
      <EnglishPractice />
    </I18nProvider>,
  );

  it('shows ten stable life scenarios and opens the complete coffee lesson', () => {
    renderPractice();

    expect(screen.getByRole('heading', { name: '10 个经典生活场景' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /A1|A2|B1/ })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: /咖啡店点餐.*Ordering at a Coffee Shop/ }));

    expect(screen.getByRole('heading', { name: '咖啡店点餐' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'latte' })).toBeTruthy();
    expect(screen.getAllByLabelText(/播放第/)).toHaveLength(12);
  });

  it('opens a contextual word card and saves the word to the vocabulary book', () => {
    renderPractice();
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
    renderPractice();
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

  it('opens the IELTS coach inside Daily English and starts a one-question-at-a-time diagnosis', () => {
    renderPractice();

    fireEvent.click(screen.getByRole('tab', { name: /IELTS 口语教练/ }));

    expect(screen.getByRole('heading', { name: '把语块练成随时能用的表达' })).toBeTruthy();
    expect(screen.getByText(/均标注为“模拟题”/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '工作与学习' }).className).toContain('is-active');

    fireEvent.click(screen.getByRole('button', { name: /开始 Part 1 诊断/ }));

    expect(screen.getByRole('heading', { name: 'Do you work or are you a student?' })).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.queryByText('What do you enjoy most about your work or studies?')).toBeNull();
  });

  it('moves from diagnosis to replaceable chunks and reveals transfer hints progressively', () => {
    renderPractice();
    fireEvent.click(screen.getByRole('tab', { name: /IELTS 口语教练/ }));
    fireEvent.click(screen.getByRole('button', { name: /开始 Part 1 诊断/ }));

    fireEvent.click(screen.getByRole('button', { name: '完成回答，下一题' }));
    fireEvent.click(screen.getByRole('button', { name: '完成回答，下一题' }));
    fireEvent.click(screen.getByRole('button', { name: '完成诊断，查看目标语块' }));

    expect(screen.getByRole('heading', { name: 'play a major role in [something]' })).toBeTruthy();
    expect(screen.getByText('[something] 可替换为名词或动名词短语')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存并练下一个语块' }));
    fireEvent.click(screen.getByRole('button', { name: '保存并练下一个语块' }));
    fireEvent.click(screen.getByRole('button', { name: '进入跨题迁移' }));

    expect(screen.getByRole('heading', { name: 'What helps you stay productive?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '我卡住了，给提示' }));
    expect(screen.getByText('想一个真实的习惯、工具或环境。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '再给一点提示' }));
    expect(screen.getByText('… plays a major role in …')).toBeTruthy();
  });

  it('renders the practice shell and IELTS setup in English', () => {
    render(
      <I18nProvider initial="en">
        <EnglishPractice />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: '10 classic life scenarios' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ordering at a Coffee Shop/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /IELTS speaking coach/ }));
    expect(screen.getByRole('heading', {
      name: 'Turn chunks into expressions you can use on demand',
    })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Work & study' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '工作与学习' })).toBeNull();
  });
});
