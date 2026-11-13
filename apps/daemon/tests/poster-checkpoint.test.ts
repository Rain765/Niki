import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { posterCheckpoint } from '../src/poster-checkpoint.js';

describe('poster provider checkpoints', () => {
  it('buys a new candidate for a new task but resumes the same task without a provider call', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'poster-generation-scope-'));
    try {
      const render = vi.fn().mockResolvedValueOnce({ bytes: Buffer.from('rejected'), providerNote: 'first' })
        .mockResolvedValueOnce({ bytes: Buffer.from('new'), providerNote: 'second' });
      await posterCheckpoint(dir, 'same-output-and-settings', false, 'task-a').render('same-prompt', render);
      const fresh = await posterCheckpoint(dir, 'same-output-and-settings', false, 'task-b').render('same-prompt', render);
      expect(fresh.bytes.toString()).toBe('new');
      expect(render).toHaveBeenCalledTimes(2);
      const forbidden = vi.fn();
      expect(await posterCheckpoint(dir, 'same-output-and-settings', true, 'task-b').render('same-prompt', forbidden)).toEqual(fresh);
      await expect(posterCheckpoint(dir, 'same-output-and-settings', true, 'task-c').render('same-prompt', forbidden))
        .rejects.toMatchObject({ code: 'poster_checkpoint_missing' });
      expect(forbidden).not.toHaveBeenCalled();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('saves exact bytes and resumes them in a new instance without a provider call', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'poster-checkpoint-test-'));
    try {
      const result = { bytes: Buffer.from('paid provider image'), providerNote: 'openai/model', suggestedExt: '.png' };
      const render = vi.fn(async () => result);
      expect(await posterCheckpoint(dir, 'brand+output+settings').render('prompt', render)).toEqual(result);
      const replay = vi.fn(async () => { throw new Error('must never buy an image'); });
      expect(await posterCheckpoint(dir, 'brand+output+settings', true).render('prompt', replay)).toEqual(result);
      expect(render).toHaveBeenCalledTimes(1);
      expect(replay).not.toHaveBeenCalled();
      expect(await readdir(dir)).toEqual(['.poster-checkpoints']);
      await expect(posterCheckpoint(dir, 'another brand', true).render('prompt', replay)).rejects.toMatchObject({ code: 'poster_checkpoint_missing' });
      await expect(posterCheckpoint(dir, 'brand+output+settings', true).render('changed prompt', replay)).rejects.toMatchObject({ code: 'poster_checkpoint_missing' });
      expect(replay).not.toHaveBeenCalled();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('stores provider bytes in the private checkpoint directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'poster-checkpoint-test-'));
    try {
      const checkpoint = posterCheckpoint(dir, 'output');
      await checkpoint.render('prompt', async () => ({ bytes: Buffer.from('base'), providerNote: 'provider' }));
      const sub = (await readdir(path.join(dir, '.poster-checkpoints')))[0]!;
      const name = (await readdir(path.join(dir, '.poster-checkpoints', sub)))[0]!;
      expect(JSON.parse(await readFile(path.join(dir, '.poster-checkpoints', sub, name), 'utf8')).base64).toBe(Buffer.from('base').toString('base64'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
