import path from 'node:path';
import {
  PRESENTATION_LAYOUTS,
  PRESENTATION_PAGE_COUNTS,
  PRESENTATION_PALETTES,
  PRESENTATION_RATIOS,
  type PresentationDeck,
  type PresentationOptions,
  type PresentationSlide,
} from '@open-design/contracts';
import { buildDocumentPreview } from '../document-preview.js';

export class PresentationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PresentationError('Invalid presentation data');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/u.test(value)
  ) {
    throw new PresentationError(`Text must be at most ${max} characters`);
  }
  const result = value.trim();
  if (required && !result)
    throw new PresentationError('Required text is empty');
  return result;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new PresentationError('Invalid presentation style or density');
  return value as T;
}
export function parsePresentationOptions(value: unknown): PresentationOptions {
  const v = record(value);
  if (
    typeof v.palette !== 'string' ||
    !Object.hasOwn(PRESENTATION_PALETTES, v.palette) ||
    !PRESENTATION_RATIOS.includes(v.ratio as PresentationOptions['ratio']) ||
    !PRESENTATION_PAGE_COUNTS.includes(
      v.pageCount as PresentationOptions['pageCount'],
    )
  ) {
    throw new PresentationError('Invalid color, aspect ratio or page count');
  }
  return {
    palette: v.palette as PresentationOptions['palette'],
    ratio: v.ratio as PresentationOptions['ratio'],
    pageCount: v.pageCount as PresentationOptions['pageCount'],
    prompt: text(v.prompt ?? '', 2000),
    style:
      v.style === undefined ? 'swiss' : choice(v.style, ['swiss', 'editorial']),
    ...(v.model ? { model: parseModel(v.model) } : {}),
    ...(v.fallbackModel ? { fallbackModel: parseModel(v.fallbackModel) } : {}),
    ...(v.reviewPlan === undefined
      ? {}
      : { reviewPlan: v.reviewPlan === true }),
    ...(v.templateFamily
      ? {
          templateFamily: choice(v.templateFamily, [
            'swiss',
            'editorial',
            'technical',
          ]),
        }
      : {}),
    density:
      v.density === undefined
        ? 'complete'
        : choice(v.density, ['complete', 'brief']),
  };
}

export function parsePresentationSlide(value: unknown): PresentationSlide {
  const v = record(value);
  if (
    !PRESENTATION_LAYOUTS.includes(v.layout as PresentationSlide['layout']) ||
    !Array.isArray(v.items) ||
    v.items.length > 12 ||
    !Array.isArray(v.edges) ||
    v.edges.length > 16
  ) {
    throw new PresentationError(
      'A slide supports up to 12 items and 16 connections',
    );
  }
  const items = v.items.map((raw) => {
    const item = record(raw);
    return {
      id: text(item.id, 20, true),
      title: text(item.title, 80, true),
      body: text(item.body, 600),
      ...(item.group ? { group: text(item.group, 40) } : {}),
    };
  });
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length)
    throw new PresentationError('Duplicate diagram item IDs');
  const edges = v.edges.map((raw) => {
    const edge = record(raw);
    const from = text(edge.from, 20, true);
    const to = text(edge.to, 20, true);
    if (!ids.has(from) || !ids.has(to))
      throw new PresentationError('Invalid diagram connection');
    return { from, to, label: text(edge.label, 12) };
  });
  const layout = v.layout as PresentationSlide['layout'];
  if (
    v.templateId &&
    edges.length &&
    !['architecture', 'flow', 'cycle'].includes(layout)
  )
    throw new PresentationError(
      'Directed connections require a diagram layout.',
    );
  const evidence = parsePresentationEvidence(v);
  if (evidence.groups?.length && !['architecture', 'flow'].includes(layout))
    throw new PresentationError(
      'Groups require an architecture or flow layout.',
    );
  if (
    items.some(
      (item) =>
        item.group && !evidence.groups?.some((g) => g.id === item.group),
    )
  )
    throw new PresentationError('Diagram item references an unknown group.');
  if (
    (v.table && layout !== 'table') ||
    (v.chart && layout !== 'metrics') ||
    (v.image && layout !== 'editorial')
  )
    throw new PresentationError(
      'Structured tables, charts and images must use their compatible visible layout.',
    );
  if ([v.table, v.chart, v.image].filter(Boolean).length > 1)
    throw new PresentationError('Use one primary evidence type per slide.');
  if (layout === 'editorial' && !v.image && items.length < 1)
    throw new PresentationError('Editorial requires at least 1 item');
  if (
    !v.table &&
    !v.chart &&
    !v.image &&
    !['cover', 'closing', 'editorial'].includes(layout) &&
    items.length < 2
  )
    throw new PresentationError('This layout requires at least 2 items');
  if (layout === 'matrix' && !v.templateId && items.length !== 4)
    throw new PresentationError('Matrix requires 4 items');
  if (layout === 'comparison' && items.length > 4)
    throw new PresentationError('Comparison supports up to 4 items');
  if (['flow', 'cycle'].includes(layout) && edges.length === 0)
    throw new PresentationError('Diagram connections are required');
  const sourceRefs = v.sourceRefs === undefined ? undefined : v.sourceRefs;
  if (
    sourceRefs !== undefined &&
    (!Array.isArray(sourceRefs) ||
      sourceRefs.length > 200 ||
      sourceRefs.some((x: unknown) => !Number.isInteger(x) || Number(x) < 1))
  )
    throw new PresentationError('Invalid source references');
  return {
    ...evidence,
    ...(sourceRefs === undefined ? {} : { sourceRefs: sourceRefs as number[] }),
    title: text(v.title, 100, true),
    subtitle: text(v.subtitle, 400),
    layout,
    items,
    edges,
    notes: text(v.notes, 6000),
  };
}
export function parsePresentationDeck(
  value: unknown,
  options: PresentationOptions,
): PresentationDeck {
  const v = record(value);
  if (
    !Array.isArray(v.slides) ||
    v.slides.length < 5 ||
    v.slides.length > 30 ||
    (options.pageCount !== 'auto' && v.slides.length !== options.pageCount)
  ) {
    throw new PresentationError(
      'Generated slide count does not match the request',
      502,
    );
  }
  return {
    title: text(v.title, 100, true),
    slides: v.slides.map(parsePresentationSlide),
  };
}

