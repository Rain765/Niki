# Niki

**One-click AI loan-poster generation, built for real mobile workflows.**

Niki is an authenticated creative workspace for producing and reviewing loan marketing posters. Choose a product, aspect ratio, and quantity, enter the campaign copy, and Niki starts image generation immediately—without asking users to write prompts or manage an agent conversation.

This repository is the current Niki product. It is based on the Open Design runtime, but the primary experience is now the Niki poster workflow described below.

<p align="center"><b>English</b> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

<p align="center">
  <a href="https://github.com/Rain765/Niki/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Rain765/Niki?style=flat-square" /></a>
  <a href="https://github.com/Rain765/Niki/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/Rain765/Niki?style=flat-square" /></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
</p>

## What Niki does

- **One-click poster creation** — select BiuMoney or Zamloan, choose the output ratio and number of posters, add the copy, and start generating.
- **Product-specific creative direction** — each product uses its own reference assets, layout constraints, and simplified copy rules.
- **Generation batch timeline** — every request is shown as a separate batch. Older results stay above the active batch, and queued, completed, failed, or interrupted states survive reloads.
- **Mobile-first review** — the composer, loading states, image delivery, and result grid are tuned for phones as well as desktop browsers.
- **Authenticated workspaces** — hosted deployments can use Feishu OAuth and administrator-managed password accounts.
- **Per-user isolation and quotas** — projects are isolated by account, with configurable storage and daily-generation limits.
- **Durable local runtime** — projects, messages, task state, and generated files remain on disk and can be reopened later.

## Product flow

1. Sign in to Niki.
2. Choose **BiuMoney** or **Zamloan**, an aspect ratio, and a poster count.
3. Enter the campaign copy and start generation.
4. Review each generation batch in the project timeline. Start another batch without losing earlier results.

## Quick start

### Requirements

- Node.js `24.x`
- pnpm `10.33.2` through Corepack
- macOS, Linux, WSL2, or Windows
- An image-generation provider configured in Niki settings

### Run the web workspace

    corepack enable
    pnpm install
    pnpm tools-dev start web

Open the web URL printed by `tools-dev`.

To run the daemon, web app, and Electron desktop shell together:

    pnpm tools-dev

Use `pnpm tools-dev status`, `pnpm tools-dev logs`, and `pnpm tools-dev stop` to inspect or stop the managed runtime.

## Authentication and account management

Authentication is disabled for local-only development. A private deployment can enable standalone password authentication without Feishu:

    NIKI_AUTH_MODE=password
    NIKI_PUBLIC_URL=https://your-niki-domain.example

After the daemon starts, create the first administrator once from the same machine. For Docker Compose, run:

    printf '%s\n' 'choose-a-strong-password' | \
      docker compose exec -T open-design node apps/daemon/dist/cli.js \
      auth bootstrap-admin --username owner --name Owner --password-file -

The bootstrap endpoint accepts only local daemon requests and closes permanently after the first user is created. Passwords must contain 10–128 characters. Use `NIKI_AUTH_MODE=hybrid` to offer both password and Feishu login, or keep the legacy Feishu setup with:

    NIKI_AUTH_MODE=feishu
    FEISHU_APP_ID=your_app_id
    FEISHU_APP_SECRET=your_app_secret
    NIKI_PUBLIC_URL=https://your-niki-domain.example

When authentication is enabled, administrators can manage password accounts and quotas in the Niki account panel or through the `od auth` CLI:

    od auth status
    od auth login --username <id> --password-file <path|->
    od auth change-password --current-password-file <path|-> --password-file <path|->
    od auth users list
    od auth users create --username <id> --name <display-name> --password-file <path|->
    od auth users set-quota --user <user-id> --storage-gb <number> --daily-generations <number>

`od auth login` prints a new `OD_NIKI_SESSION_TOKEN` export command; administrator CLI operations require an administrator token in that environment variable. Passwords are read from a file or standard input and are never accepted directly as a CLI argument.

## Remote device pairing

Niki includes a secure device-relay foundation for pairing a local daemon with the hosted service:

    od device pair --relay-url <url> --name <device-name>
    od device status
    od device disconnect

The current device bridge is intentionally limited to pairing, presence, and Ping/Pong health checks. It does not execute remote commands.

## Data and security

- Runtime data is stored under `.od/` by default.
- `OD_DATA_DIR` can relocate all daemon runtime data.
- Authenticated users receive isolated project roots.
- Session tokens are stored as hashes and expire.
- Password login includes failure tracking and rate limiting.
- Per-user storage and generation quotas are enforced by the daemon.

Local runtime data, logs, databases, and generated scratch files under `.od/` and `.tmp/` must not be committed.

## Repository layout

| Path | Responsibility |
|---|---|
| `apps/web` | Niki web workspace, poster composer, authentication UI, and project timeline |
| `apps/daemon` | HTTP API, persistence, authentication, quotas, media jobs, and the `od` CLI |
| `apps/desktop` | Electron desktop shell |
| `apps/relay` | Secure device-pairing relay |
| `packages/contracts` | Shared API and event contracts |
| `tools/dev` | Supported local lifecycle control plane |

## Development

Before submitting changes, run the repository checks that match the affected packages:

    pnpm guard
    pnpm typecheck
    pnpm --filter @open-design/web test
    pnpm --filter @open-design/daemon test

Use `pnpm tools-dev` as the only local lifecycle entry point. See [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for repository boundaries and contribution rules.

## Upstream and license

Niki is derived from [Open Design](https://github.com/nexu-io/open-design) and retains its agent runtime, project workspace, and extensible design foundation. Niki's current product layer adds the focused loan-poster workflow, managed authentication, user quotas, mobile adaptations, persistent generation batches, and secure device pairing.

Licensed under the [Apache License 2.0](LICENSE).
