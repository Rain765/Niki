// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/components/UpdaterPopup', () => ({
  UpdaterPopup: () => <div data-testid="entry-updater" />,
}));

afterEach(() => {
  cleanup();
});

describe('EntryNavRail', () => {
  it('keeps Home and Projects directly available without a navigation dropdown', () => {
    const onViewChange = vi.fn();

    render(
      <I18nProvider initial="zh-CN">
        <EntryNavRail
          view="home"
          onViewChange={onViewChange}
          settingsControl={<button type="button">设置</button>}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId('entry-nav-home')).toBeTruthy();
    expect(screen.getByTestId('entry-nav-projects')).toBeTruthy();
    expect(screen.queryByTestId('entry-nav-menu-toggle')).toBeNull();

    fireEvent.click(screen.getByTestId('entry-nav-projects'));
    expect(onViewChange).toHaveBeenCalledWith('projects');

    fireEvent.click(screen.getByTestId('entry-nav-home'));
    expect(onViewChange).toHaveBeenCalledWith('home');
  });
});
