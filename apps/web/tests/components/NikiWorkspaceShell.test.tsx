// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import { I18nProvider } from '../../src/i18n';
import { NikiWorkspaceShell } from '../../src/components/NikiWorkspaceShell';
import { DEFAULT_CONFIG } from '../../src/state/config';

const projects: Project[] = [
  {
    id: 'older',
    name: 'Older project',
    skillId: null,
    designSystemId: null,
    createdAt: new Date(2026, 5, 3, 8).getTime(),
    updatedAt: new Date(2026, 5, 3, 9).getTime(),
  },
  {
    id: 'newer',
    name: 'BiuMoney 贷款海报 · 2026-07-28',
    skillId: null,
    designSystemId: null,
    createdAt: new Date(2026, 6, 28, 8).getTime(),
    updatedAt: new Date(2026, 6, 28, 9).getTime(),
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.style.overflow = '';
});

function renderShell(overrides: Partial<Parameters<typeof NikiWorkspaceShell>[0]> = {}) {
  const props: Parameters<typeof NikiWorkspaceShell>[0] = {
    projects,
    activeProjectId: 'newer',
    onOpenProject: vi.fn(),
    onNewProject: vi.fn(),
    onOpenDesignFiles: vi.fn(),
    onRenameProject: vi.fn(),
    onDeleteProject: vi.fn(),
    config: DEFAULT_CONFIG,
    agents: [],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onThemeChange: vi.fn(),
    onOpenSettings: vi.fn(),
    children: <div>Workspace content</div>,
    ...overrides,
  };
  render(
    <I18nProvider initial="zh-CN">
      <NikiWorkspaceShell {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('NikiWorkspaceShell', () => {
  it('shows recent projects newest first and marks the active project', () => {
    renderShell();

    const projectLinks = Array.from(
      screen
        .getByTestId('niki-project-sidebar')
        .querySelectorAll<HTMLButtonElement>('.niki-workspace__project-link'),
    );
    expect(projectLinks.map((button) => button.textContent)).toEqual([
      'BiuMoney · 002',
      'Older project · 001',
    ]);
    expect(
      screen.getByRole('button', { name: 'BiuMoney · 002' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('opens the mobile drawer and selects a project without leaving the shell', () => {
    const props = renderShell();
    const menuButton = screen.getByRole('button', { name: '聊天' });

    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Older project · 001' }));
    expect(props.onOpenProject).toHaveBeenCalledWith('older');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes a keyboard-resizable desktop sidebar separator', () => {
    renderShell();

    const separator = screen.getByRole('separator', { name: '调整侧边栏宽度' });
    expect(separator.getAttribute('aria-valuenow')).toBe('264');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('280');
  });

  it('opens the global design files view from the sidebar', () => {
    const props = renderShell({ activeView: 'home' });

    fireEvent.click(screen.getByTestId('niki-design-files'));

    expect(props.onOpenDesignFiles).toHaveBeenCalledTimes(1);
  });

  it('returns to the generator from the new-project action', () => {
    const props = renderShell();
    fireEvent.click(screen.getByTestId('niki-new-project'));
    expect(props.onNewProject).toHaveBeenCalledTimes(1);
  });

  it('restores the account menu with runtime controls and full settings', () => {
    const props = renderShell();

    fireEvent.click(screen.getByTestId('niki-account-menu-trigger'));
    expect(screen.getByTestId('niki-account-menu-popover')).toBeTruthy();
    expect(screen.getByTestId('inline-model-switcher')).toBeTruthy();

    fireEvent.click(screen.getByTestId('niki-account-shortcuts'));
    expect(screen.getByTestId('niki-account-shortcut-list').textContent).toContain('Enter');
    expect(screen.getByTestId('niki-account-shortcut-list').textContent).toContain('Shift + Enter');

    fireEvent.click(screen.getByTestId('niki-account-open-settings'));
    expect(props.onOpenSettings).toHaveBeenCalledWith(undefined);
  });
});
