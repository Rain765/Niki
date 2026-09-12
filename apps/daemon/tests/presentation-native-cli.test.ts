import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runPresentationCli } from '../src/presentation-cli.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); process.exitCode = 0; });
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
