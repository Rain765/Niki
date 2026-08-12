# Codex 开发、远程连接、部署、发版与运维规范

> 适用范围：Niki / Open Design 仓库及当前 Mac mini 托管环境<br>
> 基线日期：2026-08-10<br>
> 性质：基于 Git 历史、仓库脚本、CI 工作流和主机现有运维脚本整理的项目规范

## 1. 目标

本规范把一次需求从 Codex 接手到线上持续运行的全过程收敛为一条可验证链路：

```text
需求与授权
  -> 识别用户实际运行目标
  -> 隔离开发与记录基线
  -> 实现、测试、人工验收
  -> 审核并提交任务自有变更
  -> 按明确授权推送或部署
  -> 验证实际用户入口
  -> 监控、备份、归档、回滚与复盘
```

核心原则只有一句：**提交、推送、构建、发布和用户可用是五种不同状态，任何一步成功都不能替代下一步的验证。**

## 2. 事实来源与可信边界

本规范的“现行做法”来自以下可审计来源：

- Git 提交、分支、reflog 和合并记录；
- 根目录及分层 `AGENTS.md`；
- `package.json`、`tools/dev`、`tools/pack` 和 `tools/serve`；
- `.github/workflows/release-*.yml` 及对应发布脚本；
- `deploy/`、`render.yaml`、Docker Compose 配置；
- 当前主机的 LaunchAgent、不可变发布、健康检查、备份和归档脚本；
- 当前运行进程、端口、Tailscale Funnel 和 HTTP 健康响应。

以下内容不能仅靠 Git 完整还原，必须在执行时重新核对：

- 历史 Codex 对话中未落盘的判断和口头授权；
- 第三方平台当前凭据、权限和控制台配置；
- 已删除且未提交的临时修改；
- DNS、证书、代理、Tailscale、Render、Vercel、R2 和 GitHub 的实时状态。

因此，每次执行仍需保留命令输出、构建结果、部署记录和验收证据，不能把本文当成实时状态证明。

## 3. 环境与交付目标分层

| 层级 | 典型入口 | 作用 | 成功标准 |
|---|---|---|---|
| 开发工作区 | Codex worktree、`codex/<task>` | 修改、测试、提交 | 任务提交独立有效 |
| 本地开发运行时 | `pnpm tools-dev` | 开发调试 | 指定 namespace、daemon、web/desktop 均正常 |
| Niki 托管运行时 | Mac mini LaunchAgent | 飞书/浏览器生产服务 | 活跃不可变 release 与预期 commit 一致 |
| 公网入口 | Tailscale Funnel | 把本机 web 端口映射到 HTTPS | 外部 URL 和实际构建资源可访问 |
| 设备中继 | Render 上的 `apps/relay` | 配对、在线状态、Ping/Pong | `/health` 正常且持久化状态可用 |
| Vercel | 分支 preview 或独立 web 目标 | Web 预览 | 预览 URL 对应指定 commit |
| Docker | localhost Compose + VPN/反代 | 自托管 | 容器健康、数据卷持久、入口受保护 |
| 桌面安装包 | beta/preview/nightly/stable | macOS、Windows、Linux 分发 | 产物、校验和、元数据、安装和更新链路通过 |

不得混淆以下结论：

- `git commit` 成功，不代表已推送；
- `git push` 成功，不代表已部署；
- Vercel preview 成功，不代表飞书 Niki 已更新；
- 本地健康，不代表公网入口健康；
- R2 已上传文件，不代表 latest 元数据、安装器和自动更新链路正确；
- 独立任务分支完成，不代表用户正在看的运行时已切换到该提交。

## 4. 权限与操作边界

### 4.1 默认允许

- 读取代码、文档、Git 历史、状态、日志和健康接口；
- 在任务范围内修改代码和测试；
- 运行项目规定的本地校验；
- 创建 `codex/<task-slug>` 分支或独立 worktree；
- 只暂存并提交任务产生的变更。

### 4.2 必须得到明确授权

- 推送远程分支；
- 部署、发布、提升生产环境或修改生产分支；
- 发送外部消息、创建 PR 或操作第三方平台状态；
- 删除数据、清理非任务文件、重写 Git 历史；
- 覆盖或迁移生产数据、密钥和认证配置。

