import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';
import './niki-result-controls.css';

export type ResultView = 'latest' | 'history';

export function ResultTabs({
  id, label, latest, history, view, onChange, className = '', listRef,
}: {
  id: string;
  label: string;
  latest: ReactNode;
  history: ReactNode;
  view: ResultView;
  onChange: (view: ResultView) => void;
  className?: string;
  listRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={listRef}
      className={`poster-app__result-tabs niki-result-tabs ${className}`}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'latest'
          : event.key === 'End' ? 'history' : view === 'latest' ? 'history' : 'latest';
        event.currentTarget.querySelector<HTMLButtonElement>(`#${id}-tab-${next}`)?.focus();
        onChange(next);
      }}
    >
      {(['latest', 'history'] as const).map((tab) => (
        <button
          key={tab}
          id={`${id}-tab-${tab}`}
          type="button"
          role="tab"
          className={tab === view ? 'is-active' : undefined}
          aria-controls={`${id}-panel-${tab}`}
          aria-selected={tab === view}
          tabIndex={tab === view ? 0 : -1}
          onClick={() => onChange(tab)}
        >
          {tab === 'latest' ? latest : history}
        </button>
      ))}
    </div>
  );
}

interface HistoryItem {
  id: string;
  title: string;
  date: number;
}

export function ResultHistory({
  items, locale, label, selectedId, onSelect, children, footer,
}: {
  items: HistoryItem[];
  locale: string;
  label: string;
  selectedId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const format = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const groups = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const date = format.format(item.date);
    const group = groups.get(date);
    if (group) group.push(item);
    else groups.set(date, [item]);
  }

  return (
    <div className="niki-result-history">
      <nav className="niki-result-history__sidebar" aria-label={label}>
        {Array.from(groups, ([date, group]) => (
          <section className="niki-result-history__group" key={date} aria-label={date}>
            <h3>{date}</h3>
            <div className="niki-result-history__items">
              {group.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={item.id === selectedId ? 'page' : undefined}
                  title={item.title}
                  onClick={() => onSelect(item.id)}
                >
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {footer}
      </nav>
      <div className="niki-result-history__content">{children}</div>
    </div>
  );
}

export function ResultHeader({
  title, details, navigation, actions,
}: {
  title: string;
  details?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={`niki-result-header${navigation ? ' has-navigation' : ''}`}>
      <div className="niki-result-header__heading">
        <strong title={title}>{title}</strong>
        {details && <small>{details}</small>}
      </div>
      {navigation}
      {actions && <div className="niki-result-header__actions">{actions}</div>}
    </header>
  );
}

export function ResultNavigation({
  index, count, previousLabel, nextLabel, onMove,
}: {
  index: number;
  count: number;
  previousLabel: string;
  nextLabel: string;
  onMove: (direction: -1 | 1) => void;
}) {
  if (count < 2) return null;
  return (
    <div className="niki-result-navigation">
      <IconButton label={previousLabel} onClick={() => onMove(-1)}><Icon name="chevron-left" size={18} /></IconButton>
      <span aria-live="polite">{index + 1} / {count}</span>
      <IconButton label={nextLabel} onClick={() => onMove(1)}><Icon name="chevron-right" size={18} /></IconButton>
    </div>
  );
}

export function ResultLoading({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="niki-result-loading" role="status" aria-label={label}>
      <Icon name="spinner" size={20} className="niki-result-loading__spinner" />
      <div className="niki-result-loading__copy">{children}</div>
    </div>
  );
}

export function ResultDialog({
  label, className, testId, onClose, onMove, children,
}: {
  label: string;
  className: string;
  testId?: string;
  onClose: () => void;
  onMove?: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (typeof dialog.close === 'function') dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (onMove && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        onMove(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onMove]);
  return (
    <dialog ref={dialogRef} className={`niki-result-dialog ${className}`} aria-label={label}
      data-testid={testId} aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>
  );
}
