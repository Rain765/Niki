# PPT 评测集 v1.0.0

本评测集用于暴露文档转 PPT 的内容与编排问题，并让每次核对可追溯。**不是已经验证通过的成品集，也不是已校准的自动美学评分器。** 本版有 8 份合成文档、219 条原文锚定检查（160 条文字候选检查、59 条人工检查），6 份开发文档、2 份保留文档。

## 覆盖与边界

| 案例 | 集合 | 重点 | 主配置 |
| --- | --- | --- | --- |
| 01-long-report | 开发 | 11,256 字符、32 组事实与业务细则、末章、例外与未决事项 | 自动 / 16:9 / 绿 |
| 02-dense-table | 开发 | 42 行 × 6 列、状态与数字对应、续表 | 15 页 / 4:3 / 蓝 |
| 03-wide-table | 保留 | 8 行 × 12 列、总览与拆表、特殊值 | 10 页 / 16:10 / 紫 |
| 04-concept-training | 开发 | 12 概念的定义、正反例、练习与解析 | 20 页 / 16:9 / 绿 |
| 05-procedure-training | 开发 | 18 操作步骤、硬前置条件、回退与沙盘演练 | 20 页 / 16:9 / 蓝 |
| 06-architecture | 开发 | 12 节点、14 有向边、同步异步、信任边界 | 10 页 / 16:9 / 紫 |
| 07-branch-flow | 保留 | 12 条连接、角色泳道、补件循环、金额等号边界 | 5 页 / 4:3 / 橙 |
| 08-mixed-capacity | 开发 | 长标题、中英文标识符、单位、页数冲突、不可信文档指令 | 5 页 / 16:10 / 橙 |

表中配置只覆盖代表组合，不能称为全部颜色 × 比例 × 页数覆盖。原文使用 Markdown；PDF 扫描/OCR、Word 复杂结构、公式、图片与原生图表导入、跨办公软件渲染、超大文档尚未验证。完整未覆盖清单在 `manifest.json`。

这些材料全部为合成，不冒充真实业务分布或公共基准数据。长报告有意加入程序性段落以测试容量；其信息分布不代表所有真实长文档。真实用户案例作为额外私有回归材料放在仓库忽略的 `.tmp/`，不得提交业务原文、输出、内部链接或凭据。

没有真实请求分布，因此没有“覆盖大部分情况”的百分比承诺。今后按文档类型、长度、结构和失败原因统计真实样本频次，报告各层样本数、失败率和未覆盖比例；不能用 8 个类别均存在来推导用户流量覆盖率。

## 可运行入口

从 `e2e/` 执行。工具不读取 API 密钥、不调用模型、不写生产数据。

```bash
pnpm exec tsx scripts/presentation-eval.ts validate
pnpm exec tsx scripts/presentation-eval.ts catalog --out ../.tmp/ppt-evaluation
pnpm exec tsx scripts/presentation-eval.ts input --case 01-long-report --out ../.tmp/ppt-input
pnpm exec tsx scripts/presentation-eval.ts evaluate --case 01-long-report --pptx /absolute/deck.pptx --run /absolute/run.json --images /absolute/rendered-pages --out ../.tmp/ppt-run-001
```

生成入口只导出 `source.md` 和 `request.json`（简报与生成设置），不导出检查项与答案。保留集默认拒绝导出和评测，最终版本冻结后显式增加 `--allow-reserved`。保留文件在仓库中可见，**不是防泄漏的隐藏基准**；开发者必须执行“不用保留集调参”的流程约束。反复针对保留结果修复后，应换一批全新文档作为验收集。

`request.json.options` 使用 `@open-design/contracts` 的 `PresentationOptions`：`palette`、`ratio`、`pageCount`、`style`、`density`、`prompt`。可以作为 `POST /api/presentations` 的 multipart `options` 字段，原文作为 `file`；不需要猜测 API 字段。本版均明确使用 `density: complete` 和 `style: swiss`；不同布局风格比较须另记运行配置。文件级规则测试不等同于此 HTTP 生成链路已实跑。

私有案例用 `--case-dir /absolute/private-case`，目录内为同结构的 `source.md` 与 `case.json`。原文更改会触发 SHA-256 校验失败，必须版本化修改答案并重新核对；不得为了让当前输出通过而放宽答案。

`run.json` 必须包含以下字段。未知项填写 `null`，不要填猜测值：

```json
{
  "engine": "current-product",
  "model": null,
  "codeCommit": null,
  "promptVersion": null,
  "templateVersion": null,
  "generationTime": null,
  "usage": null,
  "renderProvenance": null
}
```

建议补充运行 ID、设置、重试次数、总耗时、token 输入/输出/缓存/推理及费用口径、模型响应 ID、参考流程版本。同一案例重复运行须用不同输出目录，保留每次失败，不挑最好的一次替代全部结果。渲染图片必须连续命名 `page-01.png` 等，数量等于实际页数；工具保存文件哈希，但图片是否确实由该 PPTX 渲染仍需核对。

## 自动检查究竟证明什么

- 从最终 PPTX 的关系表按放映顺序读取原生文字；忽略备注、隐藏页和明显越界对象。原生表格可以按行读取。缺少必要的包结构则直接报错，不退回草稿 JSON 冒充成品。
- 文字词组命中只标为 `candidate`，未命中标为 `flag`。可见页上的同义改写会漏检；同页多行的相同数字会造成错误候选。它们都需要人工裁决，**不能以候选命中率宣称事实保留率**。
- 组合形状、继承定位、旋转、图像、图表标签、透明文字、遮挡、文本裁切、字形、阅读顺序及语义关系没有完整解析能力。会记录部分结构警告，不会声称已验证所有可见性。
- 比例与指定页数可以核对，但容量冲突是否正确处理、可读性和原生可编辑程度由人工检查。没有生成成品的安全拒绝必须单独报告，不能计为生成成功。
- `review.json` 是绑定原文、答案及 PPTX 哈希的待填写记录；每项需记录 verdict（pass/fail/uncertain）、页码、证据与理由。当前工具生成记录，不自动汇总人工签字，也没有 CI 发布阻断能力。最终报告始终为 `needs-review`，不存在“所有词都找到了所以美观合格”。

