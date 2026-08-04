# Niki

**面向真实移动端工作流的一键 AI 贷款海报生成平台。**

Niki 是一个带登录和用户隔离的创意工作区，用于生成、查看和管理贷款营销海报。选择产品、画面比例和张数，输入活动文案后即可直接开始出图，无需编写提示词，也不需要操作智能体对话。

本仓库当前对应 Niki 产品。底层仍基于 Open Design 运行时，但主要产品体验已经调整为下文所述的 Niki 海报工作流。

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <b>简体中文</b> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

<p align="center">
  <a href="https://github.com/Rain765/Niki/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Rain765/Niki?style=flat-square" /></a>
  <a href="https://github.com/Rain765/Niki/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/Rain765/Niki?style=flat-square" /></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
</p>

## Niki 能做什么

- **一键生成海报**：选择 BiuMoney 或 Zamloan，再选择画面比例和海报张数，输入文案即可开始生成。
- **产品专属创意规则**：不同产品使用各自的参考素材、版式约束和精简文案规则。
- **生成批次时间线**：每次请求单独显示为一个批次；旧结果保留在上方，新批次与加载状态追加在下方，刷新后仍能恢复排队、完成、失败或中断状态。
- **移动端优先查看**：输入区、加载状态、图片传输和结果网格同时适配手机与桌面浏览器。
- **带登录的用户工作区**：线上部署可使用飞书 OAuth，并支持管理员创建的密码账号。
- **用户隔离与额度管理**：项目按账号隔离，可分别设置存储空间和每日生成次数。
- **持久化本地运行时**：项目、消息、任务状态和生成文件都会落盘，之后可以继续查看和编辑。

## 使用流程

1. 登录 Niki。
2. 选择 **BiuMoney** 或 **Zamloan**、画面比例和海报张数。
3. 输入活动文案并开始生成。
4. 在项目时间线中查看每个生成批次；继续生成时不会覆盖之前的结果。

## 快速开始

### 环境要求

- Node.js `24.x`
- 通过 Corepack 使用 pnpm `10.33.2`
- macOS、Linux、WSL2 或 Windows
- 已在 Niki 设置中配置图片生成服务

### 启动网页工作区

    corepack enable
    pnpm install
    pnpm tools-dev start web

打开 `tools-dev` 输出的网页地址。

如果需要同时启动 daemon、网页和 Electron 桌面端：

    pnpm tools-dev

可以使用 `pnpm tools-dev status`、`pnpm tools-dev logs` 和 `pnpm tools-dev stop` 查看或停止托管运行时。

## 登录与账号管理

仅本机开发时默认不启用登录。私有部署无需飞书即可启用独立账号密码登录：

    NIKI_AUTH_MODE=password
    NIKI_PUBLIC_URL=https://your-niki-domain.example

daemon 启动后，需要从同一台机器执行一次首个管理员初始化。Docker Compose 部署可运行：

    printf '%s\n' 'choose-a-strong-password' | \
      docker compose exec -T open-design node apps/daemon/dist/cli.js \
      auth bootstrap-admin --username owner --name Owner --password-file -

初始化接口只接受 daemon 本机请求，并会在首个用户创建后永久关闭。密码长度必须为 10–128 个字符。若需同时提供密码和飞书登录，可使用 `NIKI_AUTH_MODE=hybrid`；原有飞书模式仍可按以下方式配置：

    NIKI_AUTH_MODE=feishu
    FEISHU_APP_ID=your_app_id
    FEISHU_APP_SECRET=your_app_secret
    NIKI_PUBLIC_URL=https://your-niki-domain.example

启用登录后，管理员可以在 Niki 账号管理界面或通过 `od auth` CLI 管理密码账号与用户额度：

    od auth status
    od auth login --username <id> --password-file <path|->
    od auth change-password --current-password-file <path|-> --password-file <path|->
    od auth users list
    od auth users create --username <id> --name <display-name> --password-file <path|->
    od auth users set-quota --user <user-id> --storage-gb <number> --daily-generations <number>

`od auth login` 会输出新的 `OD_NIKI_SESSION_TOKEN` 导出命令；管理员 CLI 操作需要在该环境变量中提供管理员会话。密码只从文件或标准输入读取，不会作为命令行参数直接传入。

## 远程设备配对

Niki 提供安全设备中继基础能力，用于将本地 daemon 与线上服务配对：

    od device pair --relay-url <url> --name <device-name>
    od device status
    od device disconnect

当前设备桥接功能仅包含配对、在线状态和 Ping/Pong 健康检查，暂不执行远程命令。

## 数据与安全

- 运行数据默认保存在 `.od/`。
- 可以通过 `OD_DATA_DIR` 迁移全部 daemon 运行数据。
- 登录用户拥有相互隔离的项目目录。
- 会话令牌以哈希形式保存并设置有效期。
- 密码登录包含失败记录和频率限制。
- daemon 会强制执行每位用户的存储与每日生成额度。

不要提交 `.od/`、`.tmp/` 中的本地运行数据、日志、数据库和临时生成文件。

## 仓库结构

| 路径 | 职责 |
|---|---|
| `apps/web` | Niki 网页工作区、海报输入区、登录界面和项目时间线 |
| `apps/daemon` | HTTP API、持久化、登录、额度、媒体任务和 `od` CLI |
| `apps/desktop` | Electron 桌面端外壳 |
| `apps/relay` | 安全设备配对中继 |
| `packages/contracts` | 共享 API 与事件契约 |
| `tools/dev` | 受支持的本地生命周期控制面 |

## 开发与验证

提交改动前，请按涉及的包执行对应检查：

    pnpm guard
    pnpm typecheck
    pnpm --filter @open-design/web test
    pnpm --filter @open-design/daemon test

本地生命周期统一使用 `pnpm tools-dev`。仓库边界和贡献要求请参阅 [AGENTS.md](AGENTS.md) 与 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。

## 上游项目与许可证

Niki 基于 [Open Design](https://github.com/nexu-io/open-design) 开发，并保留其智能体运行时、项目工作区和可扩展设计基础。当前 Niki 产品层新增并重点维护贷款海报工作流、账号管理、用户额度、移动端适配、生成批次持久化和安全设备配对。

本项目使用 [Apache License 2.0](LICENSE)。
