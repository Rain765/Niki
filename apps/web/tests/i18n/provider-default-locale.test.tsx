// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { I18nProvider, useT } from '../../src/i18n';

function CancelLabel() {
  const t = useT();
  return <span>{t('common.cancel')}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

it('uses the app default locale when the user has not chosen a language', async () => {
  render(
    <I18nProvider defaultLocale="zh-CN" deferUntilClient>
      <CancelLabel />
    </I18nProvider>,
  );

  expect(await screen.findByText('取消')).toBeTruthy();
});

it('keeps a saved user language ahead of the app default', async () => {
  window.localStorage.setItem('open-design:locale', 'en');

  render(
    <I18nProvider defaultLocale="zh-CN" deferUntilClient>
      <CancelLabel />
    </I18nProvider>,
  );

  expect(await screen.findByText('Cancel')).toBeTruthy();
});
