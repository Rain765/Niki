# Prompt Template

Create a premium `[BRAND]` Zambia mobile-loan advertising poster in
`[FORMAT]`.

For Zamloan, use two prompts. The main prompt generates only
`[BACKGROUND_COLORS]`, `[RIBBON_COLOR]`, and the empty environment. The
foreground prompt generates `[MODEL_COMBINATION]` on a transparent background,
with the main model holding a clearly visible smartphone showing `[PHONE_TEXT]`.
Pass `[HEADLINE_LINE_1] [HEADLINE_LINE_2]` and `[SUBLINE]` as deterministic copy
fields. The daemon composites background → supplied Z → model → copy → logo.

Do not render a standalone brand-name wordmark or logo in the generated image's
top-left corner. For Zamloan, pass the exact attached logo to
`--overlay-logo`; the daemon adds it after generation.
Use the negative prompt in `negative_prompt.md`.
