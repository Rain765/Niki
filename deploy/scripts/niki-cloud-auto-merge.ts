import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const repository = 'Rain765/Niki';
const prefix = `/repos/${repository}`;
const shaPattern = /^[a-f0-9]{40}$/;

export interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
  created_at: string;
  user: { login: string };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { ref: string; repo: { full_name: string } };
  labels: { name: string }[];
  merged?: boolean;
  merged_by?: { login: string } | null;
  merge_commit_sha?: string | null;
}

export interface CiRun {
  id: number;
  workflow_id: number;
  event: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  head_repository: { full_name: string } | null;
}

export interface Api {
  request<T>(method: string, endpoint: string, body?: unknown): Promise<T>;
}

interface Options {
  api: Api;
  enabled: string;
  since: string;
  eventName: string;
  event: { workflow_run?: { id: number }; inputs?: { pr_number?: string } };
  log: (message: string) => void;
}

export function eligible(pr: PullRequest, since: string): boolean {
  const cutoff = Date.parse(since);
  const created = Date.parse(pr.created_at);
  return Number.isFinite(cutoff) && Number.isFinite(created) && created >= cutoff
    && pr.user.login === 'Rain765'
    && pr.head.repo?.full_name === repository
    && pr.base.repo.full_name === repository && pr.base.ref === 'main'
    && pr.head.ref.startsWith('codex/') && shaPattern.test(pr.head.sha)
    && !pr.draft && !pr.labels.some(({ name }) => name === 'no-automerge');
}

