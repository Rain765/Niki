import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PNG} from 'pngjs';
import {expect,it} from 'vitest';
import type {NativePresentationInspection} from '@open-design/contracts';
import {extractNativeEvidence} from '../../lib/presentations/native-evidence.ts';
import {sha256} from '../../lib/presentations/evaluation.ts';

it('binds native evaluations to source, dependencies and ordered rendered pages', async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'native-evidence-'));
  const report:NativePresentationInspection={version:1,entry:'index.html',sourceHash:sha256('source'),resourceHashes:{'style.css':sha256('style')},stale:false,viewport:{width:2,height:1},reportFile:'review/report.json',visualReviewRequired:true,slides:[{page:1,text:'金额 42\n条件完整',screenshot:'review/page-01.png',issues:[]}],failedResources:[],blockedResources:[]};
  try {
    await mkdir(path.join(root,'review'));
    await writeFile(path.join(root,'index.html'),'source');await writeFile(path.join(root,'style.css'),'style');
    await writeFile(path.join(root,'review/page-01.png'),PNG.sync.write(new PNG({width:2,height:1})));
    const initial=await extractNativeEvidence(report,root);
    expect(initial.evidence.slides[0]!.blocks).toEqual(['金额 42','条件完整']);
    const changed = new PNG({width:2,height:1}); changed.data.fill(255);
    await writeFile(path.join(root,'review/page-01.png'),PNG.sync.write(changed));
    expect((await extractNativeEvidence(report,root)).evidence.sha256).not.toBe(initial.evidence.sha256);
    await writeFile(path.join(root,'style.css'),'changed');
    await expect(extractNativeEvidence(report,root)).rejects.toThrow('Changed native resource');
    await expect(extractNativeEvidence({...report,stale:true},root)).rejects.toThrow('stale');
  } finally {await rm(root,{recursive:true,force:true});}
});
