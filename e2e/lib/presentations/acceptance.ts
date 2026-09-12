import { sha256, type Case, type Evaluation } from './evaluation.ts';

export interface Review {
  caseId: string;
  artifactSha256: string;
  sourceSha256: string;
  rubricSha256: string;
  reviewer: string | null;
  checks: Array<{
    id: string;
    verdict: 'pass' | 'fail' | 'uncertain' | 'unreviewed';
    pages: number[];
    evidence: string;
    reason: string;
  }>;
}
/** Never turn candidate matching into acceptance. Require independent, artifact-bound review. */
export function acceptance(c: Case, result: Evaluation, reviews: Review[]) {
  const problems: string[] = [];
  if (
    result.caseId !== c.id ||
    result.sourceSha256 !== c.sourceSha256 ||
    result.rubricSha256 !== sha256(JSON.stringify(c.checks))
  )
    problems.push('运行结果与当前冻结案例或评审规则不匹配。');
  const valid = reviews.filter(
    (r) =>
      r.caseId === c.id &&
      r.artifactSha256 === result.evidence.sha256 &&
      r.sourceSha256 === c.sourceSha256 &&
      r.rubricSha256 === result.rubricSha256 &&
      r.reviewer?.trim(),
  );
  if (new Set(valid.map((r) => r.reviewer)).size < 2)
    problems.push('需要两位不同评审者的独立记录。');
  if (
    !result.configuration.ratioMatches ||
    result.configuration.pageCountMatches === false
  )
    problems.push('输出比例或固定页数不匹配。');
  const checks = c.checks.map((check) => {
    const records = valid.map((r) => r.checks.filter((v) => v.id === check.id));
    const complete =
      records.length >= 2 &&
      records.every(
        (v) =>
          v.length === 1 &&
          ['pass', 'fail'].includes(v[0]!.verdict) &&
          v[0]!.evidence.trim() &&
          v[0]!.reason.trim() &&
          v[0]!.pages.length &&
          v[0]!.pages.every(
            (p) =>
              Number.isInteger(p) &&
              p > 0 &&
              p <= result.evidence.slides.length,
          ),
      );
    const verdicts = records.flatMap((v) => v.map((v) => v.verdict));
    const status = !complete
      ? 'unreviewed'
      : new Set(verdicts).size > 1
        ? 'disputed'
        : verdicts.every((v) => v === 'pass')
          ? 'pass'
          : 'fail';
    return { id: check.id, critical: check.critical, status };
  });
  if (checks.some((c) => c.status !== 'pass'))
    problems.push('仍有失败、分歧或未完成的逐项核对。');
  return {
    status: problems.length ? 'blocked' : 'accepted',
    problems,
    checks,
    reviewerCount: new Set(valid.map((r) => r.reviewer)).size,
  };
}
