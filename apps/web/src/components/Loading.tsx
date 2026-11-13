import { Icon } from './Icon';

interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 14, label }: SpinnerProps) {
  return (
    <span className="loading-spinner" role="status" aria-live="polite">
      <Icon name="spinner" size={size} />
      {label ? <span className="loading-spinner-label">{label}</span> : null}
    </span>
  );
}

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ width, height = 14, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/**
 * Card-shaped skeleton tuned for the DesignsTab grid. Renders a thumb area
 * over the row of meta lines so the empty grid feels like content is
 * arriving rather than missing.
 */
export function DesignCardSkeleton() {
  return (
    <div className="design-card design-card-skeleton" aria-hidden>
      <div className="design-card-thumb skeleton-shimmer" />
      <div className="design-card-meta-block">
        <Skeleton height={13} width="65%" />
        <Skeleton height={11} width="45%" />
      </div>
    </div>
  );
}

/**
 * Centered overlay used while bootstrap data loads (agents, skills, design
 * systems, project list). Sits inside a flex/grid parent and grows with it.
 */
export function CenteredLoader({
  label,
  variant = 'default',
}: {
  label?: string;
  variant?: 'default' | 'chat';
}) {
  if (variant === 'chat') {
    return (
      <div className="chat-loading-skeleton" role="status" aria-busy="true">
        <div className="chat-loading-skeleton__log" aria-hidden="true">
          <span className="skeleton-block chat-loading-skeleton__line is-short" />
          <span className="skeleton-block chat-loading-skeleton__line is-medium" />
          <span className="skeleton-block chat-loading-skeleton__line is-long" />
        </div>
        <div className="chat-loading-skeleton__composer" aria-hidden="true">
          <span className="skeleton-block chat-loading-skeleton__composer-line" />
          <span className="skeleton-block chat-loading-skeleton__composer-button" />
        </div>
      </div>
    );
  }
  return (
    <div className="centered-loader">
      <Spinner size={20} />
      {label ? <span className="centered-loader-label">{label}</span> : null}
    </div>
  );
}
