import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import { registerFeishuDocumentRoutes } from '../src/feishu-document-routes.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';
import {
  saveFeishuOAuthCredential,
  upsertFeishuUser,
} from '../src/niki-auth.js';

describe('Feishu document search routes', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;
  let feishuFetch: typeof fetch;
  let db: ReturnType<typeof openDatabase>;
  let user: ReturnType<typeof upsertFeishuUser>;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'feishu-document-routes-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    user = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-a',
      name: 'Rain',
    });
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'user-access-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'search:docs:read',
    });
    feishuFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        total: 1,
        has_more: false,
        res_units: [{
          title_highlighted: '<h>Launch</h> plan',
          summary_highlighted: 'Rollout details',
          entity_type: 'DOC',
          result_meta: {
            update_time: 1_786_944_000,
            url: 'https://acme.feishu.cn/docx/LaunchPlan123',
            owner_name: 'Rain',
          },
        }],
      },
    }), { status: 200 }));

    const app = express();
    app.use(express.json());
    app.use('/api', (_req, _res, next) => runAsNikiUser(user, () => next()));
    registerFeishuDocumentRoutes(app, { db, fetchImpl: feishuFetch });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('searches with the current user token and returns safe result metadata', async () => {
    const response = await fetch(`${baseUrl}/api/feishu/documents/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'launch plan', pageSize: 12 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      query: 'launch plan',
      results: [{
        title: '<h>Launch</h> plan',
        summary: 'Rollout details',
        url: 'https://acme.feishu.cn/docx/LaunchPlan123',
        ownerName: 'Rain',
        updatedAt: 1_786_944_000,
        entityType: 'DOC',
      }],
      total: 1,
      hasMore: false,
    });
    expect(feishuFetch).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/search/v2/doc_wiki/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer user-access-token',
        }),
      }),
    );
  });

  it('rejects an empty query before contacting Feishu', async () => {
    const response = await fetch(`${baseUrl}/api/feishu/documents/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_QUERY' });
    expect(feishuFetch).not.toHaveBeenCalled();
  });

  it('reads a pasted docx link with content-read scope and without search scope', async () => {
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'document-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'docx:document:readonly',
    });
    vi.mocked(feishuFetch)
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { content: 'Launch plan\nShip on Friday.' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { document: { title: 'Launch plan' } },
      }), { status: 200 }));

    const response = await fetch(`${baseUrl}/api/feishu/documents/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://acme.feishu.cn/docx/LaunchPlan123' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://acme.feishu.cn/docx/LaunchPlan123',
      documentId: 'LaunchPlan123',
      sourceType: 'docx',
      title: 'Launch plan',
      content: 'Launch plan\nShip on Friday.',
      truncated: false,
    });
    expect(feishuFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(feishuFetch).mock.calls.every(
      ([url]) => !String(url).includes('/search/'),
    )).toBe(true);
  });

  it('requires reauthorization when the credential only has the legacy document scope', async () => {
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'legacy-document-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'docs:document.content:read',
    });
    vi.mocked(feishuFetch).mockClear();

    const response = await fetch(`${baseUrl}/api/feishu/documents/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://acme.feishu.cn/docx/LaunchPlan123' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEISHU_AUTH_REQUIRED',
      reconnectUrl: expect.stringContaining('capability=read'),
    });
    expect(feishuFetch).not.toHaveBeenCalled();
  });

  it('surfaces Feishu action privilege errors as a reauthorization prompt', async () => {
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'document-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'docx:document:readonly',
    });
    const permissionResponse = () => new Response(JSON.stringify({
      code: 99991679,
      msg: 'Unauthorized. required privilege: docx:document:readonly',
    }), { status: 400 });
    vi.mocked(feishuFetch)
      .mockReset()
      .mockResolvedValueOnce(permissionResponse())
      .mockResolvedValueOnce(permissionResponse());

    const response = await fetch(`${baseUrl}/api/feishu/documents/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://acme.feishu.cn/docx/LaunchPlan123' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEISHU_AUTH_REQUIRED',
      reconnectUrl: expect.stringContaining('capability=read'),
    });
  });

  it('asks for search permission when a content-only credential performs a keyword search', async () => {
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'document-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'docx:document:readonly',
    });
    vi.mocked(feishuFetch).mockClear();

    const response = await fetch(`${baseUrl}/api/feishu/documents/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'launch' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEISHU_AUTH_REQUIRED',
      reconnectUrl: expect.stringContaining('capability=search'),
    });
    expect(feishuFetch).not.toHaveBeenCalled();
  });

  it('resolves a wiki link with the minimal wiki and document read scopes', async () => {
    saveFeishuOAuthCredential(db, user.id, {
      accessToken: 'wiki-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      scope: 'docx:document:readonly wiki:node:read',
    });
    vi.mocked(feishuFetch)
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: {
          node: {
            obj_type: 'docx',
            obj_token: 'ResolvedDoc123',
            title: 'Wiki launch plan',
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { content: 'Resolved wiki content' },
      }), { status: 200 }));

    const response = await fetch(`${baseUrl}/api/feishu/documents/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://acme.feishu.cn/wiki/WikiNode123' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      documentId: 'ResolvedDoc123',
      sourceType: 'wiki',
      title: 'Wiki launch plan',
      content: 'Resolved wiki content',
    });
  });
});
