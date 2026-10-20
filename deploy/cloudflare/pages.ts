/** Pages' public hostname calls the VPC Worker over a Cloudflare service binding. */
export default {
  async fetch(request: Request, env: { NIKI_PROXY: { fetch(request: Request): Promise<Response> } }): Promise<Response> {
    const url = new URL(request.url);
    if (url.host !== 'niki-work-app.pages.dev') {
      return new Response('Unknown host', { status: 421 });
    }
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    try {
      return await env.NIKI_PROXY.fetch(new Request(request, { redirect: 'manual' }));
    } catch {
      return new Response('Niki temporarily unavailable', {
        status: 502, headers: { 'Cache-Control': 'no-store' },
      });
    }
  },
};