export const MAX_PRESENTATION_FILE_BYTES = 10 * 1024 * 1024;
export async function extractPresentationDocument(
  name: string,
  buffer: Buffer,
): Promise<string> {
  if (!buffer.length || buffer.length > MAX_PRESENTATION_FILE_BYTES)
    throw new PresentationError(
      'Document must be between 1 byte and 10 MB',
      413,
    );
  const ext = path.extname(name).toLowerCase();
  let content: string;
  if (['.txt', '.md'].includes(ext)) {
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new PresentationError('Please save the text document as UTF-8');
    }
  } else if (['.pdf', '.docx'].includes(ext)) {
    try {
      const preview = await buildDocumentPreview({ name, buffer });
      content = (preview.sections as Array<{ lines: string[] }>)
        .flatMap((section) => section.lines)
        .join('\n');
    } catch {
      throw new PresentationError(
        'Cannot read this document. Please upload an unencrypted PDF or DOCX.',
      );
    }
    if (
      /^(No readable text found\.|Text preview is unavailable\.)/.test(content)
    ) {
      throw new PresentationError(
        'No readable text. For scanned PDFs, run OCR first or upload a DOCX / text version.',
      );
    }
  } else
    throw new PresentationError(
      'Supported files: PDF, DOCX, Markdown and TXT',
      415,
    );
  content = content.replace(/\r\n/g, '\n').trim();
  if (content.length < 40)
    throw new PresentationError(
      'The document needs at least 40 characters of readable text',
    );
  if (content.length > 80_000)
    throw new PresentationError(
      'Document exceeds 80,000 characters. Upload a shorter section.',
      413,
    );
  if (/\x00/u.test(content))
    throw new PresentationError('The document contains invalid text');
  return content;
}

const string = { type: 'string' };
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
export const PRESENTATION_SCHEMA = object({
  title: string,
  slides: {
    type: 'array',
    items: object({
      title: string,
      subtitle: string,
      layout: { type: 'string', enum: PRESENTATION_LAYOUTS },
      items: {
        type: 'array',
        items: object({ id: string, title: string, body: string }),
      },
      edges: {
        type: 'array',
        items: object({ from: string, to: string, label: string }),
      },
      notes: string,
      sourceRefs: { type: 'array', items: { type: 'integer' } },
    }),
  },
});

export function parseModel(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)
  )
    throw new PresentationError('Invalid model ID');
  return value;
}
function parsePresentationEvidence(
  v: Record<string, unknown>,
): Partial<PresentationSlide> {
  const result: Partial<PresentationSlide> = {};
  if (v.templateId) result.templateId = text(v.templateId, 50);
  if (v.purpose) result.purpose = text(v.purpose, 250);
  if (v.factIds) {
    if (!Array.isArray(v.factIds) || v.factIds.length > 300)
      throw new PresentationError('Invalid fact references');
    result.factIds = v.factIds.map((x) => text(x, 20, true));
  }
  if (v.groups) {
    if (!Array.isArray(v.groups) || v.groups.length > 4)
      throw new PresentationError('Use at most four diagram groups');
    result.groups = v.groups.map((raw) => {
      const g = record(raw);
      return { id: text(g.id, 40, true), title: text(g.title, 50, true) };
    });
    if (new Set(result.groups.map((g) => g.id)).size !== result.groups.length)
      throw new PresentationError('Duplicate group IDs');
  }
  if (v.table) {
    const t = record(v.table);
    if (
      !Array.isArray(t.headers) ||
      !Array.isArray(t.rows) ||
      t.headers.length < 2 ||
      t.headers.length > 20 ||
      t.rows.length > 200
    )
      throw new PresentationError('Invalid table size');
    const headers = t.headers.map((x) => text(x, 120, true));
    const rows = t.rows.map((raw) => {
      if (!Array.isArray(raw) || raw.length !== headers.length)
        throw new PresentationError('Table columns do not match');
      return raw.map((x) => text(x, 600));
    });
    result.table = {
      headers,
      rows,
      ...(t.sourceId ? { sourceId: text(t.sourceId, 40) } : {}),
    };
  }
  if (v.chart) {
    const c = record(v.chart);
    if (
      !Array.isArray(c.labels) ||
      !Array.isArray(c.values) ||
      c.labels.length !== c.values.length ||
      c.values.length < 2 ||
      c.values.length > 12 ||
      c.values.some((x) => typeof x !== 'number' || !Number.isFinite(x))
    )
      throw new PresentationError('Invalid chart data');
    if (!Number.isInteger(c.sourceRef) || Number(c.sourceRef) < 1)
      throw new PresentationError('Chart requires its source passage');
    result.chart = {
      type: choice(c.type, ['bar', 'line']),
      labels: c.labels.map((x) => text(x, 70, true)),
      values: c.values as number[],
      unit: text(c.unit, 80),
      sourceRef: Number(c.sourceRef),
    };
  }
  if (v.image) {
    const img = record(v.image);
    result.image = {
      assetId: text(img.assetId, 80, true),
      caption: text(img.caption, 600),
    };
  }
  return result;
}
