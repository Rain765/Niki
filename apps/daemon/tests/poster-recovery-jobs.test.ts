import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { posterRecoveryJobs } from '../src/poster-recovery-jobs.js';

describe('durable poster continuation', () => {
  it('persists only allowed request fields and binds recovery to its project', () => {
    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, metadata_json TEXT, updated_at INTEGER)');
      db.prepare('INSERT INTO projects VALUES (?, ?, ?)').run('project', JSON.stringify({ directGeneration: { activeBatchId: 'batch', status: 'interrupted', batches: [{ id: 'batch', status: 'interrupted' }] } }), 0);
      const jobs = posterRecoveryJobs(db);
      jobs.save('loan-poster:batch:0', 'project', { surface: 'image', model: 'gpt-image-2', prompt: 'scene', posterCopyStyle: 'anti-fraud-message', apiKey: 'must-not-persist' } as never);
      expect(jobs.get('loan-poster:batch:0', 'other')).toBeNull();
      const restart = posterRecoveryJobs(db);
      expect(restart.pending()).toHaveLength(1);
      expect(JSON.stringify(restart.pending())).not.toContain('must-not-persist');
      restart.begin('loan-poster:batch:0', 'project');
      expect(JSON.parse((db.prepare('SELECT metadata_json FROM projects').get() as any).metadata_json).directGeneration.status).toBe('queued');
      restart.finish('loan-poster:batch:0', 'paused');
      expect(restart.pending()).toHaveLength(0);
      expect(restart.get('loan-poster:batch:0', 'project')).not.toBeNull();
    } finally { db.close(); }
  });
});