代码修改请求本身不等于发布授权。用户明确要求“推送、上线、部署或发版”后，才执行对应交付闭环。

## 5. Codex 标准开发流程

### 5.1 接单与范围确认

1. 阅读根目录 `AGENTS.md`。
2. 进入 `apps/`、`packages/`、`tools/` 或 `e2e/` 前阅读该层 `AGENTS.md`。
3. 写清楚用户问题、预期行为、非目标、风险和验收方法。
4. 判断任务是否影响 UI、CLI、HTTP API、契约、数据库、i18n、发布或运维。
5. 对新增用户能力执行 UI/CLI 双轨检查：HTTP endpoint、共享 contract、UI 入口和 `od` 子命令应在同一变更中闭合；CLI 需要 `--json`，长提示需要 `--prompt-file <path|->`。

### 5.2 先识别实际运行目标

用户可见改动开始前，记录：

- 用户访问的是 URL、桌面 app 还是 Docker；
- 进程 namespace 和端口；
- 运行时对应的 source worktree、branch 和 `HEAD`；
- 当前公开入口、代理和认证路径；
- 是否存在另一套同名但不同 commit 的运行时。

推荐的只读检查：

```bash
git status --short --branch
git branch -avv
git rev-parse HEAD
pnpm tools-dev status --json
pnpm tools-dev logs --json
ps -axo pid,ppid,state,lstart,command
curl --noproxy '*' -i http://127.0.0.1:<daemon-port>/api/health
curl --noproxy '*' -I http://127.0.0.1:<web-port>/
```

如果当前工作区没有安装依赖，`pnpm tools-dev status` 可能不可用，此时应读取活跃 runtime 的 manifest、LaunchAgent 和进程参数，而不是猜测。

### 5.3 记录 Git 基线并隔离工作

在第一次编辑前记录：

```bash
git status --porcelain=v2 --branch
git rev-parse HEAD
git diff --stat
git diff --cached --stat
```

规则：

- 新任务使用 `codex/<task-slug>`；
- 脏 worktree 中的 substantial task 使用独立分支或 worktree；
- 不丢弃、不 reset、不 stash、不覆盖用户原有修改；
- 记录相关的基线失败，避免把历史失败误报为本次回归；
- 多个任务分支需要整合时优先 fast-forward；需要 merge、cherry-pick 或冲突处理时留下明确记录。

### 5.4 缺陷先写可证伪测试

Bug 默认流程：

1. 在能观察症状的最轻层级写 red spec；
2. 在基线确认测试确实失败；
3. 实现最小修复；
4. 确认同一测试转绿；
5. UI、竞态、平台行为等需要人眼确认时，提供真实入口进行人工验收；
6. 相邻问题另开任务，不顺手扩大修复范围。

测试优先级通常为：daemon HTTP/e2e Vitest -> app-local test -> Playwright UI -> 平台原生或安装器 harness。

### 5.5 实现边界

- `packages/contracts` 先定义跨 web/daemon 的 DTO、事件和错误形状；
- app 不得导入另一个 app 的私有 `src/` 或测试实现；
- app 业务逻辑不感知 sidecar 控制面；
- 测试放在包级 `tests/`，UI Playwright 放 `e2e/ui/`；
- 新入口、模块、脚本、测试和配置默认 TypeScript；
- i18n key 先加到类型，再补齐全部 locale；
- 本地生命周期只用 `pnpm tools-dev`，不增加 `pnpm dev/start` 别名；
- 端口只负责传输，namespace 决定数据、日志、runtime 和 cache 路径。

### 5.6 验证矩阵

常规最低门槛：

```bash
pnpm guard
pnpm typecheck
```

再按影响范围执行：

```bash
pnpm --filter @open-design/web test
pnpm --filter @open-design/web build
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/tools-dev build
pnpm --filter @open-design/tools-pack build
```

修改 package manifest、workspace、命令入口或 bin/link 后运行：

```bash
pnpm install
```

必须记录实际运行过的命令、通过/失败结果、跳过项和原因。

### 5.7 安全提交

