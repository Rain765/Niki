import { useEffect, useRef, useState } from 'react';
import { LOCALE_LABEL, LOCALES, useI18n, useT, type Locale } from '../i18n';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  ExecMode,
} from '../types';
import { Icon } from './Icon';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { PasswordAccountManager } from '../auth/PasswordAccountManager';
import { PasswordChangeDialog } from '../auth/PasswordChangeDialog';

type SettingsSection =
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
  | 'designSystems';

interface Props {
  username: string;
  avatarUrl?: string;
  onLogout?: () => Promise<void>;
  isAdmin?: boolean;
  canChangePassword?: boolean;
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
  onOpenSettings: (section?: SettingsSection) => void;
}

type AppearanceThemeLabel =
  | 'settings.themeSystem'
  | 'settings.themeLight'
  | 'settings.themeDark';

const APPEARANCE_THEMES: ReadonlyArray<{
  value: AppTheme;
  labelKey: AppearanceThemeLabel;
}> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
];

const APPEARANCE_LABEL: Record<AppTheme, AppearanceThemeLabel> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

export function WorkspaceAccountMenu({
  username,
  avatarUrl,
  onLogout,
  isAdmin = false,
  canChangePassword = false,
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
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [shortcutsExpanded, setShortcutsExpanded] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const normalizedUsername = username.trim() || 'niki';
  const avatarLabel = Array.from(normalizedUsername)[0]?.toUpperCase() ?? 'N';

  useEffect(() => {
    if (!open) {
      setLanguageExpanded(false);
      setAppearanceExpanded(false);
      setShortcutsExpanded(false);
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="avatar-menu niki-workspace__account-menu" ref={wrapRef}>
      <button
        type="button"
        className="niki-workspace__account-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={normalizedUsername}
        data-testid="niki-account-menu-trigger"
      >
        <AccountAvatar avatarUrl={avatarUrl} label={avatarLabel} />
        <span className="niki-workspace__account-name">{normalizedUsername}</span>
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={13}
          className="niki-workspace__account-chevron"
        />
      </button>

      {open ? (
        <div
          className="avatar-popover niki-workspace__account-popover"
          role="menu"
          data-testid="niki-account-menu-popover"
        >
          <div className="niki-workspace__account-popover-head">
            <AccountAvatar avatarUrl={avatarUrl} label={avatarLabel} />
            <span>{normalizedUsername}</span>
          </div>

          <div className="avatar-popover__model-switcher">
            <InlineModelSwitcher
              config={config}
              agents={agents}
              daemonLive={daemonLive}
              onModeChange={onModeChange}
              onAgentChange={onAgentChange}
              onAgentModelChange={onAgentModelChange}
              onApiProtocolChange={onApiProtocolChange}
              onApiModelChange={onApiModelChange}
              onOpenSettings={onOpenSettings}
            />
          </div>

          <div className="avatar-popover__divider" />

          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={languageExpanded}
            onClick={() => setLanguageExpanded((current) => !current)}
            data-testid="niki-account-language"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="languages" size={14} />
            </span>
            <span>{t('settings.language')}</span>
            <span className="avatar-item-meta">{LOCALE_LABEL[locale]}</span>
            <Icon
              name={languageExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>

          {languageExpanded ? (
            <div className="avatar-language-list" role="group" aria-label={t('settings.language')}>
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{LOCALE_LABEL[code]}</span>
                    <span className="avatar-item-meta">{code}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={appearanceExpanded}
            onClick={() => setAppearanceExpanded((current) => !current)}
            data-testid="niki-account-appearance"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="sun-moon" size={14} />
            </span>
            <span>{t('settings.appearance')}</span>
            <span className="avatar-item-meta">
              {t(APPEARANCE_LABEL[config.theme ?? 'system'])}
            </span>
            <Icon
              name={appearanceExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>

          {appearanceExpanded ? (
            <div
              className="avatar-language-list"
              role="group"
              aria-label={t('settings.appearance')}
            >
              {APPEARANCE_THEMES.map(({ value, labelKey }) => {
                const active = (config.theme ?? 'system') === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      onThemeChange(value);
                      setOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={shortcutsExpanded}
            onClick={() => setShortcutsExpanded((current) => !current)}
            data-testid="niki-account-shortcuts"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="grid" size={14} />
            </span>
            <span>{t('avatar.shortcuts')}</span>
            <Icon
              name={shortcutsExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>

          {shortcutsExpanded ? (
            <div
              className="niki-workspace__shortcut-list"
              role="group"
              aria-label={t('avatar.shortcuts')}
              data-testid="niki-account-shortcut-list"
            >
              <span className="niki-workspace__shortcut-row">
                <span>{t('chat.send')}</span>
                <kbd>Enter</kbd>
              </span>
              <span className="niki-workspace__shortcut-row">
                <span>{t('homeHero.forNewLine')}</span>
                <kbd>Shift + Enter</kbd>
              </span>
              <span className="niki-workspace__shortcut-row">
                <span>{t('chat.attachAria')}</span>
                <kbd>+</kbd>
              </span>
            </div>
          ) : null}

          <div className="avatar-popover__divider" />

          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            data-testid="niki-account-open-settings"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              className="avatar-item"
              onClick={() => {
                setOpen(false);
                setAccountManagerOpen(true);
              }}
              data-testid="niki-account-manage-users"
            >
              <span className="avatar-item-icon" aria-hidden>
                <Icon name="settings" size={14} />
              </span>
              <span>账号管理</span>
            </button>
          ) : null}

          {canChangePassword ? (
            <button
              type="button"
              className="avatar-item"
              onClick={() => {
                setOpen(false);
                setPasswordChangeOpen(true);
              }}
              data-testid="niki-account-change-password"
            >
              <span className="avatar-item-icon" aria-hidden>
                <Icon name="settings" size={14} />
              </span>
              <span>修改密码</span>
            </button>
          ) : null}

          {onLogout ? (
            <button
              type="button"
              className="avatar-item"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
              data-testid="niki-account-logout"
            >
              <span className="avatar-item-icon" aria-hidden>
                <Icon name="arrow-left" size={14} />
              </span>
              <span>退出登录</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <PasswordAccountManager
        open={accountManagerOpen}
        onClose={() => setAccountManagerOpen(false)}
      />
      <PasswordChangeDialog
        open={passwordChangeOpen}
        onClose={() => setPasswordChangeOpen(false)}
      />
    </div>
  );
}

function AccountAvatar({
  avatarUrl,
  label,
}: {
  avatarUrl?: string;
  label: string;
}) {
  return (
    <span className="niki-workspace__account-avatar" aria-hidden>
      {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} /> : label}
    </span>
  );
}
