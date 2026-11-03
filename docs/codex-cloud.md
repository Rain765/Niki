# Niki Codex Cloud development

This setup prepares a Linux workspace for development and validation. Production
application processes and data remain on the Mac mini. The public Feishu entry is
`https://niki-work-app.pages.dev/`; Cloudflare forwards to that host as documented
in [the ingress runbook](../deploy/cloudflare/README.md).

## Repository and environment

- Repository: `https://github.com/Rain765/Niki.git`.
- Initial source ref: `codex/cloud-development`. This includes the personal rules,
  project rules, operations guide, and Cloudflare migration. GitHub `main` is an
  older line of development; do not select it as a substitute.
- Suggested environment name: `Niki development`; visibility: private.
- Platform: Linux, Node 24.x, Corepack, pnpm 10.33.2, Git, curl, Python 3, make,
  and g++. Native modules such as `better-sqlite3` may require compilation.
- Start without production secrets or a VPN connection. Static checks and basic
  web startup do not require production credentials. AI generation, media,
  Feishu login, and other integrations need separately configured test access.

In Codex, choose **Work in > Cloud > Select environment > Create environment**,
select this repository and source ref, and give the setup agent the installation
and startup instructions below. Review actual setup results before publishing.
After publication, start a new cloud task and repeat the startup checks. A saved
configuration or this document alone is not proof that a cloud environment runs.

Official setup reference:
<https://learn.chatgpt.com/docs/environments/cloud-environments>.

## Network access

Enable the package-manager domain preset for installation. Allow additional
download hosts only as required by observed installation failures, including
`nodejs.org` for Node headers/runtime downloads. For browser tests, Playwright may
also need `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.
Keep the environment's supplied proxy configuration; do not copy the Mac's
loopback proxy settings or bypass the cloud network policy.

GitHub source/releases and npm access are required by workspace dependencies.
Allowing a host does not supply credentials. Configure test integration secrets
through the environment's secret/variable controls, never in Git or this file.
Do not import the Mac's `.od`, `.tmp`, auth files, databases, or browser profiles.

## Install script

Have the environment setup agent select Node 24 and install the system tools
listed above first. Run this from the repository root. Keep lifecycle scripts
enabled: the root postinstall builds the workspace tools and shared packages.

```sh
set -eu
node -e 'if (process.versions.node.split(".")[0] !== "24") throw new Error("Niki requires Node 24")'
corepack enable
test "$(corepack pnpm --version)" = "10.33.2"
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @open-design/daemon build
corepack pnpm --filter @open-design/daemon exec node -e 'const Database = require("better-sqlite3"); const db = new Database(":memory:"); db.prepare("select 1").get(); db.close()'
```

If Corepack cannot write its shims, have setup configure a writable toolchain bin
directory on PATH. Do not change the repository's package-manager version or
disable lifecycle scripts to hide installation errors.

For tasks requiring browser automation, install the repository-pinned browser:

```sh
corepack pnpm --filter @open-design/e2e exec playwright install --with-deps chromium
```

## Start skill

1. Read root `AGENTS.md` and the relevant directory guidance. Record the source
   branch, HEAD, and Git status. Use a task branch for implementation.
2. From the repository root, start only daemon and web with fresh development
   data. Each cloud task has an isolated workspace; use a different namespace,
   data directory, and ports if running multiple instances in one workspace.

   ```sh
   OD_DATA_DIR="$PWD/.tmp/cloud-dev-data" corepack pnpm tools-dev start web --namespace cloud-dev --daemon-port 17456 --web-port 17573
   corepack pnpm tools-dev status --namespace cloud-dev --json
   curl --fail --show-error http://127.0.0.1:17456/api/health
   curl --fail --show-error http://127.0.0.1:17573/api/health
   curl --fail --show-error --output /dev/null http://127.0.0.1:17573/
   ```

3. Open `http://127.0.0.1:17573/` in the environment's browser and verify the
   initial page loads. Keep the daemon private. If the platform preview requires
   different binding or forwarding, inspect that platform's supported preview
   mechanism before changing listeners or exposing a privileged API.
4. Inspect failures with `corepack pnpm tools-dev logs --namespace cloud-dev
   --json`. Do not connect the development instance to production data to make a
   smoke test pass. A page load does not validate AI generation or Feishu login.
5. Stop this instance when finished:

   ```sh
   corepack pnpm tools-dev stop --namespace cloud-dev
   corepack pnpm tools-dev status --namespace cloud-dev --json
   ```

## Validation and publication gate

Before publishing the reusable environment, verify dependency installation, the
SQLite query, daemon/web health, and a real browser page load on that cloud
machine. Also run:

```sh
corepack pnpm guard
corepack pnpm typecheck
```

For each implementation task, add the package tests/builds appropriate to the
change, for example web/daemon tests or the web build. Read `e2e/AGENTS.md` before
running or changing browser suites. Do not use root `pnpm test` or `pnpm build`.

Record platform, Node/pnpm versions, source commit, commands, results, and any
unavailable integration checks. Local macOS checks must be labelled as local;
they do not replace Linux cloud acceptance. Keep screenshots and validation
outputs in ignored task-local storage, outside the source commit.

The existing Mac checkout has unrelated generated JavaScript under `output/`
that can fail `guard`. A fresh Git checkout does not include those untracked
exports. Do not change guard policy or delete user artifacts to mask that issue.

Publish only after actual cloud checks pass. If setup is incomplete, retain a
draft and report the failing step. New tasks should use the published environment
and this source ref. Changes to the install/start configuration require testing
and republication; updating a task alone does not update the reusable setup.

## Production handoff

Cloud development does not move Niki hosting or enable standalone Codex remote
control. For a product change, finish the scoped commit and applicable checks,
then make the source branch available through the authorized GitHub workflow.
Provide the exact commit, changed behavior, tests, and remaining checks to the
Mac mini deployment step.

On the Mac mini, verify the current release and source ancestry, fetch the source
branch, and deploy a clean checkout through
`~/.local/share/niki-auth/deploy.zsh <source-worktree>`. Follow
[OPERATIONS.md](../deploy/OPERATIONS.md), including storage preflight, preserving
the rollback release, and worktree retirement checks. Do not overwrite a dirty
or diverged `main`, reset release history, or deploy a different preview target.

After deployment, verify the release SHA at the public Pages URL, loaded build
assets, and changed behavior in a freshly loaded browser. Report unavailable
authenticated/mobile checks explicitly. If the cloud task cannot access an
authorized host deployment channel, report **source ready; Mac mini deployment
pending**, with the exact commit. Never equate a push or cloud preview with a
production update. Documentation-only setup changes need no application rebuild.
