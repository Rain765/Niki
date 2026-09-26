import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';

import { closeDatabase, openDatabase } from '../src/db.js';
import { registerNikiAuthRoutes } from '../src/niki-auth-routes.js';
import { createPasswordUser } from '../src/niki-auth.js';

describe('Niki Feishu authentication routes', () => {
  let tempDir: string;
  let db: Database.Database;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'niki-auth-routes-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
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
      fetchImpl: feishuFetch,
      env: {
        NIKI_AUTH_MODE: 'feishu',
        NIKI_PUBLIC_URL: 'https://niki.example.test',
        FEISHU_APP_ID: 'cli_test_app_id',
        FEISHU_APP_SECRET: 'test-secret',
      },
      resolveClientIp: (req) => String(req.headers['x-test-ip'] ?? 'test-ip'),
    });
    app.get('/api/private', (_req, res) => res.json({ ok: true }));

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

  it('lets only an administrator provision password accounts and signs them in', async () => {
    const start = await fetch(
      `${baseUrl}/api/auth/feishu/start?returnTo=%2F`,
      { redirect: 'manual' },
    );
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
    const adminCookie = callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';

    const create = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'friend.one',
        name: 'Friend One',
        password: 'A-strong-password-2026',
      }),
    });
    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({
      account: {
        username: 'friend.one',
        user: { name: 'Friend One', role: 'member' },
      },
    });

    const login = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'friend.one',
        password: 'A-strong-password-2026',
      }),
    });
    expect(login.status).toBe(200);
    const memberCookie = login.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';
    expect(memberCookie).toBeTruthy();

    const forbidden = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: memberCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'not-allowed',
        name: 'Not Allowed',
        password: 'Another-strong-password-2026',
      }),
    });
    expect(forbidden.status).toBe(403);
  });

  it('lets an administrator replace an existing account password', async () => {
    const start = await fetch(
      `${baseUrl}/api/auth/feishu/start?returnTo=%2F`,
      { redirect: 'manual' },
    );
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
    const adminCookie = callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';

    const create = await fetch(`${baseUrl}/api/auth/password-users`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'friend.reset',
        name: 'Friend Reset',
        password: 'old4',
      }),
    });
    const account = (await create.json()) as {
      account: { user: { id: string } };
    };

    const update = await fetch(
      `${baseUrl}/api/auth/password-users/${encodeURIComponent(account.account.user.id)}/password`,
      {
        method: 'PATCH',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: 'new4' }),
      },
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toEqual({ ok: true });

    const oldLogin = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'friend.reset',
        password: 'old4',
      }),
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'friend.reset',
        password: 'new4',
      }),
    });
    expect(newLogin.status).toBe(200);
  });

  it('locks a password account even when failures rotate across IP addresses', async () => {
    await createPasswordUser(db, {
      username: 'friend.locked',
      name: 'Friend Locked',
      password: 'right-password',
    });

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await fetch(`${baseUrl}/api/auth/password/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-ip': `198.51.100.${attempt}`,
        },
        body: JSON.stringify({
          username: 'friend.locked',
          password: 'wrong-password',
        }),
      });
    }

    const login = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-ip': '203.0.113.200',
      },
      body: JSON.stringify({
        username: 'friend.locked',
        password: 'right-password',
      }),
    });

    expect(login.status).toBe(429);
    expect(Number(login.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('keeps a password lock after the daemon restarts and records security events', async () => {
    await createPasswordUser(db, {
      username: 'friend.persisted',
      name: 'Friend Persisted',
      password: 'right-password',
    });

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await fetch(`${baseUrl}/api/auth/password/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-ip': '192.0.2.50',
        },
        body: JSON.stringify({
          username: 'friend.persisted',
          password: 'wrong-password',
        }),
      });
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    const restartedApp = express();
    restartedApp.use(express.json());
    registerNikiAuthRoutes(restartedApp, {
      db,
      env: {
        NIKI_AUTH_MODE: 'feishu',
        NIKI_PUBLIC_URL: 'https://niki.example.test',
        FEISHU_APP_ID: 'cli_test_app_id',
        FEISHU_APP_SECRET: 'test-secret',
      },
      resolveClientIp: (req) => String(req.headers['x-test-ip'] ?? 'test-ip'),
    });
    server = http.createServer(restartedApp);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-ip': '192.0.2.50',
      },
      body: JSON.stringify({
        username: 'friend.persisted',
        password: 'right-password',
      }),
    });

    expect(login.status).toBe(429);
    const audit = db.prepare(
      `SELECT event_type AS eventType, outcome
         FROM niki_security_events
        ORDER BY created_at ASC`,
    ).all() as Array<{ eventType: string; outcome: string }>;
    expect(audit).toContainEqual({
      eventType: 'password_login',
      outcome: 'blocked',
    });
  });
});