1. 将每个 hunk 分类为 task-owned、pre-existing 或 overlap；
2. 仅按路径或 hunk 暂存任务变更，不在脏 worktree 使用 `git add .` 或 `git add -A`；
3. 执行：

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
git diff --cached --name-only
```

4. 检查无密钥、数据库、日志、构建产物、运行时数据和无关文件；
5. 使用 conventional commit；
6. 不添加 `Co-authored-by` 或其他共同作者元数据；
7. 提交后再次检查工作区，并报告 commit、路径、验证和剩余修改；
8. 未获授权不 push、不建 PR、不 amend、不 rebase、不 force-push。

## 6. 远程连接与网络安全规范

### 6.1 分离三类连接

1. **运维连接**：管理员进入 Mac mini。推荐走 Tailscale 私网 + SSH，不对公网开放 SSH。仓库不保存 SSH 凭据和主机私钥。
2. **用户连接**：浏览器/飞书访问 Niki。当前通过 Tailscale Funnel 把 HTTPS 入口转发到本机 web 端口。
3. **设备配对**：`apps/relay` 让浏览器和本地 daemon 通过出站 WebSocket 建立设备 presence。

设备 relay v1 只允许配对、在线状态和 Ping/Pong，**不能执行远程命令，也不传输 prompt、文件或生成物**。不得把它描述为远程控制通道。

### 6.2 端口与暴露原则

- daemon 和 web 只监听 `127.0.0.1`；
- 公网只暴露经过 TLS 和入口策略保护的 web；
- 不直接暴露 daemon API 到公网或共享 LAN；
- Docker Compose 默认也只绑定 `127.0.0.1`；
- 外部访问使用认证反向代理、SSH tunnel、VPN 或 Tailscale；
- `OD_ALLOWED_ORIGINS` 和 `OD_ALLOWED_DEV_ORIGINS` 只列实际入口；
- 新域名上线同时核对 OAuth redirect URI、CORS、cookie 和公开 URL。

### 6.3 出站网络与代理

当前托管运行时通过 `HTTP_PROXY`、`HTTPS_PROXY` 和 `ALL_PROXY` 访问外部媒体服务，并用 `NO_PROXY=localhost,127.0.0.1` 绕过本地流量。

规范要求：

- 代理地址放在服务环境，不写进业务代码；
- OpenAI 图片请求必须遵循标准代理变量；
- 为连接、header、body 和总请求设置有界超时；
- 健康检查同时观察 daemon 和代理，但应区分“核心服务不可用”和“媒体能力降级”；
- 代理不可用时告警，不能无限静默重试；
- 日志不得打印 API key、cookie、session token 或完整 OAuth payload。

### 6.4 密钥管理

- Feishu、管理员登录和第三方服务配置保存在仓库外；
- 配置文件权限应为 `600`，父目录限制为当前用户；
- 密码从文件或 stdin 读取，不作为 CLI 参数；
- relay token 只保存 SHA-256 hash；
- Git、备份和日志扫描必须覆盖密钥文件名和常见 token 模式；
- 密钥轮换后验证登录、回调、后台任务和回滚版本都能正常工作。

## 7. Niki 托管环境不可变部署流程

当前飞书/浏览器生产目标使用 Mac mini、LaunchAgent 和 Tailscale Funnel。标准命令为：

```bash
~/.local/share/niki-auth/deploy.zsh <clean-source-worktree>
```

### 7.1 发布前检查

1. 确认用户明确要求部署；
2. 核对目标 URL、当前 release commit、候选 commit 和 source worktree；
3. 候选 worktree 必须 clean；
4. 完成 `guard`、`typecheck` 和相关 tests/build；
5. 当前生产 commit 必须是候选 commit 的祖先；
6. 确认磁盘空间、Node/pnpm、代理和认证配置可用；
7. 确认没有另一部署持有 `/private/tmp/niki-deploy.lock`；
8. 记录发布人、需求、commit、验证和计划回滚点。

### 7.2 不可变构建与切换

部署脚本执行以下原子流程：

1. 解析候选 `git_sha`；
2. 在 `~/.local/share/niki-runtime/releases/<short-sha>` 创建 detached Git worktree；
3. `pnpm install --frozen-lockfile`；
4. 构建 daemon；
5. 用 server output 模式构建 web；
6. 检查 web `BUILD_ID`、daemon/web sidecar 和 `tools-dev`；
7. 写入 `.niki-release`，记录 `git_sha`、`web_build_id`、构建时间和来源 worktree；
8. 原子替换 `~/.local/share/niki-runtime/current` symlink；
9. `launchctl kickstart -k gui/<uid>/com.rain.niki-dev`；
10. 在最长约 30 秒内检查 daemon、web root 和 auth bootstrap；
11. 确认 `current` 实际解析到候选 release；
12. 保留当前 release 和一个 previous release，清理更老版本。

运行入口 `launch.zsh` 还会再次校验：

- `current` 必须指向专用 release store，禁止直接运行可变源码 worktree；
- manifest commit 必须等于 release 的 Git `HEAD`；
- manifest build ID 必须等于实际 web build ID；
- 必需构建产物和 `tools-dev` 必须存在；
- 生产使用固定 daemon/web 端口并通过 `tools-dev run web --prod` 启动。

### 7.3 失败与自动回滚

如果切换后健康验证失败，部署 trap 会：

1. 把 `current` 原子恢复到 previous release；
2. 重启 LaunchAgent；
3. 保留失败输出供排查；
4. 返回非零状态。

禁止通过手工覆盖 `current`、直接在 release 目录编辑代码或从比生产更旧/分叉的 commit 强制发布来绕过回滚保护。

### 7.4 发布后验收

发布命令成功后仍需完成：

```bash
launchctl print gui/$(id -u)/com.rain.niki-dev
readlink ~/.local/share/niki-runtime/current
sed -n '1,20p' ~/.local/share/niki-runtime/current/.niki-release
curl --noproxy '*' -i http://127.0.0.1:17456/api/health
curl --noproxy '*' -I http://127.0.0.1:17573/
tailscale serve status
curl --noproxy '*' -I https://niki.tail795f4a.ts.net
```

再执行一次真实浏览器刷新，确认：

- 登录与 OAuth 回调；
- 首页和关键静态资源加载；
- 生成、历史记录和文件下载等任务相关路径；
- 外部 URL 加载的 build asset 属于新 release；
- 日志中无持续重启、认证错误和代理错误。

交付说明必须写明：活跃 branch/commit、release build ID、验证 URL、重启/刷新动作和任何未完成项。

## 8. Vercel、Render 与 Docker 部署

### 8.1 Vercel

- 非默认分支通常只生成 preview；
- preview URL 是预览证据，不是飞书生产发布证据；
- 未获明确授权不得 merge、promote 或改变 production branch；
- 验收必须从 URL 反查 commit/build，而不能只看控制台“Ready”。

### 8.2 Render 设备 relay

`render.yaml` 当前定义新加坡区域的 `niki-device-relay`：

- Docker 构建 `apps/relay/Dockerfile`；
- `/health` 作为健康接口；
- 持久盘保存 relay state；
- production 必须限制浏览器 origin；
- public URL 使用 HTTPS，并转换为 WSS 连接地址。

relay 改动应至少验证 contracts build、relay build、relay tests、生产环境变量校验、WebSocket 配对、presence 和 Ping/Pong。

### 8.3 Docker 自托管

推荐流程：

```bash
cd deploy
OPEN_DESIGN_IMAGE=<registry/image@sha256:digest> docker compose pull
OPEN_DESIGN_IMAGE=<registry/image@sha256:digest> docker compose up -d --no-build
docker compose ps
docker compose logs --tail=200
curl -i http://127.0.0.1:7456/api/health
```

生产要求：

- 使用 digest 或不可变版本，不依赖可变 `latest`；
- 保留 `/app/.od` 数据卷；
- 容器使用只读根文件系统、`no-new-privileges`、内存和 PID 限制；
- localhost 绑定之外另设认证入口；
- 配置正确 allowed origins；
- 升级前备份 volume，升级后验证 schema、数据和回滚镜像。

## 9. 桌面安装包发版规范

### 9.1 渠道语义

| 渠道 | 用途 | 版本示例 | 发布身份 |
|---|---|---|---|
| beta | 日常研发验证，不是 stable 门禁 | `X.Y.Z-beta.N` | Open Design Beta |
| preview | 独立早期体验，按 stable 级严谨度 | `X.Y.Z-preview.N` | Open Design Preview |
| nightly | stable 的内部验证门禁 | `X.Y.Z.nightly.N` | release 测试身份 |
| stable | 正式交付 | `X.Y.Z` | Open Design |

stable 只依赖经过验证的 nightly，不依赖 preview。

### 9.2 分支、版本和身份

- preview 只能从 `preview/vX.Y.Z` 运行，分支版本必须等于 `apps/packaged/package.json`；
- nightly/stable 只能从 `release/vX.Y.Z` 运行；
- stable 必须输入一个精确的、已验证的同版本 nightly；
- stable tag 为 `open-design-vX.Y.Z`，已存在则禁止重复发布；
- mac、Windows、Linux 的 app 名称、namespace、安装路径、更新 feed 和注册表身份必须与渠道一致；
- Windows beta 的真实 namespace 是 `release-beta-win`，preview 是 `release-preview-win`；
- 公共产物使用 `--portable`，避免把构建机本地 runtime 路径写入安装包。

### 9.3 CI 发布流水线

标准阶段：

```text
metadata
  -> R2 access preflight
  -> verify（适用渠道）
  -> 各平台 build/sign/smoke
  -> 汇总平台报告和产物
  -> 发布版本目录
  -> 发布 latest 元数据
  -> 远端校验 URL、checksum 和 metadata
  -> stable 创建/完成 GitHub Release
  -> 生成发布摘要
