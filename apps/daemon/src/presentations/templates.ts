import type {
  PresentationTemplate,
  PresentationSlide,
} from '@open-design/contracts';

// Native, editable adaptations of the supplied layout taxonomy. No uploaded code/assets are vendored.
const swiss: Array<[string, string, PresentationSlide['layout'], string]> = [
  ['S01', '索引封面', 'cover', '章节索引与大标题，左侧信息轴'],
  ['S02', '纵向时间线', 'timeline', '左侧日期轴，右侧事件与证据'],
  ['S03', '分屏论点', 'editorial', '主论点与解释分栏，保留条件'],
  ['S04', '六项定义', 'overview', '六项概念按两行三列对齐'],
  ['S05', '三项分栏', 'overview', '三项内容以独立信息栏呈现'],
  ['S06', '指标塔', 'metrics', '真实数值与单位分离的纵向指标'],
  ['S07', '横向条形图', 'metrics', '有来源的同口径数据排名'],
  ['S08', '双向对照', 'comparison', '相同维度下对比方案与条件'],
  ['S09', '收束宣言', 'closing', '醒目的结论与后续行动'],
  ['S10', '点阵陈述', 'editorial', '点阵底纹与醒目的核心陈述'],
  ['S11', '横向时间线', 'timeline', '阶段沿时间轴排列'],
  ['S12', '宣言与通栏', 'editorial', '通栏强调区与分层解释'],
  ['S13', '三项驱动', 'overview', '三列等权论点，以细线划分'],
  ['S14', '闭环流程', 'cycle', '有真实反馈边的环形流程'],
  ['S15', '矩阵总览', 'matrix', '多个维度与全局指标'],
  ['S16', '多项简报', 'overview', '多条事实的紧凑索引排版'],
  ['S17', '系统关系图', 'architecture', '系统容器与层级组件，有向关系保持完整'],
  ['S18', '论点与证据', 'overview', '理由与数据依据对应'],
  ['S19', '四项特性', 'matrix', '四项特性的平衡网格'],
  ['S20', '指标账本', 'metrics', '每行数值、单位、口径与条件'],
  ['S21', '技术规格表', 'table', '保留表头和单元格的规格比较'],
  ['S22', '图文主视觉', 'editorial', '原始证据图片与说明，保持完整比例'],
];
const technical: Array<[string, string, PresentationSlide['layout'], string]> =
  [
    ['H-table', '数据表格', 'table', '完整行列、重复表头与续表'],
    ['H-chart-bar', '数据比较', 'metrics', '横向条形图、标签与原始单位'],
    ['H-chart-line', '趋势分析', 'metrics', '连续时间序列，保留坐标与单位'],
    [
      'H-architecture',
      '架构蓝图',
      'architecture',
      '系统层级、分组边界与跨组连接',
    ],
    ['H-flow', '角色泳道', 'flow', '角色分组、条件分支与回退连接'],
    ['H-course', '概念与示例', 'editorial', '定义、适用条件、正反例分别编排'],
    ['H-exercise', '练习与解析', 'comparison', '题目、参考答案及解析分栏'],
    ['H-roadmap', '实施路线', 'timeline', '阶段、负责事项与先决条件'],
    ['E-report', '阅读式报告', 'editorial', '宽文本栏、分节标题与细线分隔'],
    ['E-brief', '编辑式简报', 'overview', '主栏与侧栏有明确层次'],
    ['E-cover', '报告封面', 'cover', '衬线标题与章节索引'],
  ];
