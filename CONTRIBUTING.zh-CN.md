# 为 Niki 贡献

感谢你帮助改进 Niki。本仓库当前聚焦于稳定的贷款海报工作流：选择支持的产品、输入活动文案、生成图片，并在电脑或手机上按批次审核结果。

<p align="center"><a href="CONTRIBUTING.md">English</a> · <b>简体中文</b></p>

## 开始之前

- 提交问题前先搜索[现有 Issues](https://github.com/Rain765/Niki/issues)。
- 开始大型功能或产品方向调整前，先开 Issue 讨论。
- 每个 Pull Request 只处理一个明确问题。
- 不要提交账号凭据、服务密钥、会话令牌、客户数据或本地运行数据。

## 贡献范围

| 范围 | 示例 | 主要目录 |
|---|---|---|
| 海报流程 | 产品选择、文案输入、比例和张数控制、进度反馈 | `apps/web/src/components/` |
| 海报结果 | 产品参考素材、版式约束、批次状态和结果处理 | `apps/web/`、`apps/daemon/` |
| 移动端体验 | 响应式控件、加载状态、图片审核与下载 | `apps/web/` |
| 账号与额度 | 登录、账号管理、项目隔离、存储和生成额度 | `apps/web/src/auth/`、`apps/daemon/` |
| 运行稳定性 | 数据持久化、任务恢复、媒体传输和运维工具 | `apps/daemon/`、`tools/` |
| 文档 | 安装说明、用户可见行为和故障排查 | `README*.md`、`docs/` |

贷款海报工作流之外的改动，请先通过 Issue 达成一致。

## 本地环境

### 环境要求

- Node.js `~24`
- 通过 Corepack 使用 pnpm `10.33.2`
- macOS、Linux、WSL2 或 Windows

### 安装与启动

```bash
git clone https://github.com/Rain765/Niki.git
cd Niki
corepack enable
pnpm install
pnpm tools-dev start web
```

需要同时启动 daemon、网页和 Electron 桌面端时，使用 `pnpm tools-dev`。支持的生命周期命令为：

```bash
pnpm tools-dev status
pnpm tools-dev logs
pnpm tools-dev stop
pnpm tools-dev check
```

不要新增其他根目录开发或启动命令。

## 仓库边界

- `apps/web` 负责海报界面、项目时间线、结果画廊和账号管理界面。
- `apps/daemon` 负责 HTTP API、媒体任务、持久化、登录、额度和 CLI。
- `apps/desktop` 负责 Electron 桌面端外壳。
- `packages/contracts` 负责共享 API DTO 与事件契约。
- `tools/dev` 负责受支持的本地生命周期。

修改某个目录前，请先阅读离它最近的 `AGENTS.md`。共享 API 结构必须先在 `packages/contracts` 更新，再同步修改网页和 daemon，避免两端协议分叉。

## 开发规则

- 新增的项目源码、测试、脚本和入口默认使用 TypeScript。
- 应用测试放在包级 `tests/` 目录，不要在 `src/` 下新增测试文件。
- JavaScript 和 TypeScript 默认使用单引号，除非转义会明显影响可读性。
- 代码注释使用英文，只说明不容易从代码本身看出的意图或约束。
- 新增根目录依赖时，必须在 Pull Request 中说明用途及 bundle 或运行成本。
- 不要提交 `.od/`、`.tmp/`、日志、数据库、包含隐私信息的截图或临时生成文件。

## 验证

每个 Pull Request 都必须执行与改动范围匹配的检查。首先运行：

```bash
pnpm guard
pnpm typecheck
```

然后执行对应包的检查，例如：

```bash
pnpm --dir apps/web test
pnpm --dir apps/web build
pnpm --dir apps/daemon test
pnpm --dir apps/daemon build
```

仅修改文档时，也要检查链接、命令、Markdown 展示以及中英文一致性。

修复 Bug 时，优先添加一个修改源码前会失败、修改后会通过的回归测试。用户可见的界面改动还需要截图或简短的人工验证记录。

## Commit 与 Pull Request

- 标题使用动词开头并带范围，例如 `fix(web): preserve poster batches after reload`。
- 一个 Pull Request 只处理一个问题。
- 说明为什么需要修改，以及用户会看到什么变化。
- 完整填写 `.github/pull_request_template.md` 中所有适用部分。
- 有关联 Issue 时必须链接。
- 写明实际执行的验证命令和结果。
- 可见界面改动需要提供入口截图。
- 除非维护者要求，不要对共享分支强制推送。
- Commit 中不要添加共同作者元数据。

## 报告问题

提交 [GitHub Issue](https://github.com/Rain765/Niki/issues/new) 时，请提供：

- 浏览器、操作系统，以及使用的是手机还是电脑。
- 选择的产品、画面比例和海报张数。
- 触发问题的步骤以及预期结果。
- 问题发生在开始生成前、生成过程中，还是查看结果时。
- 已移除密钥和客户数据的 daemon 日志末尾内容。
- 可见问题的截图或录屏。

不要在 Issue 中粘贴服务密钥、密码、Cookie、会话令牌或未脱敏的客户文案。

## 产品与安全边界

Pull Request 不应：

- 在海报模板中增加未经确认的金融承诺、审批保证、利率或费用。
- 绕过不同产品的文案和参考素材规则。
- 削弱账号隔离、额度、密码处理或会话过期机制。
- 未经产品确认增加贷款海报之外的产品流程。
- 未经讨论替换当前网页、daemon 或持久化架构。
- 打包许可证不兼容或缺少归属说明的第三方素材。

## 许可证

提交贡献即代表你同意按本仓库的 [Apache License 2.0](LICENSE) 授权你的改动。包含独立许可证或归属说明的文件继续遵循其原有声明。
