import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  loadCorpus,
  type Evaluation,
} from '../lib/presentations/evaluation.ts';
import { acceptance, type Review } from '../lib/presentations/acceptance.ts';
const { values } = parseArgs({
  options: { manifest: { type: 'string' }, out: { type: 'string' } },
});
if (!values.manifest || !values.out)
  throw new Error(
    'Usage: presentation-acceptance --manifest /absolute/comparison.json --out /new/report-directory',
  );
const manifest = JSON.parse(await readFile(values.manifest, 'utf8')) as {
  cases: string[];
  engines: string[];
  repetitions: number;
  runs: Array<{
    caseId: string;
    engine: string;
    repetition: number;
    result: string;
    reviews: string[];
  }>;
};
if (
  !manifest.cases?.length ||
  !manifest.engines?.length ||
  !Number.isInteger(manifest.repetitions) ||
  manifest.repetitions < 1
)
  throw new Error('Invalid comparison manifest');
const corpus = await loadCorpus();
const rows = [];
for (const caseId of manifest.cases)
  for (const engine of manifest.engines)
    for (let repeat = 1; repeat <= manifest.repetitions; repeat++) {
      const c = corpus.cases.find((c) => c.id === caseId);
      if (!c) throw new Error('Unknown corpus case');
      const matches = manifest.runs.filter(
        (r) =>
          r.caseId === caseId && r.engine === engine && r.repetition === repeat,
      );
      let verdict;
      if (matches.length !== 1)
        verdict = {
          status: 'blocked',
          problems: ['运行缺失或重复，不能从分母删除。'],
        };
      else {
        const run = matches[0]!;
        const result = JSON.parse(
          await readFile(
            path.resolve(path.dirname(values.manifest), run.result),
            'utf8',
          ),
        ) as Evaluation;
        const reviews = await Promise.all(
          run.reviews.map(
            async (p) =>
              JSON.parse(
                await readFile(
                  path.resolve(path.dirname(values.manifest!), p),
                  'utf8',
                ),
              ) as Review,
          ),
        );
        verdict = acceptance(c, result, reviews);
      }
      rows.push({ caseId, engine, repeat, ...verdict });
    }
const report = {
  status: rows.every((r) => r.status === 'accepted') ? 'accepted' : 'blocked',
  expectedRuns: rows.length,
  rows,
};
await mkdir(values.out, { recursive: false });
await writeFile(
  path.join(values.out, 'acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
if (report.status !== 'accepted') process.exitCode = 1;
