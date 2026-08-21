import type { Express } from 'express';
import type {
  LogoArchitecture,
  LogoBriefRequest,
  LogoBriefResponse,
  LogoDirection,
  LogoFinalization,
  LogoFinalizeRequest,
  LogoFinalizeResponse,
  LogoFinalizationsResponse,
  NormalizedLogoBrief,
} from '@open-design/contracts';
import type { RouteDeps } from './server-context.js';

const ARCHITECTURES = new Set<LogoArchitecture>([
  'symbol',
  'wordmark',
  'combination',
  'monogram',
]);
const LOGO_FINAL_OUTPUTS = [
  'logo.svg',
  'logo-dark.svg',
  'logo-mono.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'og-image.png',
  'BRAND.md',
] as const;
const FINALIZATION_MANIFEST = /^logo\/finalizations\/([^/]+)\/manifest\.json$/u;

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

interface LogoFinalizationBuildContext {
  finalizationId: string;
  conversationId: string;
  requestedAt: number;
  projectPrompt: string;
}

export function buildLogoFinalization(
  input: LogoFinalizeRequest,
  context: LogoFinalizationBuildContext,
): LogoFinalizeResponse {
  const projectId = cleanText(input?.projectId, 160);
  const direction = Number(input?.direction);
  if (!projectId) throw new Error('projectId is required');
  if (!Number.isInteger(direction) || direction < 1 || direction > 4) {
    throw new Error('direction must be an integer from 1 to 4');
  }

  const safeDirection = direction as LogoDirection;
  const notes = cleanText(input.notes, 2_000);
  const sourceFile = `logo-direction-${String(safeDirection).padStart(2, '0')}.png`;
  const outputRoot = `logo/final/${context.finalizationId}`;
  const expectedPaths = LOGO_FINAL_OUTPUTS.map((name) => `${outputRoot}/${name}`);
  const prompt = [
    'Use $logo-generator to refine the approved logo direction into a production brand kit.',
    '',
    '# Approved source',
    `- Project brief: ${context.projectPrompt.trim() || 'Use the existing project brief and files.'}`,
    `- Selected direction: ${safeDirection} of 4`,
    `- Source image: ${sourceFile}`,
    `- Refinement notes: ${notes || 'Preserve the selected concept while improving geometry, balance, and small-size legibility.'}`,
    '',
    '# Required workflow',
    '1. Inspect the selected source image and reconstruct its essential geometry as true editable SVG paths.',
    '2. Do not embed the source raster, a data URL, or a base64 image inside any SVG.',
    '3. Simplify and optimize the paths; remove editor metadata, hidden layers, redundant groups, and unnecessary points.',
    '4. Verify the mark at 16 px, in monochrome, and on light and dark backgrounds.',
    '5. Do not claim trademark clearance; record any obvious visual-similarity risk in BRAND.md.',
    '',
    '# Required outputs',
    ...expectedPaths.map((path) => `- ${path}`),
    '',
    'logo.svg is the primary full-color vector. logo-dark.svg is the reversed-background variant. logo-mono.svg must use one color. Generate the raster icons and OG image from the reconstructed vector, not from the concept PNG. BRAND.md must document colors, clear space, minimum size, typography/licensing notes, and usage cautions.',
    '',
    'Proceed autonomously with the approved direction and write every required output. Do not stop to ask another discovery question.',
  ].join('\n');

  const finalization: LogoFinalization = {
    id: context.finalizationId,
    projectId,
    conversationId: context.conversationId,
    clientRequestId: `logo-finalize:${context.finalizationId}`,
    direction: safeDirection,
    sourceFile,
    outputRoot,
    expectedOutputs: [...LOGO_FINAL_OUTPUTS],
    outputFiles: [],
    status: 'prepared',
    requestedAt: context.requestedAt,
    notes,
    prompt,
  };

  return { finalization, prompt };
}

