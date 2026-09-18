import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { NativePresentationInspection } from '@open-design/contracts';
import { sha256, type Evidence } from './evaluation.ts';

/** Bind native HTML evaluation to the exact rendered source, dependencies and page images. */
export async function extractNativeEvidence(report: NativePresentationInspection, projectDir: string): Promise<{evidence: Evidence; images: Buffer[]}> {
  if (report.version !== 1 || report.stale || !report.slides.length) throw new Error('Native inspection is stale or empty');
  const root = await realpath(projectDir);
  const read = async (name: string) => {
    if (path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || part.startsWith('.'))) throw new Error('Invalid native evidence path');
    const target = await realpath(path.join(root, name));
    if (!target.startsWith(root + path.sep)) throw new Error('Native evidence leaves project');
    return readFile(target);
  };
  const resources = Object.entries({...report.resourceHashes,[report.entry]:report.sourceHash}).sort(([a],[b])=>a.localeCompare(b));
  for (const [name,digest] of resources) if (sha256(await read(name)) !== digest) throw new Error(`Changed native resource: ${name}`);
  const images: Buffer[] = [];
  for (const [index,slide] of report.slides.entries()) {
    if (slide.page !== index+1) throw new Error('Native inspection must cover every slide in order');
    const bytes = await read(slide.screenshot);
    const image = PNG.sync.read(bytes);
    if (image.width !== report.viewport.width || image.height !== report.viewport.height) throw new Error('Native screenshot dimensions do not match the inspected viewport');
    images.push(bytes);
  }
  const resourceWarnings = [...report.failedResources ?? [],...report.blockedResources].map(resource=>`Resource not loaded: ${resource}`);
  return {
    evidence: {
      sha256:sha256(JSON.stringify({resources,report,imageHashes:images.map(sha256)})),
      width:report.viewport.width,height:report.viewport.height,
      slides:report.slides.map(slide=>({page:slide.page,blocks:slide.text.split('\n').filter(text=>text.trim()),warnings:[...resourceWarnings,...slide.issues.map(issue=>`${issue.kind}: ${issue.text}`)]})),
    },images,
  };
}
