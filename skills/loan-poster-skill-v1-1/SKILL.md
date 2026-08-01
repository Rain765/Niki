---
name: loan-poster-skill-v1-1
description: |
  Generate consistent Zamloan or BiuMoney Zambia loan posters in selectable 1:1 or 16:9 formats.
triggers:
  - "loan poster"
  - "Zamloan poster"
  - "BiuMoney poster"
  - "Zambia loan advertising"
  - "贷款海报"
  - "赞比亚海报"
od:
  mode: utility
  category: marketing-creative
---

# Loan Poster Skill v1.1

Use this skill when a request asks for a Zamloan or BiuMoney Zambia loan poster.
The caller supplies the brand, aspect ratio, quantity, and campaign context.

## Required inputs

- `brand`: `zamloan` or `biumoney`
- `format`: `1:1` or `16:9`
- `quantity`: integer from 1 through 10
- `campaign`: optional campaign or scene direction

## Workflow

1. Read `system_prompt.md`, `template_rules.md`, `negative_prompt.md`, and
   `output_format.md`.
2. Read `config.json` and the JSON libraries under `library/` before resolving
   scenes, characters, colors, headlines, and benefits. Use `generator.py` only
   as an internal structured prompt helper; do not expose its planning output.
3. Generate exactly the requested quantity at the requested format. Do not
   substitute another supported format.
4. Keep the selected brand consistent in visible copy, filenames, and creative
   direction. Never mix Zamloan and BiuMoney in one output.
5. Produce only the requested poster image files. Reference images and prompt
   planning files are internal inputs, not deliverables.

## Unified visual contract

- Use a red-dominant gradient background and a glossy curved bottom ribbon.
- Keep copy on the left and realistic African / Black models on the right.
- Show an authentic Zambian lifestyle scene with the main model holding a
  clearly visible smartphone.
- Keep the phone UI white and readable with one solid green checkmark and short
  black status text.
- Use exactly one large semi-transparent Z from the supplied reference as a
  background structure.
- Do not render a Zamloan, Biu Money, BiuMoney, or other brand-name wordmark in
  the top-left corner. Do not replace it with another text logo or icon logo.
- Preserve premium commercial photography and natural skin retouching.

## Batch planning

Resolve these variables for every poster:

- `SCENE_NAME`
- `HEADLINE_LINE_1`
- `HEADLINE_LINE_2`
- `SUBLINE`
- `BACKGROUND_COLORS`
- `RIBBON_COLOR`
- `MODEL_COMBINATION`
- `SCENE_DESCRIPTION`
- `PHONE_TEXT`

Keep the overall structure consistent while varying scenario, relationship,
model composition, copy, ribbon color, and visual story. Avoid repeating the
same model combination in adjacent outputs.

## Output contract

- Respect `1:1` as square and `16:9` as landscape.
- Vary scenarios and model relationships across a batch without changing the
  selected brand system.
- Keep phone UI simple and readable.
- Avoid duplicate marks, auxiliary manifests, critique files, and HTML output.
- Use the negative prompt in `negative_prompt.md` for every image.
