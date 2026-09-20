# PPT model providers

Administrators open **account menu → Model settings** to save, replace, test, or delete a provider key. The PPT **Generation model** filter selects a model for a new presentation. Members use the administrator's default and cannot read or change provider settings. Existing-model behavior remains available and is the initial default.

| Label | API model | Endpoint |
| --- | --- | --- |
| Qwen3.8-Max | `qwen3.8-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Kimi K3 | `kimi-k3` | `https://api.moonshot.cn/v1` |
| DeepSeek V4.1 Flash | `deepseek-flash` | `https://api.deepseek.com/v1` |

These are the mainland-China API endpoints, not Coding Plan credentials. A connection test makes a small billable chat request. Successful connection is not a presentation-quality rating. Replacing a key clears its test status. Changing the default affects new presentations; existing provider-bound projects retain their model for revisions. Deleting a key makes future runs of those projects unavailable until that provider is configured again. Requests already in progress retain their credential snapshot.

The daemon stores credentials in `RUNTIME_DATA_DIR/ppt-model-credentials.json` with owner-only permissions and atomic writes. Keep the runtime data directory persistent across releases, as for the SQLite database. Public responses contain only configuration status and the key's final four characters. No key enters project metadata or browser storage.

Provider-bound projects run the original HTML PPT or Guizang skill through OpenCode. A run-scoped local gateway forwards chat, streaming, image, tool, and reasoning payloads to the selected provider. Only an ephemeral gateway credential enters OpenCode's environment. There is no automatic fallback to another provider. Template resources and design rules are unchanged. Interactive confirmations use the host's question form because the noninteractive OpenCode runner cannot wait for terminal input.

## CLI

The `od ppt` commands use the same administrator HTTP endpoints as the UI. Remote authenticated instances require `OD_NIKI_SESSION_TOKEN`.

```sh
od ppt providers --json
od ppt provider-save --provider qwen --key-file /secure/path/qwen-key --json
od ppt provider-test --provider qwen --json
od ppt default-model --provider qwen --json
od ppt native --workflow html-ppt --provider qwen --template tech-sharing --prompt-file brief.md --agent opencode --json
od ppt default-model --provider existing --json
od ppt provider-delete --provider qwen --json
```

`--key-file -` reads from stdin. Never put a key directly in command arguments. `--prompt-file -` also accepts a piped brief.

## Validation

- `apps/daemon/tests/ppt-models.test.ts`: permissions, key persistence and masking, test invalidation, concurrent providers, stream and multimodal forwarding, expired run credentials.
- `apps/daemon/tests/ppt-model-projects.test.ts`: real project APIs stamp canonical bindings and prevent later changes.
- `apps/daemon/tests/ppt-opencode.test.ts`: opt-in installed OpenCode test against a local fake provider. It executes actual image-reading and HTML-writing tools and verifies reasoning survives tool round trips. Run with `OD_TEST_OPENCODE_BIN=/absolute/path/to/opencode`.
- Web tests cover the administrator filter, unchanged original brief, upload binding preservation, and key-entry behavior.
- Real provider quality still requires actual credentials and representative documents compared with the original template and Guizang references. Mock tests do not establish that quality.

Model identifiers checked against [Qwen documentation](https://help.aliyun.com/zh/model-studio/vision-model), [Kimi model list](https://platform.kimi.com/docs/models), and [DeepSeek model details](https://api-docs.deepseek.com/quick_start/pricing/) on 2026-09-20.
