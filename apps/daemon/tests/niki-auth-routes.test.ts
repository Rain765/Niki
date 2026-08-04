import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  readNikiAuthRuntimeConfig,
  registerNikiAuthRoutes,
} from '../src/niki-auth-routes.js';

describe('Niki authentication runtime modes', () => {
  it('keeps Feishu mode gated on OAuth configuration', () => {
    expect(readNikiAuthRuntimeConfig({ NIKI_AUTH_MODE: 'feishu' }))
      .toMatchObject({
        mode: 'feishu',
        enabled: true,
        ready: false,
        passwordLogin: true,
        feishuLogin: false,
      });
  });

  it('lets hybrid mode bootstrap by password before Feishu is configured', () => {
    expect(readNikiAuthRuntimeConfig({ NIKI_AUTH_MODE: 'hybrid' }))
      .toMatchObject({
        mode: 'hybrid',
        enabled: true,
        ready: true,
        passwordLogin: true,
        feishuLogin: false,
      });
  });
});

describe('Niki Feishu authentication routes', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;

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
      isTrustedBrowserRequest: () => true,
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
        provider: 'feishu',
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
});

describe('Niki standalone password authentication routes', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'niki-password-auth-routes-'));
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const app = express();
    app.use(express.json());
    registerNikiAuthRoutes(app, {
      db,
      projectsRoot: path.join(tempDir, 'projects'),
      isLocalOperatorRequest: (req) =>
        req.get('x-test-local-operator') === 'yes',
      isTrustedBrowserRequest: (req) =>
        req.get('origin') !== 'https://evil.example.test',
      env: { NIKI_AUTH_MODE: 'password' },
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

  it('is ready without Feishu credentials and reports that bootstrap is required', async () => {
    const response = await fetch(`${baseUrl}/api/auth/config`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      mode: 'password',
      provider: 'password',
      providers: ['password'],
      ready: true,
      passwordLogin: true,
      feishuLogin: false,
      bootstrapRequired: true,
    });
  });

  it('bootstraps exactly one local administrator and accepts its password login', async () => {
    const input = {
      username: 'owner',
      name: 'Workspace owner',
      password: 'correct horse battery staple',
    };
    const remoteBootstrap = await fetch(`${baseUrl}/api/auth/bootstrap/password-admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(remoteBootstrap.status).toBe(403);

    const proxiedBootstrap = await fetch(`${baseUrl}/api/auth/bootstrap/password-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
        'x-test-local-operator': 'yes',
      },
      body: JSON.stringify(input),
    });
    expect(proxiedBootstrap.status).toBe(403);

    const bootstrap = await fetch(`${baseUrl}/api/auth/bootstrap/password-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-local-operator': 'yes',
      },
      body: JSON.stringify(input),
    });
    expect(bootstrap.status).toBe(201);
    await expect(bootstrap.json()).resolves.toMatchObject({
      account: {
        username: 'owner',
        user: { name: 'Workspace owner', role: 'admin' },
      },
    });

    const duplicate = await fetch(`${baseUrl}/api/auth/bootstrap/password-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-local-operator': 'yes',
      },
      body: JSON.stringify({ ...input, username: 'another-owner' }),
    });
    expect(duplicate.status).toBe(409);

    const crossOriginLogin = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.test',
      },
      body: JSON.stringify({ username: input.username, password: input.password }),
    });
    expect(crossOriginLogin.status).toBe(403);

    const wrongPassword = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: input.username, password: 'wrong password' }),
    });
    expect(wrongPassword.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/auth/password/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-niki-session-transport': 'bearer',
      },
      body: JSON.stringify({ username: input.username, password: input.password }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as {
      sessionToken?: string;
      expiresAt?: number;
      user?: { provider?: string };
    };
    expect(loginBody.sessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(loginBody.expiresAt).toBeGreaterThan(Date.now());
    expect(loginBody.user?.provider).toBe('password');

    const authenticated = await fetch(`${baseUrl}/api/private`, {
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(authenticated.status).toBe(200);

    const changed = await fetch(`${baseUrl}/api/auth/password/change`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${loginBody.sessionToken}`,
        'content-type': 'application/json',
        'x-niki-session-transport': 'bearer',
      },
      body: JSON.stringify({
        currentPassword: input.password,
        newPassword: 'a different strong password',
      }),
    });
    expect(changed.status).toBe(200);
    const changedBody = await changed.json() as { sessionToken?: string };
    expect(changedBody.sessionToken).toBeTruthy();
    expect(changedBody.sessionToken).not.toBe(loginBody.sessionToken);

    const invalidatedSession = await fetch(`${baseUrl}/api/private`, {
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(invalidatedSession.status).toBe(401);
    const replacementSession = await fetch(`${baseUrl}/api/private`, {
      headers: { authorization: `Bearer ${changedBody.sessionToken}` },
    });
    expect(replacementSession.status).toBe(200);

    const config = await fetch(`${baseUrl}/api/auth/config`);
    await expect(config.json()).resolves.toMatchObject({ bootstrapRequired: false });
  });
});
