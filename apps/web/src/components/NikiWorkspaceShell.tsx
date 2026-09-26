import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  ExecMode,
  Project,
} from '../types';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { WorkspaceAccountMenu } from './WorkspaceAccountMenu';
import { isDirectLoanPosterProject } from './home-hero/zambia-posters';
import { useNikiAuth } from '../auth/NikiAuth';

interface Props {
  projects: Project[];
  activeProjectId: string | null;
  activeView?: 'home' | 'project' | 'design-files';
  projectsLoading?: boolean;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onOpenDesignFiles: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'orbit'
      | 'integrations'
      | 'mcpClient'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'library'
      | 'about'
      | 'memory'
      | 'designSystems',
  ) => void;
  children: ReactNode;
}

const DEFAULT_SIDEBAR_WIDTH = 264;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_WIDTH_STEP = 16;
const SIDEBAR_WIDTH_STORAGE_KEY = 'niki.workspace.sidebarWidth';

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function readSidebarWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
  try {
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0
      ? clampSidebarWidth(saved)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function NikiWorkspaceShell({
  projects,
  activeProjectId,
  activeView = activeProjectId ? 'project' : 'home',
  projectsLoading = false,
  onOpenProject,
  onNewProject,
  onOpenDesignFiles,
  onRenameProject,
  onDeleteProject,
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onThemeChange,
  onOpenSettings,
  children,
}: Props) {
  const t = useT();
  const nikiAuth = useNikiAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const stopSidebarResizeRef = useRef<(() => void) | null>(null);
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );
  const projectSequenceById = useMemo(() => {
    const chronological = [...projects].sort((a, b) => (
      a.createdAt - b.createdAt || a.id.localeCompare(b.id)
    ));
    return new Map(
      chronological.map((project, index) => [project.id, index + 1]),
    );
  }, [projects]);
  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) ?? null
    : null;
  const directPosterProjectActive = activeView === 'project'
    && isDirectLoanPosterProject(activeProject?.skillId, activeProject?.metadata);

  const updateSidebarWidth = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // Storage can be unavailable in embedded or privacy-restricted webviews.
    }
  }, []);

  const startSidebarResize = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopSidebarResizeRef.current?.();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateSidebarWidth(startWidth + moveEvent.clientX - startX);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      stopSidebarResizeRef.current = null;
    };
    stopSidebarResizeRef.current = stop;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [sidebarWidth, updateSidebarWidth]);

  useEffect(() => () => stopSidebarResizeRef.current?.(), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuProjectId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuProjectId(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuProjectId]);

  function openProject(id: string) {
    setDrawerOpen(false);
    setMenuProjectId(null);
    onOpenProject(id);
  }

  function startNewProject() {
    setDrawerOpen(false);
    setMenuProjectId(null);
    onNewProject();
  }

  function openDesignFiles() {
    setDrawerOpen(false);
    setMenuProjectId(null);
    onOpenDesignFiles();
  }

  function renameProject(project: Project) {
    setMenuProjectId(null);
    const nextName = window.prompt(t('designs.renamePrompt'), project.name);
    if (nextName?.trim() && nextName.trim() !== project.name) {
      onRenameProject(project.id, nextName.trim());
    }
  }

  function deleteProject(project: Project) {
    setMenuProjectId(null);
    if (window.confirm(t('designs.deleteConfirm', { name: project.name }))) {
      onDeleteProject(project.id);
    }
  }

  const sidebar = (
    <aside
      className="niki-workspace__sidebar"
      aria-label={t('recentProjects.title')}
      data-testid="niki-project-sidebar"
    >
      <div className="niki-workspace__sidebar-head">
        <button
          type="button"
          className="niki-workspace__brand"
          onClick={startNewProject}
          aria-label={t('app.brand')}
        >
          <img
            src="/app-icon.svg?v=20260527"
            alt=""
            className="niki-workspace__brand-icon"
            draggable={false}
          />
          <span>Niki</span>
        </button>
        <button
          type="button"
          className="niki-workspace__drawer-close"
          onClick={() => setDrawerOpen(false)}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <button
        type="button"
        className={`niki-workspace__new${activeView === 'home' ? ' is-active' : ''}`}
        onClick={startNewProject}
        data-testid="niki-new-project"
      >
        <Icon name="plus" size={17} />
        <span>{t('chat.newConversation')}</span>
      </button>

      <button
        type="button"
        className={`niki-workspace__design-files${
          activeView === 'design-files' ? ' is-active' : ''
        }`}
        onClick={openDesignFiles}
        data-testid="niki-design-files"
      >
        <Icon name="image" size={17} />
        <span>{t('workspace.designFiles')}</span>
      </button>

      <div className="niki-workspace__section-label">{t('recentProjects.title')}</div>
      <div className="niki-workspace__project-list">
        {projectsLoading && sortedProjects.length === 0 ? (
          <div className="niki-workspace__empty">{t('common.loading')}</div>
        ) : sortedProjects.length === 0 ? (
          <div className="niki-workspace__empty">{t('recentProjects.empty')}</div>
        ) : (
          sortedProjects.map((project) => {
            const active = project.id === activeProjectId;
            const menuOpen = project.id === menuProjectId;
            return (
              <div
                key={project.id}
                className={`niki-workspace__project-row${active ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="niki-workspace__project-link"
                  onClick={() => openProject(project.id)}
                  aria-current={active ? 'page' : undefined}
                  title={projectDisplayName(project, projectSequenceById.get(project.id))}
                >
                  <Icon name="folder" size={16} />
                  <span>{projectDisplayName(project, projectSequenceById.get(project.id))}</span>
                </button>
                <div
                  className="niki-workspace__project-actions"
                  ref={menuOpen ? menuRef : undefined}
                >
                  <button
                    type="button"
                    className="niki-workspace__project-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuProjectId((current) => (
                        current === project.id ? null : project.id
                      ));
                    }}
                    aria-label={`${project.name} · ${t('common.rename')}`}
                    aria-expanded={menuOpen}
                  >
                    <Icon name="more-horizontal" size={16} />
                  </button>
                  {menuOpen ? (
                    <div className="niki-workspace__project-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => renameProject(project)}>
                        <Icon name="edit" size={15} />
                        <span>{t('common.rename')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => deleteProject(project)}
                      >
                        <Icon name="trash" size={15} />
                        <span>{t('common.delete')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <WorkspaceAccountMenu
        username={nikiAuth.user.name}
        avatarUrl={nikiAuth.user.avatarUrl}
        isAdmin={nikiAuth.user.role === 'admin'}
        onLogout={nikiAuth.enabled ? nikiAuth.logout : undefined}
        config={config}
        agents={agents}
        daemonLive={daemonLive}
        onModeChange={onModeChange}
        onAgentChange={onAgentChange}
        onAgentModelChange={onAgentModelChange}
        onApiProtocolChange={onApiProtocolChange}
        onApiModelChange={onApiModelChange}
        onThemeChange={onThemeChange}
        onOpenSettings={(section) => {
          setDrawerOpen(false);
          onOpenSettings(section);
        }}
      />
    </aside>
  );

  return (
    <div
      className={[
        'niki-workspace',
        drawerOpen ? 'is-drawer-open' : '',
        directPosterProjectActive ? 'is-direct-poster-project' : '',
      ].filter(Boolean).join(' ')}
      style={{
        '--niki-sidebar-width': `${sidebarWidth}px`,
      } as CSSProperties}
    >
      <header className="niki-workspace__mobile-header">
        <button
          type="button"
          className="niki-workspace__menu-button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('recentProjects.title')}
          aria-expanded={drawerOpen}
          aria-controls="niki-project-drawer"
        >
          <Icon name="menu" size={21} />
        </button>
        <div className="niki-workspace__mobile-title">
          {directPosterProjectActive
            ? null
            : activeView === 'design-files'
            ? t('workspace.designFiles')
            : activeProject
              ? projectDisplayName(
                  activeProject,
                  projectSequenceById.get(activeProject.id),
                )
              : 'Niki'}
        </div>
        <button
          type="button"
          className="niki-workspace__mobile-new"
          onClick={startNewProject}
          aria-label={t('chat.newConversation')}
        >
          <Icon name="plus" size={20} />
        </button>
      </header>

      <div id="niki-project-drawer" className="niki-workspace__sidebar-slot">
        {sidebar}
        <div
          className="niki-workspace__sidebar-resize"
          role="separator"
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={startSidebarResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              updateSidebarWidth(sidebarWidth - SIDEBAR_WIDTH_STEP);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              updateSidebarWidth(sidebarWidth + SIDEBAR_WIDTH_STEP);
            } else if (event.key === 'Home') {
              event.preventDefault();
              updateSidebarWidth(MIN_SIDEBAR_WIDTH);
            } else if (event.key === 'End') {
              event.preventDefault();
              updateSidebarWidth(MAX_SIDEBAR_WIDTH);
            }
          }}
        />
      </div>
      <button
        type="button"
        className="niki-workspace__scrim"
        onClick={() => setDrawerOpen(false)}
        aria-label={t('common.close')}
        tabIndex={drawerOpen ? 0 : -1}
      />
      <main className="niki-workspace__main">{children}</main>
    </div>
  );
}

function projectDisplayName(project: Project, sequence?: number): string {
  const normalized = project.name
    .replace(/\s*贷款海报\s*/gu, ' ')
    .replace(
      /\s*[·•]\s*20\d{2}(?:[-/.年]\d{1,2})?(?:[-/.月]\d{1,2}日?)?\s*$/u,
      '',
    )
    .replace(/\s+/gu, ' ')
    .trim();
  const baseName = normalized || project.name;
  return sequence
    ? `${baseName} · ${String(sequence).padStart(3, '0')}`
    : baseName;
}
