import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import type { NikiPasswordAccount } from '@open-design/contracts';
import type { NikiAuthUser, NikiUserRole } from './niki-auth-context.js';

type SqliteDb = Database.Database;

export interface FeishuUserProfile {
  tenantKey: string;
  openId: string;
  unionId?: string;
  name: string;
  avatarUrl?: string;
}

export interface NikiSession {
  token: string;
  expiresAt: number;
}

export interface CreatePasswordUserInput {
  username: string;
  name: string;
  password: string;
}

export class NikiPasswordAccountError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid-username'
      | 'invalid-name'
      | 'weak-password'
      | 'username-taken'
      | 'already-initialized',
  ) {
    super(message);
    this.name = 'NikiPasswordAccountError';
  }
}

const PASSWORD_TENANT_KEY = '__niki_password__';
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_VERSION = 'v1';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const MAX_ACTIVE_SESSIONS_PER_USER = 10;
const DUMMY_PASSWORD_SALT = Buffer.from('niki-password-dummy-salt-v1');
const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeUser(row: Record<string, unknown>): NikiAuthUser {
  const unionId = typeof row.unionId === 'string' && row.unionId
    ? row.unionId
    : undefined;
  const avatarUrl = typeof row.avatarUrl === 'string' && row.avatarUrl
    ? row.avatarUrl
    : undefined;
  return {
    id: String(row.id),
    tenantKey: String(row.tenantKey),
    openId: String(row.openId),
    ...(unionId ? { unionId } : {}),
    name: String(row.name),
    ...(avatarUrl ? { avatarUrl } : {}),
    role: row.role === 'admin' ? 'admin' : 'member',
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

const USER_COLS = `
  id,
  feishu_tenant_key AS tenantKey,
  feishu_open_id AS openId,
  feishu_union_id AS unionId,
  name,
  avatar_url AS avatarUrl,
  role,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const JOINED_USER_COLS = `
  users.id,
  users.feishu_tenant_key AS tenantKey,
  users.feishu_open_id AS openId,
  users.feishu_union_id AS unionId,
  users.name,
  users.avatar_url AS avatarUrl,
  users.role,
  users.created_at AS createdAt,
  users.updated_at AS updatedAt
`;

/**
 * The first Feishu identity becomes the workspace administrator and claims
 * projects created before multi-user auth was enabled. Every later identity
 * starts with an empty, isolated project list.
 */
export function upsertFeishuUser(
  db: SqliteDb,
  profile: FeishuUserProfile,
  now = Date.now(),
): NikiAuthUser {
  const transaction = db.transaction(() => {
    const existing = db.prepare(
      `SELECT ${USER_COLS}
         FROM niki_users
        WHERE feishu_tenant_key = ? AND feishu_open_id = ?`,
    ).get(profile.tenantKey, profile.openId) as Record<string, unknown> | undefined;

    if (existing) {
      db.prepare(
        `UPDATE niki_users
            SET feishu_union_id = ?,
                name = ?,
                avatar_url = ?,
                updated_at = ?
          WHERE id = ?`,
      ).run(
        profile.unionId ?? null,
        profile.name,
        profile.avatarUrl ?? null,
        now,
        existing.id,
      );
      const updated = db.prepare(
        `SELECT ${USER_COLS} FROM niki_users WHERE id = ?`,
      ).get(existing.id) as Record<string, unknown>;
      return normalizeUser(updated);
    }

    const userCount = Number(
      (db.prepare('SELECT COUNT(*) AS count FROM niki_users').get() as { count: number }).count,
    );
    const role: NikiUserRole = userCount === 0 ? 'admin' : 'member';
    const id = randomUUID();
    db.prepare(
      `INSERT INTO niki_users
        (id, feishu_tenant_key, feishu_open_id, feishu_union_id, name,
         avatar_url, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      profile.tenantKey,
      profile.openId,
      profile.unionId ?? null,
      profile.name,
      profile.avatarUrl ?? null,
      role,
      now,
      now,
    );

    if (role === 'admin') {
      db.prepare(
        'UPDATE projects SET owner_user_id = ? WHERE owner_user_id IS NULL',
      ).run(id);
    }

    const inserted = db.prepare(
      `SELECT ${USER_COLS} FROM niki_users WHERE id = ?`,
    ).get(id) as Record<string, unknown>;
    return normalizeUser(inserted);
  });

  return transaction();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new NikiPasswordAccountError('密码需为 10–128 个字符', 'weak-password');
  }
}

