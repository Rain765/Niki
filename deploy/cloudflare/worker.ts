/** Public ingress only. NIKI_WEB is a VPC Service fixed to 127.0.0.1:17573. */
export interface Env {
  NIKI_WEB: { fetch(request: Request): Promise<Response> };
}

export const PUBLIC_ORIGIN = 'https://niki-work-app.pages.dev';
// Keep this different from PUBLIC_ORIGIN: the existing web sidecar rewrites
// same-host Origin to loopback, which would grant local-operator privileges.
const UPSTREAM_ORIGIN = 'http://niki-origin.internal';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    if (incoming.host === 'niki.1045423197.workers.dev') {
      return Response.redirect(`${PUBLIC_ORIGIN}${incoming.pathname}${incoming.search}`, 308);
    }
    if (incoming.host !== new URL(PUBLIC_ORIGIN).host) {
      return new Response('Unknown host', { status: 421 });
    }
    if (incoming.protocol !== 'https:') {
      return Response.redirect(`${PUBLIC_ORIGIN}${incoming.pathname}${incoming.search}`, 308);
    }
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== PUBLIC_ORIGIN) {
      return new Response('Forbidden origin', { status: 403 });
    }

    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (name === 'host' || name === 'forwarded' || name === 'x-real-ip'
        || name.startsWith('x-forwarded-') || name.startsWith('tailscale-')) {
        headers.delete(name);
      }
    }
    // Supply a non-local Origin even on navigation/CLI requests without one.
    // The daemon must authenticate these requests, including operator routes.
    headers.set('origin', PUBLIC_ORIGIN);
    headers.set('x-forwarded-proto', 'https');
    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp) headers.set('x-forwarded-for', clientIp);
    const target = new URL(UPSTREAM_ORIGIN);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const upstream = new Request(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
      // Required by Node's streaming Request in tests; ignored by Workers.
      ...({ duplex: 'half' } as object),
    });
    try {
      // Preserve streaming, redirects and every Set-Cookie header verbatim.
      return await env.NIKI_WEB.fetch(upstream);
    } catch {
      return new Response('Niki temporarily unavailable', {
        status: 502, headers: { 'Cache-Control': 'no-store' },
      });
    }
  },
};
