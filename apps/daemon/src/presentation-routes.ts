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
  NativePresentationInspectionJob,
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
import { resolveProjectDir, writeProjectFile } from './projects.js';
import { inspectNativePresentation, nativeInspectionIsStale } from './presentations/native-inspection.js';
import {
  MAX_PRESENTATION_FILE_BYTES,
  parsePresentationOptions,
  parsePresentationSlide,
  PresentationError,
} from './presentations/content.js';
import {
  planPresentation,
  generatePresentationV2,
  generatePlannedSlide,
  withPresentationImage,
} from './presentations/pipeline.js';
import { extractPresentationSource } from './presentations/extract.js';
import { presentationTemplates } from './presentations/templates.js';
import { presentationModels } from './presentations/provider.js';
import { checkPresentationQuality } from './presentations/quality.js';
import { reviewPresentation } from './presentations/review.js';
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
  plan?: typeof planPresentation;
  inspectNative?: typeof inspectNativePresentation;
  review?: typeof reviewPresentation;
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
  const inspecting = new Set<string>();
  const inspections = new Map<string, NativePresentationInspectionJob>();
  app.get('/api/projects/:id/native-presentation/inspections/:inspectionId', async (req, res) => {
    const project = getProject(db, req.params.id);
    const job = inspections.get(req.params.inspectionId);
    if (!project || !job || job.projectId !== project.id) return res.status(404).json({ error: 'Inspection unavailable; run it again' });
    if (job.report) {
      const stale = await nativeInspectionIsStale(resolveProjectDir(projectsRoot, project.id, project.metadata), job.report);
      return res.json({...job, report: {...job.report, stale}});
    }
    return res.json(job);
  });
  app.post('/api/projects/:id/native-presentation/inspect', async (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project || !['html-ppt', 'guizang-ppt-skill'].includes(project.skillId ?? '')) return res.status(404).json({ error: 'Native presentation not found' });
    if (typeof req.body?.entry !== 'string' || !/\.html?$/i.test(req.body.entry)) return res.status(400).json({ error: 'Select an HTML presentation' });
    if (inspecting.has(project.id)) return res.status(409).json({ error: 'This presentation is already being inspected' });
    inspecting.add(project.id);
    const job: NativePresentationInspectionJob = {id:randomUUID(),projectId:project.id,status:'running'};
    // Completed reports live in project files; retain only the latest in-memory job per project.
    for (const [id, previous] of inspections) if (previous.projectId === project.id) inspections.delete(id);
    inspections.set(job.id, job);
    res.status(202).json(job);
    void (async () => { try {
      job.report = await (deps.inspectNative ?? inspectNativePresentation)({
        projectDir: resolveProjectDir(projectsRoot, project.id, project.metadata), entry: req.body.entry,
        save: async (name, bytes) => {
          const user = currentNikiUser();
          if (user) await assertNikiStorageAllowed(db, projectsRoot, user.id, bytes.length);
          await writeProjectFile(projectsRoot, project.id, name, bytes, {}, project.metadata);
        },
      });
      job.status = 'completed';
    } catch (error) {
      job.error = error instanceof Error ? error.message : 'Native inspection failed';
      job.status = 'failed';
    } finally { inspecting.delete(project.id); }
    })();
  });
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
      ['planning', 'generating', 'rendering', 'checking'].includes(
        job.status,
      ) &&
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
    job.deck = fitPresentationDeck(
      {
        ...job.deck!,
        slides: job.deck!.slides.map((slide) =>
          withPresentationImage(slide, job.source),
        ),
      },
      job.options,
    );
    if (job.source)
      job.quality = await checkPresentationQuality(
        job.deck,
        job.options,
        job.source,
      );
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
    job.deck = {
      ...job.deck!,
      slides: job.deck!.slides.map((slide) =>
        slide.image
          ? {
              ...slide,
              image: {
                assetId: slide.image.assetId,
                caption: slide.image.caption,
              },
            }
          : slide,
      ),
    };
    return { pptx, previews, html };
  };

  app.get('/api/presentations/templates', (_req, res) =>
    res.json({ version: '2.0.0', templates: presentationTemplates }),
  );
  app.get('/api/presentations/models', async (_req, res) => {
    try {
      res.json(await presentationModels(projectRoot));
    } catch (error) {
      errorResponse(res, error);
    }
  });
  app.get('/api/presentations/styles/:style', (req, res) => {
    try {
      const style = req.params.style;
      if (style !== 'swiss' && style !== 'editorial')
        throw new PresentationError('Unknown style', 404);
      const options = parsePresentationOptions({
        style,
        palette: req.query.palette ?? 'emerald',
        ratio: req.query.ratio ?? '16:9',
        pageCount: 5,
        prompt: '',
      });
      const template =
        presentationTemplates.find((t) => t.id === req.query.template) ??
        presentationTemplates.find(
          (t) => t.id === (style === 'swiss' ? 'S17' : 'E-report'),
        )!;
      res
        .type('image/svg+xml')
        .set('Cache-Control', 'private, no-cache')
        .send(
          presentationSceneSvg(
            buildPresentationScene(template.sample, options, 1, 10),
          ),
        );
    } catch (error) {
      errorResponse(res, error);
    }
  });
  const context = (job: PresentationJob) => ({
    projectRoot,
    document: job.source!.blocks.join('\n\n'),
    sourceName: job.sourceName,
    options: job.options,
    source: job.source!,
    onUsage: async (usage: PresentationUsage) => {
      const old = job.usage;
      job.usage = old
        ? {
            ...usage,
            model: [...new Set([...old.model.split(', '), usage.model])].join(
              ', ',
            ),
            inputTokens: old.inputTokens + usage.inputTokens,
            outputTokens: old.outputTokens + usage.outputTokens,
            cachedInputTokens: old.cachedInputTokens + usage.cachedInputTokens,
            reasoningTokens: old.reasoningTokens + usage.reasoningTokens,
            estimatedUsd:
              old.estimatedUsd === null || usage.estimatedUsd === null
                ? null
                : old.estimatedUsd + usage.estimatedUsd,
          }
        : usage;
      save(job);
    },
    pageDrafts: job.pageDrafts ?? {},
    onPage: async (
      index: number,
      slide: PresentationDeck['slides'][number],
    ) => {
      job.pageDrafts = { ...job.pageDrafts, [String(index)]: slide };
      job.completedPages = Object.keys(job.pageDrafts).length;
      save(job);
    },
    onPlan: async (plan: PresentationDeck) => {
      job.plan = plan;
      save(job);
    },
    onDraft: async (deck: PresentationDeck) => {
      job.deck = deck;
      save(job);
    },
    onStage: async (stage: string, completed: number) => {
      job.stage = stage;
      job.completedPages = completed;
      save(job);
    },
  });
  const finish = async (job: PresentationJob, review = true) => {
    job.status = 'rendering';
    save(job);
    Object.assign(job, await exportFiles(job));
    if (job.source && job.quality && review) {
      job.status = 'checking';
      job.stage = '正在核对原文事实与页面渲染';
      save(job);
      job.quality = await (deps.review ?? reviewPresentation)({
        projectRoot,
        deck: job.deck!,
        options: job.options,
        source: job.source!,
        quality: job.quality,
        onUsage: context(job).onUsage,
      });
      if (!deps.generate && job.quality.status === 'blocked') {
        const targets = [
          ...new Set(
            job.quality.issues
              .filter((issue) => issue.severity === 'error')
              .map((issue) =>
                issue.page
                  ? issue.page - 1
                  : job.deck!.slides.findIndex(
                      (slide) =>
                        issue.factId && slide.factIds?.includes(issue.factId),
                    ),
              )
              .filter((index) => index >= 0),
          ),
        ].slice(0, 3);
        for (const index of targets) {
          job.stage = `正在修复第 ${index + 1} 页`;
          save(job);
          const defects = job.quality.issues
            .filter(
              (issue) =>
                issue.page === index + 1 ||
                (issue.factId &&
                  job.deck!.slides[index]!.factIds?.includes(issue.factId)),
            )
            .map((issue) => issue.message)
            .join('\n');
          try {
            job.deck!.slides[index] = await generatePlannedSlide(
              context(job),
              job.deck!.slides[index]!,
              index,
              job.deck!.slides.length,
              defects,
            );
          } catch (error) {
            job.quality.issues.push({
              code: 'repair-failed',
              severity: 'error',
              page: index + 1,
              message: error instanceof Error ? error.message : '页面修复失败',
            });
          }
        }
        if (targets.length) {
          const repairFailures = job.quality.issues.filter(
            (issue) => issue.code === 'repair-failed',
          );
          Object.assign(job, await exportFiles(job));
          job.quality = await (deps.review ?? reviewPresentation)({
            projectRoot,
            deck: job.deck!,
            options: job.options,
            source: job.source!,
            quality: job.quality!,
            onUsage: context(job).onUsage,
          });
          job.quality.issues.push(...repairFailures);
          if (repairFailures.length) job.quality.status = 'blocked';
        }
      }
    }
    job.status = 'complete';
    delete job.error;
    delete job.stage;
    delete job.pageDrafts;
    save(job);
  };
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
            ...(job.quality ? { qualityStatus: job.quality.status } : {}),
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
            const { document, source } = await extractPresentationSource(
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
              status:
                options.reviewPlan && (!!deps.plan || !deps.generate)
                  ? 'planning'
                  : 'generating',
              source,
              pipelineVersion: '2.0.0',
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
              if (options.reviewPlan && (!!deps.plan || !deps.generate)) {
                job.plan = await (deps.plan ?? planPresentation)(context(job));
                job.status = 'awaiting-plan';
                save(job);
              } else {
                job.deck = await (deps.generate ?? generatePresentationV2)({
                  ...context(job),
                  document,
                });
                await finish(job, !deps.generate);
              }
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
  app.post('/api/projects/:id/presentation/action', async (req, res) => {
    const id = req.params.id!,
      owner = currentNikiUser()?.id ?? 'local';
    try {
      const job = read(id);
      if (req.body?.revision !== job.revision)
        throw new PresentationError('文稿已更新，请重新加载。', 409);
      if (activeProjects.has(id) || editing.has(id))
        throw new PresentationError('文稿正在处理中。', 409);
      const action = req.body.action;
      const completed =
        job.status === 'failed' && !req.body.plan ? job.deck : undefined;
      if (action === 'accept-review') {
        if (
          !job.quality ||
          job.quality.issues.some((i) => i.severity === 'error')
        )
          throw new PresentationError('请先修复阻断问题，再确认验收。', 409);
        if (
          typeof req.body.note !== 'string' ||
          req.body.note.trim().length < 3 ||
          req.body.note.length > 2000
        )
          throw new PresentationError('请填写验收依据。');
        job.quality.humanReview = {
          verdict: 'accepted',
          note: req.body.note.trim(),
          reviewedAt: Date.now(),
        };
        job.quality.status = 'passed';
        job.revision++;
        save(job);
        return res.json(job);
      }
      if (!['continue', 'repair', 'check'].includes(action))
        throw new PresentationError('Unknown presentation action');
      if (!job.source)
        throw new PresentationError(
          '此历史文稿缺少结构化原文，请重新上传。',
          409,
        );
      if (activeUsers.has(owner) || activeUsers.size >= 2)
        throw new PresentationError('请等待当前生成完成。', 429);
      if (
        action === 'continue' &&
        (!job.plan || !['awaiting-plan', 'failed'].includes(job.status))
      )
        throw new PresentationError('没有待确认的页面计划。', 409);
      if (action !== 'continue' && (!job.deck || job.status !== 'complete'))
        throw new PresentationError('文稿尚未完成。', 409);
      const page = req.body.slideIndex;
      if (
        action === 'repair' &&
        (!Number.isInteger(page) || page < 0 || page >= job.deck!.slides.length)
      )
        throw new PresentationError('Invalid page');
      if (req.body.plan) {
        delete job.pageDrafts;
        if (
          action !== 'continue' ||
          !Array.isArray(req.body.plan.slides) ||
          req.body.plan.slides.length !== job.plan!.slides.length
        )
          throw new PresentationError('Invalid page plan');
        job.plan!.slides = job.plan!.slides.map((old, i) => {
          const next = req.body.plan.slides[i],
            template = presentationTemplates.find(
              (t) => t.id === next.templateId,
            );
          if (
            typeof next.title !== 'string' ||
            !next.title.trim() ||
            next.title.length > 100 ||
            !template ||
            (old.table && template.layout !== 'table')
          )
            throw new PresentationError('Invalid planned title or template');
          return {
            ...old,
            title: next.title.trim(),
            templateId: template.id,
            layout: template.layout,
          };
        });
      }
      const user = currentNikiUser();
      if (user) await assertNikiGenerationAllowed(db, projectsRoot, user.id);
      activeUsers.add(owner);
      activeProjects.add(id);
      job.revision++;
      job.status = action === 'check' ? 'checking' : 'generating';
      delete job.error;
      save(job);
      res.status(202).json(job);
      try {
        if (action === 'continue')
          job.deck = await (deps.generate ?? generatePresentationV2)({
            ...context(job),
            ...(!deps.generate
              ? { plan: job.plan!, ...(completed ? { completed } : {}) }
              : {}),
          });
        if (action === 'repair') {
          const note =
            typeof req.body.note === 'string'
              ? req.body.note.slice(0, 2000)
              : '';
          const defects =
            job.quality?.issues
              .filter((i) => i.page === page + 1)
              .map((i) => i.message)
              .join('\n') ?? '';
          job.deck!.slides[page] = await generatePlannedSlide(
            context(job),
            job.deck!.slides[page]!,
            page,
            job.deck!.slides.length,
            defects + '\n' + note,
          );
        }
        await finish(job);
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : '处理失败';
        save(job);
      } finally {
        activeUsers.delete(owner);
        activeProjects.delete(id);
      }
    } catch (error) {
      if (!res.headersSent) errorResponse(res, error);
    }
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
      if (job.plan && job.deck.slides.length !== job.plan.slides.length)
        throw new PresentationError('部分页面尚未生成，请继续原计划。', 409);
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
      delete next.pageDrafts;
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
