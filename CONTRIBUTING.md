# Contributing to Niki

Thank you for helping improve Niki. This repository is focused on a reliable loan-poster workflow: choose a supported product, enter campaign copy, generate images, and review each batch on desktop or mobile.

<p align="center"><b>English</b> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a></p>

## Before you start

- Search the [existing issues](https://github.com/Rain765/Niki/issues) before opening a new one.
- Open an issue before starting a substantial feature or product-direction change.
- Keep each pull request focused on one concern.
- Never include account credentials, provider keys, session tokens, customer data, or generated runtime data in a commit.

## Contribution areas

| Area | Examples | Main paths |
|---|---|---|
| Poster workflow | Product selection, copy entry, ratio and quantity controls, progress feedback | `apps/web/src/components/` |
| Poster output | Product-specific references, layout constraints, batch status and result handling | `apps/web/`, `apps/daemon/` |
| Mobile experience | Responsive controls, loading states, image review and download behavior | `apps/web/` |
| Accounts and limits | Sign-in, account administration, project isolation, storage and generation limits | `apps/web/src/auth/`, `apps/daemon/` |
| Runtime reliability | Persistence, job recovery, media delivery and operational tooling | `apps/daemon/`, `tools/` |
| Documentation | Setup instructions, user-visible behavior and troubleshooting | `README*.md`, `docs/` |

Changes outside the current loan-poster workflow require prior agreement in an issue.

## Local setup

### Requirements

- Node.js `~24`
- pnpm `10.33.2` selected through Corepack
- macOS, Linux, WSL2, or Windows

### Install and start

```bash
git clone https://github.com/Rain765/Niki.git
cd Niki
corepack enable
pnpm install
pnpm tools-dev start web
```

Use `pnpm tools-dev` when you need the daemon, web app, and Electron shell together. The supported lifecycle commands are:

```bash
pnpm tools-dev status
pnpm tools-dev logs
pnpm tools-dev stop
pnpm tools-dev check
```

Do not add alternative root-level development or start commands.

## Repository boundaries

- `apps/web` owns the poster UI, project timeline, result gallery, and account-management interface.
- `apps/daemon` owns HTTP APIs, media jobs, persistence, authentication, quotas, and the CLI.
- `apps/desktop` owns the Electron shell.
- `packages/contracts` owns shared API DTOs and event contracts.
- `tools/dev` owns the supported local lifecycle.

Read the closest `AGENTS.md` before changing a directory. Shared API shapes must be updated in `packages/contracts` before the web and daemon implementations diverge.

## Development rules

- Use TypeScript for new project-owned source, tests, scripts, and entrypoints.
- Keep app tests in the package-level `tests/` directory; do not add tests under `src/`.
- Use single quotes in JavaScript and TypeScript unless escaping would make the result harder to read.
- Keep code comments in English and use them for non-obvious intent or constraints.
- Do not add root dependencies without explaining their purpose and bundle or runtime cost in the pull request.
- Do not commit `.od/`, `.tmp/`, logs, databases, screenshots containing private data, or generated scratch files.

## Validation

Every pull request must run the checks that match its scope. Start with:

```bash
pnpm guard
pnpm typecheck
```

Then run the relevant package checks, for example:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web build
pnpm --dir apps/daemon test
pnpm --dir apps/daemon build
```

Documentation-only changes should still verify links, commands, Markdown rendering, and English/Chinese consistency.

For bug fixes, prefer a regression test that fails before the source change and passes afterward. Visible UI changes also need a screenshot or a short manual verification note.

## Commits and pull requests

- Use an imperative, scoped title such as `fix(web): preserve poster batches after reload`.
- Keep one concern per pull request.
- Explain why the change is needed and what users will see.
- Complete every applicable section of `.github/pull_request_template.md`.
- Link the related issue when one exists.
- Include the exact validation commands and results.
- Add entry-point screenshots for visible UI changes.
- Do not force-push a shared branch unless a maintainer asks you to.
- Do not add co-author metadata to commits.

## Reporting bugs

Open a [GitHub issue](https://github.com/Rain765/Niki/issues/new) with:

- The browser, operating system, and whether you were using phone or desktop.
- The selected product, ratio, and poster count.
- The steps that led to the problem and what you expected to happen.
- Whether the problem occurred before generation, during progress, or while viewing results.
- The relevant daemon log tail with secrets and customer data removed.
- A screenshot or screen recording for visible problems.

Never paste provider keys, passwords, cookies, session tokens, or unredacted customer content into an issue.

## Product and security boundaries

Pull requests should not:

- Add unsupported financial claims, approval promises, rates, or fees to poster templates.
- Bypass product-specific copy and reference rules.
- Weaken account isolation, quotas, password handling, or session expiry.
- Add product flows outside the current loan-poster experience without product approval.
- Replace the current web, daemon, or persistence architecture without prior discussion.
- Bundle third-party assets without compatible licensing and attribution.

## License

By contributing, you agree that your contribution is licensed under the repository's [Apache License 2.0](LICENSE). Files that contain their own license or attribution remain governed by those notices.
