import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium, type BrowserServer } from 'playwright-core';
import type { NativePresentationInspection } from '@open-design/contracts';
import { mimeFor } from '../projects.js';
import { NATIVE_INSPECTION_SCRIPT } from './native-inspection-script.js';

const ORIGINAL_ASSET_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com']);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** A saved review only describes the exact entry and dependencies it rendered. */
export async function nativeInspectionIsStale(projectDir: string, report: NativePresentationInspection): Promise<boolean> {
  if (report.stale) return true;
  try {
    const root = await realpath(projectDir);
    for (const [name, digest] of Object.entries({...report.resourceHashes, [report.entry]: report.sourceHash})) {
      if (path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || part.startsWith('.'))) return true;
      const file = await realpath(path.join(root, name));
      if (!file.startsWith(root + path.sep) || hash(await readFile(file)) !== digest) return true;
    }
    return false;
  } catch { return true; }
}

/** A project-only preview server: no app cookies, credentials, general API access or arbitrary local files. */
export async function inspectNativePresentation(input: {
  projectDir: string;
  entry: string;
  save: (name: string, bytes: Buffer) => Promise<void>;
}): Promise<NativePresentationInspection> {
  const root = await realpath(input.projectDir);
  const resolve = async (name: string) => {
    if (path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || part.startsWith('.'))) throw new Error('Invalid presentation file');
    const file = await realpath(path.join(root, name));
    if (!file.startsWith(root + path.sep)) throw new Error('Presentation file leaves project');
    return file;
  };
  if (!/\.html?$/i.test(input.entry)) throw new Error('Select an HTML presentation');
  const file = await resolve(input.entry);
  const original = await readFile(file);
  const token = randomUUID();
  const prefix = `/${token}/`;
  const resourceHashes: Record<string, string> = {};
  let resourceChanged = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method !== 'GET' || !url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const name = decodeURIComponent(url.pathname.slice(prefix.length));
      const target = await resolve(name);
      res.setHeader('Content-Type', mimeFor(target));
      res.setHeader('Cache-Control', 'no-store');
      const bytes = await readFile(target);
      const digest = hash(bytes);
      if (resourceHashes[name] && resourceHashes[name] !== digest) resourceChanged = true;
      resourceHashes[name] = digest;
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const url = `${origin}${prefix}${input.entry.split('/').map(encodeURIComponent).join('/')}`;
  const blocked = new Set<string>();
  const failed = new Set<string>();
  const review = `native-review/${randomUUID()}`;
  let browser;
  let browserServer: BrowserServer | undefined;
  try {
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, chromiumSandbox: true, host: '127.0.0.1' });
    const child = browserServer.process();
    // Chrome helpers can inherit pipes after the browser exits on macOS. Those pipes
    // must not keep Playwright's child `close` event (and the completed review) pending.
    child.once('exit', () => {
      for (const stream of child.stdio) if (stream && 'destroy' in stream && typeof stream.destroy === 'function') stream.destroy();
    });
    browser = await chromium.connect(browserServer.wsEndpoint());
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => {
      const request = route.request(); const target = new URL(request.url());
      const allowed = request.method() === 'GET' && ((target.origin === origin && target.pathname.startsWith(prefix)) || (target.protocol === 'https:' && ORIGINAL_ASSET_HOSTS.has(target.hostname)));
      if (allowed) return route.continue();
      blocked.add(target.origin + target.pathname);
      return route.abort();
    });
    await context.routeWebSocket('**/*', socket => { blocked.add(socket.url()); socket.close(); });
    const page = await context.newPage();
    page.on('response', response => { if (response.status() >= 400) failed.add(response.url()); });
    page.on('requestfailed', request => { failed.add(request.url()); });
    page.setDefaultTimeout(10_000);
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    const selector = '#deck > .slide, .deck > .slide';
    const count = await page.locator(selector).count();
    if (!count) throw new Error('No native slides found; select the actual deck HTML');
    const html = await page.locator('.deck').count() > 0;
    const portrait = await page.locator('body.tpl-xhs-post').count() > 0;
    const viewport = portrait ? {width: 960, height: 1280} : {width: 1280, height: 720};
    await page.setViewportSize(viewport);
    if (html) await page.goto(url + '?preview=1', { waitUntil: 'load', timeout: 30_000 });
    const slides: NativePresentationInspection['slides'] = [];
    for (let i = 0; i < count; i++) {
      if (html) await page.evaluate(`window.postMessage({type:'preview-goto',idx:${i}},'*')`);
      else await page.locator('#nav button').nth(i).click();
      await page.waitForTimeout(2000);
      // Respect the original manual pipeline: reveal every step using its own keyboard interaction.
      const pipeline = page.locator(selector).nth(i).locator('[data-anim="step"]');
      if (!html && await page.locator(selector).nth(i).getAttribute('data-animate') === 'pipeline') {
        for (let j = 0; j < await pipeline.count(); j++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100); }
        await page.waitForTimeout(600);
      }
      const observed = await page.evaluate(`(${NATIVE_INSPECTION_SCRIPT})(${i})`) as Pick<NativePresentationInspection['slides'][number], 'text' | 'issues'>;
      const screenshot = `${review}/page-${String(i + 1).padStart(2, '0')}.png`;
      await input.save(screenshot, await page.screenshot());
      slides.push({page: i + 1, screenshot, ...observed});
    }
    for (const [name, digest] of Object.entries(resourceHashes)) {
      try { if (hash(await readFile(await resolve(name))) !== digest) resourceChanged = true; }
      catch { resourceChanged = true; }
    }
    const result: NativePresentationInspection = {
      version: 1, entry: input.entry, sourceHash: hash(original), resourceHashes, stale: resourceChanged || hash(await readFile(file)) !== hash(original), viewport,
      reportFile: `${review}/report.json`, visualReviewRequired: true, slides, blockedResources: [...blocked], failedResources: [...failed],
    };
    await input.save(result.reportFile, Buffer.from(JSON.stringify(result, null, 2)));
    return result;
  } finally {
    if (browserServer) {
      // Some WebGL decks leave Chrome's graceful close waiting after all screenshots are saved.
      // This handle owns only this inspection's child; never stop a user's browser.
      const owner = browserServer;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          owner.close().catch(() => owner.kill()),
          new Promise<void>(resolve => { timer = setTimeout(() => { void owner.kill().catch(() => {}).finally(resolve); }, 5000); }),
        ]);
      } finally { clearTimeout(timer); }
    }
    await browser?.close().catch(() => {});
    await new Promise<void>(accept => { server.close(() => accept()); server.closeAllConnections(); });
  }
}
