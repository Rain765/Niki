import { randomUUID } from 'node:crypto';
import { AsyncResource } from 'node:async_hooks';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import type {
  PresentationDeck,
  PresentationJob,
  PresentationOptions,
  PresentationSummary,
  PresentationUsage,
} from '@open-design/contracts';
import { PRESENTATION_PALETTES } from '@open-design/contracts';
import {
  getProject,
  insertProject,
  listProjects,
  updateProject,
} from './db.js';
import { currentNikiUser } from './niki-auth-context.js';
import {
  assertNikiGenerationAllowed,
  assertNikiStorageAllowed,
  NikiQuotaExceededError,
} from './niki-quota.js';
import { writeProjectFile } from './projects.js';
import {
  extractPresentationDocument,
  MAX_PRESENTATION_FILE_BYTES,
  parsePresentationOptions,
  parsePresentationSlide,
  PresentationError,
} from './presentations/content.js';
import { generatePresentation } from './presentations/generate.js';
import {
  buildPresentationScene,
  presentationSceneSvg,
  renderPresentation,
} from './presentations/render.js';
import { attachPresentationSources } from './presentations/source.js';
import { fitPresentationDeck } from './presentations/layout.js';

interface Dependencies {
  db: Database.Database;
  projectsRoot: string;
  projectRoot: string;
  generate?: (input: {
    projectRoot: string;
    document: string;
    sourceName: string;
    options: PresentationOptions;
    onUsage: (usage: PresentationUsage) => Promise<void>;
    onDraft?: (deck: PresentationDeck) => Promise<void>;
  }) => Promise<PresentationDeck>;
}

