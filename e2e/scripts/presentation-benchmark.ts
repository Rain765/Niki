import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { PresentationJob } from '@open-design/contracts';
import {
  corpusRoot,
  loadCorpus,
  generationOptions,
  evaluate,
  extractPptx,
  sha256,
} from '../lib/presentations/evaluation.js';
import { resultHtml } from '../lib/presentations/report.js';

/** Opt-in paid evaluation through the same production HTTP endpoints as UI/CLI. */
const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    cases: { type: 'string' },
    repeats: { type: 'string', default: '1' },
    model: { type: 'string' },
    'allow-reserved': { type: 'boolean' },
    'source-version': { type: 'string' },
    'resume-projects': { type: 'string' },
  },
});
if (!values.url || !values.out)
  throw new Error(
    'Usage: presentation-benchmark --url <isolated daemon> --out <new private directory> [--cases id,id] [--repeats 3] [--model ID] [--allow-reserved] [--source-version commit-or-tree-hash]. This calls the configured model API and records real usage.',
  );
const origin = new URL(values.url).origin;
const out = path.resolve(values.out);
const repeats = Number(values.repeats);
const resumeProjects: Record<string, string> = values['resume-projects']
  ? JSON.parse(await readFile(values['resume-projects'], 'utf8'))
  : {};
if (values['resume-projects'] && repeats !== 1)
  throw new Error(
    'A recovery run is not an independent repetition. Use repeats=1.',
  );
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5)
  throw new Error('Use 1–5 repetitions');
await mkdir(out, { recursive: false });
const headers: Record<string, string> = process.env.OD_NIKI_SESSION_TOKEN
  ? { authorization: `Bearer ${process.env.OD_NIKI_SESSION_TOKEN}` }
  : {};
