# Document to PPT

Niki's **PPT** tab (`/?mode=ppt`) accepts PDF, DOCX, Markdown and UTF-8 TXT. Choose a theme color, aspect ratio and slide count, then generate. Page counts include the cover and closing: Auto, 5, 10, 15 or 20. Supported ratios are 16:9, 4:3 and 16:10. The eleven theme palettes sample the supplied Color Tokens reference; generated slides use its dark, normal, light and air shades with neutral text.

Generation uses the configured OpenAI API key and base URL (`resolveProviderConfig`) with `gpt-5.6-terra`. A strict Responses API schema produces content and explicit diagram edges, followed by server validation and a deterministic SVG/PPTX renderer. Uploaded text is untrusted source material, not system instructions. The model receives no tools or executable output channel. Files are limited to 10 MB and 80,000 extracted characters. Scanned PDFs require OCR beforehand; no content is silently truncated.

The renderer supports cover, overview, steps, timeline, architecture, flow, comparison, matrix, cycle and closing layouts. Text, shapes and arrows in the PPTX remain editable. Native diagram arrows can be moved in PowerPoint; they are not PowerPoint SmartArt. Previews and exports share geometry and text wrapping. Installed fonts may produce minor differences between viewers; PPTX uses Microsoft YaHei with viewer fallback on other platforms.

Users can preview pages, edit their titles, descriptions, item text, connections and speaker notes, and save a new version without calling the model. Switching to a diagram layout requires valid connections. Complex slides may require shorter copy. Edits check the current revision and publish download paths only after the whole export succeeds. Older files remain available. History, input files, generated content, status and usage persist with the owner-scoped project. Server restarts mark unfinished tasks as failed on the next read.

## API and CLI

- `POST /api/presentations`: multipart `file` and JSON `options` (`palette`, `ratio`, `pageCount`, `prompt`); returns a `PresentationJob` with HTTP 202.
- `GET /api/presentations`: the authenticated user's latest 100 presentations.
- `GET /api/projects/:id/presentation`: status, deck content, revision, usage and project-relative output paths.
- `PATCH /api/projects/:id/presentation`: `{revision, slideIndex, slide}`; re-exports without a model call.
- Downloads and SVG previews use the normal owner-protected project file API.

```sh
od ppt generate --file architecture.docx --color emerald --ratio 16:9 --pages 10 --prompt-file brief.md --wait --json
od ppt list --json
od ppt status --project PROJECT_ID --json
od ppt edit --project PROJECT_ID --page 3 --revision 1 --slide-file revised-slide.json --json
od ppt preview --project PROJECT_ID --page 3 --output slide.svg --json
od ppt download --project PROJECT_ID --output presentation.pptx --json
```

`--prompt-file -` and `--slide-file -` read stdin. Use `--daemon-url` or `OD_DAEMON_URL` to select the instance, and `OD_NIKI_SESSION_TOKEN` for authenticated instances. File downloads refuse to overwrite an existing local path.

At most one generation per user and two globally run at once. Each accepted generation consumes one daily generation attempt alongside existing media tasks; storage quotas apply to uploads and exports. Invalid model output gets at most one automatic retry. Usage from both attempts is retained, including on failure when the provider returns it. Reasoning tokens are a subset of output tokens and are not charged twice in the estimate. At the recorded 2026-09-11 standard prices, Terra costs $2/M input, $0.20/M cached input and $12/M output tokens. Estimates exclude storage/compute and are suppressed for non-OpenAI gateways. Provider billing remains authoritative.

## Validation

Daemon tests cover document extraction, exact page count, unsafe SVG text, diagram references, three aspect ratios, distinct return connections, native editable export, ownership, duplicate admission, revision conflicts, quota accounting and interrupted-job recovery. The implementation uses [PptxGenJS](https://github.com/gitbrent/PptxGenJS) (MIT). Product and layout research considered [Presenton](https://github.com/presenton/presenton), [AntV Infographic](https://github.com/antvis/Infographic) and [PPT Master](https://github.com/hugohe3/ppt-master); their application code is not bundled.
