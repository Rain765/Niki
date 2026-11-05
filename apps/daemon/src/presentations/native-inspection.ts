import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium, type BrowserServer, type Page } from 'playwright-core';
import { NATIVE_PRESENTATION_INSPECTOR_VERSION, type NativePresentationInspection } from '@open-design/contracts';
import { mimeFor } from '../projects.js';
import { NATIVE_INSPECTION_SCRIPT } from './native-inspection-script.js';

const ORIGINAL_ASSET_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com']);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** A saved review only describes the exact entry and dependencies it rendered. */
export async function nativeInspectionIsStale(projectDir: string, report: NativePresentationInspection): Promise<boolean> {
  if (report.stale || report.inspectorVersion !== NATIVE_PRESENTATION_INSPECTOR_VERSION) return true;
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
  visitSlide?: (page: Page, selector: string, index: number) => Promise<void>;
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
    const selector = '#deck > .slide, .deck > .slide, body > .slide';
    let deckUrl = url;
    await page.goto(deckUrl, { waitUntil: 'load', timeout: 30_000 });
    const seen = new Set([deckUrl]);
    while (input.visitSlide && !await page.locator(selector).count() && await page.locator('iframe[src]').count() === 1) {
      const src = await page.locator('iframe[src]').getAttribute('src');
      const next = new URL(src ?? '', deckUrl);
      if (next.origin !== origin || !next.pathname.startsWith(prefix) || !/\.html?$/i.test(next.pathname) || seen.has(next.href) || seen.size >= 8) break;
      seen.add(next.href);
      deckUrl = next.href;
      await page.goto(deckUrl, { waitUntil: 'load', timeout: 30_000 });
    }
    const count = await page.locator(selector).count();
    if (!count) throw new Error('No native slides found; select the actual deck HTML');
    const html = await page.locator('.deck').count() > 0;
    const portrait = await page.locator('body.tpl-xhs-post').count() > 0;
    const viewport = portrait ? {width: 960, height: 1280} : {width: 1280, height: 720};
    await page.setViewportSize(viewport);
    if (html) {
      const preview = new URL(deckUrl);
      preview.searchParams.set('preview', '1');
      await page.goto(preview.href, { waitUntil: 'load', timeout: 30_000 });
    }
    if (input.visitSlide && portrait) {
      const canvas = await page.locator(selector).first().boundingBox();
      if (canvas) await page.setViewportSize({ width: Math.round(canvas.width), height: Math.round(canvas.height) });
    }
    const slides: NativePresentationInspection['slides'] = [];
    for (let i = 0; i < count; i++) {
      if (html) await page.evaluate(`window.postMessage({type:'preview-goto',idx:${i}},'*')`);
      else if (await page.locator('#nav button').count() > i) {
        // Follow the original keyboard path; clicking off-screen nav controls can scroll the deck.
        if (i > 0) await page.keyboard.press('ArrowRight');
      }
      else await page.evaluate(`if (typeof window.go === 'function') window.go(${i},{force:true})`);
      await page.evaluate(`(async () => {
        let timer;
        try {
          await Promise.race([
            Promise.all([document.fonts.ready, ...Array.from(document.images, img => img.decode().catch(() => {}))]),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Asset readiness timed out')), 10000); }),
          ]);
        } finally { clearTimeout(timer); }
      })()`).catch(() => { failed.add('fonts-or-images-not-ready'); });
      // The original HTML PPT preview switches slides synchronously on preview-goto.
      // Fall back to the full grace period for Guizang and unrecognized runtimes.
      const previewReached = html && await page.evaluate(`(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return document.documentElement.dataset.preview === '1'
          && document.querySelectorAll('${selector}')[${i}]?.classList.contains('is-active');
      })()`);
      if (!previewReached) await page.waitForTimeout(2000);
      // Run the same step hook as the native keyboard handler, without its next-slide fallback.
      const pipeline = page.locator(selector).nth(i).locator('[data-anim="step"]');
      if (!html && await page.locator(selector).nth(i).getAttribute('data-animate') === 'pipeline') {
        const steps = await pipeline.count();
        for (let j = 0; j < steps; j++) {
          if (!await page.evaluate(`typeof window.__pipeAdvance === 'function' && window.__pipeAdvance()`)) break;
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(600);
      }
      // Wait for finite entrance animations, but never stop or rewrite original background motion.
      const settled = await page.evaluate(`(async () => {
        const deadline = Date.now() + 12000;
        let stable = 0, previous = '';
        while (Date.now() < deadline) {
          const running = document.getAnimations().some(animation =>
            animation.effect?.getComputedTiming().iterations !== Infinity && (animation.playState === 'running' || animation.pending));
          const active = document.querySelectorAll('${selector}')[${i}];
          const text = [...active.querySelectorAll('*')].filter(el =>
            [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
            && !el.closest('.notes,aside,[hidden],[aria-hidden="true"],.ghost,script,style'));
          const nodes = new Set();
          const bounds = active.getBoundingClientRect();
          let visible = bounds.width > 0 && bounds.left >= -2 && bounds.right <= innerWidth + 2;
          for (const el of text) {
            const rect = el.getBoundingClientRect();
            // Ancestor scale/opacity can hide otherwise stable text. Never reveal it by rewriting CSS.
            if (rect.width < .5 || rect.height < .5) visible = false;
            for (let parent = el; parent && parent !== active.parentElement; parent = parent.parentElement) {
              nodes.add(parent);
              const style = getComputedStyle(parent);
              if (Number(style.opacity) < .01 || style.visibility === 'hidden' || style.display === 'none') visible = false;
            }
          }
          const sample = [...nodes].map(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return [s.opacity,s.transform,r.x,r.y,r.width,r.height].join('/'); }).join('|');
          stable = visible && !running && sample === previous ? stable + 1 : 0;
          if (stable >= 3) return true;
          previous = sample;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        return false;
      })()`);
      if (!settled) failed.add(`page-${i+1}:entrance-animation-not-settled`);
      if (input.visitSlide) {
        await input.visitSlide(page, selector, i);
        continue;
      }
      const observed = await page.evaluate(`(${NATIVE_INSPECTION_SCRIPT})(${i})`) as Pick<NativePresentationInspection['slides'][number], 'text' | 'issues' | 'design'>;
      const screenshot = `${review}/page-${String(i + 1).padStart(2, '0')}.png`;
      await input.save(screenshot, await page.screenshot());
      slides.push({page: i + 1, screenshot, ...observed});
    }
    for (const [name, digest] of Object.entries(resourceHashes)) {
      try { if (hash(await readFile(await resolve(name))) !== digest) resourceChanged = true; }
      catch { resourceChanged = true; }
    }
    const result: NativePresentationInspection = {
      version: 1, inspectorVersion: NATIVE_PRESENTATION_INSPECTOR_VERSION, entry: input.entry, sourceHash: hash(original), resourceHashes, stale: resourceChanged || hash(await readFile(file)) !== hash(original), viewport,
      reportFile: `${review}/report.json`, visualReviewRequired: true, slides, blockedResources: [...blocked], failedResources: [...failed],
    };
    if (!input.visitSlide) await input.save(result.reportFile, Buffer.from(JSON.stringify(result, null, 2)));
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
