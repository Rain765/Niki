import { expect, it } from 'vitest';
import { acceptance, type Review } from '../../lib/presentations/acceptance.ts';
import { loadCorpus, evaluate } from '../../lib/presentations/evaluation.ts';
it('blocks missing reviews, changed artifacts, conflicts and repeated reviewer identities', async () => {
  const c = (await loadCorpus()).cases[0]!;
  const result = evaluate(c, {
    sha256: 'artifact',
    width: 1600,
    height: 900,
    slides: [{ page: 1, blocks: [c.source], warnings: [] }],
  });
  const review: Review = {
    caseId: c.id,
    artifactSha256: 'artifact',
    sourceSha256: c.sourceSha256,
    rubricSha256: result.rubricSha256,
    reviewer: 'A',
    checks: c.checks.map((check) => ({
      id: check.id,
      verdict: 'pass',
      pages: [1],
      evidence: check.evidence[0]!,
      reason: 'Verified against rendered source evidence.',
    })),
  };
  expect(acceptance(c, result, []).status).toBe('blocked');
  expect(acceptance(c, result, [review, review]).status).toBe('blocked');
  expect(
    acceptance(c, result, [
      review,
      { ...review, reviewer: 'B', artifactSha256: 'old' },
    ]).status,
  ).toBe('blocked');
  const second = structuredClone(review);
  second.reviewer = 'B';
  second.checks[0]!.verdict = 'fail';
  expect(acceptance(c, result, [review, second]).checks[0]!.status).toBe(
    'disputed',
  );
  second.checks[0]!.verdict = 'pass';
  expect(acceptance(c, result, [review, second]).status).toBe('accepted');
  expect(
    acceptance(c, { ...result, sourceSha256: 'changed' }, [review, second])
      .status,
  ).toBe('blocked');
  expect(
    acceptance(c, { ...result, caseId: 'another-case' }, [review, second])
      .status,
  ).toBe('blocked');
});
