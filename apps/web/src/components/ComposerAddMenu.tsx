import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon, type IconName } from './Icon';

interface ComposerAddMenuProps {
  open: boolean;
  testId: string;
  label: string;
  title?: string;
  closeLabel: string;
  className?: string;
  keepMounted?: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shared Codex-style add menu used by the Home and project chat composers.
 * The contents stay owned by each surface,
 * while trigger sizing, dismissal, mobile-sheet behavior, and focus
 * semantics remain consistent.
 */
export function ComposerAddMenu({
  open,
  testId,
  label,
  title = label,
  closeLabel,
  className,
  keepMounted = false,
  children,
  onOpenChange,
}: ComposerAddMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [desktopPosition, setDesktopPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  const updateDesktopPosition = useCallback(() => {
    const trigger = rootRef.current;
    if (
      !trigger
      || (typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 680px)').matches)
    ) {
      setDesktopPosition(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const estimatedWidth = className?.includes('home-hero__add-menu')
      ? 590
      : className?.includes('chat-composer__add-menu')
        ? 420
        : 560;
    const availableWidth = Math.max(240, window.innerWidth - 24);
    const menuWidth = Math.min(estimatedWidth, availableWidth);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    const spaceAbove = rect.top - 20;

    if (spaceAbove >= 180) {
      setDesktopPosition({
        left,
        bottom: window.innerHeight - rect.top + 10,
        maxHeight: spaceAbove,
      });
      return;
    }

    setDesktopPosition({
      left,
      top: rect.bottom + 10,
      maxHeight: Math.max(160, window.innerHeight - rect.bottom - 22),
    });
  }, [className]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }

    updateDesktopPosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updateDesktopPosition);
    window.addEventListener('scroll', updateDesktopPosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateDesktopPosition);
      window.removeEventListener('scroll', updateDesktopPosition, true);
    };
  }, [onOpenChange, open, updateDesktopPosition]);

  const portalStyle = desktopPosition
    ? ({
        left: desktopPosition.left,
        top: desktopPosition.top,
        bottom: desktopPosition.bottom,
        '--composer-add-max-height': `${desktopPosition.maxHeight}px`,
      } as CSSProperties)
    : undefined;

  const portal = portalRoot && (open || keepMounted)
    ? createPortal(
        <>
          {open ? (
            <div
              className="composer-add__backdrop"
              aria-hidden="true"
              role="presentation"
              onPointerDown={() => onOpenChange(false)}
            />
          ) : null}
          <div
            className={['composer-add__portal', className].filter(Boolean).join(' ')}
            style={portalStyle}
          >
            <div
              ref={menuRef}
              className="composer-add__menu"
              role="menu"
              aria-label={label}
              data-testid={`${testId}-panel`}
              hidden={!open}
            >
              <div className="composer-add__mobile-header">
                <span>{title}</span>
                <button
                  type="button"
                  className="composer-add__mobile-close"
                  aria-label={closeLabel}
                  data-testid={`${testId}-close`}
                  onClick={() => onOpenChange(false)}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
              {children}
            </div>
          </div>
        </>,
        portalRoot,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={['composer-add', className].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className={`composer-add__trigger${open ? ' is-open' : ''}`}
        data-testid={testId}
        onClick={() => {
          if (!open) updateDesktopPosition();
          onOpenChange(!open);
        }}
        title={title}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="plus" size={20} />
      </button>
      {portal}
    </div>
  );
}

interface ComposerAddSectionProps {
  label: string;
  children: ReactNode;
}

export function ComposerAddSection({ label, children }: ComposerAddSectionProps) {
  return (
    <section className="composer-add__section">
      <div className="composer-add__section-label">{label}</div>
      <div className="composer-add__section-body">{children}</div>
    </section>
  );
}

interface ComposerAddActionProps {
  icon: IconName;
  label: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  onClick: () => void;
}

export function ComposerAddAction({
  icon,
  label,
  description,
  active = false,
  disabled = false,
  testId,
  onClick,
}: ComposerAddActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`composer-add__action${active ? ' is-active' : ''}`}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="composer-add__action-icon" aria-hidden>
        <Icon name={active ? 'check' : icon} size={18} />
      </span>
      <span className="composer-add__action-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <Icon name="chevron-right" size={15} className="composer-add__action-chevron" />
    </button>
  );
}
