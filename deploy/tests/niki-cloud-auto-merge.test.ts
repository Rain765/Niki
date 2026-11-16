import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { autoMerge, eligible, type Api, type CiRun, type PullRequest } from '../scripts/niki-cloud-auto-merge.ts';

const head = 'a'.repeat(40);
const merged = 'b'.repeat(40);
const since = '2026-11-16T00:00:00Z';
const repo = { full_name: 'Rain765/Niki' };
const pull = (): PullRequest => ({ number: 12, state: 'open', draft: false,
  created_at: '2026-11-16T01:00:00Z', user: { login: 'Rain765' },
  head: { sha: head, ref: 'codex/cloud-change', repo }, base: { ref: 'main', repo }, labels: [] });
const ci = (): CiRun => ({ id: 100, workflow_id: 1, event: 'pull_request', status: 'completed',
  conclusion: 'success', head_sha: head, head_branch: 'codex/cloud-change', head_repository: repo });

function fixture() {
  const state = { pr: pull(), run: ci(), latest: ci(), main: merged, mainRuns: [] as CiRun[],
    failure: '', changeOnRefresh: false, prReads: 0 };
  const calls: { method: string; endpoint: string; body?: unknown }[] = [];
  const logs: string[] = [];
  const api: Api = { async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    calls.push({ method, endpoint, body });
    let result: unknown;
    if (method === 'PUT') {
      if (state.failure) throw new Error(state.failure);
      result = { merged: true, sha: merged };
      state.pr.merged = true; state.pr.state = 'closed';
      state.pr.merged_by = { login: 'github-actions[bot]' }; state.pr.merge_commit_sha = merged;
    } else if (method === 'POST') {
      result = undefined;
    } else if (endpoint.endsWith('/ci.yml')) result = { id: 1 };
    else if (endpoint.includes('/actions/runs/')) result = state.run;
    else if (endpoint.includes('/pulls?')) result = [state.pr];
    else if (endpoint.endsWith('/pulls/12')) {
      state.prReads++;
      if (state.changeOnRefresh && state.prReads === 2) state.pr.head.sha = 'c'.repeat(40);
      result = structuredClone(state.pr);
    } else if (endpoint.includes('?event=pull_request')) result = { workflow_runs: [state.latest] };
    else if (endpoint.includes('/git/ref/')) result = { object: { sha: state.main } };
    else if (endpoint.includes('?branch=main')) result = { workflow_runs: state.mainRuns };
    else throw new Error(`Unexpected API request: ${method} ${endpoint}`);
    return structuredClone(result) as T;
  } };
  const options = { api, enabled: 'true', since, eventName: 'workflow_run',
    event: { workflow_run: { id: 100 } }, log: (message: string) => logs.push(message) };
  return { state, calls, options, logs, writes: () => calls.filter(({ method }) => method !== 'GET') };
}

test('only new, owner-authored, same-repository ready codex PRs to main are eligible', () => {
  assert.equal(eligible(pull(), since), true);
  for (const change of [
    (p: PullRequest) => { p.draft = true; },
    (p: PullRequest) => { p.user.login = 'outsider'; },
    (p: PullRequest) => { p.head.repo = { full_name: 'outsider/Niki' }; },
    (p: PullRequest) => { p.head.repo = null; },
    (p: PullRequest) => { p.base.ref = 'release'; },
    (p: PullRequest) => { p.base.repo = { full_name: 'Rain765/Other' }; },
    (p: PullRequest) => { p.head.ref = 'feature/unrequested'; },
    (p: PullRequest) => { p.created_at = '2026-11-15T23:59:59Z'; },
    (p: PullRequest) => { p.created_at = 'invalid'; },
    (p: PullRequest) => { p.labels = [{ name: 'no-automerge' }]; },
    (p: PullRequest) => { p.head.sha = 'not-a-sha'; },
  ]) { const pr = pull(); change(pr); assert.equal(eligible(pr, since), false); }
  assert.equal(eligible(pull(), ''), false);
});

test('merges the checked head without coauthor metadata and dispatches main CI', async () => {
  const f = fixture(); await autoMerge(f.options);
  assert.deepEqual(f.writes().map(({ method }) => method), ['PUT', 'POST']);
  assert.deepEqual(f.writes()[0].body, { sha: head, merge_method: 'merge',
    commit_title: 'Merge cloud PR #12', commit_message: `Validated cloud delivery from ${head}.` });
  assert.match(f.writes()[1].endpoint, /ci.yml\/dispatches$/);
  assert.deepEqual(f.writes()[1].body, { ref: 'main' });
});