function sample(
  id: string,
  name: string,
  layout: PresentationSlide['layout'],
): PresentationSlide {
  const slide: PresentationSlide = {
    templateId: id,
    title: name,
    subtitle: '文档中的事实，按内容关系组织',
    layout,
    items: [
      {
        id: 'a',
        title: '业务入口',
        body: '接收需求，核对材料与必要条件。',
        group: 'g1',
      },
      {
        id: 'b',
        title: '处理服务',
        body: '按规则处理，保留异常与回退路径。',
        group: 'g2',
      },
      {
        id: 'c',
        title: '结果交付',
        body: '输出可追溯的结果与后续操作。',
        group: 'g2',
      },
      {
        id: 'd',
        title: '质量复核',
        body: '逐项核对关键数据和执行条件。',
        group: 'g3',
      },
    ],
    edges: [],
    notes: '',
  };
  if (['architecture', 'flow', 'cycle'].includes(layout)) {
    slide.edges = [
      { from: 'a', to: 'b', label: '提交' },
      { from: 'b', to: 'c', label: '通过' },
      { from: 'c', to: 'd', label: '复核' },
    ];
    if (layout === 'cycle')
      slide.edges.push({ from: 'd', to: 'a', label: '补充' });
    slide.groups = [
      { id: 'g1', title: '接入层' },
      { id: 'g2', title: '业务层' },
      { id: 'g3', title: '质量层' },
    ];
  }
  if (layout === 'table')
    slide.table = {
      headers: ['项目', '范围', '处理要求'],
      rows: [
        ['文档读取', '正文、表格', '保留原文结构'],
        ['业务规则', '条件、例外', '逐项核对'],
        ['输出检查', '内容、版式', '保留检查记录'],
      ],
    };
  if (layout === 'metrics' && id !== 'S20') {
    slide.chart = {
      type: id === 'H-chart-line' ? 'line' : 'bar',
      labels: ['方案 A', '方案 B', '方案 C', '方案 D'],
      values: [45, 72, 96, 60],
      unit: '示例数据',
      sourceRef: 1,
    };
    slide.items = slide.chart.labels.map((title, i) => ({
      id: String(i),
      title: String(slide.chart!.values[i]),
      body: title + ' · 示例数据',
    }));
  }
  if (id === 'S20')
    slide.items = ['72%', '3.2 倍', '18 天'].map((title, i) => ({
      id: String(i),
      title,
      body: '示例指标 · 实际生成仅使用原文数据与口径。',
    }));
  if (['S05', 'S13', 'S18'].includes(id)) slide.items = slide.items.slice(0, 3);
  if (id === 'S04')
    slide.items.push(
      { id: 'e', title: '例外处理', body: '区分适用条件和例外情况。' },
      { id: 'f', title: '后续跟进', body: '明确责任、时点与验证依据。' },
    );
  if (!['architecture', 'flow'].includes(layout)) {
    delete slide.groups;
    slide.items = slide.items.map(({ group: _group, ...item }) => item);
  }
  if (slide.table || slide.chart) slide.items = [];
  if (id === 'H-course')
    slide.items = [
      {
        id: 'definition',
        title: '定义 · 最小权限',
        body: '只授予完成当前工作所需的权限。',
      },
      { id: 'example', title: '正例', body: '分析师仅能读取汇总报表。' },
      {
        id: 'counterexample',
        title: '反例',
        body: '为了方便而向全员开放原始客户表。',
      },
    ];
  if (id === 'H-exercise')
    slide.items = [
      {
        id: 'question',
        title: '情景判断',
        body: '供应商要求永久管理员权限，以方便排障。是否批准？',
      },
      {
        id: 'answer',
        title: '作答与讲解',
        body: '先判断工作范围、时效和审批条件，再说明依据。',
      },
    ];
  return slide;
}
export const presentationTemplates: PresentationTemplate[] = [
  ...swiss,
  ...technical,
].map(([id, name, layout, description]) => ({
  id,
  name,
  layout,
  description,
  family: id.startsWith('S')
    ? 'swiss'
    : id.startsWith('E')
      ? 'editorial'
      : 'technical',
  reference: id.startsWith('S')
    ? 'guizang-ppt / Swiss layout taxonomy (native adaptation)'
    : id.startsWith('E')
      ? 'html-ppt / editorial composition (native adaptation)'
      : `html-ppt / ${id.slice(2)} (native adaptation)`,
  sample: sample(id, name, layout),
}));
export function templateFor(
  slide: PresentationSlide,
  index: number,
  family = 'swiss',
): string {
  if (slide.table) return 'H-table';
  if (slide.chart) return slide.chart.type === 'line' ? 'H-chart-line' : 'S07';
  if (slide.image) return 'S22';
  const explicit = presentationTemplates.find(
    (t) => t.id === slide.templateId && t.layout === slide.layout,
  );
  if (explicit) return explicit.id;
  const matches = presentationTemplates.filter(
    (t) => t.layout === slide.layout && t.family === family,
  );
  return (
    (
      matches[index % Math.max(matches.length, 1)] ??
      presentationTemplates.find((t) => t.layout === slide.layout)
    )?.id ?? 'E-report'
  );
}