```

要求：

- mac 签名与 notarization 凭据只进入 CI secret；
- Windows 安装器验证注册表身份和覆盖更新行为；
- 所有下载产物提供 SHA-256；
- latest 元数据只在全部必需平台成功后发布；
- stable 发布失败时按 workflow 逻辑清理不完整 GitHub Release/tag；
- R2 metadata 中记录 repository、branch、commit、workflow、版本、签名和平台产物；
- 更新器必须在展示安装动作前验证下载内容校验和。

### 9.4 自动更新高置信验收

使用 `tools-serve start updater` 进行快速、确定性测试；但涉及真实 feed、渠道身份、Windows registry、安装器打开或可见 updater UI 时，必须再跑公共 feed 的用户流程。

高置信验收至少覆盖：

- 旧版本安装后能发现同渠道新版本；
- 下载进度来自真实字节，不提前跳到 100%；
- 校验和正确；
- 打开的安装器属于正确渠道；
- 更新覆盖同一个 app/registry key，不产生第二个伪同名安装；
- 更新完成后的版本和 latest metadata 一致；
- 清理测试 namespace、安装残留和用户数据时只操作已解析的明确路径。

## 10. 日常运维规范

### 10.1 自动任务

当前主机的设计目标：

- 主服务：LaunchAgent `RunAtLoad`，异常退出自动拉起；
- 健康检查：每 60 秒执行一次完整探测，使用连续失败阈值和修复冷却，不因单次抖动立即重启；
- 监控看门狗：每 5 分钟验证状态心跳，超过 4 分钟未更新时告警并重新触发监控任务；
- 备份：每天 03:30；
- 归档：每天 04:30 扫描符合阈值的旧项目，实际是否移动由 archive 配置控制；
- public gateway：`RunAtLoad` + `KeepAlive`；
- `tools-dev` 日志按大小轮转并限制保留份数；
- 不可变 runtime 只保留当前和一个回滚版本。

### 10.2 监控、告警与自动处理

主机监控入口为 `/Users/rain/.local/share/niki-auth/monitor.zsh`，状态查询命令：

```bash
/Users/rain/.local/share/niki-auth/monitor.zsh status
/Users/rain/.local/share/niki-auth/monitor.zsh status --json
```

监控状态写入 `/Users/rain/.local/state/niki-monitor/status.json`，状态变更和自动处理记录写入 `/Users/rain/Library/Logs/Niki-monitor-events.jsonl`。LaunchAgent 日志为 `Niki-monitor*.log`，告警投递日志为 `Niki-alerts.log`。

| 监控项 | 判定 | 自动处理 | 保护措施 |
| --- | --- | --- | --- |
| daemon + web | 本地健康 JSON 和首页均成功 | 连续失败 2 次后重启 `com.rain.niki-dev` | 备份期间不重启；10 分钟冷却 |
| Tailscale | BackendState、Self.Online 和 Health 正常 | 仅在 Tailscale 应用未运行时重新打开 | 运行中异常不强杀进程 |
| Funnel | 443 HTTPS 映射到 `127.0.0.1:17573` | 连续失败 3 次后重建相同 Funnel 映射 | 10 分钟冷却；不改变目标端口 |
| 远程 SSH | Tailscale IPv4 的 22 端口可连接 | 只告警 | 不自动修改系统远程登录设置 |
| 公网网页 | 公共 DNS、TLS、首页和 `/api/health` 均成功 | 由 runtime/Tailscale/Funnel 根因处理 | 强制走公共 Funnel IP，避免本机 MagicDNS 假绿 |
| 媒体代理 | `127.0.0.1:7897` 可连接 | 只告警 | 不重启供其他应用共用的代理 |
| 磁盘 | 可用空间至少 10 GiB | 只告警 | 不自动删除数据或日志 |
| 备份 | 最新成功快照不超过 36 小时且目录存在 | 触发一次备份任务 | 6 小时冷却；已有备份运行时不重复触发 |

告警按组件保存活动状态，故障恢复时发送恢复事件；重复故障按冷却周期抑制。依赖故障会标记为 `blocked`，例如 Tailscale 故障时不再为 Funnel 和远程 SSH 分别制造重复告警。当前投递包括本机通知和结构化日志；飞书远程消息需要应用管理员授予 `im:message` 类权限后才能生效。

### 10.3 每日检查

- daemon/web/public URL 返回成功；
- LaunchAgent 无持续 restart loop；
- 媒体代理正常，或已明确处于降级状态；
- 磁盘剩余空间高于告警阈值；
- 前一晚备份存在成功标记且无 `.snapshot-*` 残留；
- 生成任务无长期 queued/running，启动后失败任务能被 reconcile；
- 登录失败率、配额、存储增长和外部 API 错误无异常。

### 10.4 每周检查

- 抽查最新 snapshot 的 manifest；
- 对备份 SQLite 执行 `PRAGMA quick_check` 和 `foreign_key_check`；
- 检查 Git bundle 可读取；
- 检查 Tailscale 设备、Funnel 和证书状态；
- 检查代理、Feishu OAuth、Render relay 和 R2/GitHub workflow；
- 检查日志轮转、release 清理和磁盘趋势；
- 清理已确认无用的孤立分支和 worktree前先确认没有未推送提交。

### 10.5 每月检查

- 在隔离目录完成一次恢复演练；
- 验证最近备份可恢复数据库、项目文件、LaunchAgent 和认证配置；
- 验证 previous release 一键回滚；
- 审计密钥、账号、Tailscale 设备、GitHub/Render/Vercel/R2 权限；
- 审计渠道 latest metadata、下载链接和校验和；
- 汇总可用性、发布失败、自动恢复、备份成功率、磁盘和成本。

## 11. 备份、归档与恢复

### 11.1 当前备份机制

备份脚本会：

1. 获取单实例锁并设置 backup sentinel；
2. 先检查备份盘可用空间；
3. 停止服务，避免 SQLite 和项目文件产生不一致快照；
4. 用 rsync 和上一 snapshot 的 hard-link 创建增量快照；
5. 保存 LaunchAgent、运维脚本和认证配置副本，权限设为 `600`；
6. 对备份数据库执行 SQLite quick check 和 foreign key check；
7. 创建包含所有 refs 的 Git bundle；
8. 写 manifest 后原子完成 snapshot；
9. 默认保留 7 份；
10. 无论成功失败都尝试恢复服务并释放锁。

### 11.2 归档机制

- 只处理数据库中超过阈值、没有外部 `baseDir`、且无 queued/running media task 的项目；
- 归档目标必须位于已挂载的 `/Volumes/...`；
- 使用临时目录复制并以 rsync dry-run 校验；
- 激活后可把本地项目目录替换为指向归档的 symlink；
- 任一步失败都应保留本地源并清理 stage；
- 归档不等于备份，归档盘仍需独立备份。

### 11.3 恢复演练

建议步骤：

1. 选择最新成功 snapshot，不直接覆盖生产目录；
2. 校验 manifest、文件权限、SQLite 和 Git bundle；
3. 恢复到临时 `OD_DATA_DIR`；
4. 使用隔离 namespace 和端口启动 daemon/web；
5. 验证用户、项目、消息、生成文件和配额；
6. 记录恢复时间目标 RTO 和恢复点目标 RPO；
7. 只有在演练通过并获授权后才能用于生产恢复。

## 12. 故障处理 Runbook

### 12.1 服务管理器显示 running，但健康接口失败

1. 用 `lsof` 确认 17456/17573 监听者；
2. 用 `curl --noproxy '*'` 排除 shell 代理干扰；
3. 检查 LaunchAgent、tools-dev、daemon 和 web 各自日志；
4. 检查是否处于 backup/archive sentinel；
5. 检查端口冲突、文件描述符、内存、磁盘和进程重启次数；
6. 如果当前 release 本身异常，切回 previous release；
7. 外部 URL 仍失败时再检查 Funnel、DNS 和证书。

### 12.2 媒体生成失败

1. 区分核心服务正常但媒体代理失败，还是 daemon 整体失败；
2. 检查 127.0.0.1 媒体代理监听；
3. 检查 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`；
4. 检查 provider 凭据、限额和超时；
5. 检查失败/中断 task 是否在重启后被 reconcile；
6. 不通过无限加长超时掩盖网络故障。

