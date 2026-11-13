import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const helper = path.resolve(import.meta.dirname, '../scripts/niki-runtime-release-gc.zsh');

test('retains foreign, dirty and unknown releases during the first runner deployment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'niki-release-gc-'));
  const source = path.join(root, 'runner');
  const oldSource = path.join(root, 'manual');
  const releases = path.join(root, 'releases');
  const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, ...args], { stdio: 'pipe' });
  for (const repo of [source, oldSource]) {
    await mkdir(repo, { recursive: true });
    git(repo, 'init');
    await writeFile(path.join(repo, 'package.json'), '{}');
    git(repo, 'add', 'package.json');
    git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture');
  }
  const current = path.join(releases, 'current');
  const rollback = path.join(releases, 'rollback');
  const foreign = path.join(releases, 'foreign');
  const dirty = path.join(releases, 'dirty');
  const unknown = path.join(releases, 'unknown');
  await mkdir(releases);
  for (const target of [current, rollback, dirty]) git(source, 'worktree', 'add', '--detach', target, 'HEAD');
  git(oldSource, 'worktree', 'add', '--detach', foreign, 'HEAD');
  await writeFile(path.join(dirty, 'package.json'), '{"uncommitted":true}');
  await mkdir(unknown);
  await writeFile(path.join(unknown, 'package.json'), '{"unregistered":true}');
  execFileSync('/bin/zsh', ['-c', 'source "$1"; prune_niki_runtime_releases "$2" "$3" "$4" "$5"', 'test', helper, source, releases, current, rollback], { stdio: 'pipe' });
  for (const target of [current, rollback, foreign]) assert.equal(await readFile(path.join(target, 'package.json'), 'utf8'), '{}');
  assert.equal(await readFile(path.join(dirty, 'package.json'), 'utf8'), '{"uncommitted":true}');
  assert.equal(await readFile(path.join(unknown, 'package.json'), 'utf8'), '{"unregistered":true}');
  assert.match(git(oldSource, 'worktree', 'list', '--porcelain').toString(), /releases\/foreign/);
});