export async function autoMerge(options: Options): Promise<void> {
  const { api, log } = options;
  if (options.enabled !== 'true' || !Number.isFinite(Date.parse(options.since))) {
    log('Auto-merge is disabled or its activation timestamp is missing.');
    return;
  }
  const workflow = await api.request<{ id: number }>('GET', `${prefix}/actions/workflows/ci.yml`);
  let candidates: PullRequest[];
  let triggeringRun: CiRun | undefined;
  if (options.eventName === 'workflow_run' && options.event.workflow_run) {
    triggeringRun = await api.request<CiRun>('GET', `${prefix}/actions/runs/${options.event.workflow_run.id}`);
    if (triggeringRun.workflow_id !== workflow.id || triggeringRun.event !== 'pull_request'
      || triggeringRun.status !== 'completed' || triggeringRun.conclusion !== 'success'
      || triggeringRun.head_repository?.full_name !== repository) {
      log('Ignoring an unsuccessful, foreign or non-PR CI run.');
      return;
    }
    // Include merged PRs so rerunning a failed dispatch can recover without remerging.
    candidates = await api.request<PullRequest[]>('GET', `${prefix}/pulls?state=all&base=main&head=${encodeURIComponent(`Rain765:${triggeringRun.head_branch}`)}&per_page=100`);
    candidates = candidates.filter((pr) => pr.head.sha === triggeringRun?.head_sha);
  } else if (options.eventName === 'workflow_dispatch') {
    const number = options.event.inputs?.pr_number ?? '';
    if (!/^[1-9]\d*$/.test(number)) throw new Error('A valid PR number is required.');
    candidates = [await api.request<PullRequest>('GET', `${prefix}/pulls/${number}`)];
  } else {
    log('Unsupported event; no mutation performed.');
    return;
  }

  for (const candidate of candidates) {
    let pr = await api.request<PullRequest>('GET', `${prefix}/pulls/${candidate.number}`);
    if (!eligible(pr, options.since) || (triggeringRun && pr.head.sha !== triggeringRun.head_sha)) {
      log(`PR #${pr.number} is outside the enabled cloud delivery scope.`);
      continue;
    }
    if (pr.state !== 'open' && !(pr.merged && pr.merged_by?.login === 'github-actions[bot]')) {
      log(`PR #${pr.number} is closed; no mutation performed.`);
      continue;
    }
    const runs = await api.request<{ workflow_runs: CiRun[] }>('GET', `${prefix}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`);
    const latest = runs.workflow_runs.filter((run) => run.head_sha === pr.head.sha)
      .sort((a, b) => b.id - a.id)[0];
    if (!latest || latest.workflow_id !== workflow.id || latest.event !== 'pull_request'
      || latest.head_repository?.full_name !== repository || latest.status !== 'completed'
      || latest.conclusion !== 'success' || (triggeringRun && latest.id !== triggeringRun.id)) {
      log(`PR #${pr.number} does not have successful current-head PR CI.`);
      continue;
    }

    const checkedSha = pr.head.sha;
    // Refresh draft/hold/base/head immediately before the SHA-conditional merge.
    pr = await api.request<PullRequest>('GET', `${prefix}/pulls/${pr.number}`);
    if (!eligible(pr, options.since) || pr.head.sha !== checkedSha) {
      log(`PR #${pr.number} changed during validation; waiting for fresh CI.`);
      continue;
    }
    let mergedSha = pr.merge_commit_sha;
    if (!pr.merged) {
      if (pr.state !== 'open') continue;
      // GitHub enforces required checks, review requirements and up-to-date rules.
      // No admin bypass, squash, rebase, branch deletion or force update is used.
      const result = await api.request<{ merged: boolean; sha: string }>('PUT', `${prefix}/pulls/${pr.number}/merge`, {
        sha: checkedSha,
        merge_method: 'merge',
        commit_title: `Merge cloud PR #${pr.number}`,
        commit_message: `Validated cloud delivery from ${checkedSha}.`,
      });
      if (!result.merged) throw new Error(`GitHub refused to merge PR #${pr.number}.`);
      mergedSha = result.sha;
      log(`Merged PR #${pr.number} at ${mergedSha}.`);
    } else if (pr.merged_by?.login !== 'github-actions[bot]') {
      continue;
    }
    if (!mergedSha || !shaPattern.test(mergedSha)) throw new Error('Missing merge commit SHA.');
    const main = await api.request<{ object: { sha: string } }>('GET', `${prefix}/git/ref/heads/main`);
    if (main.object.sha !== mergedSha) {
      log('Main has advanced; its newer delivery owns the deployment.');
      continue;
    }
    const mainRuns = await api.request<{ workflow_runs: CiRun[] }>('GET', `${prefix}/actions/workflows/ci.yml/runs?branch=main&head_sha=${mergedSha}&per_page=100`);
    if (mainRuns.workflow_runs.some((run) => run.head_sha === mergedSha
      && (run.event === 'push' || run.event === 'workflow_dispatch'))) {
      log(`Main CI already exists for ${mergedSha}.`);
      continue;
    }
    // GITHUB_TOKEN merges do not emit a new push workflow. Explicit dispatch
    // starts CI; its successful workflow_run triggers the existing Mac deployment.
    await api.request('POST', `${prefix}/actions/workflows/ci.yml/dispatches`, { ref: 'main' });
    log(`Dispatched main CI for ${mergedSha}; production deploy follows successful CI.`);
  }
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== repository) throw new Error('Unexpected repository.');
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('Missing workflow token.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const messages: string[] = [];
  const api: Api = {
    async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
      const response = await fetch(`https://api.github.com${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`GitHub ${method} ${endpoint.split('?')[0]} returned ${response.status}; no protection bypass attempted.`);
      return (response.status === 204 ? undefined : await response.json()) as T;
    },
  };
  try {
    await autoMerge({ api, enabled: process.env.NIKI_CLOUD_AUTO_MERGE ?? '',
      since: process.env.NIKI_CLOUD_AUTO_MERGE_SINCE ?? '',
      eventName: process.env.GITHUB_EVENT_NAME ?? '', event,
      log: (message) => { messages.push(message); console.log(message); } });
  } finally {
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Cloud auto-merge\n\n${messages.join('\n\n')}\n`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
