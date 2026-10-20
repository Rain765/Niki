# UI control guidelines

These rules define the shared interaction language for product selectors, action buttons, and transient feedback. New pages should use the shared components and classes instead of copying page-specific controls.

The rules are application-wide. Existing product pages, generation pages, and library/filter pages use the same primitives; page CSS may size or position them but must not redefine their visual or interaction states.

## Corner radius

- Use `--od-control-radius` (8 px) for buttons, selectors, inputs, and small interactive controls.
- Use `--od-surface-radius` (12 px) for toolbar backgrounds, cards, dialogs, menus, and notices. Avoid larger page-specific radii or pill-shaped rectangular controls.
- Preserve intentional circles for avatars, color swatches, progress indicators and slider thumbs, and preserve the shape of generated content. Small details may retain radii of 8 px or less.
- Desktop, mobile sheets, and critical first-paint CSS follow the same scale.

## Selectors

- Use `SelectField` for a labelled form selector and `CustomSelect` only when the surrounding layout already owns the label.
- The closed trigger uses the neutral fill, an 8 px radius, no visible border, and one clear focus outline.
- Trigger text uses `--od-control-font-size` (13 px); its radius uses `--od-control-radius` (8 px). Adjacent inputs and action buttons consume these same tokens.
- The menu opens below the trigger, remains within the viewport, and uses the same option hover, active, and selected states everywhere.
- A field label is the accessible name. The selected value stays visible inside the trigger and is not repeated in the accessible name.
- Keyboard behavior is inherited from `CustomSelect`: open with Enter, Space, or Arrow keys; move through options with Arrow keys; confirm with Enter; close with Escape.

## Buttons

- Use `Button`; do not create page-specific primary or secondary button systems.
- All action buttons use the selector's 8 px radius, 13 px font size, and 650 font weight through `--od-control-radius`, `--od-control-font-size`, and `--od-control-font-weight`. This applies to primary, secondary, ghost, danger, compact, and loading/disabled variants on every page. Compact changes height and padding only; it does not shrink the text or radius.
- Keep these values consistent on desktop and mobile. Page CSS must not override button font size, font weight, or radius, including in editor panels, dialogs, and responsive rules. Existing native action controls must consume the same tokens until migrated to `Button`.
- `primary` is reserved for the main action in a section. `secondary` is for supporting actions, `ghost` for low-emphasis utilities, and `danger` for destructive actions.
- Use one primary action per toolbar. Primary actions sit after their required inputs and align to the same control height.
- Loading buttons remain in place, expose `aria-busy`, and are disabled until the action completes.
- Main creation actions across poster, video, PPT, brand, and image pages use “生成” (English: “Generate”). Busy states still describe the actual operation; non-creation actions keep their own semantic labels.
- Name text actions with a concise verb and object; use the same term for the same action and describe the actual busy state. Text actions do not carry decorative icons.
- Use `IconButton` for familiar utilities such as close, play, copy, download, delete, and back. Its required `label` supplies both the accessible name and hover hint. Keep text for actions whose meaning depends on the workflow (generation, refinement, or submission).
- Buttons fit their content with 12 px horizontal padding (10 px for compact controls). Keep touch targets large enough; do not stretch actions to fill a toolbar or mobile row. Content cards and selection controls retain their own layout.
- Hover and focus provide clear feedback. Pressed motion is short and subtle; controls never animate from `scale(0)`.

## Notifications

- Use `Toast` for feedback caused by an action. Do not show a permanent success or readiness banner when nothing has just happened.
- Informational feedback dismisses after 4 seconds. Success dismisses after 3 seconds.
- Errors, in-progress operations, and content that the user must copy remain visible until resolved or dismissed.
- Restored history and previously completed output do not trigger a new success toast after reload.
- Use `role="status"` for normal feedback and `role="alert"` for errors. A dismiss action must have an accessible label.
- Durable instructions belong inline beside the relevant field or in an empty state, not in a toast.

## Layout and ownership

- Use `.od-generation-toolbar` for a compact row of selectors followed by one primary action.
- Add `.od-filter-grid` to every adjacent filter or generation-control group that should follow the shared responsive layout.
- At 760 px and below, `.od-filter-grid` always uses two equal columns with a 12 px gap. Controls retain a minimum 46 px touch target.
- Add `.od-filter-grid__item` to each filter. When a group has an odd number of filters, add `.od-filter-grid__wide` to the final filter so it spans both columns.
- Add `.od-filter-grid__action` to the primary action and `.od-filter-grid__meta` to supporting result counts; both occupy their own row on mobile, with the action itself sized to its content and aligned to the start.
- This grid applies to adjacent selector/search groups. A single search field, editor/settings form, or horizontally scrollable chip/pill row keeps its task-specific layout.
- The mobile-grid exception above is about layout only. Selectors, action buttons, and action-triggered feedback inside forms still use `SelectField`/`CustomSelect`, `Button`, and `Toast` respectively.
- Shared visual and interaction states live in `src/styles/ui-controls.css`. Page styles may only define layout proportions or truly page-specific context.
- This action-control rule does not turn navigation tabs, selectable content cards, color swatches, word exercises, or switch tracks into buttons with identical geometry. Preserve their semantic presentation; use the shared tokens for the actions within those surfaces.
- The poster generation page is the reference implementation. Poster, video, lightweight image generation, Skills, prompt templates, plugins, and design-system library filters all use the shared responsive grid.

## Verification

- Check poster, video, PPT, brand, documents, English practice, and account/settings actions when changing shared tokens. Verify the computed radius, font size, and font weight against a `SelectField`, including compact and disabled controls.
- Inspect a desktop width and a narrow mobile width, plus any affected editor or dialog. Check for clipping and horizontal overflow without running paid generation or submitting real user data.
- Keep existing copy, icon meanings, focus states, and action behavior intact. Run the repository guard/typecheck and relevant web tests before delivery.
