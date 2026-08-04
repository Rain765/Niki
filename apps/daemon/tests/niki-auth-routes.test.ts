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

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'niki-auth-routes-'));
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const app = express();
    app.use(express.json());
    const authFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('open-apis/authen/v2/oauth/token')) {
        return new Response(JSON.stringify({
          access_token: 'temporary-feishu-access-token',
        }), { status: 200 });
      }
      if (url.includes('open-apis/authen/v1/user_info')) {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            tenant_key: 'tenant-a',
            open_id: 'open-first',
            union_id: 'union-first',
            name: 'First teammate',
            avatar_url: 'https://example.test/avatar.png',
          },
        }), { status: 200 });
      }
      if (url.includes('/sns/oauth2/access_token')) {
        return new Response(JSON.stringify({
          access_token: 'temporary-wechat-access-token',
          openid: 'wechat-open-first',
          unionid: 'wechat-union-first',
        }), { status: 200 });
      }
      if (url.includes('/sns/userinfo')) {
        return new Response(JSON.stringify({
          openid: 'wechat-open-first',
          unionid: 'wechat-union-first',
          nickname: '微信同事',
          headimgurl: 'https://example.test/wechat.png',
        }), { status: 200 });
      }
      throw new Error(`unexpected auth request: ${url}`);
    });

    registerNikiAuthRoutes(app, {
      db,
      projectsRoot: path.join(tempDir, 'projects'),
      fetchImpl: authFetch as typeof fetch,
      isLocalOperatorRequest: (req) =>
        req.get('x-test-local-operator') === 'yes',
      env: {
        NIKI_AUTH_MODE: 'feishu,wechat',
        NIKI_PUBLIC_URL: 'https://niki.example.test',
        FEISHU_APP_ID: 'cli_test_app_id',
        FEISHU_APP_SECRET: 'test-secret',
        WECHAT_WEB_APP_ID: 'wechat_web_app_id',
        WECHAT_WEB_APP_SECRET: 'wechat-web-secret',
        WECHAT_OA_APP_ID: 'wechat_oa_app_id',
        WECHAT_OA_APP_SECRET: 'wechat-oa-secret',
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

  it('logs a website visitor in through WeChat QR OAuth as a member', async () => {
    const start = await fetch(
      `${baseUrl}/api/auth/wechat/start?returnTo=%2Fprojects`,
      { redirect: 'manual' },
    );
    expect(start.status).toBe(302);
    const authorizeUrl = new URL(start.headers.get('location') ?? '');
    expect(authorizeUrl.origin).toBe('https://open.weixin.qq.com');
    expect(authorizeUrl.pathname).toBe('/connect/qrconnect');
    expect(authorizeUrl.searchParams.get('appid')).toBe('wechat_web_app_id');
    expect(authorizeUrl.searchParams.get('scope')).toBe('snsapi_login');
    const state = authorizeUrl.searchParams.get('state') ?? '';
    const stateCookie = start.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_wechat_oauth_state=')) ?? '';

    const callback = await fetch(
      `${baseUrl}/api/auth/wechat/callback?code=wechat-code&state=${encodeURIComponent(state)}`,
      {
        redirect: 'manual',
        headers: { cookie: stateCookie.split(';')[0] ?? '' },
      },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/projects');
    const sessionCookie = callback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    await expect(me.json()).resolves.toMatchObject({
      user: { name: '微信同事', role: 'member' },
    });
  });

  it('uses Official Account OAuth only inside the WeChat browser', async () => {
    const start = await fetch(`${baseUrl}/api/auth/wechat/start`, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 MicroMessenger/8.0' },
    });
    const authorizeUrl = new URL(start.headers.get('location') ?? '');
    expect(authorizeUrl.pathname).toBe('/connect/oauth2/authorize');
    expect(authorizeUrl.searchParams.get('appid')).toBe('wechat_oa_app_id');
    expect(authorizeUrl.searchParams.get('scope')).toBe('snsapi_userinfo');
  });

  it('links WeChat to the signed-in Niki user instead of creating a duplicate', async () => {
    const feishuStart = await fetch(`${baseUrl}/api/auth/feishu/start`, {
      redirect: 'manual',
    });
    const feishuStateCookie = feishuStart.headers.get('set-cookie') ?? '';
    const feishuState = new URL(feishuStart.headers.get('location') ?? '')
      .searchParams.get('state') ?? '';
    const feishuCallback = await fetch(
      `${baseUrl}/api/auth/feishu/callback?code=oauth-code&state=${encodeURIComponent(feishuState)}`,
      {
        redirect: 'manual',
        headers: { cookie: feishuStateCookie.split(';')[0] ?? '' },
      },
    );
    const sessionCookie = feishuCallback.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_session='))
      ?.split(';')[0] ?? '';

    const wechatStart = await fetch(
      `${baseUrl}/api/auth/wechat/start?link=1&returnTo=%2F`,
      {
        redirect: 'manual',
        headers: { cookie: sessionCookie },
      },
    );
    expect(wechatStart.status).toBe(302);
    const wechatState = new URL(wechatStart.headers.get('location') ?? '')
      .searchParams.get('state') ?? '';
    const wechatStateCookie = wechatStart.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('niki_wechat_oauth_state='))
      ?.split(';')[0] ?? '';
    const linked = await fetch(
      `${baseUrl}/api/auth/wechat/callback?code=wechat-code&state=${encodeURIComponent(wechatState)}`,
      {
        redirect: 'manual',
        headers: { cookie: `${sessionCookie}; ${wechatStateCookie}` },
      },
    );
    expect(linked.headers.get('location')).toBe('/?wechatLinked=1');

    const users = await fetch(`${baseUrl}/api/auth/users`, {
      headers: { cookie: sessionCookie },
    });
    await expect(users.json()).resolves.toMatchObject({
      users: [{
        user: { name: 'First teammate' },
        providers: expect.arrayContaining(['feishu', 'wechat']),
      }],
    });
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
