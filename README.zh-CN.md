# Niki

**一键生成可直接审核的贷款营销海报。**

Niki 是面向贷款营销团队的专用海报工作区。选择产品、画面比例和生成张数，输入活动文案后即可开始出图。每次结果按批次保留，方便在电脑或手机上持续查看和审核。

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

<p align="center">
  <a href="https://github.com/Rain765/Niki/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Rain765/Niki?style=flat-square" /></a>
  <a href="https://github.com/Rain765/Niki/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/Rain765/Niki?style=flat-square" /></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
</p>

## 目前可以做什么

- **一键生成海报**：输入活动文案即可开始出图，不需要编写提示词。
- **选择产品样式**：支持 Zamloan 和 BiuMoney，并使用对应的参考素材与版式规则。
- **控制每次生成**：可选择 `1:1` 或 `16:9`，每批生成 1–10 张海报。
- **保留全部结果**：新批次不会覆盖旧图片，刷新后仍能看到生成中断或失败的状态。
- **手机和电脑均可审核**：输入区、进度状态和结果画廊同时适配移动端与桌面端。
- **隔离用户数据**：线上部署可以按账号隔离项目，并分别设置存储空间和每日生成次数。

## 使用流程

1. 登录 Niki。
2. 选择 **Zamloan** 或 **BiuMoney**。
3. 选择画面比例和海报张数。
4. 输入活动文案并开始生成。
5. 在项目时间线中查看图片，或继续创建下一批海报。

## 本地开发

### 环境要求

- Node.js `24.x`
- 通过 Corepack 使用 pnpm `10.33.2`
- macOS、Linux、WSL2 或 Windows
- 已在 Niki 设置中配置图片生成服务

### 启动 Niki

```bash
git clone https://github.com/Rain765/Niki.git
cd Niki
corepack enable
pnpm install
pnpm tools-dev start web
```

打开 `tools-dev` 输出的网页地址。

如果需要同时启动 daemon、网页和 Electron 桌面端：

```bash
pnpm tools-dev
```

可以使用 `pnpm tools-dev status`、`pnpm tools-dev logs` 和 `pnpm tools-dev stop` 查看或停止托管运行时。

## 登录与额度

仅本机开发时默认不启用登录。线上部署可以通过以下环境变量启用飞书登录：

```env
NIKI_AUTH_MODE=feishu
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
NIKI_PUBLIC_URL=https://your-niki-domain.example
```

管理员可以在账号管理界面创建密码账号、停用账号、重置密码，并设置每位用户的存储空间和每日生成次数。

## 数据与安全

- 运行数据默认保存在 `.od/`。
- 可以通过 `OD_DATA_DIR` 迁移全部 daemon 运行数据。
- 登录用户拥有相互隔离的项目目录。
- 会话令牌以哈希形式保存并设置有效期。
- 密码登录包含失败记录和频率限制。
- daemon 会强制执行每位用户的存储与生成额度。

不要提交 `.od/`、`.tmp/` 中的本地数据、日志、数据库和临时生成文件。

## 仓库结构

| 路径 | 职责 |
|---|---|
| `apps/web` | 海报输入区、项目时间线、结果画廊和账号界面 |
| `apps/daemon` | HTTP API、持久化、登录、额度和媒体任务 |
| `apps/desktop` | Electron 桌面端外壳 |
| `packages/contracts` | 共享 API 与事件契约 |
| `tools/dev` | 本地生命周期管理命令 |

## 参与贡献

提交改动前，请阅读 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)，并按改动范围执行对应检查。仓库的标准检查为：

```bash
pnpm guard
pnpm typecheck
```

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
