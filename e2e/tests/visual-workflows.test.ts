import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const workflowsDir = join(workspaceRoot, '.github', 'workflows');

describe('visual screenshot workflows', () => {
  it('skips R2 work only when screenshot storage is not configured', async () => {
    const baseline = await workflow('visual-baseline.yml');
    const prCapture = await workflow('visual-pr-capture.yml');
    const prComment = await workflow('visual-pr-comment.yml');

    for (const source of [baseline, prCapture, prComment]) {
      const detection = step(source, 'Detect R2 screenshot storage');
      expect(detection).toContain('id: r2');
      expect(detection).toContain('bucket="${R2_BUCKET:-${CLOUDFLARE_R2_RELEASES_BUCKET:-}}"');
      expect(detection).toContain('public_origin="${R2_PUBLIC_ORIGIN:-${CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN:-}}"');
      expect(detection).toContain('access_key_id="${R2_ACCESS_KEY_ID:-${CLOUDFLARE_R2_RELEASES_AK:-}}"');
      expect(detection).toContain('secret_access_key="${R2_SECRET_ACCESS_KEY:-${CLOUDFLARE_R2_RELEASES_SK:-}}"');
      expect(detection).toContain('endpoint="${R2_ENDPOINT:-${CLOUDFLARE_R2_RELEASES_URL:-}}"');
      expect(detection).toContain('[ -n "$endpoint" ] || [ -n "${R2_ACCOUNT_ID:-}" ]');
      expect(detection).toContain('configured=true');
      expect(detection).toContain('configured=false');
    }

    expect(step(baseline, 'Upload baseline screenshots to R2')).toContain(
      "if: ${{ steps.r2.outputs.configured == 'true' }}",
    );
    expect(step(prCapture, 'Build visual diff report')).toContain(
      "if: ${{ steps.r2.outputs.configured == 'true' }}",
    );
    expect(step(prCapture, 'Upsert PR comment')).toContain(
      "if: ${{ steps.r2.outputs.configured == 'true' }}",
    );
    expect(step(prComment, 'Build visual diff report')).toContain(
      "steps.r2.outputs.configured == 'true'",
    );
    expect(step(prComment, 'Upsert PR comment')).toContain(
      "steps.r2.outputs.configured == 'true'",
    );
  });

  it('does not mask screenshot capture or R2 upload failures', async () => {
    for (const name of ['visual-baseline.yml', 'visual-pr-capture.yml', 'visual-pr-comment.yml']) {
      expect(await workflow(name)).not.toContain('continue-on-error: true');
    }

    const prCapture = await workflow('visual-pr-capture.yml');
    expect(step(prCapture, 'Write capture manifest')).toContain('if: ${{ always() }}');
  });
});

async function workflow(name: string): Promise<string> {
  return readFile(join(workflowsDir, name), 'utf8');
}

function step(source: string, name: string): string {
  const match = source.match(new RegExp(`      - name: ${name}\\n[\\s\\S]*?(?=\\n      - name:|$)`, 'u'));
  expect(match?.[0], `${name} step`).toBeDefined();
  return match?.[0] ?? '';
}
