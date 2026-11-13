# PPT reference previews

Derived from the original `design-templates/html-ppt` resources at
`d35b6409369196cf432ceefefe1e709dd6f7c91f` and the original Guizang
`guizang-386e091390b8` bundle's `assets/ppt-skill-showcase.png`.
These files are UI references only. Generation resources, prompts and rules are unchanged.

- Each HTML cover uses its original HTML, CSS, fonts and preview runtime.
- All 15 full decks and the custom starter have a default plus all 36 theme variants.
  Themes use the original theme CSS link and `data-theme`, preserving the template's
  own CSS specificity. Identical images share content-addressed filenames.
- The automatic option shows the original template gallery. With a theme but no
  template selected it shows that theme on the original generic starter.
- Guizang is the original combined style showcase, labelled a style reference.
- Thumbnails fit inside 320 × 180 (2× the 160 × 90 UI). Full previews fit inside
  1280 × 1280 and load only when opened. Original aspect ratios are preserved.
- WebP quality: thumbnail 75, full 85; effort 6. Files use the first 20 SHA-256
  hex characters of their bytes. Only these hashed image paths get immutable caching.

Regenerate with the locked workspace dependencies installed and an isolated
`pnpm tools-dev` daemon running:

```sh
pnpm exec tsx scripts/bake-native-ppt-previews.ts http://127.0.0.1:<daemon-port> /path/to/original/ppt-skill-showcase.png
pnpm --filter @open-design/web test tests/poster/native-preview-assets.test.ts
```

The manifest is `apps/web/src/poster/native-preview-assets.json`. Remove obsolete
WebP files after regeneration; the test checks catalog coverage, file hashes,
WebP headers, size budgets and orphaned files. Review regenerated images visually
before committing. No model API is called.