### 12.3 备份失败

1. 把“脚本被调度”与“快照成功完成”分开判断；
2. 检查 lock、sentinel、stage、磁盘和服务是否已恢复；
3. 遇到 `Too many open files` 时检查 launchd/shell 的文件描述符限制和 rsync 行为；
4. 修复后手工执行一次备份并确认 SQLite、Git bundle 和 manifest；
5. 完成一次从该快照启动的恢复演练；
6. 将失败接入主动通知，不能只留在本地 error log。

### 12.4 发布失败

- 构建前失败：不切换 current；
- 切换后健康失败：由 deploy trap 自动恢复 previous；
- 公网失败但本地成功：保持应用不动，排查 Funnel/入口；
- 新功能异常但健康接口正常：执行人工业务验收后决定回滚；
- stable 产物不完整：不得发布 latest metadata，不得标记正式 Release；
- 任何回滚都记录原因、commit、开始/结束时间和数据影响。

## 13. 交付记录模板

每次 Codex 开发或发布至少记录：

```text
任务：
授权范围：仅代码 / push / preview / production / packaged release
基线 branch + commit：
用户实际入口：
活跃 runtime namespace / release：
任务分支：
任务 commit：
变更路径：
测试与构建：
人工验收：
推送结果：
部署目标与 provider：
部署后 branch + commit + build ID：
本地健康：
公网健康：
回滚点：
数据/迁移影响：
未完成事项与风险：
执行人和时间：
```

