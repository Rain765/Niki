import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'compact' | 'default';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  size = 'default',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[
        'od-button',
        `od-button--${variant}`,
        `od-button--${size}`,
        loading ? 'is-loading' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {children}
    </button>
  );
}

/** Familiar utility actions use a compact target with a visible hover hint. */
export function IconButton({
  label,
  className,
  size = 'compact',
  variant = 'ghost',
  ...props
}: Omit<ButtonProps, 'aria-label' | 'title'> & { label: string }) {
  return <Button {...props} size={size} variant={variant}
    className={['od-icon-button', className].filter(Boolean).join(' ')}
    aria-label={label} title={label} />;
}
