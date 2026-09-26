import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../i18n';
import { Icon } from './Icon';
import {
  AUTO_POSTER_ASPECT_RATIOS,
  AUTO_POSTER_BRANDS,
  autoPosterBrandLabel,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  ZAMBIA_POSTER_MAX_COUNT,
  ZAMBIA_POSTER_MIN_COUNT,
} from './home-hero/zambia-posters';

interface Props {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
  pending?: boolean;
  disabled?: boolean;
  testIdPrefix: string;
  className?: string;
  onCountChange: (count: number) => void;
  onAspectRatioChange: (aspectRatio: AutoPosterAspectRatio) => void;
  onBrandChange: (brand: AutoPosterBrand) => void;
  onGenerate?: () => void;
  labels?: {
    count: string;
    aspectRatio: string;
    brand: string;
    settings: string;
  };
  formatCount?: (count: number) => string;
}

export function AutoPosterControls({
  count,
  aspectRatio,
  brand,
  pending = false,
  disabled = false,
  testIdPrefix,
  className,
  onCountChange,
  onAspectRatioChange,
  onBrandChange,
  onGenerate,
  labels,
  formatCount,
}: Props) {
  const t = useT();
  const controlsDisabled = pending || disabled;
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'count' | 'aspect' | 'brand' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [desktopPosition, setDesktopPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const resolvedLabels = {
    count: labels?.count ?? t('homeHero.autoPosterCountAria'),
    aspectRatio: labels?.aspectRatio ?? t('homeHero.autoPosterSizeAria'),
    brand: labels?.brand ?? t('homeHero.autoPosterBrandAria'),
    settings:
      labels?.settings
      ?? [
        t('homeHero.autoPosterCountAria'),
        t('homeHero.autoPosterSizeAria'),
        t('homeHero.autoPosterBrandAria'),
      ].join(' / '),
  };
  const countLabel = formatCount
    ? formatCount(count)
    : t('homeHero.autoPosterCountOption', { n: count });

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
    const totalMenuWidth = 508;
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - Math.min(totalMenuWidth, window.innerWidth - 24) - 12),
    );

    if (rect.top >= 170) {
      setDesktopPosition({
        left,
        bottom: window.innerHeight - rect.top + 10,
      });
      return;
    }

    setDesktopPosition({
      left,
      top: rect.bottom + 10,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setActivePanel(null);
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
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
  }, [open, updateDesktopPosition]);

  const selectCount = (value: number) => {
    onCountChange(value);
    setOpen(false);
  };
  const selectAspect = (value: AutoPosterAspectRatio) => {
    onAspectRatioChange(value);
    setOpen(false);
  };
  const selectBrand = (value: AutoPosterBrand) => {
    onBrandChange(value);
    setOpen(false);
  };

  const portalStyle = desktopPosition
    ? ({
        left: desktopPosition.left,
        top: desktopPosition.top,
        bottom: desktopPosition.bottom,
      } as CSSProperties)
    : undefined;

  const filterMenu = portalRoot && open
    ? createPortal(
        <>
          <div
            className="auto-poster-filter__backdrop"
            aria-hidden="true"
            role="presentation"
            onPointerDown={() => setOpen(false)}
          />
          <div className="auto-poster-filter__portal" style={portalStyle}>
            <div
              ref={menuRef}
              className="auto-poster-filter__menu"
              role="menu"
              aria-label={resolvedLabels.settings}
              data-testid={`${testIdPrefix}-menu`}
            >
              <div className="auto-poster-filter__mobile-header">
                <span>{resolvedLabels.settings}</span>
                <button
                  type="button"
                  className="auto-poster-filter__mobile-close"
                  aria-label={t('common.close')}
                  data-testid={`${testIdPrefix}-close`}
                  onClick={() => setOpen(false)}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
              <FilterRow
                label={resolvedLabels.count}
                value={countLabel}
                active={activePanel === 'count'}
                onClick={() => setActivePanel('count')}
              />
              <FilterRow
                label={resolvedLabels.aspectRatio}
                value={aspectRatio}
                active={activePanel === 'aspect'}
                onClick={() => setActivePanel('aspect')}
              />
              <FilterRow
                label={resolvedLabels.brand}
                value={autoPosterBrandLabel(brand)}
                active={activePanel === 'brand'}
                onClick={() => setActivePanel('brand')}
              />

              {activePanel ? (
                <div
                  className={`auto-poster-filter__submenu auto-poster-filter__submenu--${activePanel}`}
                  role="menu"
                >
                  <div className="auto-poster-filter__mobile-subheader">
                    <button
                      type="button"
                      className="auto-poster-filter__mobile-back"
                      onClick={() => setActivePanel(null)}
                    >
                      <Icon name="chevron-left" size={17} />
                      <span>
                        {activePanel === 'count'
                          ? resolvedLabels.count
                          : activePanel === 'aspect'
                            ? resolvedLabels.aspectRatio
                            : resolvedLabels.brand}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="auto-poster-filter__mobile-close"
                      aria-label={t('common.close')}
                      data-testid={`${testIdPrefix}-submenu-close`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </div>
                  {activePanel === 'count'
                    ? Array.from(
                        { length: ZAMBIA_POSTER_MAX_COUNT - ZAMBIA_POSTER_MIN_COUNT + 1 },
                        (_, index) => index + ZAMBIA_POSTER_MIN_COUNT,
                      ).map((optionCount) => (
                        <FilterOption
                          key={optionCount}
                          label={formatCount
                            ? formatCount(optionCount)
                            : t('homeHero.autoPosterCountOption', { n: optionCount })}
                          selected={count === optionCount}
                          testId={`${testIdPrefix}-count-option-${optionCount}`}
                          onClick={() => selectCount(optionCount)}
                        />
                      ))
                    : null}
                  {activePanel === 'aspect'
                    ? AUTO_POSTER_ASPECT_RATIOS.map((optionAspectRatio) => (
                        <FilterOption
                          key={optionAspectRatio}
                          label={optionAspectRatio}
                          selected={aspectRatio === optionAspectRatio}
                          testId={`${testIdPrefix}-size-option-${optionAspectRatio}`}
                          onClick={() => selectAspect(optionAspectRatio)}
                        />
                      ))
                    : null}
                  {activePanel === 'brand'
                    ? AUTO_POSTER_BRANDS.map((optionBrand) => (
                        <FilterOption
                          key={optionBrand}
                          label={autoPosterBrandLabel(optionBrand)}
                          selected={brand === optionBrand}
                          testId={`${testIdPrefix}-brand-option-${optionBrand}`}
                          onClick={() => selectBrand(optionBrand)}
                        />
                      ))
                    : null}
                </div>
              ) : null}
            </div>
          </div>
        </>,
        portalRoot,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={['home-hero__auto-poster', className].filter(Boolean).join(' ')}
      data-testid={`${testIdPrefix}-controls`}
    >
      <button
        type="button"
        className={`auto-poster-filter__trigger${open ? ' is-open' : ''}`}
        data-testid={`${testIdPrefix}-trigger`}
        disabled={controlsDisabled}
        aria-label={resolvedLabels.settings}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) updateDesktopPosition();
          setOpen((value) => !value);
        }}
      >
        <Icon name="sliders" size={15} />
        <span>{countLabel}</span>
        <span className="auto-poster-filter__summary-divider" aria-hidden>·</span>
        <span>{aspectRatio}</span>
        <span className="auto-poster-filter__summary-divider" aria-hidden>·</span>
        <span>{autoPosterBrandLabel(brand)}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {onGenerate ? (
        <button
          type="button"
          className="auto-poster-filter__generate"
          data-testid={`${testIdPrefix}-generate`}
          disabled={controlsDisabled}
          title={pending ? t('homeHero.autoPosterPreparing') : t('homeHero.autoPoster')}
          aria-label={t('homeHero.autoPoster')}
          onClick={() => {
            setOpen(false);
            onGenerate();
          }}
        >
          <Icon name={pending ? 'spinner' : 'sparkles'} size={17} />
        </button>
      ) : null}

      {filterMenu}

      <span className="auto-poster-filter__native" aria-hidden hidden>
        <select
          data-testid={`${testIdPrefix}-count`}
          value={count}
          disabled={controlsDisabled}
          tabIndex={-1}
          onChange={(event) => onCountChange(Number(event.target.value))}
        >
          {Array.from(
            { length: ZAMBIA_POSTER_MAX_COUNT - ZAMBIA_POSTER_MIN_COUNT + 1 },
            (_, index) => index + ZAMBIA_POSTER_MIN_COUNT,
          ).map((optionCount) => (
            <option key={optionCount} value={optionCount}>
              {t('homeHero.autoPosterCountOption', { n: optionCount })}
            </option>
          ))}
        </select>
        <select
          data-testid={`${testIdPrefix}-size`}
          value={aspectRatio}
          disabled={controlsDisabled}
          tabIndex={-1}
          onChange={(event) => onAspectRatioChange(event.target.value as AutoPosterAspectRatio)}
        >
          {AUTO_POSTER_ASPECT_RATIOS.map((optionAspectRatio) => (
            <option key={optionAspectRatio} value={optionAspectRatio}>{optionAspectRatio}</option>
          ))}
        </select>
        <select
          data-testid={`${testIdPrefix}-brand`}
          value={brand}
          disabled={controlsDisabled}
          tabIndex={-1}
          onChange={(event) => onBrandChange(event.target.value as AutoPosterBrand)}
        >
          {AUTO_POSTER_BRANDS.map((optionBrand) => (
            <option key={optionBrand} value={optionBrand}>
              {autoPosterBrandLabel(optionBrand)}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function FilterRow({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`auto-poster-filter__row${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="auto-poster-filter__row-value">{value}</span>
      <Icon name="chevron-right" size={16} />
    </button>
  );
}

function FilterOption({
  label,
  selected,
  testId,
  onClick,
}: {
  label: string;
  selected: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={`auto-poster-filter__option${selected ? ' is-selected' : ''}`}
      data-testid={testId}
      onClick={onClick}
    >
      <span>{label}</span>
      {selected ? <Icon name="check" size={17} /> : null}
    </button>
  );
}
