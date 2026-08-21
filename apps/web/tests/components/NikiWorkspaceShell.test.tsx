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
    createdAt: 1,
    updatedAt: 10,
  },
  {
    id: 'newer',
    name: 'Newer project',
    skillId: null,
    designSystemId: null,
    createdAt: 2,
    updatedAt: 20,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

function renderShell(overrides: Partial<Parameters<typeof NikiWorkspaceShell>[0]> = {}) {
  const props: Parameters<typeof NikiWorkspaceShell>[0] = {
    projects,
    activeProjectId: 'newer',
    onOpenProject: vi.fn(),
    onNewProject: vi.fn(),
    onOpenDesignFiles: vi.fn(),
    onOpenLogoStudio: vi.fn(),
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

    const links = screen.getAllByRole('button', { name: /project/i });
    const projectLinks = links.filter((button) => (
      button.textContent?.startsWith('Newer project')
      || button.textContent?.startsWith('Older project')
    ));
    expect(projectLinks.map((button) => button.textContent)).toEqual([
      'Newer project · 002',
      'Older project · 001',
    ]);
    expect(
      screen
        .getByRole('button', { name: 'Newer project · 002' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('opens the mobile drawer and selects a project without leaving the shell', () => {
    const props = renderShell();
    const menuButton = screen.getByRole('button', { name: '聊天' });

    expect(document.querySelector('.niki-workspace__mobile-title')).toBeNull();
    expect(document.querySelector('.niki-workspace__mobile-new')).toBeNull();
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Older project · 001' }));
    expect(props.onOpenProject).toHaveBeenCalledWith('older');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
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

  it('places Logo Studio last in the title dropdown and opens it', () => {
    const props = renderShell({ activeView: 'logo' });
    fireEvent.click(screen.getByTestId('niki-title-menu-trigger'));

    const menu = screen.getByTestId('niki-title-menu');
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    expect(items.at(-1)?.textContent).toContain('Logo Studio');

    fireEvent.click(screen.getByTestId('niki-title-logo-studio'));
    expect(props.onOpenLogoStudio).toHaveBeenCalledTimes(1);
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
