import { NATIVE_PRESENTATION_RESOURCES, nativePresentationDesignInstructions } from '@open-design/contracts';
import { createProject, patchProject } from '../state/projects';
import { uploadProjectFile } from '../providers/registry';
import type { Project } from '../types';

export const NATIVE_PPT_SKILLS = ['html-ppt', 'guizang-ppt-skill'] as const;
export type NativePptSkill = typeof NATIVE_PPT_SKILLS[number];
export type NativePptBrief = {
  skill: NativePptSkill;
  topic: string;
  audience: string;
  pages: string;
  style: string;
  theme: string;
  duration: string;
};

export function isNativePresentation(project: Project): boolean {
  return NATIVE_PPT_SKILLS.some((id) => project.skillId === id)
    && !project.metadata?.presentation;
}

/** The brief contains user choices only; the original skill owns its workflow. */
export function nativePresentationPrompt(brief: NativePptBrief, sourceName?: string): string {
  return [
    `请使用 ${brief.skill} 的原始完整工作流制作 HTML 演示稿。`,
    brief.topic,
    sourceName ? `原始资料已上传到项目文件：${JSON.stringify(sourceName)}。请读取完整文件，以原文为依据，不要仅依据摘要制作。` : '',
    brief.audience ? `受众与场景：${brief.audience}。` : '受众和场景如未提供，结合资料判断；只有会实质影响内容时再确认，不必强制补填。',
    `页数：${brief.pages === 'auto' ? '按内容容量规划，先给我建议' : `${brief.pages} 页；如容量不足，请先与我确认增页，不要删减重要信息` }。`,
    brief.duration ? `分享时长：${brief.duration} 分钟。` : '',
    `风格：${brief.style || '请从原始模板中推荐并与我确认'}。`,
    `主题：${brief.skill === 'html-ppt' && brief.style && brief.style !== 'custom' ? '保留模板原主题' : brief.theme || '保留模板原主题'}。`,
    nativePresentationDesignInstructions(brief.skill, brief.style, brief.theme),
    '按原流程确认需求、大纲与视觉方向，再生成和检查。保留原模板的字体、布局、资源、交互与演讲者模式。',
    '保留原文中的事实、数据、限制条件及表格；内容过多时提出拆页方案。缺失的素材和数据先说明，不要编造。',
    '生成前在项目中保存 content-plan.md：逐页列出目的、原文位置、必须保留的信息、选用的原始版式、容量风险与核对项。架构和流程保留节点、连线方向及分支条件；密集表格可续页并重复表头；培训保留定义、示例与练习。先确认容量冲突，不通过删信息、缩小字号或全部移入备注解决。',
    '优先按所选模板的原生网格、字体、间距和版式组织内容；原版式不适合时说明并确认，不静默换生成方案。表格续页允许重复版式。保存 source-coverage.md，记录源材料事实、数据、条件、表格与最终页码对应关系，以及任何未覆盖内容。',
    '交付完整 HTML 及依赖资源；若有其他真实生成的文件可同时交付。',
    '只在当前项目内创建和修改演示产物，不修改应用源码，不执行 Git 提交或部署。',
  ].filter(Boolean).join('\n\n');
}

/** Upload finishes before any generation can start. A failed upload stays recoverable. */
export async function prepareNativePresentation(brief: NativePptBrief, file: File | null): Promise<Project> {
  const created = await createProject({
    name: brief.topic.trim().slice(0, 70) || file?.name.replace(/\.[^.]+$/, '') || '演示文稿',
    skillId: brief.skill,
    designSystemId: null,
    metadata: { kind: 'deck', nativePresentation: { version: 1, workflow: brief.skill, selection: { template: brief.style, theme: brief.theme }, resourceVersion: NATIVE_PRESENTATION_RESOURCES[brief.skill], brief: nativePresentationPrompt(brief) } },
  });
  if (!created) throw new Error('无法创建文稿，请重试。 / Could not create presentation.');
  const uploaded = file ? await uploadProjectFile(created.project.id, file) : null;
  if (file && !uploaded) throw new Error('原文件上传失败，尚未开始生成。可从我的文稿打开草稿重新上传。 / Upload failed; generation has not started.');
  const project = await patchProject(created.project.id, {
    pendingPrompt: nativePresentationPrompt(brief, uploaded?.name),
    metadata: { ...created.project.metadata!, nativePresentation: { version: 1, workflow: brief.skill, selection: { template: brief.style, theme: brief.theme }, resourceVersion: NATIVE_PRESENTATION_RESOURCES[brief.skill], brief: nativePresentationPrompt(brief, uploaded?.name), sourceFileName: uploaded?.name } },
  });
  if (!project) throw new Error('资料已保存，需求保存失败。可从我的文稿继续。 / Brief could not be saved.');
  return project;
}
