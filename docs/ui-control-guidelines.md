# UI control guidelines

These rules define the shared interaction language for product selectors, action buttons, and transient feedback. New pages should use the shared components and classes instead of copying page-specific controls.

## Selectors

- Use `SelectField` for a labelled form selector and `CustomSelect` only when the surrounding layout already owns the label.
- The closed trigger uses the neutral fill, a 12 px radius, no visible border, and one clear focus outline.
- The menu opens below the trigger, remains within the viewport, and uses the same option hover, active, and selected states everywhere.
- A field label is the accessible name. The selected value stays visible inside the trigger and is not repeated in the accessible name.
- Keyboard behavior is inherited from `CustomSelect`: open with Enter, Space, or Arrow keys; move through options with Arrow keys; confirm with Enter; close with Escape.

## Buttons

- Use `Button`; do not create page-specific primary or secondary button systems.
- `primary` is reserved for the main action in a section. `secondary` is for supporting actions, `ghost` for low-emphasis utilities, and `danger` for destructive actions.
- Use one primary action per toolbar. Primary actions sit after their required inputs and align to the same control height.
- Loading buttons remain in place, expose `aria-busy`, and are disabled until the action completes.
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
- Shared visual and interaction states live in `src/styles/ui-controls.css`. Page styles may only define layout proportions or truly page-specific context.
- The poster generation page is the reference implementation. The video quick-generation page uses the same primitives; migrate other pages only after this reference is approved.
