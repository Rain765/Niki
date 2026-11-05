import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import type { NativePptxExportJob, NativePresentationInspection } from '@open-design/contracts';
import { getProject } from './db.js';
import { currentNikiUser } from './niki-auth-context.js';
import { assertNikiStorageAllowed } from './niki-quota.js';
import { readProjectFile, resolveProjectDir, writeProjectFile } from './projects.js';
import { nativeInspectionIsStale } from './presentations/native-inspection.js';
import { exportNativePresentation } from './presentations/native-export.js';

const prefix = '/api/projects/:id/native-presentation/pptx';
const manifestPath = 'native-export/state.json';
const pptxPath = 'native-export/presentation.pptx';
const exporterVersion = 2;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type Cache = { version: number; hash: string; pages: number; warnings: string[]; report: NativePresentationInspection };

export function registerNativePptxExportRoutes(app: Express, { db, projectsRoot, isProjectRunning, exportPptx = exportNativePresentation }: {
  db: Database.Database; projectsRoot: string; isProjectRunning?: (id: string) => boolean; exportPptx?: typeof exportNativePresentation;
}) {
  const jobs = new Map<string, { entry: string; job: NativePptxExportJob }>();
  const projectFor = (id: string) => {
    const project = getProject(db, id);
    return project && ['html-ppt', 'guizang-ppt-skill'].includes(project.skillId ?? '') ? project : null;
  };
  const dir = (project: NonNullable<ReturnType<typeof projectFor>>) => resolveProjectDir(projectsRoot, project.id, project.metadata);
  const readCache = async (project: NonNullable<ReturnType<typeof projectFor>>) => {
    try {
      const manifest = await readProjectFile(projectsRoot, project.id, manifestPath, project.metadata);
      const cache = JSON.parse(manifest.buffer.toString('utf8')) as Cache;
      if (cache.version !== exporterVersion || await nativeInspectionIsStale(dir(project), cache.report)) return null;
      const { buffer } = await readProjectFile(projectsRoot, project.id, pptxPath, project.metadata);
      return cache.hash === hash(buffer) ? { cache, buffer } : null;
    } catch { return null; }
  };
  app.post(prefix, (req, res) => {
    const project = projectFor(req.params.id ?? '');
    if (!project) return res.status(404).json({ error: '文稿不存在' });
    if (isProjectRunning?.(project.id)) return res.status(409).json({ error: '文稿仍在生成，请完成后导出' });
    const entry = req.body?.entry;
    if (typeof entry !== 'string' || !/\.html?$/i.test(entry) || entry.split(/[\\/]/).some(part => part.startsWith('.') || !part))
      return res.status(400).json({ error: '请选择有效的演示稿文件' });
    const existing = jobs.get(project.id);
    if (existing?.job.status === 'running') {
      if (existing.entry !== entry) return res.status(409).json({ error: '此项目有导出正在进行，请稍后重试' });
      return res.status(202).json(existing.job);
    }
    if (Array.from(jobs.values()).filter(j => j.job.status === 'running').length >= 2)
      return res.status(429).json({ error: '当前导出任务较多，请稍后重试' });
    const id = randomUUID();
    const record: { entry: string; job: NativePptxExportJob } = { entry, job: { id, pages: 0, status: 'running' } };
    const owner = currentNikiUser()?.id;
    jobs.set(project.id, record);
    res.setHeader('Cache-Control', 'no-store');
    res.status(202).json(record.job);
    void (async () => {
      try {
        const previous = await readCache(project);
        let cached = previous?.cache.report.entry === entry ? previous.cache : null;
        if (!cached) {
          const result = await exportPptx(dir(project), entry, project.name, pages => {
            record.job = { id, pages, status: 'running' };
          });
          if (isProjectRunning?.(project.id) || await nativeInspectionIsStale(dir(project), result.report)) throw new Error('文稿在导出期间已修改，请重新导出');
          cached = { version: exporterVersion, hash: hash(result.pptx), pages: result.pages, warnings: result.warnings, report: result.report };
          const manifest = Buffer.from(JSON.stringify(cached));
          if (owner) await assertNikiStorageAllowed(db, projectsRoot, owner, result.pptx.length + manifest.length);
          await writeProjectFile(projectsRoot, project.id, pptxPath, result.pptx, {}, project.metadata);
          await writeProjectFile(projectsRoot, project.id, manifestPath, manifest, {}, project.metadata);
        }
        record.job = {
          id, status: 'ready', pages: cached.pages, warnings: cached.warnings,
          downloadUrl: `/api/projects/${encodeURIComponent(project.id)}/native-presentation/pptx/file/${cached.hash}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        record.job = { id, status: 'failed', pages: record.job.pages, error: /^(?:第 \d+ 页|文稿|没有|Canvas|No native slides)/.test(message) ? message : 'PowerPoint 导出失败，请重试' };
      }
    })();
  });
  app.get(prefix + '/jobs/:jobId', (req, res) => {
    if (!projectFor(req.params.id ?? '')) return res.status(404).json({ error: '文稿不存在' });
    const job = jobs.get(req.params.id ?? '')?.job;
    if (!job || job.id !== req.params.jobId) return res.status(404).json({ error: '导出任务已失效，请重试' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(job);
  });
  app.get(prefix + '/file/:hash', async (req, res) => {
    const project = projectFor(req.params.id ?? '');
    if (!project) return res.status(404).json({ error: '文稿不存在' });
    if (isProjectRunning?.(project.id)) return res.status(409).json({ error: '文稿仍在生成，请完成后导出' });
    const saved = await readCache(project);
    if (!saved || saved.cache.hash !== req.params.hash) return res.status(409).json({ error: '文稿已更新，请重新导出' });
    const title = project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 100) || 'presentation';
    res.setHeader('Cache-Control', 'private, no-store');
    return res.attachment(title + '.pptx').send(saved.buffer);
  });
}
