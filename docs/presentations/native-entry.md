# Native presentation entry

The PPT page now launches the complete `html-ppt` or `guizang-ppt-skill` workflow in the existing project/chat/file workspace. It does not feed those workflows through the legacy `/api/presentations` JSON-to-PPTX renderer.

## Boundaries

- Original documents go through `POST /api/projects/:id/files` without text extraction or shortening. Generation cannot start until upload and brief persistence succeed.
- Projects keep `skillId`, `metadata.kind=deck`, and `metadata.nativePresentation` with workflow, resource version, source filename and the submitted brief. The daemon's existing skill loader stages the complete resource directory and composes the original skill body.
- An explicit native workflow does not acquire the generic `example-simple-deck` scenario plugin. Explicit user-selected plugins retain the existing behavior.
- Original `ProjectView`, conversation, editing and run APIs remain the workspace. Native HTML preview uses an explicit separate-window link, because guizang requires localStorage and popup synchronization that the normal opaque preview sandbox cannot provide. The source editor stays available; the sandbox is not weakened. The static `/ppt-workspace?path=...` shell preserves conversation/file navigation and works in both static and server builds. Outer-page styles do not flow into the embedded workspace or the generated document.
- Model execution uses a local tool-capable agent. The workspace exposes agent/model/reasoning selection; when no model has been chosen it retains the source and waits. It does not silently substitute a fallback generator.
- Updated the existing recoverable Codex skill-budget notice matcher for the 0.149 wording (without a percentage); real runtime failures remain fatal.
- The legacy studio entry has been removed from the PPT page. Existing legacy projects are not automatically deleted for other users. The new workflow returns actual generated artifacts; HTML presenter capability is not a promise of equivalent editable PPTX export.

## Frozen resources

The built-in HTML PPT baseline contains 226 files. `e2e/tests/presentations/native-resources.test.ts` checks their SHA-256 tree against `NATIVE_PRESENTATION_RESOURCES`.

Guizang is installed as a complete user-managed resource bundle, not vendored into application source. The supplied archive SHA-256 is `386e091390b83d2d8abf737e80540eb1b767c0a70e86bd92aa88d7f6d29c451b`. Preserve all 41 files, including LICENSE, references, templates, assets and validation scripts. The active installation uses `<OD_DATA_DIR>/skills/guizang-ppt-skill` linked to the extracted, versioned bundle under `<OD_DATA_DIR>/skill-bundles/`. `provenance.json` records per-file hashes. A missing skill is shown as unavailable; no alternate engine is selected.

A resource version in project metadata is provenance, not a claim that arbitrary future source edits are automatically pinned. Resource updates must retain older bundles and rerun artifact comparisons before changing the entry's recorded version.

## CLI

The same original project, file and run endpoints are available via:

```sh
od ppt native --workflow html-ppt --prompt-file brief.md --file source.docx --agent codex --model MODEL --json
od ppt native --workflow guizang-ppt-skill --prompt-file brief.md --json
od run watch RUN_ID --json
```

Omit `--agent` to save a project and open the returned workspace path for native requirement/design interaction. `--prompt-file -` accepts stdin. Model invocation is opt-in through `--agent`; original skills may pause for user decisions. Existing `od project`, `od run`, and `od ui` commands remain available.

## Acceptance boundaries

Resource hashes, request checks, upload integrity and passing builds establish preservation of the invocation path. They do not establish visual quality. Use public synthetic content for automated provider runs. Do not send private source documents without authorization for the actual processing destination.

For visual acceptance, inspect the produced files, compare them against the original templates at the same viewport, verify every factual number and relation, test audience/presenter views and refresh the actual deployed entry. Do not accept an SVG-only preview or a manually constructed PPTX as evidence that this workflow produced the same result. Archive the exact output and review evidence, including incomplete or failed runs.

## Original workflow precedence

Native `html-ppt` and `guizang-ppt-skill` runs use their own discovery and preflight rules. They do not receive the generic fixed deck framework or the generic discovery form. The previous seed detector only recognized `assets/template.html`; it missed HTML PPT's `templates/full-decks/*` and `templates/deck.html`, so a supposedly native run was told to replace its original renderer. Guizang preflight also must not unconditionally pick style A's template when the user selected style B. Regression tests now inspect the composed prompt, not just resource hashes.

The UI selects original full-deck templates and previews their original HTML with relative CSS/JS dependencies via `/api/native-presentation-resources/:workflow/*`. This endpoint permits only the two native workflows, limits files to assets/templates, and rejects traversal and escaping symlinks. `od ppt native-templates --json` lists the same catalog; `od ppt native --template weekly-report --prompt-file brief.md` carries the selected template into the original workflow.

Native text editing operates on individual text nodes within slides and retains nested emphasis, SVG labels, scripts and styles. A local HTML wrapper can point at its same-project deck. The editor re-reads before saving to avoid overwriting an agent's intervening change; it uses the existing file endpoint. This is a pre-save conflict check, not an atomic database compare-and-swap. Full layout edits remain available through the original conversation and source editor. The original deep/light rhythm is retained; readability fixes change text styling, not background alternation.
