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
  };
}

export function parsePresentationSlide(value: unknown): PresentationSlide {
  const v = record(value);
  if (
    !PRESENTATION_LAYOUTS.includes(v.layout as PresentationSlide['layout']) ||
    !Array.isArray(v.items) ||
    v.items.length > 6 ||
    !Array.isArray(v.edges) ||
    v.edges.length > 8
  ) {
    throw new PresentationError(
      'A slide supports up to 6 items and 8 connections',
    );
  }
  const items = v.items.map((raw) => {
    const item = record(raw);
    return {
      id: text(item.id, 20, true),
      title: text(item.title, 32, true),
      body: text(item.body, 100),
    };
  });
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length)
    throw new PresentationError('Duplicate diagram item IDs');
  const edges = v.edges.map((raw) => {
    const edge = record(raw);
    const from = text(edge.from, 20, true);
    const to = text(edge.to, 20, true);
    if (!ids.has(from) || !ids.has(to) || from === to)
      throw new PresentationError('Invalid diagram connection');
    return { from, to, label: text(edge.label, 4) };
  });
  const layout = v.layout as PresentationSlide['layout'];
  if (!['cover', 'closing'].includes(layout) && items.length < 2)
    throw new PresentationError('This layout requires at least 2 items');
  if (layout === 'matrix' && items.length !== 4)
    throw new PresentationError('Matrix requires 4 items');
  if (layout === 'comparison' && items.length > 4)
    throw new PresentationError('Comparison supports up to 4 items');
  if (['architecture', 'flow', 'cycle'].includes(layout) && edges.length === 0)
    throw new PresentationError('Diagram connections are required');
  return {
    title: text(v.title, 64, true),
    subtitle: text(v.subtitle, 160),
    layout,
    items,
    edges,
    notes: text(v.notes, 2400),
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
    v.slides.length > 20 ||
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
    }),
  },
});