## 14. 当前审计结论与整改优先级

2026-08-10 只读核对得到：

- 生产 runtime 使用不可变 release，活跃 release 为 `4ab03c95`，并保留 `79e25755` 作为 previous；
- LaunchAgent 正在运行，daemon `17456`、web `17573` 均监听 localhost；
- daemon `/api/health`、本地 web 和公开 Funnel URL 均返回 HTTP 200；
- Tailscale Funnel 当前把 `https://niki.tail795f4a.ts.net` 转发到 `127.0.0.1:17573`；
- 当前 Codex 调研工作区起点为 `85b1999`，与活跃生产 release 不同，证明“当前工作区即生产”是危险假设；
- 健康日志中存在媒体代理不可用告警和历史自动恢复记录；
- 备份 error log 中存在 rsync `Too many open files`，需要确认后续成功备份与恢复能力；
- Git 中存在大量任务分支、cherry-pick、fast-forward 和少量 merge，说明隔离开发有效，但分支收敛、远端同步和发布记录仍需加强；
- 当前本地 `main` 与 `origin/main` 曾呈现双向偏离，任何集成或部署前必须重新 fetch 并做 ancestry 检查。

整改优先级：

1. **P0：备份成功审计与恢复演练。** 修复/确认文件描述符问题，增加成功/失败主动通知。
2. **P0：生产告警闭环。** 将健康重启、代理降级、磁盘不足和持续 task 失败发送到外部告警渠道。
3. **P1：发布台账。** 自动记录 source commit、release build ID、外部 URL 验证和回滚点。
4. **P1：分支收敛。** 规定任务分支生命周期、远端同步、集成分支和删除前检查。
5. **P1：公网业务探针。** 除 HTTP 200 外增加登录 bootstrap、关键静态资源和最小业务路径。
6. **P2：灾备。** 增加异机/异盘备份和定期 restore drill，明确 RPO/RTO。
7. **P2：统一可观测性。** 汇总 daemon、web、proxy、relay、release 和 backup 指标与日志。

