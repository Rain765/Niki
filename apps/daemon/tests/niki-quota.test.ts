import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, deleteProject, openDatabase } from '../src/db.js';
import { insertMediaTask, migrateMediaTasks } from '../src/media-tasks.js';
import {
  assertNikiGenerationAllowed,
  assertNikiStorageAllowed,
  DEFAULT_DAILY_GENERATION_QUOTA,
  DEFAULT_STORAGE_QUOTA_BYTES,
  getNikiQuotaStatus,
  updateNikiUserQuota,
  userDailyGenerationCount,
  withNikiGenerationAdmission,
} from '../src/niki-quota.js';
import { upsertFeishuUser } from '../src/niki-auth.js';

describe('Niki per-user quotas', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'niki-quota-'));
  });

  afterEach(async () => {
    closeDatabase();
    await rm(root, { recursive: true, force: true });
  });

  it('tracks project bytes and rolling daily generation attempts per owner', async () => {
    const db = openDatabase(root, { dataDir: root });
    migrateMediaTasks(db);
    const user = upsertFeishuUser(db, {
      tenantKey: 'tenant',
      openId: 'owner',
      name: 'Owner',
    });
    const projectId = 'project-owned';
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, owner_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(projectId, 'Owned', user.id, now, now);
    const projectDir = path.join(root, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'image.bin'), Buffer.alloc(137));
    db.prepare(
      `INSERT INTO media_tasks
        (id, project_id, status, progress_json, started_at, created_at, updated_at)
       VALUES (?, ?, 'failed', '[]', ?, ?, ?)`,
    ).run('attempt-1', projectId, now, now, now);

    const status = await getNikiQuotaStatus(db, path.join(root, 'projects'), user.id, {
      now,
    });

    expect(status.quota).toEqual({
      storageBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      dailyGenerations: DEFAULT_DAILY_GENERATION_QUOTA,
    });
    expect(status.usage.storageBytes).toBe(137);
    expect(status.usage.dailyGenerations).toBe(1);
    expect(status.allowed.storage).toBe(true);
    expect(status.allowed.generation).toBe(true);
  });

  it('persists an administrator quota override and reports exhausted limits', async () => {
    const db = openDatabase(root, { dataDir: root });
    migrateMediaTasks(db);
    const user = upsertFeishuUser(db, {
      tenantKey: 'tenant',
      openId: 'member',
      name: 'Member',
    });
    const projectId = 'project-limited';
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, owner_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(projectId, 'Limited', user.id, now, now);
    const projectDir = path.join(root, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'large.bin'), Buffer.alloc(12));
    db.prepare(
      `INSERT INTO media_tasks
        (id, project_id, status, progress_json, started_at, created_at, updated_at)
       VALUES (?, ?, 'done', '[]', ?, ?, ?)`,
    ).run('attempt-1', projectId, now, now, now);

    expect(updateNikiUserQuota(db, user.id, {
      storageBytes: 10,
      dailyGenerations: 1,
    })).toBe(true);

    const status = await getNikiQuotaStatus(db, path.join(root, 'projects'), user.id, {
      now,
    });
    expect(status.quota).toEqual({
      storageBytes: 10,
      dailyGenerations: 1,
    });
    expect(status.allowed).toEqual({
      storage: false,
      generation: false,
    });
    await expect(
      assertNikiStorageAllowed(db, path.join(root, 'projects'), user.id),
    ).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
      status: 429,
    });

    await writeFile(path.join(projectDir, 'large.bin'), Buffer.alloc(1));
    expect(updateNikiUserQuota(db, user.id, {
      storageBytes: 100,
      dailyGenerations: 1,
    })).toBe(true);
    await expect(
      assertNikiGenerationAllowed(db, path.join(root, 'projects'), user.id),
    ).rejects.toMatchObject({
      code: 'GENERATION_QUOTA_EXCEEDED',
      status: 429,
    });
  });
  it('retains daily usage after project deletion and database restart', async () => {
    let db = openDatabase(root, { dataDir: root });
    const user = upsertFeishuUser(db, { tenantKey: 'test', openId: 'owner', name: 'Owner' });
    const now = Date.now();
    db.prepare('INSERT INTO projects (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('deleted-project', 'Deleted', user.id, now, now);
    insertMediaTask(db, { id: 'consumed', projectId: 'deleted-project', status: 'failed' });
    expect(userDailyGenerationCount(db, user.id)).toBe(1);
    deleteProject(db, 'deleted-project');
    expect(userDailyGenerationCount(db, user.id)).toBe(1);
    closeDatabase();
    db = openDatabase(root, { dataDir: root });
    expect(userDailyGenerationCount(db, user.id)).toBe(1);
  });

  it('backfills existing media and presentation usage once and preserves its rolling window', () => {
    let db = openDatabase(root, { dataDir: root });
    const user = upsertFeishuUser(db, { tenantKey: 'test', openId: 'owner', name: 'Owner' });
    // Restore the pre-ledger schema to exercise upgrade against existing data.
    for (const trigger of [
      'niki_media_generation_usage', 'niki_presentation_generation_usage',
      'niki_presentation_generation_usage_update', 'niki_adopted_generation_usage',
    ]) db.exec(`DROP TRIGGER ${trigger}`);
    db.exec('DROP TABLE niki_generation_usage');
    const now = Date.now();
    const addProject = db.prepare('INSERT INTO projects (id, name, owner_user_id, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    addProject.run('deck', 'Deck', user.id, JSON.stringify({ presentation: { createdAt: now } }), now, now);
    addProject.run('media', 'Media', user.id, null, now, now);
    insertMediaTask(db, { id: 'recent', projectId: 'media', createdAt: now });
    insertMediaTask(db, { id: 'expired', projectId: 'media', createdAt: now - 86_400_001 });
    closeDatabase();
    db = openDatabase(root, { dataDir: root });
    expect(userDailyGenerationCount(db, user.id, now)).toBe(2);
    deleteProject(db, 'deck');
    deleteProject(db, 'media');
    closeDatabase();
    db = openDatabase(root, { dataDir: root });
    expect(userDailyGenerationCount(db, user.id, now)).toBe(2);
    expect(userDailyGenerationCount(db, user.id, now + 86_400_001)).toBe(0);
  });

  it('counts recreated task IDs and new presentations without charging status updates', () => {
    const db = openDatabase(root, { dataDir: root });
    const user = upsertFeishuUser(db, { tenantKey: 'test', openId: 'owner', name: 'Owner' });
    const now = Date.now();
    const addProject = db.prepare('INSERT INTO projects (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    addProject.run('media', 'Media', user.id, now, now);
    insertMediaTask(db, { id: 'reused-id', projectId: 'media' });
    deleteProject(db, 'media');
    addProject.run('media', 'Media again', user.id, now, now);
    insertMediaTask(db, { id: 'reused-id', projectId: 'media' });
    db.prepare('UPDATE projects SET metadata_json = ? WHERE id = ?').run(JSON.stringify({ presentation: { createdAt: now, status: 'generating' } }), 'media');
    db.prepare('UPDATE projects SET metadata_json = ? WHERE id = ?').run(JSON.stringify({ presentation: { createdAt: now, status: 'complete' } }), 'media');
    expect(userDailyGenerationCount(db, user.id)).toBe(3);
    deleteProject(db, 'media');
    expect(userDailyGenerationCount(db, user.id)).toBe(3);
  });

  it('counts local projects when the first Feishu user adopts them', () => {
    const db = openDatabase(root, { dataDir: root });
    const now = Date.now();
    db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('local', 'Local', now, now);
    insertMediaTask(db, { id: 'local-task', projectId: 'local' });
    const user = upsertFeishuUser(db, { tenantKey: 'test', openId: 'owner', name: 'Owner' });
    expect(userDailyGenerationCount(db, user.id)).toBe(1);
  });

  it('rolls back consumption with a failed insert and rechecks stale admission snapshots', async () => {
    const db = openDatabase(root, { dataDir: root });
    const user = upsertFeishuUser(db, { tenantKey: 'test', openId: 'owner', name: 'Owner' });
    const now = Date.now();
    db.prepare('INSERT INTO projects (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('media', 'Media', user.id, now, now);
    updateNikiUserQuota(db, user.id, { storageBytes: 100_000, dailyGenerations: 1 });
    const status = await assertNikiStorageAllowed(db, path.join(root, 'projects'), user.id);
    expect(() => withNikiGenerationAdmission(db, status, () => {
      insertMediaTask(db, { id: 'rolled-back', projectId: 'media' });
      throw new Error('Write failed');
    })).toThrow('Write failed');
    expect(userDailyGenerationCount(db, user.id)).toBe(0);
    withNikiGenerationAdmission(db, status, () => insertMediaTask(db, { id: 'accepted', projectId: 'media' }));
    expect(() => withNikiGenerationAdmission(db, status, () => insertMediaTask(db, { id: 'rejected', projectId: 'media' })))
      .toThrow('过去 24 小时的生成额度已用完');
    expect(userDailyGenerationCount(db, user.id)).toBe(1);
  });

});
