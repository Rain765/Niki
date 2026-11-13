import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { DOMParser, type Element } from '@xmldom/xmldom';
import { PRESENTATION_PAGE_COUNTS, PRESENTATION_PALETTES, PRESENTATION_RATIOS, type PresentationOptions } from '@open-design/contracts';

export const corpusRoot = fileURLToPath(new URL('../../resources/presentations/', import.meta.url));
export const evaluatorVersion = '1.0.0';
type CheckBase = { id: string; critical: boolean; question: string; evidence: string[] };
export type Literal = { kind: 'literal'; scope: 'block' | 'slide'; groups: string[][] };
export type Check = CheckBase & (Literal | { kind: 'manual' });
export type Case = {
  id: string; title: string; split: 'development' | 'reserved' | 'private'; provenance: string;
  tags: string[]; sourceSha256: string; brief: string;
  settings: Omit<PresentationOptions, 'prompt'>;
  checks: Check[]; source: string;
};
export type SlideText = { page: number; blocks: string[]; warnings: string[] };
export type Evidence = { sha256: string; width: number; height: number; slides: SlideText[] };
export type CheckResult = { id: string; status: 'candidate' | 'flag' | 'manual'; pages: number[] };
export type Evaluation = {
  caseId: string; sourceSha256: string; rubricSha256: string; evaluatorVersion: string;
  status: 'needs-review'; evidence: Evidence; results: CheckResult[];
  configuration: { ratioMatches: boolean; pageCountMatches: boolean | null };
};
export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export const generationOptions = (c: Case): PresentationOptions => ({ ...c.settings, prompt: c.brief });

/** Formatting normalization only. Never remove negation, units, digits or arbitrary punctuation. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\\([.*_()[\]#+<>|!-])/g, '$1').replace(/\s+/gu, '');
}

function contains(text: string, term: string): boolean {
  const needle = normalizeText(term);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = /^\d/.test(needle) ? '(?<![\\d.])' : '';
  const right = /\d$/.test(needle) ? '(?![\\d.])' : '';
  return new RegExp(`${left}${escaped}${right}`, 'u').test(normalizeText(text));
}

/** A hit is a review candidate, never proof of semantic correctness or visible readability. */
export function evaluateLiteral(check: Literal, slides: SlideText[]): number[] {
  return slides.filter(slide => {
    const haystacks = check.scope === 'slide' ? [slide.blocks.join('\n')] : slide.blocks;
    return haystacks.some(text => check.groups.every(group => group.some(term => contains(text, term))));
  }).map(slide => slide.page);
}

export async function loadCase(directory: string): Promise<Case> {
  const data = JSON.parse(await readFile(path.join(directory, 'case.json'), 'utf8')) as Omit<Case, 'source'>;
  const source = await readFile(path.join(directory, 'source.md'), 'utf8');
  if (!/^[a-z0-9-]+$/.test(data.id) || !data.title || !Array.isArray(data.checks) || !data.checks.length) throw new Error(`Invalid case: ${directory}`);
  if (!data.brief || !data.settings || !PRESENTATION_RATIOS.includes(data.settings.ratio) || !Object.hasOwn(PRESENTATION_PALETTES, data.settings.palette)) throw new Error(`Invalid settings: ${data.id}`);
  if (!PRESENTATION_PAGE_COUNTS.includes(data.settings.pageCount)) throw new Error(`Invalid pages: ${data.id}`);
  if (data.settings.density !== 'complete' || !['swiss', 'editorial'].includes(data.settings.style ?? '')) throw new Error(`Missing explicit style or complete density: ${data.id}`);
  if (!['development', 'reserved', 'private'].includes(data.split)) throw new Error(`Invalid split: ${data.id}`);
  if (sha256(source) !== data.sourceSha256) throw new Error(`Source changed without versioned rubric review: ${data.id}`);
  const ids = new Set<string>();
  for (const check of data.checks) {
    if (ids.has(check.id) || !check.question || !check.evidence?.length || typeof check.critical !== 'boolean') throw new Error(`Invalid check: ${check.id}`);
    ids.add(check.id);
    for (const quote of check.evidence) if (!quote.trim() || !source.includes(quote)) throw new Error(`Unanchored answer: ${check.id}`);
    if (check.kind === 'literal') {
      if (!['block', 'slide'].includes(check.scope) || !check.groups?.length) throw new Error(`Invalid literal: ${check.id}`);
      for (const group of check.groups) {
        if (!group.length || group.some(t => !t.trim()) || !group.some(term => contains(source, term))) throw new Error(`Answer absent from source: ${check.id}`);
      }
    } else if (check.kind !== 'manual') throw new Error(`Unknown check kind in ${data.id}`);
  }
  return { ...data, source };
}