export function registerPresentationRoutes(
  app: Express,
  deps: Dependencies,
): void {
  const { db, projectsRoot, projectRoot } = deps;
  const activeProjects = new Set<string>();
  const activeUsers = new Set<string>();
  const editing = new Set<string>();
  // Busboy emits partsLimit when reaching the limit, including the closing boundary.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_PRESENTATION_FILE_BYTES,
      files: 1,
      fields: 1,
      fieldSize: 4096,
      parts: 3,
    },
  }).single('file');
  const errorResponse = (res: Response, error: unknown) => {
    if (error instanceof PresentationError)
      return res.status(error.status).json({ error: error.message });
    if (error instanceof NikiQuotaExceededError)
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code });
    return res
      .status(500)
      .json({ error: 'Presentation operation failed. Please try again.' });
  };
  const save = (job: PresentationJob) => {
    const project = getProject(db, job.projectId);
    if (!project) throw new PresentationError('Presentation not found', 404);
    job.updatedAt = Date.now();
    updateProject(db, job.projectId, {
      name: job.deck?.title || job.sourceName,
      metadata: { ...project.metadata, presentation: job },
      updatedAt: job.updatedAt,
    });
  };
  const read = (id: string): PresentationJob => {
    // getProject also enforces the current authenticated owner, independent of URL middleware.
    const project = getProject(db, id);
    const job = project?.metadata?.presentation as PresentationJob | undefined;
    if (!job || job.projectId !== id)
      throw new PresentationError('Presentation not found', 404);
    if (
      ['generating', 'rendering'].includes(job.status) &&
      !activeProjects.has(id)
    ) {
      job.status = 'failed';
      job.error =
        'The server restarted during generation. Please generate again.';
      save(job);
    }
    return job;
  };
  const exportFiles = async (job: PresentationJob) => {
    if (!getProject(db, job.projectId))
      throw new PresentationError('Presentation not found', 404);
    job.deck = fitPresentationDeck(job.deck!, job.options);
    const result = await renderPresentation(job.deck, job.options);
    const user = currentNikiUser();
    if (user)
      await assertNikiStorageAllowed(
        db,
        projectsRoot,
        user.id,
        result.pptx.length +
          Buffer.byteLength(result.html) +
          result.previews.reduce((n, svg) => n + Buffer.byteLength(svg), 0),
      );
    const prefix = `presentation/revision-${job.revision}`;
    const previews = result.previews.map(
      (_, i) => `${prefix}/slide-${String(i + 1).padStart(2, '0')}.svg`,
    );
    for (let i = 0; i < previews.length; i += 1)
      await writeProjectFile(
        projectsRoot,
        job.projectId,
        previews[i],
        result.previews[i],
      );
    const pptx = `${prefix}/presentation.pptx`;
    await writeProjectFile(projectsRoot, job.projectId, pptx, result.pptx);
    const html = `${prefix}/presentation.html`;
    await writeProjectFile(projectsRoot, job.projectId, html, result.html);
    return { pptx, previews, html };
  };

  app.get('/api/presentations/styles/:style', (req, res) => {
    try {
      if (!['swiss', 'editorial'].includes(req.params.style!))
        throw new PresentationError('Unknown style', 404);
      const style = req.params.style as 'swiss' | 'editorial';
      const palette =
        typeof req.query.palette === 'string' &&
        Object.hasOwn(PRESENTATION_PALETTES, req.query.palette)
          ? (req.query.palette as PresentationOptions['palette'])
          : 'emerald';
      const demo = {
        title: style === 'swiss' ? '结构清晰，信息有序。' : '让内容成为主角。',
        subtitle: '从原始材料，到完整而清晰的表达。',
        layout:
          style === 'swiss'
            ? ('architecture' as const)
            : ('editorial' as const),
        items: [
          {
            id: '1',
            title: '内容层 / CONTENT',
            body: '保留事实、数据与重要条件。把复杂信息组织成有依据的清晰表达。',
          },
          {
            id: '2',
            title: '结构层 / STRUCTURE',
            body: '按照主题与关系安排页面。为每一种内容选择适合的布局。',
          },
          ...(style === 'swiss'
            ? [
                {
                  id: '3',
                  title: '表达层 / DESIGN',
                  body: '统一颜色与字号，用线条、层次和留白建立阅读顺序。',
                },
              ]
            : []),
        ],
        edges: [],
        notes: '',
      };
      res
        .type('image/svg+xml')
        .set('Cache-Control', 'private, max-age=3600')
        .send(
          presentationSceneSvg(
            buildPresentationScene(
              demo,
              { style, palette, ratio: '16:9', pageCount: 5, prompt: '' },
              1,
              10,
            ),
          ),
        );
    } catch (error) {
      errorResponse(res, error);
    }
  });
  app.get('/api/presentations', (_req, res) => {
    try {
      const presentations: PresentationSummary[] = listProjects(db)
        .filter((p) => p.metadata?.presentation)
        .slice(0, 100)
        .map((p) => {
          const job = read(p.id);
          return {
            projectId: job.projectId,
            sourceName: job.sourceName,
            createdAt: job.createdAt,
            status: job.status,
            title: job.deck?.title || job.sourceName,
          };
        });
      res.json({ presentations });
    } catch (error) {
      errorResponse(res, error);
    }
  });
  app.get('/api/projects/:id/presentation', (req, res) => {
    try {
      res.json(read(req.params.id!));
    } catch (error) {
      errorResponse(res, error);
    }
  });
  app.post('/api/presentations', (req: Request, res: Response) => {
    const owner = currentNikiUser()?.id ?? 'local';
    if (activeUsers.has(owner) || activeUsers.size >= 2)
      return res.status(429).json({
        error:
          'A presentation is already generating. Please wait for it to finish.',
      });
    // Reserve before receiving/parsing the document so simultaneous requests cannot bypass limits.
    activeUsers.add(owner);
    upload(
      req,
      res,
      AsyncResource.bind((uploadError: unknown) => {
        if (uploadError) {
          activeUsers.delete(owner);
          return res.status(413).json({
            error: 'Upload one document up to 10 MB and valid options.',
          });
        }
        void (async () => {
          try {
            if (!req.file)
              throw new PresentationError('Please upload a document');
            let rawOptions: unknown;
            try {
              rawOptions = JSON.parse(String(req.body.options));
            } catch {
              throw new PresentationError('Invalid presentation options');
            }
            const options = parsePresentationOptions(rawOptions);
            // Browsers encode multipart filenames as UTF-8; Multer exposes the header as Latin-1.
            const decoded = Buffer.from(
              req.file.originalname,
              'latin1',
            ).toString('utf8');
            const sourceName = path
              .basename(
                decoded.includes('\uFFFD') ? req.file.originalname : decoded,
              )
              .replace(/[\x00-\x1F]/g, '')
              .slice(0, 150);
            const document = await extractPresentationDocument(
              sourceName,
              req.file.buffer,
            );
            const user = currentNikiUser();
            if (user) {
              await assertNikiGenerationAllowed(db, projectsRoot, user.id);
              await assertNikiStorageAllowed(
                db,
                projectsRoot,
                user.id,
                req.file.size + 2 * 1024 * 1024,
              );
            }
            const id = randomUUID();
            const now = Date.now();
            const job: PresentationJob = {
              projectId: id,
              revision: 1,
              status: 'generating',
              sourceName,
              createdAt: now,
              updatedAt: now,
              options,
            };
            insertProject(db, {
              id,
              name: sourceName,
              createdAt: now,
              updatedAt: now,
              metadata: { kind: 'deck', presentation: job },
            });
            activeProjects.add(id);
            try {
              await writeProjectFile(
                projectsRoot,
                id,
                `source${path.extname(sourceName).toLowerCase()}`,
                req.file.buffer,
              );
            } catch (error) {
              job.status = 'failed';
              job.error = 'Could not save the uploaded document.';
              save(job);
              activeProjects.delete(id);
              throw error;
            }
            res.status(202).json(job);
            try {
              const deck = await (deps.generate ?? generatePresentation)({
                projectRoot,
                document,
                sourceName,
                options,
                onDraft: async (deck) => {
                  job.deck = deck;
                  save(job);
                },
                onUsage: async (usage) => {
                  job.usage = usage;
                  save(job);
                },
              });
              job.deck = deck;
              job.status = 'rendering';
              save(job);
              Object.assign(job, await exportFiles(job));
              job.status = 'complete';
              save(job);
            } catch (error) {
              job.status = 'failed';
              job.error =
                error instanceof PresentationError
                  ? error.message
                  : 'Could not complete this presentation. Please try again.';
              if (getProject(db, id)) save(job);
            } finally {
              activeProjects.delete(id);
            }
          } catch (error) {
            if (!res.headersSent) errorResponse(res, error);
          } finally {
            activeUsers.delete(owner);
          }
        })();
      }),
    );
  });
  app.patch('/api/projects/:id/presentation', async (req, res) => {
    const id = req.params.id!;
    if (editing.has(id))
      return res
        .status(409)
        .json({ error: 'This presentation is being saved. Please wait.' });
    editing.add(id);
    try {
      const job = read(id);
      if (
        !(['complete', 'failed'] as string[]).includes(job.status) ||
        !job.deck
      )
        throw new PresentationError('Presentation is not ready to edit', 409);
      if (req.body?.revision !== job.revision)
        throw new PresentationError(
          'This presentation changed. Reload it before saving.',
          409,
        );
      const index = req.body.slideIndex;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= job.deck.slides.length
      )
        throw new PresentationError('Invalid slide index');
      const next = structuredClone(job);
      next.deck!.slides[index] = parsePresentationSlide(req.body.slide);
      if (next.deck!.sourceBlocks)
        next.deck = attachPresentationSources(
          next.deck!,
          next.deck!.sourceBlocks,
        );
      next.revision += 1;
      Object.assign(next, await exportFiles(next));
      next.status = 'complete';
      delete next.error;
      save(next);
      res.json(next);
    } catch (error) {
      errorResponse(res, error);
    } finally {
      editing.delete(id);
    }
  });
}
