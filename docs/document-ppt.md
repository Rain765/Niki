# Document → PPT studio

PPT mode is part of Niki at `/?mode=ppt`. Creation, the page plan, actual slide review, structured editing and the library share the existing product navigation and color tokens. The eleven supplied palettes, 16:9 / 4:3 / 16:10 ratios and automatic / 5 / 10 / 15 / 20 pages remain available. Automatic length is bounded to 5–30 pages. Uploads accept text PDFs, DOCX, Markdown and UTF-8 TXT, up to 10 MB and 80,000 extracted characters.

## Generation pipeline v2

1. Extract source passages, a source-derived fact ledger, table cells and bounded embedded Word images. The source document is data, never authority to change system instructions or call tools.
2. Plan every page's purpose, source references, facts and registered composition. The UI defaults to confirming this plan. Users can change titles and choose compatible compositions before generation; direct generation is an explicit option.
3. Generate at most three pages concurrently. Each page is persisted independently. Retry a failed phase without paying to generate already completed pages again. Native table chunks are copied from source cells, with repeated headers and identifying columns; the model does not rewrite those cells.
4. Compose readable text, native diagrams, tables, numeric charts and original images on a shared scene. Preview, HTML and editable PPTX use this scene. Graph layouts cannot silently turn into paragraphs. Capacity failures retain the draft and explain the constraint; explicit page counts are not silently exceeded.
5. Check actual visible content against source facts, exact table cells and chart source values. Rasterize every scene, check bounds, then request semantic and visual model review. A bounded repair pass can regenerate up to three affected pages and recheck. Remaining errors block normal download; the source, draft and issue list remain accessible.
6. Review the report, jump to affected pages, edit native content or request page repair. Human acceptance is recorded explicitly and invalidated by any subsequent edit. A model review or lexical match is never presented as calibrated accuracy.

The default model is `gpt-5.6-terra`. `/models` is queried from the user's configured API; another model and an explicit fallback can be selected. Listing a model does not prove structured-output or vision compatibility. Network failures receive a bounded retry; fallback is limited to the selected alternative. Usage accumulates planning, generation, retries and review, including reasoning tokens already included in output. The previous dated tariff is retained only for its exact model at the official endpoint; unknown models and other gateways show tokens without inventing a price. Manual editing and deterministic export do not call the model.

## Reference design migration

The uploaded guizang archive describes a plan → registered layout → visual validation → iteration workflow. The repository's HTML PPT catalogue provides broader technical, report and training compositions. This implementation brings those workflow stages into Niki's controls and adds 33 native composition profiles: 22 Swiss-inspired profiles plus technical/training/editorial profiles. The gallery uses the real renderer and selected ratio and palette.

These are independently implemented editable adaptations, not execution of the original skill or a pixel-identical import of its CSS, animation or all 31 built-in HTML layouts. The uploaded archive identifies AGPLv3; no archive code, CSS or artwork is vendored. Advanced presenter effects and full-slide bitmap exports are not part of this native PPTX path. The retained HTML deck runtime supports presentation navigation and printing.

## API and CLI

Both surfaces call the same daemon endpoints and shared contracts:

- `GET /api/presentations/templates`, `GET /api/presentations/models` and `GET /api/presentations/styles/:style?template=...&ratio=...&palette=...`.
- `POST /api/presentations`: multipart file and options; returns an owned asynchronous job.
- `GET /api/presentations` and `GET /api/projects/:id/presentation`: history, progress, saved plan, source evidence, quality, usage and artifact paths.
- `POST /api/projects/:id/presentation/action`: revision-checked `continue`, `repair`, `check`, `accept-review` actions. Continuing may include the edited plan; repair includes a zero-based page index and optional note.
- `PATCH /api/projects/:id/presentation`: revision-checked native slide editing and re-export. Completed quality acceptance is cleared.

```bash
od ppt models --json
od ppt templates --json
od ppt generate --file source.docx --model gpt-5.6-terra --review-plan --family technical --pages auto --prompt-file brief.md --wait --json
od ppt continue --project PROJECT_ID --revision N --plan-file plan.json --wait --json
od ppt repair --project PROJECT_ID --revision N --page 3 --prompt-file correction.md --wait --json
od ppt check --project PROJECT_ID --revision N --wait --json
od ppt review --project PROJECT_ID --revision N --prompt-file acceptance.md --json
od ppt edit --project PROJECT_ID --page 3 --revision N --slide-file slide.json --json
od ppt download --project PROJECT_ID --output presentation.pptx --json
```

## Evaluation and acceptance

The frozen corpus and answer-free generation input exporter live under `e2e/resources/presentations`. `e2e/scripts/presentation-benchmark.ts` makes real API calls through production HTTP endpoints in an isolated instance and records every failure, source hash, configuration, job, output, candidate checks and token usage. It does not give rubric answers to the generator. `presentation-acceptance.ts` evaluates an explicit case × engine × repetition manifest, including missing runs; it requires two distinct reviewers with evidence and matching source, rubric and artifact hashes. Unreviewed checks and disagreements remain blocked.

Tests cover native extraction/retention, layout capacity, 33 profiles at three ratios, source-proof limitations, plan confirmation, owner isolation, admission, revision conflicts, interrupted work and acceptance invalidation. Browser verification and actual Office rendering are separate from unit tests. Private outputs and screenshots stay in ignored `.tmp/` directories; reports identify their exact renderer and source revision.

The eight synthetic cases do not establish production coverage or a calibrated aesthetic score. Independent human gold-standard review, three-flow comparisons and repeated runs are evidence requirements, not results that can be inferred from green tests. Merged Word tables, image meaning, scanned PDFs/OCR, embedded Office charts/formulas and font substitution across PowerPoint/Keynote still require explicit checking. The product surfaces extraction warnings; it cannot promise identical display across viewers without those viewers being tested.
