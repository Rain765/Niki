# Document → PPT studio

Niki's PPT mode (`/?mode=ppt`) uses the existing application navigation with a rebuilt creation, review and library workspace. It accepts PDF, DOCX, Markdown and UTF-8 TXT (10 MB / 80,000 extracted characters). Scanned PDFs require OCR. The eleven original color palettes and 16:9 / 4:3 / 16:10 formats remain available. Explicit page counts are 5, 10, 15 or 20 including cover and closing; automatic length supports 5–30 pages.

## Design comparison and decision

The user supplied `guizang-ppt-skill-main.zip`. Its skill is larger and materially different from the repository's existing `design-templates/guizang-ppt`: it adds a Swiss direction with 22 registered body layouts, expanded presenter controls and rendered layout validators. It describes two visual directions, magazine and Swiss, and explicitly cautions against dense training material. The archive LICENSE identifies AGPLv3; the existing bundled version identifies MIT. No files, executable scripts, CSS or artwork from the archive are vendored in this change.

The existing `design-templates/html-ppt` contains 36 themes, 31 single-page layouts and 15 complete-deck examples. It has broader information-layout coverage; it is not an automatically editable PPTX converter. The previous workbench's editable export sends an agent another conversion task.

The studio combines independently implemented Swiss/editorial composition with the existing `DECK_SKELETON_HTML` runtime for HTML presentation navigation and printing. It retains native PPTX generation so text, shapes and arrows stay editable. It does not claim to execute the uploaded skill or expose all 31/22 source layouts. Thirteen supported compositions are available, including dense editorial, specification tables, source-backed metrics, architecture layers, graph flows, cycles, timeline, comparison and matrix. Style thumbnails are rendered by the actual export renderer through `GET /api/presentations/styles/:style?palette=...`.

## Content and limits

Full-detail generation is the default; brief summaries are an explicit choice. Prompts preserve arguments, values, units, conditions, exceptions and process steps on slides. The model supplies source-passage references; the original extracted passages remain available in the review panel and referenced passages are included in PPTX speaker notes. Coverage warnings flag passages without a reference. Reference coverage is not semantic completeness: a citation cannot prove every fact is represented, and the UI says so.

The renderer wraps CJK and Latin text without silently truncating it. Table, step and architecture rows allocate height by measured content. Text slides that overflow first fall back to editorial composition without a model call. Automatic-length decks may split content blocks across slides up to 30 pages; explicit page counts stay fixed. Graphs retain their relationships and are not flattened into prose. If deterministic recovery cannot fit the content, generation may make its bounded model retry. The same recovery runs when saving or retrying a persisted failed draft, and the saved deck reflects the actual layout and page count. Font metrics can vary by viewer. Editorial display text uses Noto Serif SC when installed, with normal viewer fallback; body text uses Microsoft YaHei/PingFang-compatible metrics. WebGL effects and rasterized full-slide exports are not part of this implementation.

Generation uses the configured OpenAI provider with `gpt-5.6-terra`, medium reasoning, strict structured output, `store: false`, and at most one automatic retry. Uploaded content is treated as untrusted data, not instructions. Full original documents and source passages stay within the owning project. The product uses the existing Niki authentication, storage and generation quotas, owner checks and one-active-job-per-user limit.

## API and CLI

- `POST /api/presentations`: multipart file + JSON options (`palette`, `ratio`, `pageCount`, `style`, `density`, `prompt`), returns a job and generates asynchronously.
- `GET /api/presentations`: owned history.
- `GET /api/projects/:id/presentation`: status, usage, deck, source blocks, warnings and output paths.
- `PATCH /api/projects/:id/presentation`: `{revision, slideIndex, slide}`; re-exports without a model call. Revision checks prevent stale overwrites; failed writes preserve the old revision.
- Style defaults are `swiss` and `complete`; older jobs without these fields remain readable. Older jobs lack the new source references/HTML export until regenerated or saved.

```bash
od ppt generate --file architecture.docx --style swiss --density complete --color emerald --ratio 16:9 --pages auto --prompt-file brief.md --wait --json
od ppt list --json
od ppt status --project PROJECT_ID --json
od ppt edit --project PROJECT_ID --page 3 --revision N --slide-file revised-slide.json --json
od ppt preview --project PROJECT_ID --page 3 --output slide.svg --json
od ppt download --project PROJECT_ID --output presentation.pptx --json
od ppt download --project PROJECT_ID --format html --output presentation.html --json
```

Token usage includes reasoning and retries, with reasoning already counted in output tokens. Displayed USD cost uses the recorded standard input/cached/output prices; a nonstandard gateway suppresses that estimate. Parsing, storage and server operation are separate from model pricing. Manual editing has no model-token charge.

## Validation

Tests cover extraction, references and missing-passage warnings, detailed text beyond the former 100-character cap, native PPTX text/notes/arrows, three ratios, shared HTML deck navigation, distinct architecture/flow composition, return-arrow labels, ownership, admission, revision conflicts and interrupted jobs. Browser verification must include creation, actual generation, source comparison, editing, download, reloading history and mobile layout; green unit tests alone do not establish presentation quality.
