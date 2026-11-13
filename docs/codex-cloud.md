# Niki Codex Cloud development

This setup prepares a Linux workspace for development and validation. Production
application processes and data remain on the Mac mini. The public Feishu entry is
`https://niki-work-app.pages.dev/`; Cloudflare forwards to that host as documented
in [the ingress runbook](../deploy/cloudflare/README.md).

## Repository and environment

- Repository: `https://github.com/Rain765/Niki.git`.
- Source ref for new tasks: the latest GitHub `main`. Fetch before recording the
  baseline, then create a task branch. `codex/cloud-development` is a historical
  branch with separate product changes; do not overwrite `main` with its tree.
  This documentation integration preserves the cloud features already on `main`.
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
For public production checks, add `niki-work-app.pages.dev` to the additional
allowed domains. The former `niki.tail795f4a.ts.net` entry is historical and is
not required for the current public website. Keeping package-manager domains
enabled is appropriate; unrestricted Internet access is not required just for
this check.

Keep the environment's supplied proxy configuration; do not copy the Mac's
loopback proxy settings or bypass the cloud network policy.

GitHub source/releases and npm access are required by workspace dependencies.
Allowing a host does not supply credentials. Configure test integration secrets
through the environment's secret/variable controls, never in Git or this file.
Do not import the Mac's `.od`, `.tmp`, auth files, databases, or browser profiles.

The normal delivery path is **Codex Cloud → GitHub → Codex on the Mac mini →
the existing local release script → the public Pages URL**. Routine application
changes do not require a Cloudflare API token or cloud VPN. Public HTTP access
can verify a release but cannot install code or restart the Mac application.
Direct cloud-to-host deployment would require a separately configured and
authorized channel; do not invent SSH access from a working website URL.

The supported unattended channel is the repository's dedicated Mac self-hosted
runner described in [`deploy/AUTO_DEPLOY.md`](../deploy/AUTO_DEPLOY.md). It runs
the same existing release script only after CI succeeds and release ancestry is
verified. Until that runner is online, production history is reconciled, and the
repository enable variable is set, continue to report Mac deployment as pending.

Repository commits cannot change a saved Codex environment. In its settings,
select the current source ref where available, update the additional domain,
test, save and publish the configuration, then start a new task. Report draft
changes separately from published settings. If no environment-management tool
is available, give the user these exact remaining steps rather than claiming
the settings were updated.

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

3. If browser access is available, open `http://127.0.0.1:17573/` and verify the
   initial page loads. Otherwise record browser acceptance as unavailable; HTTP
   checks alone do not constitute UI acceptance. Keep the daemon private. If the
   platform preview requires
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
SQLite query and daemon/web health on that cloud machine. Verify a real browser
page load when browser access is available; otherwise report this limitation
and do not claim UI verification. Also run:

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

Untracked generated JavaScript under `output/` can fail `guard` in a local
checkout. A fresh Git checkout does not include those untracked exports. Do not
change guard policy or delete user artifacts to mask that issue.

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

On the Mac mini, verify the current release and source ancestry and fetch the
source branch. During this documentation integration, GitHub `main` at
`1f774aef2f322d2a556e7809b340ce0db85a9e82` did not contain the active Mac release
`54bd4c0cb5d2e03ab990ad523e81d97253b90a9a` as an ancestor. This is a recorded
snapshot, not a permanent version pin. Recheck the live release and compare
product differences before deployment; integrating these documents alone does
not reconcile those product histories. Do not replace newer host features with
an older source tree. Once the intended product tree has been reconciled and
validated, deploy a clean checkout through
`~/.local/share/niki-auth/deploy.zsh <source-worktree>`. Follow
[OPERATIONS.md](../deploy/OPERATIONS.md), including storage preflight, preserving
the rollback release, and worktree retirement checks. Do not overwrite a dirty
or diverged `main`, reset release history, or deploy a different preview target.
When the [production auto-deploy workflow](../deploy/AUTO_DEPLOY.md) is enabled,
it performs this handoff on the dedicated Mac runner and intentionally refuses a
target whose history does not contain the current production release.

After deployment, verify the release SHA at the public Pages URL, loaded build
assets, and changed behavior in a freshly loaded browser. Report unavailable
authenticated/mobile checks explicitly. If the cloud task cannot access an
authorized host deployment channel, report **source ready; Mac mini deployment
pending**, with the exact commit. Never equate a push or cloud preview with a
production update. Documentation-only setup changes need no application rebuild.

## Mac mini handoff prompt

Fill in the exact delivered commit and checks before passing this to the local
Codex task. A documentation-only change needs no production deployment.

```text
在 Niki 的 Mac mini 上接手云端产品变更，按仓库 AGENTS.md 和部署文档完成交付。
仓库：Rain765/Niki
来源分支：<实际推送的分支>
目标提交：<完整 SHA>
业务变更：<本次功能或修复>
云端验证：<命令、平台、结果及未验证项>

先读取规则、记录 Git 状态，核对 current 发布及公网 /api/version，fetch 来源。
检查目标提交与当前生产版本的祖先关系和业务差异，保留云端与生产已有功能。
不要 reset、强推、覆盖脏工作区，或直接用缺少生产功能的旧代码树部署。
有分叉时先明确列出需要整合的产品差异；无法安全确认时报告具体阻塞。
在干净且经过验证的交付工作树中，按 OPERATIONS.md 进行存储预检，保留回滚版，
使用 ~/.local/share/niki-auth/deploy.zsh <source-worktree> 发布。
核验 https://niki-work-app.pages.dev/api/version 的发布 SHA、实际加载的构建资源
及新加载浏览器中的变更行为；飞书登录或移动端无法检查时明确说明。
不要将 Vercel 预览或 GitHub 推送当成飞书上线，不迁移托管，不更改 Cloudflare
凭据、隧道或 Codex remote provider。最终报告部署 SHA、验证结果及剩余阻塞。
```

## Context shared between local and cloud tasks

Use the committed root `AGENTS.md` for durable rules and this document plus the
Cloudflare runbook for environment and delivery context. Each new task must read
these files from its actual checkout. Chat messages, local global rules, installed
skills, credentials and runtime files should not be assumed to exist in another
task. Record decisions and handoff evidence in source documentation without
secrets; report observed state separately from previous acceptance records.
