# Niki

**Generate ready-to-review loan posters in one click.**

Niki is a focused poster workspace for loan-marketing teams. Select a product, choose the image ratio and quantity, enter the campaign copy, and start generating. Results stay organized by batch so they are easy to review on desktop or mobile.

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="https://github.com/Rain765/Niki/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Rain765/Niki?style=flat-square" /></a>
  <a href="https://github.com/Rain765/Niki/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/Rain765/Niki?style=flat-square" /></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
</p>

## What you can do

- **Generate posters in one click** — enter the campaign copy and start image generation without writing prompts.
- **Choose the right product treatment** — create campaigns for Zamloan or BiuMoney with product-specific references and layout rules.
- **Control each batch** — select a `1:1` or `16:9` ratio and generate between 1 and 10 posters at a time.
- **Keep every result** — new batches appear without replacing previous work, and interrupted or failed states remain visible after reload.
- **Review from any screen** — the composer, progress states, and result gallery are designed for both phone and desktop use.
- **Separate user workspaces** — hosted installations can provide account-based project isolation and configurable storage and generation limits.

## Product flow

1. Sign in to Niki.
2. Select **Zamloan** or **BiuMoney**.
3. Choose the ratio and number of posters.
4. Enter the campaign copy and start generation.
5. Review the completed images in the project timeline or start another batch.

## Local development

### Requirements

- Node.js `24.x`
- pnpm `10.33.2` through Corepack
- macOS, Linux, WSL2, or Windows
- An image-generation provider configured in Niki settings

### Start Niki

```bash
git clone https://github.com/Rain765/Niki.git
cd Niki
corepack enable
pnpm install
pnpm tools-dev start web
```

Open the web URL printed by `tools-dev`.

To start the daemon, web app, and Electron shell together:

```bash
pnpm tools-dev
```

Use `pnpm tools-dev status`, `pnpm tools-dev logs`, and `pnpm tools-dev stop` to inspect or stop the managed runtime.

## Authentication and quotas

Authentication is disabled for local-only development. A hosted installation can enable Feishu login with:

```env
NIKI_AUTH_MODE=feishu
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
NIKI_PUBLIC_URL=https://your-niki-domain.example
```

Administrators can create password accounts, disable access, reset passwords, and set storage and daily-generation limits from the account-management interface.

## Data and security

- Runtime data is stored under `.od/` by default.
- `OD_DATA_DIR` can relocate all daemon runtime data.
- Authenticated users receive isolated project roots.
- Session tokens are stored as hashes and expire.
- Password login includes failure tracking and rate limiting.
- Storage and generation limits are enforced by the daemon.

Do not commit local data, logs, databases, or generated scratch files from `.od/` or `.tmp/`.

## Repository layout

| Path | Responsibility |
|---|---|
| `apps/web` | Poster composer, project timeline, result gallery, and account UI |
| `apps/daemon` | HTTP API, persistence, authentication, quotas, and media jobs |
| `apps/desktop` | Electron desktop shell |
| `packages/contracts` | Shared API and event contracts |
| `tools/dev` | Supported local lifecycle commands |

## Contributing

Before submitting changes, read [CONTRIBUTING.md](CONTRIBUTING.md) and run the checks required for the affected packages. The standard repository checks are:

```bash
pnpm guard
pnpm typecheck
```

## License

Licensed under the [Apache License 2.0](LICENSE).
