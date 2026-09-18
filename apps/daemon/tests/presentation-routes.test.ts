import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import type {
  PresentationDeck,
  PresentationJob,
  PresentationListResponse,
  NativePresentationInspectionJob,
} from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, updateProject } from '../src/db.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import { upsertFeishuUser } from '../src/niki-auth.js';
import { getNikiQuotaStatus } from '../src/niki-quota.js';
import { registerPresentationRoutes } from '../src/presentation-routes.js';

describe('document to PPT HTTP workflow', () => {
  let server: Server | undefined;
  let root = '';
  afterEach(async () => {
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    closeDatabase();
    if (root) await rm(root, { recursive: true, force: true });
  });
  it('returns an owned async native inspection job before rendering completes and persists its report', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'niki-native-inspect-http-'));
    const db = openDatabase(root, { dataDir: root });
    const owner = upsertFeishuUser(db, {tenantKey:'test',openId:'owner',name:'Owner'});
    const other = upsertFeishuUser(db, {tenantKey:'test',openId:'other',name:'Other'});
    runAsNikiUser(owner, () => insertProject(db, {id:'deck',name:'Public deck',skillId:'html-ppt',createdAt:1,updatedAt:1}));
    const app=express(); app.use(express.json());
    app.use((req,_res,next)=>runAsNikiUser(req.headers['x-test-user']==='other'?other:owner,next));
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    registerPresentationRoutes(app, {db,projectRoot:root,projectsRoot:path.join(root,'projects'),inspectNative:async ({save})=>{
      await gate;
      const report={version:1 as const,entry:'index.html',sourceHash:'abc',resourceHashes:{},stale:false,viewport:{width:1280,height:720},reportFile:'native-review/report.json',visualReviewRequired:true as const,slides:[],blockedResources:[],failedResources:[]};
      await save(report.reportFile,Buffer.from(JSON.stringify(report)));
      return report;
    }});
    server=createServer(app);
    await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const start=()=>fetch(`${base}/api/projects/deck/native-presentation/inspect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:'index.html'})});
    const response=await start(); expect(response.status).toBe(202);
    const job=await response.json() as NativePresentationInspectionJob;
    expect(job.status).toBe('running');
    const url=`${base}/api/projects/deck/native-presentation/inspections/${job.id}`;
    expect((await fetch(url,{headers:{'x-test-user':'other'}})).status).toBe(404);
    expect(await (await start()).json()).toMatchObject({id:job.id,status:'running'});
    release();
    await expect.poll(async()=>((await (await fetch(url)).json()) as NativePresentationInspectionJob).status).toBe('completed');
    const saved=JSON.parse(await readFile(path.join(root,'projects/deck/native-review/report.json'),'utf8'));
    expect(saved.visualReviewRequired).toBe(true);
  });
  it('persists an owned job, prevents duplicate generation, saves revisions and recovers interrupted work', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'niki-ppt-http-'));
    const db = openDatabase(root, { dataDir: root });
    const owner = upsertFeishuUser(db, {
      tenantKey: 'test',
      openId: 'owner',
      name: 'Owner',
    });
    const other = upsertFeishuUser(db, {
      tenantKey: 'test',
      openId: 'other',
      name: 'Other',
    });
    const projectsRoot = path.join(root, 'projects');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) =>
      runAsNikiUser(
        req.headers['x-test-user'] === 'other' ? other : owner,
        next,
      ),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const deck: PresentationDeck = {
      title: 'Architecture',
      slides: Array.from({ length: 5 }, (_, index) => ({
        layout: index === 0 ? 'cover' : 'overview',
        title: `Architecture ${index + 1}`,
        subtitle: 'A documented workflow',
        items:
          index === 0
            ? []
            : [
                { id: 'a', title: 'Input', body: 'Uploaded document' },
                { id: 'b', title: 'Output', body: 'Editable presentation' },
              ],
        edges: [],
        notes: 'Source: uploaded text',
      })),
    };
    registerPresentationRoutes(app, {
      db,
      projectsRoot,
      projectRoot: root,
      generate: async ({ onUsage }) => {
        calls += 1;
        await gate;
        await onUsage({
          model: 'gpt-5.6-terra',
          inputTokens: 1234,
          cachedInputTokens: 0,
          outputTokens: 456,
          reasoningTokens: 32,
          estimatedUsd: 0.00794,
          pricingDate: '2026-09-11',
        });
        return deck;
      },
    });
    server = createServer(app);
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No HTTP address');
    const base = `http://127.0.0.1:${address.port}`;
    const upload = () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([
          'This document describes the upload, analysis, layout and export workflow.',
        ]),
        '系统架构.md',
      );
      form.append(
        'options',
        JSON.stringify({
          palette: 'blue',
          ratio: '16:9',
          pageCount: 5,
          prompt: 'Show the workflow.',
        }),
      );
      return form;
    };
    const response = await fetch(`${base}/api/presentations`, {
      method: 'POST',
      body: upload(),
    });
    expect(response.status).toBe(202);
    const started = (await response.json()) as PresentationJob;
    expect(started.sourceName).toBe('系统架构.md');
    const url = `${base}/api/projects/${started.projectId}/presentation`;
    const duplicate = await fetch(`${base}/api/presentations`, {
      method: 'POST',
      body: upload(),
    });
    expect(duplicate.status).toBe(429);
    expect(
      (await fetch(url, { headers: { 'x-test-user': 'other' } })).status,
    ).toBe(404);
    expect(
      (
        (await (
          await fetch(`${base}/api/presentations`, {
            headers: { 'x-test-user': 'other' },
          })
        ).json()) as PresentationListResponse
      ).presentations,
    ).toEqual([]);
    release();
    await expect
      .poll(
        async () =>
          ((await (await fetch(url)).json()) as PresentationJob).status,
      )
      .toBe('complete');
    const completed = (await (await fetch(url)).json()) as PresentationJob;
    expect(completed.deck?.slides).toHaveLength(5);
    expect(completed.usage?.outputTokens).toBe(456);
    expect(
      (
        await readFile(
          path.join(projectsRoot, started.projectId, completed.pptx!),
        )
      )
        .subarray(0, 2)
        .toString(),
    ).toBe('PK');
    const edit = {
      revision: completed.revision,
      slideIndex: 1,
      slide: { ...completed.deck!.slides[1], title: 'Reviewed architecture' },
    };
    const edited = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edit),
    });
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as PresentationJob).revision).toBe(2);
    expect(
      (
        await fetch(url, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(edit),
        })
      ).status,
    ).toBe(409);
    expect(calls).toBe(1);
    expect(
      (await getNikiQuotaStatus(db, projectsRoot, owner.id)).usage
        .dailyGenerations,
    ).toBe(1);
    // Simulate persisted in-flight state from a previous process; no active job owns it now.
    const denseSlide = completed.deck!.slides[1]!;
    denseSlide.layout = 'comparison';
    denseSlide.items = denseSlide.items.map((item) => ({
      ...item,
      body: '保留业务条件以及说明。'.repeat(32),
    }));
    runAsNikiUser(owner, () =>
      updateProject(db, started.projectId, {
        metadata: {
          kind: 'deck',
          presentation: { ...completed, status: 'generating' },
        },
      }),
    );
    const recovered = (await (await fetch(url)).json()) as PresentationJob;
    expect(recovered.status).toBe('failed');
    expect(recovered.error).toContain('restarted');
    expect(recovered.usage?.outputTokens).toBe(456);
    const repairedResponse = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        revision: recovered.revision,
        slideIndex: 0,
        slide: recovered.deck!.slides[0],
      }),
    });
    expect(repairedResponse.status).toBe(200);
    const repaired = (await repairedResponse.json()) as PresentationJob;
    expect(repaired.status).toBe('complete');
    expect(repaired.error).toBeUndefined();
    expect(repaired.html).toMatch(/presentation\.html$/);
    expect(repaired.usage).toEqual(recovered.usage);
    expect(repaired.deck!.slides[1]!.layout).toBe('editorial');
    expect(repaired.deck!.slides[1]!.items).toEqual(denseSlide.items);
    expect(calls).toBe(1);
  });
  it('requires plan confirmation, rejects stale actions and clears acceptance after editing', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'niki-ppt-plan-'));
    const db = openDatabase(root, { dataDir: root });
    const owner = upsertFeishuUser(db, {
      tenantKey: 'test',
      openId: 'planner',
      name: 'Planner',
    });
    const app = express();
    app.use(express.json());
    app.use((_req, _res, next) => runAsNikiUser(owner, next));
    const deck: PresentationDeck = {
      title: 'Plan',
      slides: Array.from({ length: 5 }, (_, index) => ({
        title: `Page ${index + 1}`,
        subtitle: '',
        layout: index ? 'editorial' : 'cover',
        templateId: index ? 'E-report' : 'S01',
        items: [
          {
            id: 'a',
            title: 'Cost',
            body: 'The fee is 45 USD per month. Approval is mandatory before delivery.',
          },
        ],
        edges: [],
        notes: '',
        sourceRefs: [1],
        factIds: ['F1'],
      })),
    };
    let generations = 0;
    registerPresentationRoutes(app, {
      db,
      projectRoot: root,
      projectsRoot: path.join(root, 'projects'),
      plan: async () => deck,
      generate: async () => {
        generations++;
        return structuredClone(deck);
      },
      review: async ({ quality }) => quality,
    });
    server = createServer(app);
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    const base = `http://127.0.0.1:${address.port}`;
    const form = new FormData();
    form.append(
      'file',
      new Blob([
        'The fee is 45 USD per month. Approval is mandatory before delivery.',
      ]),
      'plan.md',
    );
    form.append(
      'options',
      JSON.stringify({
        palette: 'blue',
        ratio: '16:9',
        pageCount: 5,
        reviewPlan: true,
        prompt: '',
      }),
    );
    const started = (await (
      await fetch(base + '/api/presentations', { method: 'POST', body: form })
    ).json()) as PresentationJob;
    const url = `${base}/api/projects/${started.projectId}/presentation`;
    const read = async () =>
      (await (await fetch(url)).json()) as PresentationJob;
    await expect.poll(async () => (await read()).status).toBe('awaiting-plan');
    expect(generations).toBe(0);
    const act = (body: object) =>
      fetch(url + '/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await act({ action: 'continue', revision: 0 })).status).toBe(409);
    expect(
      (await act({ action: 'continue', revision: 1, plan: { slides: [] } }))
        .status,
    ).toBe(400);
    expect((await act({ action: 'continue', revision: 1 })).status).toBe(202);
    await expect
      .poll(async () => (await read()).status, { timeout: 15000 })
      .toBe('complete');
    const complete = await read();
    expect(generations).toBe(1);
    expect(complete.quality?.status).toBe('needs-review');
    expect(
      (
        await act({
          action: 'accept-review',
          revision: complete.revision,
          note: 'Checked source and rendered pages.',
        })
      ).status,
    ).toBe(200);
    const accepted = await read();
    expect(accepted.quality?.humanReview?.verdict).toBe('accepted');
    const edited = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        revision: accepted.revision,
        slideIndex: 1,
        slide: { ...accepted.deck!.slides[1], title: 'Revised title' },
      }),
    });
    expect(edited.status).toBe(200);
    const result = (await edited.json()) as PresentationJob;
    expect(result.quality?.status).toBe('needs-review');
    expect(result.quality?.humanReview).toBeUndefined();
    expect(result.pageDrafts).toBeUndefined();
  }, 30000);
});