function validatePasswordAccountInput(input: CreatePasswordUserInput): {
  username: string;
  name: string;
} {
  const username = normalizeUsername(input.username);
  const name = input.name.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new NikiPasswordAccountError(
      '用户名需为 3–32 位字母、数字、点、下划线或短横线',
      'invalid-username',
    );
  }
  if (!name || name.length > 80) {
    throw new NikiPasswordAccountError('显示名称不能为空且不能超过 80 字', 'invalid-name');
  }
  validatePassword(input.password);
  return { username, name };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    'scrypt',
    SCRYPT_VERSION,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

async function derivePassword(
  password: string,
  salt: Buffer,
  keyLength: number,
  parameters: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scryptAsync(password, salt, keyLength, {
    ...parameters,
    maxmem: SCRYPT_MAXMEM,
  });
}

async function passwordMatches(
  password: string,
  storedHash: string,
): Promise<{ matches: boolean; needsUpgrade: boolean }> {
  const parts = storedHash.split('$');
  if (parts[0] !== 'scrypt') return { matches: false, needsUpgrade: false };
  const versioned = parts[1] === SCRYPT_VERSION;
  const saltText = versioned ? parts[5] : parts[1];
  const hashText = versioned ? parts[6] : parts[2];
  const N = versioned ? Number(parts[2]) : SCRYPT_N;
  const r = versioned ? Number(parts[3]) : SCRYPT_R;
  const p = versioned ? Number(parts[4]) : SCRYPT_P;
  if (
    !saltText
    || !hashText
    || !Number.isSafeInteger(N)
    || !Number.isSafeInteger(r)
    || !Number.isSafeInteger(p)
    || N < 2
    || r < 1
    || p < 1
  ) {
    return { matches: false, needsUpgrade: false };
  }
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await derivePassword(
      password,
      Buffer.from(saltText, 'base64url'),
      expected.length,
      { N, r, p },
    );
    return {
      matches: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsUpgrade: !versioned
        || N !== SCRYPT_N
        || r !== SCRYPT_R
        || p !== SCRYPT_P,
    };
  } catch {
    return { matches: false, needsUpgrade: false };
  }
}

function normalizePasswordAccount(row: Record<string, unknown>): NikiPasswordAccount {
  const user = normalizeUser(row);
  return {
    username: String(row.username),
    user: {
      id: user.id,
      name: user.name,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      role: user.role,
    },
    isActive: Number(row.isActive) === 1,
    createdAt: Number(row.accountCreatedAt),
  };
}

const PASSWORD_ACCOUNT_COLS = `
  ${JOINED_USER_COLS},
  accounts.username,
  users.is_active AS isActive,
  accounts.created_at AS accountCreatedAt
`;

/**
 * Password accounts are provisioned by an authenticated administrator. There
 * is deliberately no self-registration path; every account still maps to the
 * same niki_users row used by Feishu identities and project isolation.
 */
