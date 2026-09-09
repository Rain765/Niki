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
  AUTO_POSTER_DEFAULT_ASPECT_RATIO,
  autoPosterBrandLabel,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  ZAMBIA_POSTER_DEFAULT_COUNT,
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
  inlineOnMobile?: boolean;
  onOpenChange?: (open: boolean) => void;
  onGenerate?: () => void;
  onCountChange: (count: number) => void;
  onAspectRatioChange: (aspectRatio: AutoPosterAspectRatio) => void;
  onBrandChange: (brand: AutoPosterBrand) => void;
  labels?: {
    count: string;
    aspectRatio: string;
    brand: string;
    settings: string;
  };
  formatCount?: (count: number) => string;
}

interface ProductPreference {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
}

export function AutoPosterControls({
  count,
  aspectRatio,
  brand,
  pending = false,
  disabled = false,
  testIdPrefix,
  className,
  inlineOnMobile = false,
  onOpenChange,
  onGenerate,
  onCountChange,
  onAspectRatioChange,
  onBrandChange,
  labels,
  formatCount,
}: Props) {
  const t = useT();
  const controlsDisabled = pending || disabled;
  const [open, setOpen] = useState(false);
  const [mobileInlineActive, setMobileInlineActive] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const preferencesRef = useRef<Record<AutoPosterBrand, ProductPreference>>(
    Object.fromEntries(AUTO_POSTER_BRANDS.map((productBrand) => [
      productBrand,
      productBrand === brand
        ? { count, aspectRatio }
        : {
            count: ZAMBIA_POSTER_DEFAULT_COUNT,
            aspectRatio: AUTO_POSTER_DEFAULT_ASPECT_RATIO,
          },
    ])) as Record<AutoPosterBrand, ProductPreference>,
  );
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
        t('homeHero.autoPosterBrandAria'),
        t('homeHero.autoPosterSizeAria'),
        t('homeHero.autoPosterCountAria'),
      ].join(' / '),
  };
  const countOptions = Array.from(
    { length: ZAMBIA_POSTER_MAX_COUNT - ZAMBIA_POSTER_MIN_COUNT + 1 },
    (_, index) => index + ZAMBIA_POSTER_MIN_COUNT,
  );
  const formatCountLabel = (value: number) => (
    formatCount
      ? formatCount(value)
      : t('homeHero.autoPosterCountOption', { n: value })
  );

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!inlineOnMobile || typeof window.matchMedia !== 'function') {
      setMobileInlineActive(false);
      return;
    }

    const query = window.matchMedia('(max-width: 680px)');
    const sync = () => setMobileInlineActive(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, [inlineOnMobile]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    preferencesRef.current[brand] = { count, aspectRatio };
  }, [aspectRatio, brand, count]);

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
    const menuWidth = 380;
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - Math.min(menuWidth, window.innerWidth - 24) - 12),
    );

    if (rect.top >= 250) {
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
    if (!open) return;

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
    preferencesRef.current[brand] = { count: value, aspectRatio };
    onCountChange(value);
  };

  const selectAspect = (value: AutoPosterAspectRatio) => {
    preferencesRef.current[brand] = { count, aspectRatio: value };
    onAspectRatioChange(value);
  };

  const selectProduct = (value: AutoPosterBrand) => {
    if (value === brand) {
      if (!open) updateDesktopPosition();
      setOpen((current) => !current);
      return;
    }

    preferencesRef.current[brand] = { count, aspectRatio };
    const nextPreference = preferencesRef.current[value];
    onBrandChange(value);
    onCountChange(nextPreference.count);
    onAspectRatioChange(nextPreference.aspectRatio);
    updateDesktopPosition();
    setOpen(true);
  };

  const generate = () => {
    if (controlsDisabled || !onGenerate) return;
    setOpen(false);
    onGenerate();
  };

  const portalStyle = desktopPosition
    ? ({
        left: desktopPosition.left,
        top: desktopPosition.top,
        bottom: desktopPosition.bottom,
      } as CSSProperties)
    : undefined;

  const filterMenu = open ? (
    <div
      ref={menuRef}
      id={`${testIdPrefix}-menu`}
      className="auto-poster-filter__menu"
      role={mobileInlineActive ? 'region' : 'dialog'}
      aria-label={resolvedLabels.settings}
      data-testid={`${testIdPrefix}-menu`}
    >
      <div className="auto-poster-filter__mobile-header">
        <span>{autoPosterBrandLabel(brand)}</span>
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

      <div className="auto-poster-filter__section">
        <span className="auto-poster-filter__section-label">
          {resolvedLabels.aspectRatio}
        </span>
        <div
          className="auto-poster-filter__choices"
          role="radiogroup"
          aria-label={resolvedLabels.aspectRatio}
        >
          {AUTO_POSTER_ASPECT_RATIOS.map((optionAspectRatio) => (
            <FilterOption
              key={optionAspectRatio}
              label={optionAspectRatio}
              selected={aspectRatio === optionAspectRatio}
              testId={`${testIdPrefix}-size-option-${optionAspectRatio}`}
              onClick={() => selectAspect(optionAspectRatio)}
            />
          ))}
        </div>
      </div>

      <div className="auto-poster-filter__section">
        <span className="auto-poster-filter__section-label">
          {resolvedLabels.count}
        </span>
        <div
          className="auto-poster-filter__choices auto-poster-filter__choices--count"
          role="radiogroup"
          aria-label={resolvedLabels.count}
        >
          {countOptions.map((optionCount) => (
            <FilterOption
              key={optionCount}
              label={formatCountLabel(optionCount)}
              selected={count === optionCount}
              testId={`${testIdPrefix}-count-option-${optionCount}`}
              onClick={() => selectCount(optionCount)}
            />
          ))}
        </div>
      </div>

      {onGenerate ? (
        <div className="auto-poster-filter__footer">
          <button
            type="button"
            className="auto-poster-filter__generate-action"
            data-testid={`${testIdPrefix}-generate`}
            disabled={controlsDisabled}
            onClick={generate}
          >
            <Icon name={pending ? 'spinner' : 'sparkles'} size={18} />
            <span>{t('homeHero.autoPoster')}</span>
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const filterSurface = open && mobileInlineActive
    ? <div className="auto-poster-filter__inline">{filterMenu}</div>
    : portalRoot && filterMenu
      ? createPortal(
          <>
            <div
              className="auto-poster-filter__backdrop"
              aria-hidden="true"
              role="presentation"
              onPointerDown={() => setOpen(false)}
            />
            <div className="auto-poster-filter__portal" style={portalStyle}>
              {filterMenu}
            </div>
          </>,
          portalRoot,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={[
        'home-hero__auto-poster',
        open ? 'is-open' : '',
        mobileInlineActive ? 'is-mobile-inline' : '',
        className,
      ].filter(Boolean).join(' ')}
      data-testid={`${testIdPrefix}-controls`}
    >
      <div
        className="auto-poster-products"
        role="toolbar"
        aria-label={resolvedLabels.brand}
      >
        {AUTO_POSTER_BRANDS.map((optionBrand) => {
          const selected = optionBrand === brand;
          return (
            <button
              key={optionBrand}
              type="button"
              className={`auto-poster-products__tag${selected ? ' is-selected' : ''}`}
              data-testid={`${testIdPrefix}-product-${optionBrand}`}
              disabled={controlsDisabled}
              aria-pressed={selected}
              aria-haspopup={mobileInlineActive ? undefined : 'dialog'}
              aria-expanded={selected && open}
              aria-controls={selected && open ? `${testIdPrefix}-menu` : undefined}
              onClick={() => selectProduct(optionBrand)}
            >
              <span>{autoPosterBrandLabel(optionBrand)}</span>
              {selected ? (
                <>
                  <span className="auto-poster-products__divider" aria-hidden>·</span>
                  <span>{aspectRatio}</span>
                  <span className="auto-poster-products__divider" aria-hidden>·</span>
                  <span>{formatCountLabel(count)}</span>
                  <Icon name="chevron-down" size={14} />
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      {filterSurface}

      <span className="auto-poster-filter__native" aria-hidden hidden>
        <select
          data-testid={`${testIdPrefix}-count`}
          value={count}
          disabled={controlsDisabled}
          tabIndex={-1}
          onChange={(event) => selectCount(Number(event.target.value))}
        >
          {countOptions.map((optionCount) => (
            <option key={optionCount} value={optionCount}>
              {formatCountLabel(optionCount)}
            </option>
          ))}
        </select>
        <select
          data-testid={`${testIdPrefix}-size`}
          value={aspectRatio}
          disabled={controlsDisabled}
          tabIndex={-1}
          onChange={(event) => selectAspect(event.target.value as AutoPosterAspectRatio)}
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
          onChange={(event) => selectProduct(event.target.value as AutoPosterBrand)}
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
      role="radio"
      aria-checked={selected}
      className={`auto-poster-filter__option${selected ? ' is-selected' : ''}`}
      data-testid={testId}
      onClick={onClick}
    >
      <span>{label}</span>
      {selected ? <Icon name="check" size={15} /> : null}
    </button>
  );
}
