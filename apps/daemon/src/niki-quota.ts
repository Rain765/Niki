import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type {
  NikiManagedUser,
  NikiUserQuota,
  NikiUserQuotaStatus,
} from '@open-design/contracts';

type SqliteDb = Database.Database;

export const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
export const DEFAULT_DAILY_GENERATION_QUOTA = 30;
export const MAX_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024 * 1024;
export const MAX_DAILY_GENERATION_QUOTA = 10_000;
const GENERATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class NikiQuotaExceededError extends Error {
  readonly status = 429;

  constructor(
    readonly code: 'STORAGE_QUOTA_EXCEEDED' | 'GENERATION_QUOTA_EXCEEDED',
    message: string,
    readonly statusBody: NikiUserQuotaStatus,
  ) {
    super(message);
    this.name = 'NikiQuotaExceededError';
  }
}

interface QuotaRow {
  storageQuotaBytes: number;
  dailyGenerationQuota: number;
}

interface ManagedUserRow extends QuotaRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  isActive: number;
  createdAt: number;
  username: string | null;
}

function normalizeQuota(row: QuotaRow): NikiUserQuota {
  return {
    storageBytes: Number(row.storageQuotaBytes),
    dailyGenerations: Number(row.dailyGenerationQuota),
  };
}

function quotaRow(db: SqliteDb, userId: string): QuotaRow | null {
  return db.prepare(
    `SELECT storage_quota_bytes AS storageQuotaBytes,
            daily_generation_quota AS dailyGenerationQuota
       FROM niki_users
      WHERE id = ?`,
  ).get(userId) as QuotaRow | undefined ?? null;
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      try {
        const stats = await lstat(entryPath);
        total += stats.size;
      } catch {
        // Files may disappear while a generation is finalizing. The next
        // quota read will observe the stable state.
      }
    }
  }
  return total;
}

export async function userProjectStorageBytes(
  db: SqliteDb,
  projectsRoot: string,
  userId: string,
): Promise<number> {
  const rows = db.prepare(
    'SELECT id FROM projects WHERE owner_user_id = ?',
  ).all(userId) as Array<{ id: string }>;
  const sizes = await Promise.all(
    rows.map((row) => directoryBytes(path.join(projectsRoot, row.id))),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

export function userDailyGenerationCount(
  db: SqliteDb,
  userId: string,
  now = Date.now(),
): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM media_tasks tasks
       JOIN projects ON projects.id = tasks.project_id
      WHERE projects.owner_user_id = ?
        AND tasks.created_at >= ?`,
  ).get(userId, now - GENERATION_WINDOW_MS) as { count: number } | undefined;
  const presentations = db.prepare(
    `SELECT COUNT(*) AS count FROM projects
      WHERE owner_user_id = ? AND json_extract(metadata_json, '$.presentation.createdAt') >= ?`,
  ).get(userId, now - GENERATION_WINDOW_MS) as { count: number } | undefined;
  return Number(row?.count ?? 0) + Number(presentations?.count ?? 0);
}

export async function getNikiQuotaStatus(
  db: SqliteDb,
  projectsRoot: string,
  userId: string,
  options: { now?: number } = {},
): Promise<NikiUserQuotaStatus> {
  const row = quotaRow(db, userId);
  if (!row) throw new Error('Niki user not found');
  const now = options.now ?? Date.now();
  const [storageBytes, dailyGenerations] = await Promise.all([
    userProjectStorageBytes(db, projectsRoot, userId),
    Promise.resolve(userDailyGenerationCount(db, userId, now)),
  ]);
  const quota = normalizeQuota(row);
  return {
    userId,
    quota,
    usage: {
      storageBytes,
      dailyGenerations,
      windowStartedAt: now - GENERATION_WINDOW_MS,
    },
    allowed: {
      storage: storageBytes < quota.storageBytes,
      generation: dailyGenerations < quota.dailyGenerations,
    },
  };
}

export async function assertNikiStorageAllowed(
  db: SqliteDb,
  projectsRoot: string,
  userId: string,
  additionalBytes = 0,
): Promise<NikiUserQuotaStatus> {
  const status = await getNikiQuotaStatus(db, projectsRoot, userId);
  if (
    !status.allowed.storage
    || status.usage.storageBytes + Math.max(0, additionalBytes) > status.quota.storageBytes
  ) {
    throw new NikiQuotaExceededError(
      'STORAGE_QUOTA_EXCEEDED',
      '存储额度已用完，请删除旧文件或联系管理员提高额度',
      status,
    );
  }
  return status;
}

export async function assertNikiGenerationAllowed(
  db: SqliteDb,
  projectsRoot: string,
  userId: string,
): Promise<NikiUserQuotaStatus> {
  const status = await assertNikiStorageAllowed(db, projectsRoot, userId);
  if (!status.allowed.generation) {
    throw new NikiQuotaExceededError(
      'GENERATION_QUOTA_EXCEEDED',
      '过去 24 小时的生成额度已用完，请稍后再试或联系管理员提高额度',
      status,
    );
  }
  return status;
}

function quotaInteger(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function updateNikiUserQuota(
  db: SqliteDb,
  userId: string,
  quota: NikiUserQuota,
): boolean {
  const storageBytes = quotaInteger(
    quota.storageBytes,
    'storageBytes',
    MAX_STORAGE_QUOTA_BYTES,
  );
  const dailyGenerations = quotaInteger(
    quota.dailyGenerations,
    'dailyGenerations',
    MAX_DAILY_GENERATION_QUOTA,
  );
  const result = db.prepare(
    `UPDATE niki_users
        SET storage_quota_bytes = ?,
            daily_generation_quota = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(storageBytes, dailyGenerations, Date.now(), userId);
  return result.changes > 0;
}

export async function listNikiManagedUsers(
  db: SqliteDb,
  projectsRoot: string,
  options: { now?: number } = {},
): Promise<NikiManagedUser[]> {
  const rows = db.prepare(
    `SELECT users.id,
            users.name,
            users.avatar_url AS avatarUrl,
            users.role,
            users.is_active AS isActive,
            users.created_at AS createdAt,
            users.storage_quota_bytes AS storageQuotaBytes,
            users.daily_generation_quota AS dailyGenerationQuota,
            accounts.username
       FROM niki_users users
       LEFT JOIN niki_password_accounts accounts ON accounts.user_id = users.id
      ORDER BY users.created_at ASC`,
  ).all() as ManagedUserRow[];
  return await Promise.all(rows.map(async (row) => {
    const status = await getNikiQuotaStatus(db, projectsRoot, row.id, options);
    return {
      user: {
        id: row.id,
        name: row.name,
        ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
        role: row.role === 'admin' ? 'admin' : 'member',
      },
      provider: row.username ? 'password' : 'feishu',
      ...(row.username ? { username: row.username } : {}),
      isActive: row.isActive === 1,
      createdAt: row.createdAt,
      quota: status.quota,
      usage: status.usage,
    };
  }));
}