export async function createPasswordUser(
  db: SqliteDb,
  input: CreatePasswordUserInput,
  now = Date.now(),
): Promise<NikiPasswordAccount> {
  const { username, name } = validatePasswordAccountInput(input);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const transaction = db.transaction(() => {
    const existing = db.prepare(
      'SELECT 1 FROM niki_password_accounts WHERE username = ? COLLATE NOCASE',
    ).get(username);
    if (existing) {
      throw new NikiPasswordAccountError('用户名已存在', 'username-taken');
    }
    db.prepare(
      `INSERT INTO niki_users
        (id, feishu_tenant_key, feishu_open_id, feishu_union_id, name,
         avatar_url, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, NULL, 'member', 1, ?, ?)`,
    ).run(id, PASSWORD_TENANT_KEY, `password:${id}`, name, now, now);
    db.prepare(
      `INSERT INTO niki_password_accounts
        (user_id, username, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, username, passwordHash, now, now);
    const row = db.prepare(
      `SELECT ${PASSWORD_ACCOUNT_COLS}
         FROM niki_password_accounts accounts
         JOIN niki_users users ON users.id = accounts.user_id
        WHERE accounts.user_id = ?`,
    ).get(id) as Record<string, unknown>;
    return normalizePasswordAccount(row);
  });
  return transaction();
}

/**
 * Creates the first password identity as the workspace administrator. The
 * empty-workspace check and inserts share one SQLite transaction, making this
 * safe even if two local bootstrap commands race.
 */
export async function bootstrapPasswordAdmin(
  db: SqliteDb,
  input: CreatePasswordUserInput,
  now = Date.now(),
): Promise<NikiPasswordAccount> {
  const { username, name } = validatePasswordAccountInput(input);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const transaction = db.transaction(() => {
    const userCount = Number(
      (db.prepare('SELECT COUNT(*) AS count FROM niki_users').get() as { count: number }).count,
    );
    if (userCount !== 0) {
      throw new NikiPasswordAccountError(
        '工作区已经完成管理员初始化',
        'already-initialized',
      );
    }
    db.prepare(
      `INSERT INTO niki_users
        (id, feishu_tenant_key, feishu_open_id, feishu_union_id, name,
         avatar_url, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, NULL, 'admin', 1, ?, ?)`,
    ).run(id, PASSWORD_TENANT_KEY, `password:${id}`, name, now, now);
    db.prepare(
      `INSERT INTO niki_password_accounts
        (user_id, username, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, username, passwordHash, now, now);
    db.prepare(
      'UPDATE projects SET owner_user_id = ? WHERE owner_user_id IS NULL',
    ).run(id);
    const row = db.prepare(
      `SELECT ${PASSWORD_ACCOUNT_COLS}
         FROM niki_password_accounts accounts
         JOIN niki_users users ON users.id = accounts.user_id
        WHERE accounts.user_id = ?`,
    ).get(id) as Record<string, unknown>;
    return normalizePasswordAccount(row);
  });
  return transaction();
}

export async function verifyPasswordUser(
  db: SqliteDb,
  username: string,
  password: string,
): Promise<NikiAuthUser | null> {
  const normalized = normalizeUsername(username);
  if (!normalized || !password || password.length > 128) return null;
  const row = db.prepare(
    `SELECT ${JOINED_USER_COLS}, accounts.password_hash AS passwordHash
       FROM niki_password_accounts accounts
       JOIN niki_users users ON users.id = accounts.user_id
      WHERE accounts.username = ? COLLATE NOCASE
        AND users.is_active = 1`,
  ).get(normalized) as Record<string, unknown> | undefined;
  if (!row || typeof row.passwordHash !== 'string') {
    // Keep nonexistent usernames on the same expensive code path as wrong
    // passwords so the response time does not reveal whether an account exists.
    await derivePassword(password, DUMMY_PASSWORD_SALT, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    return null;
  }
  const result = await passwordMatches(password, row.passwordHash);
  if (!result.matches) return null;
  if (result.needsUpgrade) {
    db.prepare(
      `UPDATE niki_password_accounts
          SET password_hash = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(await hashPassword(password), Date.now(), row.id);
  }
  return normalizeUser(row);
}

export function listPasswordUsers(db: SqliteDb): NikiPasswordAccount[] {
  const rows = db.prepare(
    `SELECT ${PASSWORD_ACCOUNT_COLS}
       FROM niki_password_accounts accounts
       JOIN niki_users users ON users.id = accounts.user_id
      ORDER BY accounts.created_at DESC`,
  ).all() as Record<string, unknown>[];
  return rows.map(normalizePasswordAccount);
}

export async function updatePasswordUser(
  db: SqliteDb,
  userId: string,
  password: string,
  now = Date.now(),
): Promise<boolean> {
  validatePassword(password);
  const passwordHash = await hashPassword(password);
  const transaction = db.transaction(() => {
    const updated = db.prepare(
      `UPDATE niki_password_accounts
          SET password_hash = ?,
              updated_at = ?
        WHERE user_id = ?`,
    ).run(passwordHash, now, userId);
    if (updated.changes === 0) return false;
    db.prepare('DELETE FROM niki_auth_sessions WHERE user_id = ?').run(userId);
    return true;
  });
  return transaction();
}

export async function changeOwnPassword(
  db: SqliteDb,
  userId: string,
  currentPassword: string,
  newPassword: string,
  now = Date.now(),
): Promise<NikiAuthUser | null> {
  const account = db.prepare(
    'SELECT username FROM niki_password_accounts WHERE user_id = ?',
  ).get(userId) as { username: string } | undefined;
  if (!account) return null;
  const verified = await verifyPasswordUser(db, account.username, currentPassword);
  if (!verified || verified.id !== userId) return null;
  await updatePasswordUser(db, userId, newPassword, now);
  return verified;
}

export function disablePasswordUser(db: SqliteDb, userId: string, now = Date.now()): boolean {
  const transaction = db.transaction(() => {
    const account = db.prepare(
      'SELECT 1 FROM niki_password_accounts WHERE user_id = ?',
    ).get(userId);
    if (!account) return false;
    db.prepare(
      'UPDATE niki_users SET is_active = 0, updated_at = ? WHERE id = ?',
    ).run(now, userId);
    db.prepare('DELETE FROM niki_auth_sessions WHERE user_id = ?').run(userId);
    return true;
  });
  return transaction();
}

export function createNikiSession(
  db: SqliteDb,
  userId: string,
  now = Date.now(),
  ttlMs = 7 * 24 * 60 * 60 * 1_000,
): NikiSession {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + ttlMs;
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM niki_auth_sessions WHERE expires_at <= ?').run(now);
    db.prepare(
      `INSERT INTO niki_auth_sessions
        (token_hash, user_id, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(tokenHash(token), userId, expiresAt, now, now);
    db.prepare(
      `DELETE FROM niki_auth_sessions
        WHERE user_id = ?
          AND token_hash NOT IN (
            SELECT token_hash
              FROM niki_auth_sessions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ?
          )`,
    ).run(userId, userId, MAX_ACTIVE_SESSIONS_PER_USER);
  });
  transaction();
  return { token, expiresAt };
}

export function resolveNikiSession(
  db: SqliteDb,
  token: string,
  now = Date.now(),
): NikiAuthUser | null {
  if (!token) return null;
  const hash = tokenHash(token);
  const row = db.prepare(
    `SELECT ${JOINED_USER_COLS}
       FROM niki_auth_sessions sessions
       JOIN niki_users users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
        AND users.is_active = 1`,
  ).get(hash, now) as Record<string, unknown> | undefined;
  if (!row) {
    db.prepare(
      'DELETE FROM niki_auth_sessions WHERE token_hash = ? OR expires_at <= ?',
    ).run(hash, now);
    return null;
  }
  db.prepare(
    'UPDATE niki_auth_sessions SET last_seen_at = ? WHERE token_hash = ?',
  ).run(now, hash);
  return normalizeUser(row);
}

export function deleteNikiSession(db: SqliteDb, token: string): void {
  if (!token) return;
  db.prepare('DELETE FROM niki_auth_sessions WHERE token_hash = ?')
    .run(tokenHash(token));
}

export function createNikiOAuthState(
  db: SqliteDb,
  returnTo: string,
  now = Date.now(),
  ttlMs = 10 * 60 * 1_000,
): string {
  const state = randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO niki_oauth_states
      (state_hash, return_to, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(tokenHash(state), returnTo, now + ttlMs, now);
  return state;
}

export function consumeNikiOAuthState(
  db: SqliteDb,
  state: string,
  now = Date.now(),
): string | null {
  if (!state) return null;
  const hash = tokenHash(state);
  const transaction = db.transaction(() => {
    const row = db.prepare(
      `SELECT return_to AS returnTo, expires_at AS expiresAt
         FROM niki_oauth_states
        WHERE state_hash = ?`,
    ).get(hash) as { returnTo: string; expiresAt: number } | undefined;
    db.prepare('DELETE FROM niki_oauth_states WHERE state_hash = ?').run(hash);
    db.prepare('DELETE FROM niki_oauth_states WHERE expires_at <= ?').run(now);
    if (!row || Number(row.expiresAt) <= now) return null;
    return row.returnTo;
  });
  return transaction();
}
