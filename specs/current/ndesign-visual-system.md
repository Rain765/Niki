# Ndesign Visual System

## Product position

Ndesign is an operational AI design workspace, not a marketing site. Its visual
language combines an engineering console with a visual production studio:
precise structure, compact controls, clear system state, and selective brand
energy.

## Design decisions

- **Anchor:** industrial developer tooling with editorial hierarchy.
- **Primary palette:** graphite surfaces, warm-white text, signal orange, cool
  steel borders, and independent semantic colors.
- **Typography:** system sans for dense interface copy; system mono for display
  headlines, labels, counters, file metadata, and technical state.
- **Spacing:** 4px base unit. Common increments are 4, 8, 12, 16, 24, 32, 48.
- **Radius:** 3px for compact controls, 4px for inputs, 6px for panels and
  overlays. Pills are reserved for status and short filters.
- **Elevation:** structure comes from surface contrast and hairline borders.
  Shadows are reserved for floating menus, dialogs, and drag state.
- **Motion:** 200ms enter and 140ms exit using
  `cubic-bezier(0.23, 1, 0.32, 1)`. No scale-from-zero effects.

## Color and contrast

Dark mode is the primary brand expression. Light mode is a companion theme,
not an inversion.

| Role | Dark | Light |
| --- | --- | --- |
| App background | `#08090a` | `#f3f3f0` |
| Panel | `#101214` | `#ffffff` |
| Raised surface | `#171a1d` | `#f8f8f5` |
| Strong text | `#f7f8f8` | `#111315` |
| Body text | `#e4e7e9` | `#202326` |
| Muted text | `#a8afb6` | `#5a6168` |
| Border | `#2b3035` | `#cfd3d6` |
| Signal orange | `#ff8a1f` | `#b94700` |

- Body text must meet WCAG AA `4.5:1` against its surface.
- Large text and non-text controls must meet `3:1`.
- Muted text is never used for required instructions, destructive actions, or
  active state.
- Focus uses a two-layer ring so it remains visible on both panel and app
  backgrounds.

## Surface hierarchy

1. **App:** near-black or neutral canvas with optional low-contrast grid.
2. **Region:** full-width structural band separated by a 1px border.
3. **Panel:** functional container such as composer, file table, or settings
   section.
4. **Overlay:** menu, popover, or dialog with a stronger border and restrained
   shadow.

Cards are only used for repeated objects. Page sections remain unframed.

## Component rules

- Icon-only controls are square and include an accessible label and tooltip.
- Primary commands use solid orange with dark foreground text.
- Selected state uses an orange edge or inset marker, not a full orange wash.
- Inputs use flat surfaces, 1px borders, and a visible focus ring.
- Tables use compact rows, tabular numerals, and hover/selection states that do
  not change layout.
- Empty states use instructional hierarchy without decorative card nesting.
- Technical labels, counts, timestamps, model names, and status text use mono.

## Texture

Dot matrices, fine grids, and diagonal hatching may appear on large empty
surfaces and hero regions at low contrast. They must not reduce text contrast,
sit behind dense data, or become decorative blobs.

## Responsive behavior

- Desktop prioritizes stable split panes and dense scanning.
- Tablet collapses secondary navigation before reducing control size.
- Mobile stacks regions, preserves 44px touch targets, and removes decorative
  texture where it competes with content.
