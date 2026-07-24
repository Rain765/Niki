import { useT } from '../i18n';
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
}: Props) {
  const t = useT();
  const controlsDisabled = pending || disabled;

  return (
    <div
      className={['home-hero__auto-poster', className].filter(Boolean).join(' ')}
      data-testid={`${testIdPrefix}-controls`}
    >
      <span className="home-hero__auto-poster-select-wrap home-hero__auto-poster-select-wrap--count">
        <span className="home-hero__auto-poster-select-value" aria-hidden>
          {t('homeHero.autoPosterCountOption', { n: count })}
        </span>
        <span className="home-hero__auto-poster-select-icon" aria-hidden />
        <select
          className="home-hero__auto-poster-select"
          data-testid={`${testIdPrefix}-count`}
          value={count}
          disabled={controlsDisabled}
          aria-label={t('homeHero.autoPosterCountAria')}
          title={t('homeHero.autoPosterCountAria')}
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
      </span>
      <span className="home-hero__auto-poster-select-wrap home-hero__auto-poster-select-wrap--aspect">
        <span className="home-hero__auto-poster-select-value" aria-hidden>
          {aspectRatio}
        </span>
        <span className="home-hero__auto-poster-select-icon" aria-hidden />
        <select
          className="home-hero__auto-poster-select"
          data-testid={`${testIdPrefix}-size`}
          value={aspectRatio}
          disabled={controlsDisabled}
          aria-label={t('homeHero.autoPosterSizeAria')}
          title={t('homeHero.autoPosterSizeAria')}
          onChange={(event) => (
            onAspectRatioChange(event.target.value as AutoPosterAspectRatio)
          )}
        >
          {AUTO_POSTER_ASPECT_RATIOS.map((optionAspectRatio) => (
            <option key={optionAspectRatio} value={optionAspectRatio}>
              {optionAspectRatio}
            </option>
          ))}
        </select>
      </span>
      <span className="home-hero__auto-poster-select-wrap home-hero__auto-poster-select-wrap--brand">
        <span className="home-hero__auto-poster-select-value" aria-hidden>
          {autoPosterBrandLabel(brand)}
        </span>
        <span className="home-hero__auto-poster-select-icon" aria-hidden />
        <select
          className="home-hero__auto-poster-select"
          data-testid={`${testIdPrefix}-brand`}
          value={brand}
          disabled={controlsDisabled}
          aria-label={t('homeHero.autoPosterBrandAria')}
          title={t('homeHero.autoPosterBrandAria')}
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
