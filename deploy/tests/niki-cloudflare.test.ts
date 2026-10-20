import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { PUBLIC_ORIGIN } from '../cloudflare/worker.ts';
import pages from '../cloudflare/pages.ts';

test('streams bodies through the fixed binding and removes spoofed proxy identity', async () => {
  const response = new Response('event: ready\ndata: ok\n\n', {
    headers: { 'content-type': 'text/event-stream', 'set-cookie': 'niki_session=test; Secure; HttpOnly' },
  });
  const result = await worker.fetch(new Request(`${PUBLIC_ORIGIN}/api/chat?stream=1`, {
    method: 'POST', body: 'hello', headers: {
      'x-forwarded-host': 'localhost:17456', 'x-forwarded-for': '127.0.0.1',
      'forwarded': 'host=localhost', 'x-real-ip': '127.0.0.1',
      'cf-connecting-ip': '203.0.113.10', 'tailscale-user-login': 'fake',
    },
  }), { NIKI_WEB: { async fetch(request) {
    assert.equal(request.url, 'http://niki-origin.internal/api/chat?stream=1');
    assert.equal(request.headers.get('origin'), PUBLIC_ORIGIN);
    assert.notEqual(new URL(request.url).hostname, new URL(PUBLIC_ORIGIN).hostname);
    assert.equal(request.headers.get('x-forwarded-for'), '203.0.113.10');
    for (const key of ['x-forwarded-host', 'forwarded', 'x-real-ip', 'tailscale-user-login']) {
      assert.equal(request.headers.get(key), null);
    }
    assert.equal(request.redirect, 'manual');
    assert.equal(await request.text(), 'hello');
    return response;
  } } });
  assert.equal(result, response);
});

test('rejects foreign origins, local spoofing and noncanonical hosts without upstream access', async () => {
  const env = { NIKI_WEB: { async fetch(): Promise<Response> { throw new Error('must not connect'); } } };
  for (const origin of ['http://127.0.0.1:17573', 'https://evil.example', 'null']) {
    assert.equal((await worker.fetch(new Request(PUBLIC_ORIGIN, { headers: { origin } }), env)).status, 403);
  }
  assert.equal((await worker.fetch(new Request('https://preview.example'), env)).status, 421);
});

test('keeps OAuth redirect and cookies; fails closed when tunnel is unavailable', async () => {
  const redirect = new Response(null, { status: 302, headers: {
    location: 'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    'set-cookie': 'niki_oauth_state=test; HttpOnly; Secure; SameSite=Lax',
  } });
  assert.equal(await worker.fetch(new Request(`${PUBLIC_ORIGIN}/api/auth/feishu/start`), {
    NIKI_WEB: { async fetch() { return redirect; } },
  }), redirect);
  const failed = await worker.fetch(new Request(PUBLIC_ORIGIN), {
    NIKI_WEB: { async fetch() { throw new Error('private diagnostic'); } },
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await failed.text(), /private diagnostic/);
});

test('Pages uses the internal service binding and retains public request identity', async () => {
  const response = new Response(null, { status: 302, headers: { location: '/api/auth/feishu/start' } });
  const request = new Request(`${PUBLIC_ORIGIN}/api/projects`, { headers: { cookie: 'niki_session=test' } });
  assert.equal(await pages.fetch(request, { NIKI_PROXY: { async fetch(forwarded) {
    assert.equal(forwarded.url, request.url);
    assert.equal(forwarded.headers.get('cookie'), 'niki_session=test');
    assert.equal(forwarded.redirect, 'manual');
    return response;
  } } }), response);
  const env = { NIKI_PROXY: { async fetch(): Promise<Response> { throw new Error('offline'); } } };
  assert.equal((await pages.fetch(new Request('https://preview.niki-work-app.pages.dev'), env)).status, 421);
  assert.equal((await pages.fetch(request, env)).status, 502);
  const moved = await worker.fetch(new Request('https://niki.1045423197.workers.dev/a?q=1'), {
    NIKI_WEB: { async fetch(): Promise<Response> { throw new Error('must not connect'); } },
  });
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get('location'), `${PUBLIC_ORIGIN}/a?q=1`);
});
