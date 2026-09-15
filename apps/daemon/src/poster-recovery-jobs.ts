import type Database from 'better-sqlite3';
import type { MediaGenerationRequest } from '@open-design/contracts';

const fields = ['surface', 'model', 'prompt', 'output', 'aspect', 'quality', 'overlayZ', 'overlayLogo', 'overlayLogoAnchor', 'overlayPhoneScreen', 'foregroundPrompt', 'posterHeadline', 'posterSubtitle', 'posterTextAnchor', 'posterCopyStyle'] as const;
export interface PosterRecoveryJob { taskId: string; projectId: string; request: MediaGenerationRequest }

/** Durable, project-owned requests contain no credentials. Only checkpoint-only
 * continuations are allowed after a restart or an explicit resume. */
export function posterRecoveryJobs(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS poster_recovery_jobs (
    task_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_json TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);
  const parse = (row: any): PosterRecoveryJob | null => row ? {
    taskId: row.task_id, projectId: row.project_id, request: JSON.parse(row.request_json),
  } : null;
  return {
    save(taskId: string, projectId: string, request: MediaGenerationRequest) {
      const safeRequest = Object.fromEntries(fields.filter(key => request[key] !== undefined).map(key => [key, request[key]]));
      db.prepare('INSERT OR REPLACE INTO poster_recovery_jobs VALUES (?, ?, ?, ?, ?)')
        .run(taskId, projectId, JSON.stringify(safeRequest), 'pending', Date.now());
    },
    get(taskId: string, projectId: string) {
      return parse(db.prepare('SELECT * FROM poster_recovery_jobs WHERE task_id = ? AND project_id = ?').get(taskId, projectId));
    },
    begin(taskId: string, projectId: string) {
      db.prepare('UPDATE poster_recovery_jobs SET state = ?, updated_at = ? WHERE task_id = ?').run('pending', Date.now(), taskId);
      const row = db.prepare('SELECT metadata_json FROM projects WHERE id = ?').get(projectId) as { metadata_json: string } | undefined;
      if (!row?.metadata_json) return;
      const metadata = JSON.parse(row.metadata_json);
      const lifecycle = metadata.directGeneration;
      if (!lifecycle?.activeBatchId || !taskId.startsWith(`loan-poster:${lifecycle.activeBatchId}:`)) return;
      lifecycle.status = 'queued';
      delete lifecycle.lastError;
      delete lifecycle.failedAt;
      for (const batch of lifecycle.batches ?? []) if (batch.id === lifecycle.activeBatchId) {
        batch.status = 'queued'; delete batch.lastError; delete batch.failedAt;
      }
      db.prepare('UPDATE projects SET metadata_json = ?, updated_at = ? WHERE id = ? AND metadata_json = ?')
        .run(JSON.stringify(metadata), Date.now(), projectId, row.metadata_json);
    },
    finish(taskId: string, state: 'done' | 'paused') {
      db.prepare('UPDATE poster_recovery_jobs SET state = ?, updated_at = ? WHERE task_id = ?').run(state, Date.now(), taskId);
    },
    pending(): PosterRecoveryJob[] {
      return db.prepare('SELECT * FROM poster_recovery_jobs WHERE state = ? ORDER BY updated_at').all('pending').map(parse) as PosterRecoveryJob[];
    },
  };
}
