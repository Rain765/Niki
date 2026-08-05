import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import type { NikiAuthProvider, NikiPasswordAccount } from '@open-design/contracts';
import type { NikiAuthUser, NikiUserRole } from './niki-auth-context.js';

type SqliteDb = Database.Database;

export interface FeishuUserProfile {
  tenantKey: string;
  openId: string;
  unionId?: string;
  name: string;
  avatarUrl?: string;
}

export interface WechatUserProfile {
  appId: string;
  openId: string;
  unionId?: string;
  name: string;
  avatarUrl?: string;
}

interface OAuthIdentityProfile {
  provider: Exclude<NikiAuthProvider, 'password'>;
  issuer: string;
  subject: string;
  unionSubject?: string;
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
    readonly code: 'invalid-username' | 'invalid-name' | 'weak-password' | 'username-taken',
  ) {
    super(message);
    this.name = 'NikiPasswordAccountError';
  }
}

export class NikiIdentityConflictError extends Error {
  constructor(message = '该微信身份已绑定到另一个 Niki 账号') {
    super(message);
    this.name = 'NikiIdentityConflictError';
  }
}

const PASSWORD_TENANT_KEY = '__niki_password__';
const SCRYPT_KEY_LENGTH = 64;
const MAX_ACTIVE_SESSIONS_PER_USER = 10;
const DUMMY_PASSWORD_SALT = Buffer.from('niki-password-dummy-salt-v1');
const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeUser(row: Record<string, unknown>): NikiAuthUser {
  const avatarUrl = typeof row.avatarUrl === 'string' && row.avatarUrl
    ? row.avatarUrl
    : undefined;
  return {
    id: String(row.id),
    name: String(row.name),
    ...(avatarUrl ? { avatarUrl } : {}),
    role: row.role === 'admin' ? 'admin' : 'member',
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

const USER_COLS = `
  id,
  name,
  avatar_url AS avatarUrl,
  role,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const JOINED_USER_COLS = `
  users.id,
  users.name,
  users.avatar_url AS avatarUrl,
  users.role,
  users.created_at AS createdAt,
  users.updated_at AS updatedAt
`;

const IDENTITY_USER_COLS = `
  ${JOINED_USER_COLS},
  identities.user_id AS identityUserId
`;

function upsertOAuthUser(
  db: SqliteDb,
  profile: OAuthIdentityProfile,
  now: number,
  linkUserId?: string,
): NikiAuthUser {
  const transaction = db.transaction(() => {
    const exactIdentity = db.prepare(
      `SELECT ${IDENTITY_USER_COLS}
         FROM niki_identities identities
         JOIN niki_users users ON users.id = identities.user_id
        WHERE identities.provider = ?
          AND identities.issuer = ?
          AND identities.subject = ?`,
    ).get(profile.provider, profile.issuer, profile.subject) as
      Record<string, unknown> | undefined;
    const unionIdentity = !exactIdentity && profile.unionSubject
      ? db.prepare(
        `SELECT ${IDENTITY_USER_COLS}
           FROM niki_identities identities
           JOIN niki_users users ON users.id = identities.user_id
          WHERE identities.provider = ?
            AND identities.union_subject = ?`,
      ).get(profile.provider, profile.unionSubject) as Record<string, unknown> | undefined
      : undefined;
    const matchedIdentity = exactIdentity ?? unionIdentity;

    if (
      linkUserId
      && matchedIdentity
      && String(matchedIdentity.identityUserId) !== linkUserId
    ) {
      throw new NikiIdentityConflictError();
    }

    const linkedUser = linkUserId
      ? db.prepare(
        `SELECT ${USER_COLS} FROM niki_users WHERE id = ? AND is_active = 1`,
      ).get(linkUserId) as Record<string, unknown> | undefined
      : undefined;
    if (linkUserId && !linkedUser) {
      throw new NikiIdentityConflictError('当前 Niki 账号不可用于绑定微信');
    }

    let userId = matchedIdentity
      ? String(matchedIdentity.identityUserId)
      : linkUserId;
    if (!userId) {
      const userCount = Number(
        (db.prepare('SELECT COUNT(*) AS count FROM niki_users').get() as { count: number }).count,
      );
      // Keep the legacy Feishu bootstrap behavior. A public WeChat identity
      // must never become administrator merely by winning the first-login race.
      const role: NikiUserRole = profile.provider === 'feishu' && userCount === 0
        ? 'admin'
        : 'member';
      userId = randomUUID();
      const legacyTenant = profile.provider === 'feishu'
        ? profile.issuer
        : `__niki_identity__:${profile.provider}`;
      const legacySubject = profile.provider === 'feishu'
        ? profile.subject
        : `${profile.provider}:${userId}`;
      db.prepare(
        `INSERT INTO niki_users
          (id, feishu_tenant_key, feishu_open_id, feishu_union_id, name,
           avatar_url, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        userId,
        legacyTenant,
        legacySubject,
        profile.provider === 'feishu' ? profile.unionSubject ?? null : null,
        profile.name,
        profile.avatarUrl ?? null,
        role,
        now,
        now,
      );
      if (role === 'admin') {
        db.prepare(
          'UPDATE projects SET owner_user_id = ? WHERE owner_user_id IS NULL',
        ).run(userId);
      }
    } else if (!linkUserId) {
      db.prepare(
        `UPDATE niki_users
            SET name = ?, avatar_url = ?, updated_at = ?
          WHERE id = ?`,
      ).run(profile.name, profile.avatarUrl ?? null, now, userId);
    }

    if (!exactIdentity) {
      db.prepare(
        `INSERT INTO niki_identities
          (id, user_id, provider, issuer, subject, union_subject, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        userId,
        profile.provider,
        profile.issuer,
        profile.subject,
        profile.unionSubject ?? null,
        now,
        now,
      );
    } else {
      db.prepare(
        `UPDATE niki_identities
            SET union_subject = COALESCE(?, union_subject), updated_at = ?
          WHERE provider = ? AND issuer = ? AND subject = ?`,
      ).run(
        profile.unionSubject ?? null,
        now,
        profile.provider,
        profile.issuer,
        profile.subject,
      );
    }

    const user = db.prepare(
      `SELECT ${USER_COLS} FROM niki_users WHERE id = ?`,
    ).get(userId) as Record<string, unknown>;
    return normalizeUser(user);
  });
  return transaction();
}

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
  return upsertOAuthUser(db, {
    provider: 'feishu',
    issuer: profile.tenantKey,
    subject: profile.openId,
    ...(profile.unionId ? { unionSubject: profile.unionId } : {}),
    name: profile.name,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  }, now);
}

export function upsertWechatUser(
  db: SqliteDb,
  profile: WechatUserProfile,
  options: { now?: number; linkUserId?: string } = {},
): NikiAuthUser {
  return upsertOAuthUser(db, {
    provider: 'wechat',
    issuer: profile.appId,
    subject: profile.openId,
    ...(profile.unionId ? { unionSubject: profile.unionId } : {}),
    name: profile.name,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  }, options.now ?? Date.now(), options.linkUserId);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new NikiPasswordAccountError('密码需为 8–128 个字符', 'weak-password');
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
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function passwordMatches(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await scryptAsync(
      password,
      Buffer.from(saltText, 'base64url'),
      expected.length,
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
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
    db.prepare(
      `INSERT INTO niki_identities
        (id, user_id, provider, issuer, subject, union_subject, created_at, updated_at)
       VALUES (?, ?, 'password', 'local', ?, NULL, ?, ?)`,
    ).run(randomUUID(), id, username, now, now);
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
    await scryptAsync(password, DUMMY_PASSWORD_SALT, SCRYPT_KEY_LENGTH);
    return null;
  }
  return await passwordMatches(password, row.passwordHash)
    ? normalizeUser(row)
    : null;
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
  options: {
    provider?: 'feishu' | 'wechat';
    channel?: 'website' | 'official-account';
    linkUserId?: string;
  } = {},
): string {
  const state = randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO niki_oauth_states
      (state_hash, return_to, expires_at, created_at, provider, channel, link_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    tokenHash(state),
    returnTo,
    now + ttlMs,
    now,
    options.provider ?? 'feishu',
    options.channel ?? null,
    options.linkUserId ?? null,
  );
  return state;
}

export interface NikiOAuthStateRecord {
  returnTo: string;
  provider: 'feishu' | 'wechat';
  channel?: 'website' | 'official-account';
  linkUserId?: string;
}

export function consumeNikiOAuthStateRecord(
  db: SqliteDb,
  state: string,
  expectedProvider?: 'feishu' | 'wechat',
  now = Date.now(),
): NikiOAuthStateRecord | null {
  if (!state) return null;
  const hash = tokenHash(state);
  const transaction = db.transaction((): NikiOAuthStateRecord | null => {
    const row = db.prepare(
      `SELECT return_to AS returnTo, expires_at AS expiresAt, provider,
              channel, link_user_id AS linkUserId
         FROM niki_oauth_states
        WHERE state_hash = ?`,
    ).get(hash) as {
      returnTo: string;
      expiresAt: number;
      provider: string;
      channel: string | null;
      linkUserId: string | null;
    } | undefined;
    db.prepare('DELETE FROM niki_oauth_states WHERE state_hash = ?').run(hash);
    db.prepare('DELETE FROM niki_oauth_states WHERE expires_at <= ?').run(now);
    const provider = row?.provider === 'feishu' || row?.provider === 'wechat'
      ? row.provider
      : null;
    if (
      !row
      || Number(row.expiresAt) <= now
      || (expectedProvider && row.provider !== expectedProvider)
      || !provider
    ) {
      return null;
    }
    const channel = row.channel === 'website' || row.channel === 'official-account'
      ? row.channel
      : undefined;
    return {
      returnTo: row.returnTo,
      provider,
      ...(channel ? { channel } : {}),
      ...(row.linkUserId ? { linkUserId: row.linkUserId } : {}),
    };
  });
  return transaction();
}

export function consumeNikiOAuthState(
  db: SqliteDb,
  state: string,
  now = Date.now(),
): string | null {
  return consumeNikiOAuthStateRecord(db, state, undefined, now)?.returnTo ?? null;
}
