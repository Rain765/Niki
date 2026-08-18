import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import { registerNikiAuthRoutes } from '../src/niki-auth-routes.js';

describe('Niki Feishu authentication routes', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;

  async function loginFirstFeishuUser(): Promise<string> {
    const start = await fetch(`${baseUrl}/api/auth/feishu/start`, {
      redirect: 'manual',
    });
    const stateCookie = start.headers.get('set-cookie') ?? '';
    const state = new URL(start.headers.get('location') ?? '')
      .searchParams.get('state') ?? '';
    const callback = await fetch(
      `${baseUrl}/api/auth/feishu/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
      {
        redirect: 'manual',
        headers: { cookie: stateCookie.split(';')[0] ?? '' },
      },
    );
    return callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'niki-auth-routes-'));
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const app = express();
    app.use(express.json());
    const feishuFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'temporary-feishu-access-token',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: {
          tenant_key: 'tenant-a',
          open_id: 'open-first',
          union_id: 'union-first',
          name: 'First teammate',
          avatar_url: 'https://example.test/avatar.png',
        },
      }), { status: 200 }));

    registerNikiAuthRoutes(app, {
      db,
      projectsRoot: path.join(tempDir, 'projects'),
      fetchImpl: feishuFetch,
      isLocalOperatorRequest: (req) =>
        req.get('x-test-local-operator') === 'yes',
      env: {
        NIKI_AUTH_MODE: 'feishu',
        NIKI_PUBLIC_URL: 'https://niki.example.test',
        FEISHU_APP_ID: 'cli_test_app_id',
        FEISHU_APP_SECRET: 'test-secret',
      },
    });
    app.get('/api/private', (_req, res) => res.json({ ok: true }));
    app.post('/api/daemon/db/verify', (_req, res) => res.json({ ok: true }));

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('completes OAuth, creates an HttpOnly session, and protects business APIs', async () => {
    const beforeLogin = await fetch(`${baseUrl}/api/private`);
    expect(beforeLogin.status).toBe(401);

    const start = await fetch(
      `${baseUrl}/api/auth/feishu/start?returnTo=%2F`,
      { redirect: 'manual' },
    );
    expect(start.status).toBe(302);
    const stateCookie = start.headers.get('set-cookie') ?? '';
    const state = new URL(start.headers.get('location') ?? '')
      .searchParams.get('state');
    expect(stateCookie).toContain('niki_oauth_state=');
    expect(stateCookie).toContain('HttpOnly');
    expect(state).toBeTruthy();
    expect(new Set(
      new URL(start.headers.get('location') ?? '').searchParams.get('scope')?.split(' '),
    )).toEqual(new Set([
      'auth:user.id:read',
      'search:docs:read',
      'docs:document.content:read',
      'offline_access',
    ]));

    const callback = await fetch(
      `${baseUrl}/api/auth/feishu/callback?code=oauth-code&state=${encodeURIComponent(state ?? '')}`,
      {
        redirect: 'manual',
        headers: {
          cookie: stateCookie.split(';')[0] ?? '',
        },
      },
    );
    expect(callback.status).toBe(302);
    const sessionCookie = callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='));
    expect(sessionCookie).toContain('HttpOnly');

    const authenticatedCookie = sessionCookie?.split(';')[0] ?? '';
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: authenticatedCookie },
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      user: {
        name: 'First teammate',
        role: 'admin',
      },
    });

    const afterLogin = await fetch(`${baseUrl}/api/private`, {
      headers: { cookie: authenticatedCookie },
    });
    expect(afterLogin.status).toBe(200);
  });

  it('allows only strict local operator routes to bypass the web session', async () => {
    const blockedMaintenance = await fetch(`${baseUrl}/api/daemon/db/verify`, {
      method: 'POST',
    });
    expect(blockedMaintenance.status).toBe(401);

    const localMaintenance = await fetch(`${baseUrl}/api/daemon/db/verify`, {
      method: 'POST',
      headers: { 'x-test-local-operator': 'yes' },
    });
    expect(localMaintenance.status).toBe(200);

    const privateRoute = await fetch(`${baseUrl}/api/private`, {
      headers: { 'x-test-local-operator': 'yes' },
    });
    expect(privateRoute.status).toBe(401);
  });

  it('reports and updates per-user quotas through authenticated admin APIs', async () => {
    const start = await fetch(`${baseUrl}/api/auth/feishu/start`, {
      redirect: 'manual',
    });
    const stateCookie = start.headers.get('set-cookie') ?? '';
    const state = new URL(start.headers.get('location') ?? '')
      .searchParams.get('state');
    const callback = await fetch(
      `${baseUrl}/api/auth/feishu/callback?code=oauth-code&state=${encodeURIComponent(state ?? '')}`,
      {
        redirect: 'manual',
        headers: { cookie: stateCookie.split(';')[0] ?? '' },
      },
    );
    const sessionCookie = callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';

    const quota = await fetch(`${baseUrl}/api/auth/quota`, {
      headers: { cookie: sessionCookie },
    });
    expect(quota.status).toBe(200);
    const initial = await quota.json() as {
      userId: string;
      quota: { storageBytes: number; dailyGenerations: number };
    };
    expect(initial.quota.storageBytes).toBeGreaterThan(0);
    expect(initial.quota.dailyGenerations).toBeGreaterThan(0);

    const updated = await fetch(
      `${baseUrl}/api/auth/users/${encodeURIComponent(initial.userId)}/quota`,
      {
        method: 'PATCH',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          storageBytes: 123_456,
          dailyGenerations: 7,
        }),
      },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      quota: {
        storageBytes: 123_456,
        dailyGenerations: 7,
      },
    });

    const users = await fetch(`${baseUrl}/api/auth/users`, {
      headers: { cookie: sessionCookie },
    });
    expect(users.status).toBe(200);
    await expect(users.json()).resolves.toMatchObject({
      users: [{
        provider: 'feishu',
        quota: {
          storageBytes: 123_456,
          dailyGenerations: 7,
        },
      }],
    });
  });

  it('lets the first Feishu administrator create password member accounts', async () => {
    const adminCookie = await loginFirstFeishuUser();
    const weakPassword = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'weak.member',
        name: '弱密码成员',
        password: '1234567',
      }),
    });
    expect(weakPassword.status).toBe(400);
    await expect(weakPassword.json()).resolves.toMatchObject({
      code: 'weak-password',
    });

    const created = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'member.one',
        name: '成员一号',
        password: 'member-password',
      }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      account: {
        username: 'member.one',
        user: { name: '成员一号', role: 'member' },
      },
    });

    const memberLogin = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'member.one',
        password: 'member-password',
      }),
    });
    expect(memberLogin.status).toBe(200);
    const memberCookie = memberLogin.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';
    const forbidden = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: memberCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'not-allowed',
        name: '不能创建',
        password: 'member-password',
      }),
    });
    expect(forbidden.status).toBe(403);
  });
});