### 14.1 2026-08-10 整改结果

- 已把备份 LaunchAgent 的文件描述符软上限提高到 `8192`，备份脚本同时设置相同上限；手工触发后的任务退出码为 `0`。
- 已生成快照 `snapshot-20260810T105953Z`；SQLite `quick_check` 为 `ok`，Git bundle 验证为完整。
- 已用独立目录、独立数据副本、独立 namespace 和端口完成恢复演练；daemon、web、项目列表接口均通过，演练结束后临时服务和数据已清理。
- 已增加统一告警脚本，并将 backup、healthcheck、archive、deploy 的失败与恢复事件接入；告警具备状态去重、一小时冷却、本机通知和结构化日志。
- 已把 daemon、web、磁盘、公网入口和本地媒体代理端口纳入健康检查。代理的 Google、OpenAI 和飞书出口已分别验证可达，未重启共享代理进程。
- 飞书机器人主动消息仍缺少 `im:message` 类应用权限；权限扩大与版本发布属于外部权限变更，在管理员确认前不自动提交。当前告警仍可通过本机通知与日志留痕。
- 已建立 `release-history.jsonl` 和 `operations-history.jsonl`，记录当前生产 commit/build、回滚点、备份与恢复演练；后续成功部署由 deploy 脚本自动追加发布记录。
- 已确认本地 `main` 相对 `origin/main` 为 ahead 4、behind 1，且活跃生产 commit 属于另一任务线。为避免非快进合并影响项目，本次不重写、合并或删除任何分支，后续集成必须先单独处理分歧。
- 所有被替换的主机脚本和 LaunchAgent 配置均保留带时间戳的回滚副本；整改未执行数据库迁移、未切换生产 release。期间健康守护曾恢复同一 release 的 daemon/web 进程，版本与数据目录均未变化。