## 如何校准评测准确性

1. **答案溯源。** 每项有原文引用、保留要求及评审问题；验证器检查引用确实存在，不能由模型自由补事实。本版答案由同一作者编写，尚未独立人工复核，属于待校准的初版。
2. **构造对照。** `controls.json` 有 16 个独立控制：4 个可接受写法、7 个确定的文字缺陷、5 个已知盲区。比较 TP/FP/FN/TN。盲区单列，不算成功。PPTX 提取测试另外验证备注、隐藏页、越界和实际页序。
3. **真实输出盲审。** 下一轮对三个生成流程匿名打乱，先对同一批 30–50 页（包含难例）做双人独立核对，再裁决分歧，形成金标准。不能让生成模型只对自己的结果打分。自动语义或视觉裁判引入后，必须在未调参的金标准上报告每类 precision/recall、混淆矩阵、拒判比例及置信区间。
4. **避免伪准确率。** 控制集的命中情况只证明这些构造缺陷能被标记；它不是真实生成事实判断准确率，更不是审美正确率。未评审项目不从分母悄悄删除。不同检查类别分别报告，不能平均成一个掩盖关键漏项的总分。
5. **验收规则。** 关键数字/单位/条件、表格行列及流程关系出现确定错误，或可见内容严重缺失，应阻止该版本被认定为质量达标。未裁决争议保持待评审。视觉采用成对比较与具象检查（层级、留白、对齐、阅读路径、编排适配），记录评审者一致性，不预先声称模型可达到某个分数。

## 运行节奏与三个流程的对照

日常修改重跑受影响的开发案例；候选发布在冻结配置上跑全套，关键难例至少重复 3 次并保留全部结果。先展示单次结果，不用不足的重复数估算稳定通过率。

当前产品、上传的 guizang skill、内置 HTML PPT 模板分别使用同一文档、简报、比例和页数策略，记录各自默认模型与能力，再在可行时做同模型对照。保留源文事实、最终 PPTX、渲染页、成本与耗时。全页图片方案不得与原生可编辑方案混为同一产物类别。

本次交付的是固定材料、检查清单、评测器控制与私有历史基线入口。8 个合成案例在三个生成流程上均**尚未实跑**；真实质量通过率、稳定性和流程优劣均待验证。后续实跑目录独立保存，不覆盖本次“未运行”目录报告。

## v2 产品真实运行与验收工具

以下入口会调用隔离实例配置的真实模型 API，产生费用。与上面的离线入口分开运行：

```bash
pnpm exec tsx scripts/presentation-benchmark.ts --url http://127.0.0.1:17956 --out ../.tmp/ppt-run-new --model gpt-5.6-terra --source-version COMMIT
```

默认六个开发案例；`--cases` 可选案例，`--repeats 3` 保留每次重复，冻结候选后才使用 `--allow-reserved`。实际结果见输出目录的 `index.html`，包括失败、逐页 SVG、最终 PPTX、原文、配置、用量和待填写评审记录。SVG 是产品场景预览，不能冒充 Office 渲染。以前目录中的“未运行”报告是历史快照，不会被新结果覆盖。

验收入口读取完整的预期矩阵，缺失运行保留在分母中：

```bash
pnpm exec tsx scripts/presentation-acceptance.ts --manifest /absolute/comparison.json --out /new/acceptance-directory
```

`comparison.json` 结构为 `{cases: [caseId], engines: ["current-product", "guizang-skill", "built-in-html-ppt"], repetitions: 3, runs: [{caseId, engine, repetition: 1, result: "result.json", reviews: ["review-A.json", "review-B.json"]}]}`。路径相对 manifest。两份独立评审必须填写不同 reviewer、逐项 pass/fail、页码、证据和理由，绑定相同原文/答案/成品哈希。缺失、失败、未评、分歧或配置不匹配均返回非零退出码。这个门槛可以阻止未经验证的质量声明，不能替代评审者或产生尚不存在的金标准。

## 原生 HTML 演示评测

两套原生方案可沿用同一批冻结输入与核对项，无需先转成 PPTX：

```sh
od ppt inspect-native --project PROJECT --file index.html --json
pnpm exec tsx scripts/presentation-eval.ts evaluate \
  --case 01-long-report --inspection /project/native-review/RUN/report.json \
  --project-dir /project --run /evidence/run.json --out /evidence/new-run
```

评测前重新核对实际 HTML、CSS、脚本等资源哈希；读取每一页 PNG，并将图片和检查记录一起绑定到产物哈希。旧评审不能用于修改后的输出。渲染检查会记录裁切、文字重叠、资源缺失等候选问题，复杂背景上的文字明确保留为视觉核对项。文字命中依然只是候选证据，不能证明关系、箭头、否定条件、视觉效果或原模板一致性。仍须通过现有独立评审门槛，不自动给出“质量通过”。

原模板冻结对照应记录全部页面的截图和字体、颜色、几何位置；新生成对照应记录同一输入、原规则、模型、实际费用和失败结果。历史样本可以做回归，不能替代新一轮生成，也不能据此给出生产覆盖率。
