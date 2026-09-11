import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { corpusRoot, evaluate, extractPptx, generationOptions, loadCase, loadCorpus, runCalibration, sha256 } from '../lib/presentations/evaluation.ts';
import { catalogHtml, resultHtml } from '../lib/presentations/report.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string' }, case: { type: 'string' }, 'case-dir': { type: 'string' }, pptx: { type: 'string' },
  images: { type: 'string' }, run: { type: 'string' }, 'allow-reserved': { type: 'boolean' },
} });
const command = positionals[0];
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const out = path.resolve(values.out ?? '../.tmp/ppt-evaluation');
const save = (name: string, data: string) => writeFile(path.join(out, name), data);

if (command === 'validate' || command === 'catalog') {
  const corpus = await loadCorpus();
  const calibration = await runCalibration();
  console.log(json({ version: corpus.version, hash: corpus.hash, cases: corpus.cases.length, checks: corpus.cases.reduce((n, c) => n + c.checks.length, 0), calibration: { tp: calibration.tp, tn: calibration.tn, fp: calibration.fp, fn: calibration.fn, manual: calibration.abstained } }));
  if (calibration.errors.length) throw new Error(`Calibration failed: ${calibration.errors.join(', ')}`);
  if (command === 'catalog') {
    await mkdir(out, { recursive: true });
    await save('calibration.json', json(calibration));
    await save('catalog.json', json({ ...corpus, generationStatus: 'not-run' }));
    await save('index.html', catalogHtml(corpus, calibration));
    console.log(path.join(out, 'index.html'));
  }
} else if (command === 'input' || command === 'evaluate') {
  if (!values['case-dir'] && (!values.case || !/^[a-z0-9-]+$/.test(values.case))) throw new Error('Use --case <id> or --case-dir <private-directory>');
  const caseData = await loadCase(values['case-dir'] ?? path.join(corpusRoot, values.case!));
  if (caseData.split === 'reserved' && !values['allow-reserved']) throw new Error('Reserved document: use --allow-reserved only for a frozen release comparison. Do not tune prompts on this result.');
  await mkdir(out, { recursive: true });
  if (command === 'input') {
    // No answer, check ID, source quote selection, tags or expected output is sent to generators.
    await save('source.md', caseData.source);
    await save('request.json', json({ options: generationOptions(caseData), sourceFile: 'source.md' }));
    console.log(`Generator input only: ${out}`);
  } else {
    if (!values.pptx || !values.run) throw new Error('evaluate requires --pptx and --run <metadata.json>; unknown values must be null, never invented');
    const existingResult = await access(path.join(out, 'result.json')).then(() => true, () => false);
    if (existingResult) throw new Error('Run output already exists. Choose a new --out directory to preserve previous results and reviews.');
    const metadata = JSON.parse(await readFile(values.run, 'utf8')) as Record<string, unknown>;
    for (const key of ['engine', 'model', 'codeCommit', 'promptVersion', 'templateVersion', 'generationTime', 'usage', 'renderProvenance']) if (!(key in metadata)) throw new Error(`Missing run metadata: ${key} (use null if unknown)`);
    const buffer = await readFile(values.pptx);
    const result = evaluate(caseData, await extractPptx(buffer));
    const images: string[] = [];
    const imageHashes: Record<string, string> = {};
    if (values.images) {
      const files = (await readdir(values.images)).filter(f => /^page-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      if (files.length !== result.evidence.slides.length || files.some((f, i) => Number(f.match(/\d+/)?.[0]) !== i + 1)) throw new Error('Rendered images must cover each slide exactly once in page order');
      for (const file of files) {
        const data = await readFile(path.join(values.images, file));
        await writeFile(path.join(out, file), data);
        images.push(file); imageHashes[file] = sha256(data);
      }
    }
    await writeFile(path.join(out, 'deck.pptx'), buffer);
    await save('source.md', caseData.source);
    await save('case.json', json({ ...caseData, source: undefined }));
    await save('result.json', json({ ...result, metadata, imageHashes, renderingVerified: false }));
    await save('review.json', json({ caseId: caseData.id, artifactSha256: result.evidence.sha256, sourceSha256: caseData.sourceSha256, rubricSha256: result.rubricSha256, status: 'pending', reviewer: null, reviewedAt: null, checks: caseData.checks.map(c => ({ id: c.id, verdict: 'unreviewed', pages: [], evidence: '', reason: '' })) }));
    await save('report.html', resultHtml(caseData, result, { ...metadata, imageHashes }, images));
    console.log(json({ report: path.join(out, 'report.html'), slides: result.evidence.slides.length, candidates: result.results.filter(r => r.status === 'candidate').length, flags: result.results.filter(r => r.status === 'flag').length, manual: result.results.filter(r => r.status === 'manual').length, status: result.status }));
  }
} else {
  console.log('Usage (from e2e): pnpm exec tsx scripts/presentation-eval.ts validate|catalog|input|evaluate\n  catalog --out ../.tmp/ppt-evaluation\n  input --case 01-long-report --out ../.tmp/ppt-input\n  evaluate --case 01-long-report --pptx <deck.pptx> --run <metadata.json> [--images <directory>] --out <directory>\n  Private case: --case-dir <directory containing source.md and case.json>\n  Reserved cases require --allow-reserved. No model API calls are made by this tool.');
  process.exitCode = 1;
}