async function request<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(origin + route, {
    ...init,
    headers: { ...headers, ...init?.headers },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  return response.json() as Promise<T>;
}
const corpus = await loadCorpus();
const selected = values.cases?.split(',');
if (selected?.some((id) => !corpus.cases.some((c) => c.id === id)))
  throw new Error('Unknown case');
const cases = corpus.cases.filter(
  (c) =>
    (!selected || selected.includes(c.id)) &&
    (c.split !== 'reserved' || values['allow-reserved']),
);
const runs: Record<string, unknown>[] = [];
const escape = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
async function index() {
  await writeFile(
    path.join(out, 'runs.json'),
    JSON.stringify(
      {
        corpusVersion: corpus.version,
        corpusHash: corpus.hash,
        sourceVersion: values['source-version'] ?? null,
        created: new Date().toISOString(),
        expectedCases: cases.map((c) => c.id),
        repeats,
        runs,
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(out, 'index.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>PPT 生成评测</title><style>body{font:16px system-ui;max-width:1200px;margin:48px auto;padding:24px;color:#1d2129}table{border-collapse:collapse;width:100%}td,th{padding:14px;border-bottom:1px solid #c9cdd4;text-align:left}p{line-height:1.7}a{color:#00665a}</style><h1>PPT 生成评测</h1><p>每次运行保留原文、配置、输出、用量和失败。文字候选不是事实通过率；人工检查未完成时保持待评审。</p><table><tr><th>案例 / 次数</th><th>状态</th><th>页数</th><th>文字候选 / 待查</th><th>输入 / 输出 Token</th><th>证据</th></tr>${runs.map((r) => `<tr><td>${escape(r.caseId)} / ${r.repeat}</td><td>${escape(r.status)}</td><td>${r.pages ?? '—'}</td><td>${r.candidates ?? '—'} / ${r.flags ?? '—'}</td><td>${r.inputTokens ?? 0} / ${r.outputTokens ?? 0}</td><td><a href="${escape(r.directory)}/${r.pages ? 'report.html' : 'run.json'}">查看记录</a></td></tr>`).join('')}</table></html>`,
  );
}
for (const c of cases)
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const directory = `${c.id}-${repeat}`,
      dir = path.join(out, directory);
    await mkdir(dir);
    const source = await readFile(
      path.join(corpusRoot, c.id, 'source.md'),
      'utf8',
    );
    const options = {
      ...generationOptions(c),
      ...(values.model ? { model: values.model } : {}),
      reviewPlan: false,
    };
    await writeFile(path.join(dir, 'source.md'), source);
    await writeFile(
      path.join(dir, 'request.json'),
      JSON.stringify({ options }, null, 2),
    );
    const startedAt = Date.now();
    let job: PresentationJob | undefined;
    const record: Record<string, unknown> = {
      caseId: c.id,
      repeat,
      directory,
      sourceSha256: sha256(source),
      status: 'running',
    };
    runs.push(record);
    await index();
    try {
      const form = new FormData();
      form.append('file', new Blob([source]), `${c.id}.md`);
      form.append('options', JSON.stringify(options));
      const resume = resumeProjects[c.id];
      if (resume) {
        job = await request<PresentationJob>(
          `/api/projects/${encodeURIComponent(resume)}/presentation`,
        );
        const original = await fetch(
          `${origin}/api/projects/${encodeURIComponent(resume)}/raw/source.md`,
          { headers },
        );
        if (
          !original.ok ||
          sha256(Buffer.from(await original.arrayBuffer())) !==
            c.sourceSha256 ||
          job.options.pageCount !== options.pageCount ||
          job.options.ratio !== options.ratio ||
          job.options.palette !== options.palette
        )
          throw new Error(
            'Recovery source or configuration does not match the frozen case',
          );
        record.resumedProject = resume;
        record.usageBefore = job.usage ?? null;
        job = await request<PresentationJob>(
          `/api/projects/${encodeURIComponent(resume)}/presentation/action`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'continue',
              revision: job.revision,
            }),
          },
        );
      } else
        job = await request<PresentationJob>('/api/presentations', {
          method: 'POST',
          body: form,
        });
      while (
        ['planning', 'generating', 'rendering', 'checking'].includes(job.status)
      ) {
        if (Date.now() - startedAt > 45 * 60_000)
          throw new Error(
            'Evaluation deadline reached; job ID is retained for recovery',
          );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        job = await request<PresentationJob>(
          `/api/projects/${encodeURIComponent(job.projectId)}/presentation`,
        );
        await writeFile(
          path.join(dir, 'job.json'),
          JSON.stringify(job, null, 2),
        );
      }
      record.status =
        job.status === 'failed'
          ? 'failed'
          : (job.quality?.status ?? job.status);
      if (job.status === 'failed')
        throw new Error(job.error ?? 'Generation failed');
      const raw = async (file: string) => {
        const response = await fetch(
          `${origin}/api/projects/${encodeURIComponent(job!.projectId)}/raw/${file.split('/').map(encodeURIComponent).join('/')}`,
          { headers, signal: AbortSignal.timeout(60_000) },
        );
        if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      };
      const pptx = await raw(job.pptx!);
      await writeFile(path.join(dir, 'deck.pptx'), pptx);
      await writeFile(path.join(dir, 'deck.html'), await raw(job.html!));
      for (let i = 0; i < (job.previews?.length ?? 0); i++)
        await writeFile(
          path.join(dir, `page-${String(i + 1).padStart(2, '0')}.svg`),
          await raw(job.previews![i]!),
        );
      const result = evaluate(c, await extractPptx(pptx));
      const metadata = {
        engine: 'current-product',
        model: job.usage?.model ?? null,
        codeCommit: values['source-version'] ?? null,
        promptVersion: job.pipelineVersion ?? null,
        templateVersion: '2.0.0',
        generationTime: Date.now() - startedAt,
        usage: job.usage ?? null,
        renderProvenance:
          'Production SVG scene previews; Office rendering is separately reviewed.',
      };
      await writeFile(
        path.join(dir, 'result.json'),
        JSON.stringify({ ...result, metadata }, null, 2),
      );
      await writeFile(
        path.join(dir, 'review.json'),
        JSON.stringify(
          {
            caseId: c.id,
            artifactSha256: result.evidence.sha256,
            sourceSha256: c.sourceSha256,
            rubricSha256: result.rubricSha256,
            reviewer: null,
            checks: c.checks.map((check) => ({
              id: check.id,
              verdict: 'unreviewed',
              pages: [],
              evidence: '',
              reason: '',
            })),
          },
          null,
          2,
        ),
      );
      await writeFile(
        path.join(dir, 'report.html'),
        resultHtml(
          c,
          result,
          metadata,
          (job.previews ?? []).map(
            (_, i) => `page-${String(i + 1).padStart(2, '0')}.svg`,
          ),
        ),
      );
      Object.assign(record, {
        pages: result.evidence.slides.length,
        candidates: result.results.filter((r) => r.status === 'candidate')
          .length,
        flags: result.results.filter((r) => r.status === 'flag').length,
        manual: result.results.filter((r) => r.status === 'manual').length,
      });
    } catch (e) {
      record.status = 'failed';
      record.error = e instanceof Error ? e.message : String(e);
    }
    Object.assign(record, {
      projectId: job?.projectId ?? null,
      durationMs: Date.now() - startedAt,
      inputTokens: job?.usage?.inputTokens ?? 0,
      outputTokens: job?.usage?.outputTokens ?? 0,
    });
    await writeFile(
      path.join(dir, 'run.json'),
      JSON.stringify(record, null, 2),
    );
    await index();
    console.log(JSON.stringify(record));
  }
if (runs.some((r) => r.status === 'failed' || r.status === 'blocked'))
  process.exitCode = 1;
