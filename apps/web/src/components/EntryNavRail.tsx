// Lovart-style top navigation for the entry view.
//
// Renders a compact horizontal bar. The first slot is the brand
// logo (clicking navigates to home), followed by the primary Home and
// Projects destinations. Secondary product surfaces stay deep-linkable
// without competing for permanent navigation space.
// Primary destinations remain directly visible on small screens so the
// mobile entry view never requires an extra menu interaction.
// The trailing slot is owned by EntryShell so the settings menu can
// share the same execution/model state as the rest of the entry view.

import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { UpdaterPopup } from './UpdaterPopup';
import { useT } from '../i18n';

export type EntryView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'design-systems'
  | 'integrations';

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  settingsControl: ReactNode;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}

interface NavItem {
  id: string;
  view?: Exclude<EntryView, 'onboarding'>;
  label: string;
  icon: IconName;
  active?: boolean;
  onClick: () => void;
  testId: string;
}

function NavButton({ active, ariaLabel, tooltip, onClick, testId, children }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-tooltip={tooltip}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {children}
    </button>
  );
}

export function EntryNavRail({ view, onViewChange, settingsControl }: Props) {
  const t = useT();
  const brandLabel = t('app.brand');
  const navItems: NavItem[] = [
    {
      id: 'home',
      view: 'home',
      label: t('entry.navHome'),
      icon: 'home',
      active: view === 'home',
      onClick: () => onViewChange('home'),
      testId: 'entry-nav-home',
    },
    {
      id: 'projects',
      view: 'projects',
      label: t('entry.navProjects'),
      icon: 'folder',
      active: view === 'projects',
      onClick: () => onViewChange('projects'),
      testId: 'entry-nav-projects',
    },
  ];

  return (
    <nav className="entry-nav-rail" aria-label="Primary">
      <div className="entry-nav-rail__brand-row">
        <button
          type="button"
          className="entry-nav-rail__logo"
          onClick={() => onViewChange('home')}
          aria-label={brandLabel}
          data-tooltip={brandLabel}
          data-testid="entry-nav-logo"
        >
          <img
            src="/app-icon.svg?v=20260527"
            alt=""
            className="entry-nav-rail__logo-img"
            draggable={false}
          />
        </button>
        <span className="entry-nav-rail__wordmark" aria-hidden>
          Niki
        </span>
      </div>
      <div className="entry-nav-rail__group entry-nav-rail__group--primary">
        <UpdaterPopup />
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            active={item.active}
            ariaLabel={item.label}
            tooltip={item.label}
            onClick={item.onClick}
            testId={item.testId}
          >
            <Icon name={item.icon} size={18} />
            <span className="entry-nav-rail__btn-label">{item.label}</span>
          </NavButton>
        ))}
      </div>
      <div className="entry-nav-rail__footer">{settingsControl}</div>
    </nav>
  );
}