test('disabled automation makes no API calls', async () => {
  const f = fixture(); await autoMerge({ ...f.options, enabled: 'false' }); assert.equal(f.calls.length, 0);
});

test('failure, foreign CI, manual CI and a newer failed rerun cannot authorize a merge', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.run.conclusion = 'failure'; },
    (f: ReturnType<typeof fixture>) => { f.state.run.head_repository = { full_name: 'outsider/Niki' }; },
    (f: ReturnType<typeof fixture>) => { f.state.run.event = 'workflow_dispatch'; },
    (f: ReturnType<typeof fixture>) => { f.state.run.workflow_id = 999; },
    (f: ReturnType<typeof fixture>) => { f.state.latest.id = 101; f.state.latest.conclusion = 'failure'; },
    (f: ReturnType<typeof fixture>) => { f.state.latest.status = 'in_progress'; },
    (f: ReturnType<typeof fixture>) => { f.state.pr.head.sha = 'c'.repeat(40); },
    (f: ReturnType<typeof fixture>) => { f.state.changeOnRefresh = true; },
    (f: ReturnType<typeof fixture>) => { f.state.pr.state = 'closed'; },
  ]) { const f = fixture(); change(f); await autoMerge(f.options); assert.equal(f.writes().length, 0); }
});

test('GitHub branch protection rejection stops before CI or deployment dispatch', async () => {
  const f = fixture(); f.state.failure = '403 required checks pending';
  await assert.rejects(autoMerge(f.options), /403/);
  assert.deepEqual(f.writes().map(({ method }) => method), ['PUT']);
});

test('recovery dispatches CI for an already bot-merged PR without merging again', async () => {
  const f = fixture(); Object.assign(f.state.pr, { merged: true, state: 'closed',
    merged_by: { login: 'github-actions[bot]' }, merge_commit_sha: merged });
  await autoMerge({ ...f.options, eventName: 'workflow_dispatch', event: { inputs: { pr_number: '12' } } });
  assert.deepEqual(f.writes().map(({ method }) => method), ['POST']);
});

test('existing main CI and a newer main tip prevent duplicate/stale dispatch', async () => {
  for (const scenario of ['existing', 'newer']) {
    const f = fixture();
    if (scenario === 'existing') f.state.mainRuns = [{ ...ci(), event: 'workflow_dispatch', head_sha: merged }];
    else f.state.main = 'c'.repeat(40);
    await autoMerge(f.options); assert.deepEqual(f.writes().map(({ method }) => method), ['PUT']);
  }
});

test('manual recovery still requires successful PR CI and an eligible PR', async () => {
  const f = fixture(); f.state.latest.conclusion = 'failure';
  await autoMerge({ ...f.options, eventName: 'workflow_dispatch', event: { inputs: { pr_number: '12' } } });
  assert.equal(f.writes().length, 0);
});

test('privileged workflow runs trusted code without PR dependencies or artifacts', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/niki-cloud-auto-merge.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /runs-on: ubuntu-24.04/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /actions: write/);
  assert.doesNotMatch(workflow, /self-hosted|download-artifact|pnpm install|npm install|pull_request_target:/);
});

test('bot-dispatched main CI explicitly hands off production only after all validation gates', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const handoff = workflow.split('\n  niki_production_handoff:\n')[1];
  assert.ok(handoff, 'Bot main CI must not rely on a subsequent workflow_run event');
  assert.match(handoff, /needs: \[validate, tools_workspace_tests, runtime_trace\]/);
  for (const gate of ["github.repository == 'Rain765/Niki'", "github.ref == 'refs/heads/main'",
    "github.event_name == 'workflow_dispatch'", "github.actor == 'github-actions[bot]'",
    "needs.validate.result == 'success'", "needs.tools_workspace_tests.result == 'success'",
    "needs.runtime_trace.result == 'success'", "vars.NIKI_PRODUCTION_AUTO_DEPLOY == 'true'"]) {
    assert.ok(handoff.includes(gate), `Missing production gate: ${gate}`);
  }
  assert.match(handoff, /current_main.*TARGET_SHA/s);
  assert.match(handoff, /gh workflow run niki-production-deploy.yml/);
  assert.match(handoff, /target_sha="\$TARGET_SHA"/);
  assert.doesNotMatch(handoff, /actions\/checkout|self-hosted|--admin/);
});
