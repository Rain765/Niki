/**
 * Single source of truth for every color used by the Niki poster experience.
 *
 * Components consume the CSS variables below. Concrete color values belong
 * only in this module so the critical first paint, authenticated UI, and
 * overlays cannot drift apart.
 */
export const NIKI_POSTER_COLOR_VALUES = {
  fill0: '#ffffff',
  fill1: '#f7f8fa',
  fill3: '#f2f3f5',
  fill4: '#e5e6eb',
  fill5: '#c9cdd4',
  fill6: '#4e5969',
  fill7: '#1d2129',
  lineActive: '#86909c',
  accent: '#fe5200',
  accentHover: '#ff772e',
  accentPressed: '#dc3b00',
  danger: '#c9353f',
  dangerSurface: '#fdf3f4',
  success: '#3dd43f',
  antiFraudShield: '#00C853',
  pickerBlack: '#000000',
} as const;

export const NIKI_POSTER_LEGACY_ACCENT_COLORS = [
  '#c96442',
  '#ff5f53',
] as const;

export const NIKI_POSTER_COLOR_VARIABLES = {
  '--poster-fill-0': NIKI_POSTER_COLOR_VALUES.fill0,
  '--poster-fill-1': NIKI_POSTER_COLOR_VALUES.fill1,
  '--poster-fill-3': NIKI_POSTER_COLOR_VALUES.fill3,
  '--poster-fill-4': NIKI_POSTER_COLOR_VALUES.fill4,
  '--poster-fill-5': NIKI_POSTER_COLOR_VALUES.fill5,
  '--poster-fill-6': NIKI_POSTER_COLOR_VALUES.fill6,
  '--poster-fill-7': NIKI_POSTER_COLOR_VALUES.fill7,
  '--poster-line-active': NIKI_POSTER_COLOR_VALUES.lineActive,
  '--poster-line-normal': 'var(--poster-fill-5)',
  '--poster-line-divide': 'var(--poster-fill-3)',
  '--poster-text-primary': 'var(--poster-fill-7)',
  '--poster-text-secondary': 'var(--poster-fill-6)',
  '--poster-text-placeholder': 'var(--poster-line-active)',
  '--poster-text-disabled': 'var(--poster-fill-5)',
  '--poster-text-inverse': 'var(--poster-fill-0)',
  '--poster-accent': NIKI_POSTER_COLOR_VALUES.accent,
  '--poster-accent-hover': NIKI_POSTER_COLOR_VALUES.accentHover,
  '--poster-accent-pressed': NIKI_POSTER_COLOR_VALUES.accentPressed,
  '--poster-danger': NIKI_POSTER_COLOR_VALUES.danger,
  '--poster-danger-surface': NIKI_POSTER_COLOR_VALUES.dangerSurface,
  '--poster-success': NIKI_POSTER_COLOR_VALUES.success,
  '--poster-toast-bg': 'color-mix(in srgb, var(--poster-fill-7) 48%, transparent)',
  '--poster-toast-text': 'var(--poster-text-inverse)',
  '--poster-toast-muted': 'var(--poster-fill-5)',
  '--poster-toast-hover': 'color-mix(in srgb, var(--poster-fill-0) 12%, transparent)',
  '--poster-toast-error': 'color-mix(in srgb, var(--poster-danger) 70%, var(--poster-fill-0))',
  '--poster-picker-panel': 'var(--poster-fill-7)',
  '--poster-picker-field': 'color-mix(in srgb, var(--poster-fill-6) 46%, var(--poster-fill-7))',
  '--poster-picker-border': 'color-mix(in srgb, var(--poster-fill-5) 22%, transparent)',
  '--poster-picker-text': 'var(--poster-fill-0)',
  '--poster-picker-muted': 'var(--poster-fill-5)',
  '--poster-picker-focus': 'var(--poster-line-active)',
  '--poster-picker-white': 'var(--poster-fill-0)',
  '--poster-picker-black': NIKI_POSTER_COLOR_VALUES.pickerBlack,
  '--poster-picker-checker': 'var(--poster-fill-5)',
  '--poster-picker-hue-spectrum': 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
  '--poster-picker-shadow': '0 22px 60px color-mix(in srgb, var(--poster-picker-black) 42%, transparent)',
  '--poster-mask-dark': 'var(--poster-fill-7)',
  '--poster-bg': 'var(--poster-fill-0)',
  '--poster-panel': 'var(--poster-fill-0)',
  '--poster-panel-muted': 'var(--poster-fill-1)',
  '--poster-panel-raised': 'var(--poster-fill-3)',
  '--poster-control-hover': 'var(--poster-fill-3)',
  '--poster-control-pressed': 'var(--poster-fill-4)',
  '--poster-history-hover': 'var(--poster-fill-1)',
  '--poster-history-pressed': 'var(--poster-fill-4)',
  '--poster-border': 'var(--poster-line-normal)',
  '--poster-text': 'var(--poster-text-primary)',
  '--poster-muted': 'var(--poster-text-secondary)',
  '--poster-placeholder': 'var(--poster-text-placeholder)',
  '--poster-disabled': 'var(--poster-text-disabled)',
  '--bg-panel': 'var(--poster-panel)',
  '--bg-subtle': 'var(--poster-panel-raised)',
  '--border': 'var(--poster-border)',
  '--border-soft': 'color-mix(in srgb, var(--poster-border) 72%, transparent)',
  '--text': 'var(--poster-text)',
  '--text-strong': 'var(--poster-text-primary)',
  '--text-muted': 'var(--poster-muted)',
  '--text-faint': 'var(--poster-text-placeholder)',
  '--bg-app': 'var(--poster-bg)',
  '--accent': 'var(--poster-accent)',
  '--accent-tint': 'color-mix(in srgb, var(--poster-accent) 12%, var(--poster-bg))',
  '--danger': 'var(--poster-danger)',
  '--success': 'var(--poster-success)',
  '--shadow-lg': '0 30px 80px color-mix(in srgb, var(--poster-mask-dark) 12%, transparent)',
} as const satisfies Record<`--${string}`, string>;

export const NIKI_POSTER_COLOR_CSS = [
  ':root {',
  ...Object.entries(NIKI_POSTER_COLOR_VARIABLES).map(
    ([name, value]) => `  ${name}: ${value};`,
  ),
  '}',
].join('\n');

export const NIKI_POSTER_THEME_COLOR = NIKI_POSTER_COLOR_VALUES.fill0;
export const NIKI_POSTER_MASK_ICON_COLOR = NIKI_POSTER_COLOR_VALUES.fill7;
