import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import type { NativePresentationInspection } from '@open-design/contracts';

const PptxGenJS = createRequire(import.meta.url)('pptxgenjs') as typeof import('pptxgenjs').default;

/** Export the exact rendered slide images; this PPTX intentionally has no editable text. */
export async function exportNativeSlides(input: {
  format: 'pptx' | 'pdf';
  report: NativePresentationInspection;
  images: Buffer[];
}): Promise<Buffer> {
  if (!input.images.length || input.images.length !== input.report.slides.length) throw new Error('Missing rendered slides');
  const width = input.report.viewport.width / 96;
  const height = input.report.viewport.height / 96;
  if (input.format === 'pptx') {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'NIKI', width, height });
    pptx.layout = 'NIKI';
    pptx.author = 'Niki';
    for (const bytes of input.images) pptx.addSlide().addImage({ data: `data:image/png;base64,${bytes.toString('base64')}`, x: 0, y: 0, w: width, h: height });
    return await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  }
  const server = await chromium.launchServer({ channel: 'chrome', headless: true, chromiumSandbox: true, host: '127.0.0.1' });
  const child = server.process();
  child.once('exit', () => { for (const stream of child.stdio) if (stream && 'destroy' in stream && typeof stream.destroy === 'function') stream.destroy(); });
  let browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(`<style>@page{size:${width}in ${height}in;margin:0}*{box-sizing:border-box}body{margin:0}img{display:block;width:${width}in;height:${height}in;break-after:page}img:last-child{break-after:auto}</style>${input.images.map(bytes => `<img src="data:image/png;base64,${bytes.toString('base64')}">`).join('')}`);
    await page.evaluate('Promise.all(Array.from(document.images, image => image.decode()))');
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([server.close().catch(() => server.kill()), new Promise<void>(resolve => { timer = setTimeout(() => { void server.kill().catch(() => {}).finally(resolve); }, 5000); })]); }
    finally { clearTimeout(timer); await browser?.close().catch(() => {}); }
  }
}