function finalizationStatus(
  record: LogoFinalization,
  files: Array<{ name: string }>,
  conversations: Array<{ id: string; latestRun?: { status?: string } }>,
): LogoFinalization {
  const fileNames = new Set(files.map((file) => file.name));
  const outputFiles = record.expectedOutputs
    .map((name) => `${record.outputRoot}/${name}`)
    .filter((name) => fileNames.has(name));
  const latestRun = conversations.find((conversation) => (
    conversation.id === record.conversationId
  ))?.latestRun;
  const runStatus = latestRun?.status;
  const complete = outputFiles.length === record.expectedOutputs.length;
  const status = complete
    ? 'complete'
    : runStatus === 'queued'
      ? 'queued'
      : runStatus === 'running'
        ? 'running'
        : runStatus === 'failed' || runStatus === 'canceled' || runStatus === 'succeeded'
          ? 'failed'
          : 'prepared';

  return {
    ...record,
    outputFiles,
    status,
    ...(complete ? {
      archiveUrl: `/api/projects/${encodeURIComponent(record.projectId)}/archive?root=${encodeURIComponent(record.outputRoot)}`,
    } : {}),
    ...(runStatus === 'succeeded' && !complete ? {
      error: 'Refinement finished without the complete brand-kit file set.',
    } : {}),
  };
}

export function registerLogoRoutes(
  app: Express,
  ctx: RouteDeps<'db' | 'http' | 'ids' | 'paths' | 'projectStore' | 'projectFiles' | 'conversations'>,
): void {
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

  app.post('/api/logo/finalize', async (req, res) => {
    try {
      const input = req.body as LogoFinalizeRequest;
      const project = ctx.projectStore.getProject(ctx.db, input?.projectId);
      if (!project || project.skillId !== 'logo-generator') {
        return ctx.http.sendApiError(res, 404, 'NOT_FOUND', 'logo project not found');
      }

      const direction = Number(input?.direction);
      if (!Number.isInteger(direction) || direction < 1 || direction > 4) {
        return ctx.http.sendApiError(res, 400, 'BAD_REQUEST', 'direction must be an integer from 1 to 4');
      }
      const sourceFile = `logo-direction-${String(direction).padStart(2, '0')}.png`;
      await ctx.projectFiles.readProjectFile(
        ctx.paths.PROJECTS_DIR,
        project.id,
        sourceFile,
        project.metadata,
      );

      const requestedAt = Date.now();
      const finalizationId = ctx.ids.randomUUID();
      const conversationId = ctx.ids.randomId();
      const built = buildLogoFinalization(input, {
        finalizationId,
        conversationId,
        requestedAt,
        projectPrompt: project.pendingPrompt ?? '',
      });
      ctx.conversations.insertConversation(ctx.db, {
        id: conversationId,
        projectId: project.id,
        title: `Logo refinement ${String(direction)}`,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      });
      const manifestPath = `logo/finalizations/${finalizationId}/manifest.json`;
      await ctx.projectFiles.writeProjectFile(
        ctx.paths.PROJECTS_DIR,
        project.id,
        manifestPath,
        `${JSON.stringify(built.finalization, null, 2)}\n`,
        { overwrite: false },
        project.metadata,
      );
      return res.status(201).json(built satisfies LogoFinalizeResponse);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      return ctx.http.sendApiError(
        res,
        code === 'ENOENT' ? 404 : 400,
        code === 'ENOENT' ? 'NOT_FOUND' : 'BAD_REQUEST',
        code === 'ENOENT'
          ? 'selected logo direction was not found'
          : error instanceof Error ? error.message : 'invalid logo finalization',
      );
    }
  });

  app.get('/api/logo/projects/:projectId/finalizations', async (req, res) => {
    try {
      const project = ctx.projectStore.getProject(ctx.db, req.params.projectId);
      if (!project || project.skillId !== 'logo-generator') {
        return ctx.http.sendApiError(res, 404, 'NOT_FOUND', 'logo project not found');
      }
      const files = await ctx.projectFiles.listFiles(
        ctx.paths.PROJECTS_DIR,
        project.id,
        { metadata: project.metadata },
      );
      const conversations = ctx.conversations.listConversations(ctx.db, project.id);
      const finalizations = (await Promise.all(files
        .filter((file: { name: string }) => FINALIZATION_MANIFEST.test(file.name))
        .map(async (file: { name: string }) => {
          try {
            const manifest = await ctx.projectFiles.readProjectFile(
              ctx.paths.PROJECTS_DIR,
              project.id,
              file.name,
              project.metadata,
            );
            const record = JSON.parse(manifest.buffer.toString('utf8')) as LogoFinalization;
            return finalizationStatus(record, files, conversations);
          } catch {
            return null;
          }
        })))
        .filter((record): record is LogoFinalization => Boolean(record))
        .sort((left, right) => right.requestedAt - left.requestedAt);
      const body: LogoFinalizationsResponse = { finalizations };
      return res.json(body);
    } catch (error) {
      return ctx.http.sendApiError(
        res,
        400,
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'could not list logo finalizations',
      );
    }
  });
}