当前剩余项只有两类：需要管理员批准的飞书消息权限，以及需要单独评审的 Git 分支收敛。它们都不应在无确认的情况下自动处理。

### 14.2 2026-08-12 监控系统上线记录

- 已安装主监控 `monitor.zsh`、兼容入口 `healthcheck.zsh` 和独立看门狗 `monitor-watchdog.zsh`；对应 LaunchAgent 分别每 60 秒和每 300 秒运行。
- 已验证 runtime、Tailscale、Funnel、Tailscale SSH、公网 DNS/TLS/首页/API、媒体代理、磁盘和备份八类探针全部为 `healthy`。
- 已在隔离状态目录完成故障注入：连续失败阈值、单次告警、修复冷却、依赖阻塞、恢复清零和监控心跳告警均通过。
- 安装时活跃生产 release 为 `ce1bb439`；监控从 `current` symlink 动态读取 release，未切换版本、未修改数据库，也未重启生产 runtime。
- 原 `healthcheck.zsh` 和 `com.rain.niki-health.plist` 保留 `.pre-monitor-20260812T065618Z` 回滚副本；增强公网 API 探针前的脚本也保留独立回滚副本。
- 当前远程告警的唯一未闭环项仍是飞书应用消息权限。权限未开通不影响探测、自愈、本机通知、状态 JSON 和审计日志，但会影响离开主机后的即时收件。

## 15. 完成定义

一次任务只有同时满足适用项，才能被称为“完成”：

- 需求和授权边界明确；
- 实际运行目标已识别；
- 代码、测试、契约、UI/CLI 和 i18n 闭合；
- 规定校验通过且结果有记录；
- 仅任务自有变更被提交；
- 推送/部署/发布均有明确授权；
- 用户实际入口解析到目标 commit/build；
- 本地和公网健康、关键业务路径通过；
- 回滚点和数据影响明确；
- 备份、监控和未完成风险已交接。

只完成其中前半段时，应准确表述为“开发完成”“已提交”“已推送”或“已生成预览”，不能笼统声称“已上线”。
