---
name: logo-generator
description: Create original, production-ready logo directions from a brand brief. Use for logos, wordmarks, monograms, app marks, favicon families, identity concepts, and logo refinement or evaluation.
triggers:
  - "logo design"
  - "create a logo"
  - "brand mark"
  - "wordmark"
  - "monogram"
  - "品牌标志"
  - "设计 logo"
od:
  mode: image
  surface: image
  category: image-generation
  outputs:
    primary: logo/concept-board.png
---

# Logo Generator

Turn a structured brand brief into a small set of distinct logo systems, then refine the selected direction into practical assets. Favor memorable structure and reproducibility over decorative image generation.

## Workflow

1. Restate the brand name, audience, personality, use cases, palette, and avoid list. Flag contradictions instead of silently resolving them.
2. Explore four genuinely different directions. Vary the underlying idea and silhouette, not only color or typeface.
3. Present a concept board containing the directions at equal visual weight. Label each with a short rationale and the design principle it uses.
4. Test every direction at favicon size, in one color, reversed on dark, and beside the full brand name.
5. Ask the user to select or combine a direction before polishing a final family. If the prompt already identifies an approved source direction, treat that selection as complete and proceed without repeating discovery.
6. Save the brief and rationale as `logo/brief.md`; save visual explorations under `logo/concepts/`; save every selected production family below its requested versioned `logo/final/<finalization-id>/` directory so a later refinement cannot overwrite it.
7. Build the primary SVG first, optimize its paths, then derive dark, monochrome, favicon, touch-icon, and social-image exports from that vector source. Keep output names and locations exactly as requested by the finalization prompt.
8. Write `BRAND.md` beside the assets with palette, clear-space, minimum-size, typography and licensing notes, misuse guidance, and a preliminary similarity-risk note.

## Design constraints

- Create original geometry. Do not imitate a named brand, living designer, or protected character.
- Keep the core mark legible at 16 px and identifiable without gradients, shadows, or mockup effects.
- Use typography that can be legally shipped, and record the font name or construction method.
- Generate on a plain background first. Lifestyle mockups are secondary evidence, never the primary deliverable.
- Treat AI-generated raster art as a concept source. Reconstruct selected simple marks as SVG before calling them production-ready.
- Never put a raster `<image>`, data URL, or base64 payload inside a production SVG. Use editable paths and a sensible viewBox, then remove hidden layers, editor metadata, redundant groups, and unnecessary points.
- Never claim trademark clearance. State that final candidates need a jurisdiction-specific similarity search.

Read [references/quality-checks.md](references/quality-checks.md) before finalizing a direction.
