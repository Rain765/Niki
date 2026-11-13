import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runPresentationCli } from '../src/presentation-cli.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); process.exitCode = 0; });
it('uses the same project-local inspection API as the native preview', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const fetchMock = vi.fn().mockResolvedValue(Response.json({id:'r1',projectId:'p1',status:'completed',report:{visualReviewRequired:true,slides:[],stale:false}}));
  vi.stubGlobal('fetch', fetchMock);
  await runPresentationCli(['inspect-native','--project','p1','--file','slides/index.html','--json','--daemon-url','http://127.0.0.1:12345']);
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:12345/api/projects/p1/native-presentation/inspect', expect.objectContaining({method:'POST',body:JSON.stringify({entry:'slides/index.html'})}));
  expect(process.exitCode ?? 0).toBe(0);
});
it('uses original project, file and run APIs without calling the restricted presentation generator', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-ppt-cli-'));
  try {
    await writeFile(path.join(dir, 'brief.md'), 'Use the original Swiss deck. Preserve all data.');
    await writeFile(path.join(dir, 'source.md'), '原始测试数据：A=12，B=34。');
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/skills/guizang-ppt-skill')) return Response.json({ id: 'guizang-ppt-skill' });
      if (url.endsWith('/api/projects')) return Response.json({ project: { id: 'p1' }, conversationId: 'c1' });
      if (url.endsWith('/api/projects/p1/files')) return Response.json({ file: { name: 'source-2.md' } });
      if (url.endsWith('/api/projects/p1')) return Response.json({ project: { id: 'p1' } });
      if (url.endsWith('/api/runs')) return Response.json({ id: 'r1' });
      throw new Error(`Unexpected endpoint ${url}`);
    }));
    await runPresentationCli(['native', '--workflow', 'guizang-ppt-skill', '--prompt-file', path.join(dir, 'brief.md'), '--file', path.join(dir, 'source.md'), '--agent', 'codex', '--json', '--daemon-url', 'http://127.0.0.1:12345']);
    expect(process.exitCode ?? 0).toBe(0);
    const upload = calls.find((call) => call.url.endsWith('/files'))!;
    expect(await ((upload.init!.body as FormData).get('file') as File).text()).toBe('原始测试数据：A=12，B=34。');
    const create = JSON.parse(calls.find((call) => call.url.endsWith('/api/projects'))!.init!.body as string);
    expect(create.skillId).toBe('guizang-ppt-skill');
    expect(create.metadata.nativePresentation.workflow).toBe('guizang-ppt-skill');
    const run = JSON.parse(calls.at(-1)!.init!.body as string);
    expect(run.message).toContain('"source-2.md"');
    expect(run.skillId).toBe('guizang-ppt-skill');
    expect(calls.every((call) => !call.url.includes('/api/presentations'))).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it.each([
  ['html-ppt', 'custom', 'arctic-cool', 'assets/themes/arctic-cool.css'],
  ['html-ppt', 'auto', 'arctic-cool', '起点尚未选择'],
  ['guizang-ppt-skill', 'A', 'Monocle', 'references/layouts.md'],
  ['guizang-ppt-skill', 'B', 'IKB', 'references/swiss-layout-lock.md'],
])('keeps %s template and theme selections through the project and run APIs', async (workflow, template, theme, reference) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-ppt-selection-'));
  try {
    await writeFile(path.join(dir, 'brief.md'), 'Confirmed public demo brief.');
    const bodies: Record<string, any> = {};
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.body) bodies[`${init.method} ${new URL(url).pathname}`] = JSON.parse(init.body as string);
      if (url.endsWith('/api/projects')) return Response.json({ project: { id: 'p1' }, conversationId: 'c1' });
      return Response.json({ runId: 'r1' });
    }));
    await runPresentationCli(['native', '--workflow', workflow!, '--template', template!, '--theme', theme!, '--prompt-file', path.join(dir, 'brief.md'), '--agent', 'codex', '--json', '--daemon-url', 'http://127.0.0.1:12345']);
    expect(process.exitCode ?? 0).toBe(0);
    for (const key of ['POST /api/projects', 'PATCH /api/projects/p1']) {
      expect(bodies[key].metadata.nativePresentation.selection).toEqual({ template: template === 'auto' ? '' : template, theme });
      expect(bodies[key].metadata.nativePresentation.brief).toContain(reference);
    }
    expect(bodies['POST /api/runs'].message).toContain(reference);
    expect(bodies['POST /api/runs'].message).toContain(theme);
    if (workflow === 'html-ppt') expect(bodies['POST /api/runs'].message).not.toMatch(/guizang|深浅/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('rejects a theme from another workflow before creating a project', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-ppt-invalid-theme-'));
  try {
    await writeFile(path.join(dir, 'brief.md'), 'Confirmed public demo brief.');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await runPresentationCli(['native', '--workflow', 'html-ppt', '--theme', 'IKB', '--prompt-file', path.join(dir, 'brief.md'), '--daemon-url', 'http://127.0.0.1:12345']);
    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('rejects a generic theme layered over a complete deck before creating files',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-template-theme-'));
 try {
  await writeFile(path.join(dir,'brief.md'),'Use the original complete template.');
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const request=vi.fn();vi.stubGlobal('fetch',request);
  await runPresentationCli(['native','--workflow','html-ppt','--template','tech-sharing','--theme','arctic-cool','--prompt-file',path.join(dir,'brief.md')]);
  expect(process.exitCode).toBe(1);expect(request).not.toHaveBeenCalled();
 } finally {await rm(dir,{recursive:true,force:true});}
});
