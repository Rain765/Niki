import type { Express } from 'express';
import type {
  LogoArchitecture,
  LogoBriefRequest,
  LogoBriefResponse,
  NormalizedLogoBrief,
} from '@open-design/contracts';
import type { RouteDeps } from './server-context.js';

const ARCHITECTURES = new Set<LogoArchitecture>([
  'symbol',
  'wordmark',
  'combination',
  'monogram',
]);

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function line(label: string, values: string[] | string): string {
  const text = Array.isArray(values) ? values.join(', ') : values;
  return `- ${label}: ${text || 'Not specified'}`;
}

export function buildLogoBrief(input: LogoBriefRequest): LogoBriefResponse {
  const brandName = cleanText(input?.brandName, 80);
  const industry = cleanText(input?.industry, 100);
  if (!brandName || !industry) {
    throw new Error('brandName and industry are required');
  }

  const requestedArchitecture = cleanText(input.architecture, 32) as LogoArchitecture;
  const brief: NormalizedLogoBrief = {
    brandName,
    industry,
    audience: cleanText(input.audience, 240),
    personality: cleanList(input.personality, 6, 40),
    architecture: ARCHITECTURES.has(requestedArchitecture)
      ? requestedArchitecture
      : 'combination',
    palette: cleanList(input.palette, 5, 32),
    applications: cleanList(input.applications, 8, 60),
    avoid: cleanList(input.avoid, 8, 100),
    notes: cleanText(input.notes, 2_000),
  };

  const pendingPrompt = [
    'Use $logo-generator to create an original logo system from this approved brief.',
    '',
    '# Brand brief',
    line('Brand name', brief.brandName),
    line('Industry', brief.industry),
    line('Audience', brief.audience),
    line('Personality', brief.personality),
    line('Preferred architecture', brief.architecture),
    line('Palette', brief.palette),
    line('Primary applications', brief.applications),
    line('Avoid', brief.avoid),
    line('Additional notes', brief.notes),
    '',
    'Create four conceptually distinct directions as four separate square images. Each image must show one clean logo direction on a plain background, not a multi-logo concept board or lifestyle mockup. Keep every direction legible at 16 px and viable in monochrome and reversed-background use. Do not claim trademark clearance.',
  ].join('\n');

  return {
    brief,
    project: {
      name: `${brief.brandName} Logo`,
      skillId: 'logo-generator',
      designSystemId: null,
      pendingPrompt,
      metadata: {
        kind: 'image',
        imageModel: 'gpt-image-2',
        imageAspect: '1:1',
        imageStyle: 'original vector logo system, clean presentation board',
        nameSource: 'generated',
        skipDiscoveryBrief: true,
      },
      pluginId: 'od-media-generation',
      pluginInputs: {
        mediaKind: 'image',
        model: 'gpt-image-2',
        subject: `${brief.brandName} logo concept board`,
        style: 'original vector logo system, flat geometry, clean presentation board',
        aspect: '1:1',
      },
      skipDiscoveryBrief: true,
    },
  };
}

export function registerLogoRoutes(app: Express, ctx: RouteDeps<'http'>): void {
  app.post('/api/logo/brief', (req, res) => {
    try {
      res.json(buildLogoBrief(req.body as LogoBriefRequest));
    } catch (error) {
      ctx.http.sendApiError(
        res,
        400,
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'invalid logo brief',
      );
    }
  });
}
