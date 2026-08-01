import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import { migrateMediaTasks } from '../src/media-tasks.js';
import {
  assertNikiGenerationAllowed,
  assertNikiStorageAllowed,
  DEFAULT_DAILY_GENERATION_QUOTA,
  DEFAULT_STORAGE_QUOTA_BYTES,
  getNikiQuotaStatus,
  updateNikiUserQuota,
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
});
