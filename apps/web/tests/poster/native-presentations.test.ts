import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareNativePresentation, type NativePptBrief } from '../../src/poster/native-presentations';
import { createProject, patchProject } from '../../src/state/projects';
import { uploadProjectFile } from '../../src/providers/registry';

vi.mock('../../src/state/projects', () => ({ createProject: vi.fn(), patchProject: vi.fn() }));
vi.mock('../../src/providers/registry', () => ({ uploadProjectFile: vi.fn() }));
const brief: NativePptBrief = { skill: 'guizang-ppt-skill', topic: '公开测试', audience: '产品团队', pages: 'auto', style: 'B', theme: 'IKB', duration: '10' };
const project = { id: 'p1', metadata: { kind: 'deck' }, skillId: brief.skill };

describe('original document handoff', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(createProject).mockResolvedValue({ project, conversationId: 'c1' } as never); });
  it('does not queue a prompt if the original file cannot be uploaded', async () => {
    vi.mocked(uploadProjectFile).mockResolvedValue(null);
    await expect(prepareNativePresentation(brief, new File(['source'], 'source.md'))).rejects.toThrow('上传失败');
    expect(patchProject).not.toHaveBeenCalled();
    expect(vi.mocked(createProject).mock.calls[0]![0]).not.toHaveProperty('pendingPrompt');
  });
  it('passes original bytes unchanged and references the server-assigned filename before starting', async () => {
    const text = Array.from({ length: 500 }, (_, i) => `数据 ${i}：金额 ${i + 123}，条件完整保留。`).join('\n');
    const file = new File([text], 'source.md');
    vi.mocked(uploadProjectFile).mockResolvedValue({ name: 'source-2.md' } as never);
    vi.mocked(patchProject).mockResolvedValue(project as never);
    await prepareNativePresentation(brief, file);
    const sentFile = vi.mocked(uploadProjectFile).mock.calls[0]![1];
    expect(await sentFile.text()).toBe(text);
    const patch = vi.mocked(patchProject).mock.calls[0]![1];
    expect(patch.pendingPrompt).toContain('"source-2.md"');
    expect(patch.metadata?.nativePresentation?.workflow).toBe('guizang-ppt-skill');
    expect(patch.metadata?.nativePresentation?.resourceVersion).toMatch(/^zip-sha256:/);
    expect(patch.metadata?.nativePresentation?.brief).toBe(patch.pendingPrompt);
  });
});

it('uses original template files and preserves original background rhythm', async () => {
  const { nativePresentationPrompt } = await import('../../src/poster/native-presentations');
  const prompt = nativePresentationPrompt({...brief,skill:'html-ppt',style:'tech-sharing'});
  expect(prompt).toContain('templates/full-decks/tech-sharing/index.html');
  expect(prompt).toContain('背景跟随选定模板');
  expect(prompt).not.toContain('深浅');
  expect(prompt).not.toContain('Guizang');
  expect(nativePresentationPrompt({...brief,style:'B · 瑞士国际主义'})).toContain('assets/template-swiss.html');
});

it('preserves full-deck design and does not require removed optional fields',async()=>{
 const {nativePresentationPrompt}=await import('../../src/poster/native-presentations');
 const prompt=nativePresentationPrompt({...brief,skill:'html-ppt',style:'tech-sharing',theme:'arctic-cool',audience:'',duration:''});
 expect(prompt).not.toContain('assets/themes/arctic-cool.css');
 expect(prompt).toContain('不叠加通用主题 CSS');
 expect(prompt).not.toContain('请在开始前与我确认');
 expect(prompt).toContain('source-coverage.md');
 expect(prompt).toContain('content-plan.md');
});

it('preserves the server-bound model through upload and leaves the skill prompt unchanged', async () => {
  const { nativePresentationPrompt } = await import('../../src/poster/native-presentations');
  const { createProject, patchProject } = await import('../../src/state/projects');
  vi.mocked(createProject).mockResolvedValue({project:{id:'bound',metadata:{kind:'deck',nativePresentation:{version:1,workflow:'html-ppt',brief:'',resourceVersion:'test',modelBinding:{provider:'qwen',model:'qwen3.8-max'}}}}} as never);
  vi.mocked(patchProject).mockResolvedValue({id:'bound'} as never);
  const input={...brief,provider:'qwen' as const};
  expect(nativePresentationPrompt(input)).toBe(nativePresentationPrompt(brief));
  await prepareNativePresentation(input,null);
  expect(vi.mocked(patchProject).mock.lastCall?.[1].metadata?.nativePresentation?.modelBinding).toEqual({provider:'qwen',model:'qwen3.8-max'});
});