export async function loadCorpus(): Promise<{ version: string; notCovered: string[]; comparators: string[]; cases: Case[]; hash: string }> {
  const raw = await readFile(path.join(corpusRoot, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw) as { version: string; notCovered: string[]; comparators: string[]; cases: string[] };
  if (new Set(manifest.cases).size !== manifest.cases.length || manifest.cases.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('Invalid corpus IDs');
  const cases = await Promise.all(manifest.cases.map(id => loadCase(path.join(corpusRoot, id))));
  return { ...manifest, cases, hash: sha256(raw + JSON.stringify(cases)) };
}

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
function parse(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML declaration');
  return new DOMParser({ onError: level => { if (level !== 'warning') throw new Error('Malformed PPTX XML'); } }).parseFromString(xml, 'application/xml');
}
function elements(node: Element, ns: string, name: string): Element[] { return Array.from(node.getElementsByTagNameNS(ns, name)); }
function ancestor(node: Element, localName: string): boolean {
  let parent = node.parentNode;
  while (parent) { if (parent.nodeType === 1 && (parent as Element).localName === localName) return true; parent = parent.parentNode; }
  return false;
}
function paragraphs(node: Element): string[] {
  return elements(node, A, 'p').map(p => elements(p, A, 't').map(t => t.textContent ?? '').join('')).filter(t => t.trim());
}

/** Inspect final slide parts in presentation order. Notes are intentionally never opened. */
export async function extractPptx(buffer: Buffer): Promise<Evidence> {
  const zip = await JSZip.loadAsync(buffer);
  async function xml(name: string) {
    const entry = zip.file(name);
    if (!entry) throw new Error(`Missing PPTX part: ${name}`);
    return parse(await entry.async('string'));
  }
  const presentation = await xml('ppt/presentation.xml');
  const rels = await xml('ppt/_rels/presentation.xml.rels');
  const size = presentation.getElementsByTagNameNS(P, 'sldSz')[0];
  const width = Number(size?.getAttribute('cx')), height = Number(size?.getAttribute('cy'));
  if (!(width > 0 && height > 0)) throw new Error('Missing slide size');
  const targets = new Map(Array.from(rels.getElementsByTagNameNS(REL, 'Relationship')).filter(r => r.getAttribute('TargetMode') !== 'External' && r.getAttribute('Type') === `${R}/slide`).map(r => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  const ids = Array.from(presentation.getElementsByTagNameNS(P, 'sldId'));
  if (!ids.length || ids.length > 300) throw new Error('Unsupported slide count');
  const slides: SlideText[] = [];
  for (const [index, id] of ids.entries()) {
    const target = targets.get(id.getAttributeNS(R, 'id'));
    if (!target) throw new Error('Slide relationship missing');
    const targetPath = target.startsWith('/') ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join('ppt', target));
    if (!/^ppt\/slides\/[^/]+\.xml$/.test(targetPath)) throw new Error('Unsupported slide target');
    const doc = await xml(targetPath);
    const slide: SlideText = { page: index + 1, blocks: [], warnings: [] };
    slides.push(slide);
    if (['0', 'false'].includes(doc.documentElement?.getAttribute('show') ?? '')) { slide.warnings.push('hidden slide: excluded'); continue; }
    const shapes = [...Array.from(doc.getElementsByTagNameNS(P, 'sp')), ...Array.from(doc.getElementsByTagNameNS(P, 'graphicFrame'))];
    for (const shape of shapes) {
      const text = paragraphs(shape);
      if (!text.length) continue;
      if (ancestor(shape, 'grpSp')) { slide.warnings.push('group transform: text excluded pending visual review'); continue; }
      const xfrm = elements(shape, A, 'xfrm')[0] ?? elements(shape, P, 'xfrm')[0];
      const offset = xfrm && elements(xfrm, A, 'off')[0], ext = xfrm && elements(xfrm, A, 'ext')[0];
      if (offset && ext) {
        const x = Number(offset.getAttribute('x')), y = Number(offset.getAttribute('y'));
        const w = Number(ext.getAttribute('cx')), h = Number(ext.getAttribute('cy'));
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > width + 10 || y + h > height + 10) {
          slide.warnings.push('off-canvas / invalid text bounds: excluded'); continue;
        }
      } else slide.warnings.push('inherited / unknown text bounds: visibility unverified');
      if (xfrm?.hasAttribute('rot')) slide.warnings.push('rotation: bounds need visual review');
      const rows = elements(shape, A, 'tr');
      slide.blocks.push(...(rows.length ? rows.map(row => paragraphs(row).join(' | ')) : text));
    }
    if (doc.getElementsByTagNameNS(P, 'pic').length) slide.warnings.push('images present: image text / graphics not evaluated');
    slide.warnings = [...new Set(slide.warnings)];
  }
  return { sha256: sha256(buffer), width, height, slides };
}

export function evaluate(caseData: Case, evidence: Evidence): Evaluation {
  const results = caseData.checks.map(check => {
    if (check.kind === 'manual') return { id: check.id, status: 'manual' as const, pages: [] };
    const pages = evaluateLiteral(check, evidence.slides);
    return { id: check.id, status: pages.length ? 'candidate' as const : 'flag' as const, pages };
  });
  const [w = 0, h = 1] = caseData.settings.ratio.split(':').map(Number);
  return {
    caseId: caseData.id, sourceSha256: caseData.sourceSha256, rubricSha256: sha256(JSON.stringify(caseData.checks)), evaluatorVersion,
    status: 'needs-review', evidence, results,
    configuration: { ratioMatches: Math.abs(evidence.width / evidence.height - w / h) < 0.001, pageCountMatches: caseData.settings.pageCount === 'auto' ? null : evidence.slides.length === caseData.settings.pageCount },
  };
}

type Control = { id: string; reason: string; expectation: 'flag' | 'candidate' | 'manual'; check: Literal; slides: SlideText[] };
export async function runCalibration() {
  const controls = JSON.parse(await readFile(path.join(corpusRoot, 'controls.json'), 'utf8')) as Control[];
  const results = controls.map(control => ({ id: control.id, reason: control.reason, expectation: control.expectation, actual: evaluateLiteral(control.check, control.slides).length ? 'candidate' : 'flag' }));
  const tp = results.filter(r => r.expectation === 'flag' && r.actual === 'flag').length;
  const tn = results.filter(r => r.expectation === 'candidate' && r.actual === 'candidate').length;
  const fp = results.filter(r => r.expectation === 'candidate' && r.actual === 'flag').length;
  const fn = results.filter(r => r.expectation === 'flag' && r.actual === 'candidate').length;
  const abstained = results.filter(r => r.expectation === 'manual').length;
  return { version: evaluatorVersion, tp, tn, fp, fn, abstained, total: results.length,
    precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null,
    errors: results.filter(r => r.expectation !== 'manual' && r.expectation !== r.actual).map(r => r.id), results,
    limitation: 'Constructed lexical controls only. Manual controls expose blind spots and are not scored as successes. This is not production semantic or visual accuracy.' };
}
