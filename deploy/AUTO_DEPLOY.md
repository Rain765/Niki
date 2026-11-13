# Niki production auto-deploy

Niki production runs on the Mac mini and is exposed through
`https://niki-work-app.pages.dev/`. The workflow in
`.github/workflows/niki-production-deploy.yml` keeps the existing immutable
release process and lets the Mac pull validated GitHub commits without opening
SSH or another inbound port.

## Safety model

- Deployment starts only after the `ci` workflow succeeds for the current tip of
  `main`, or from an explicit manual dispatch.
- The job runs only in `Rain765/Niki` on a self-hosted macOS ARM64 runner with
  the custom label `niki-production`.
- The repository variable `NIKI_PRODUCTION_AUTO_DEPLOY` must equal `true`.
- Deployments are serialized and an in-progress deployment is never cancelled.
- The public release SHA must exist in the checked-out Git history and be an
  ancestor of the target. Diverged or missing production history fails closed.
- The existing storage preflight and `deploy.zsh` remain the only release
  implementation. No Cloudflare or Feishu credential is stored in GitHub.
- The workflow verifies the public release SHA, health endpoint, home page and
  Feishu authentication readiness before reporting success.

## One-time Mac mini setup

Do not enable the repository variable until the current production release and
GitHub `main` have been reconciled in a reviewed commit. At the time this file
was introduced, production release history was not available in the cloud
checkout, so automatic deployment would correctly refuse to run.

1. On the Mac mini, read the installed
   `/Users/rain/.local/share/niki-runtime/OPERATIONS.md`, inspect
   `~/.local/share/niki-runtime/current`, and compare the public `/api/version`
   release with GitHub `main`. Preserve product changes from both histories.
2. In GitHub, open **Settings → Actions → Runners → New self-hosted runner**.
   Select macOS and ARM64, then run GitHub's generated installation commands as
   the dedicated local account that already owns the Niki release workflow.
   Do not paste the short-lived registration token into Git, logs, or chat.
3. Add the custom runner label `niki-production`. Keep the default `self-hosted`,
   `macOS`, and `ARM64` labels.
4. Install and start the runner as a launchd service using the runner package's
   generated `svc.sh` instructions. Confirm it appears online and idle in the
   repository settings. From that service account, confirm Node 24, Git, curl,
   and Corepack with pnpm 10.33.2 are on the launchd service's `PATH`; Homebrew
   tools may require adding `/opt/homebrew/bin` to the runner service environment.
   Do not change the ChatGPT/Codex desktop app's ownership of Codex remote
   access; the Actions runner is a separate service.
5. Protect `main` so changes require the repository's `ci` checks. Restrict who
   can push or merge because merged code executes on the production host.
6. After the reconciled commit has passed CI, add the Actions repository variable
   `NIKI_PRODUCTION_AUTO_DEPLOY=true`. Do not create a secret with this name.
7. Run **Niki production deploy** manually once for the reconciled `main` SHA.
   Confirm the workflow summary and `https://niki-work-app.pages.dev/api/version`
   before relying on automatic runs.

## Operation and rollback

Every successful `ci` run for a new `main` tip triggers the workflow. A stale CI
completion is skipped if a newer commit is already on `main`. Documentation-only
commits still pass through the same ancestry and public verification checks; the
release script decides the immutable build contents.

To pause automatic releases, set `NIKI_PRODUCTION_AUTO_DEPLOY` to `false` or
remove it. Stopping the self-hosted runner also prevents new jobs but leaves them
queued, so the repository variable is the preferred maintenance switch.

Use the existing immutable-release rollback procedure from `OPERATIONS.md` for a
bad deployment. Do not force-push Git history or point the workflow at an older,
unrelated commit. Land a reviewed forward fix or perform the host's documented
release rollback, then reconcile `main` before re-enabling automation.

Repository-side validation:

```sh
node --experimental-strip-types --test deploy/tests/niki-production-workflow.test.ts
```
