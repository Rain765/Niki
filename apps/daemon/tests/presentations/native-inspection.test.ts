import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectNativePresentation } from '../../src/presentations/native-inspection.js';

it('rejects paths and symlinks outside the project before rendering or writing review files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-review-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'native-review-outside-'));
  const save = vi.fn();
  try {
    await writeFile(path.join(outside, 'private.html'), 'private');
    await symlink(path.join(outside, 'private.html'), path.join(root, 'link.html'));
    for (const entry of ['../private.html', '/private.html', 'link.html', '.env.html', 'input.pdf']) {
      await expect(inspectNativePresentation({projectDir:root,entry,save})).rejects.toThrow();
    }
    expect(save).not.toHaveBeenCalled();
  } finally { await rm(root,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});

it('invalidates a saved review when its entry or a local dependency changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-review-stale-'));
  const { createHash } = await import('node:crypto');
  const { nativeInspectionIsStale } = await import('../../src/presentations/native-inspection.js');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const report = {version:1 as const,entry:'index.html',sourceHash:digest('original'),resourceHashes:{'theme.css':digest('blue')},stale:false,viewport:{width:1280,height:720},reportFile:'report.json',visualReviewRequired:true as const,slides:[],blockedResources:[],failedResources:[]};
  try {
    await writeFile(path.join(root,'index.html'),'original');
    await writeFile(path.join(root,'theme.css'),'blue');
    expect(await nativeInspectionIsStale(root,report)).toBe(false);
    await writeFile(path.join(root,'theme.css'),'red');
    expect(await nativeInspectionIsStale(root,report)).toBe(true);
    await writeFile(path.join(root,'theme.css'),'blue');
    await writeFile(path.join(root,'index.html'),'edited');
    expect(await nativeInspectionIsStale(root,report)).toBe(true);
  } finally { await rm(root,{recursive:true,force:true}); }
});
