import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const LOGIN_LOCK_MS = 15 * 60 * 1_000;
const LOGIN_MAX_FAILURES = 6;
const GUARD_RETENTION_MS = 24 * 60 * 60 * 1_000;
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

interface GuardRow {
  failedCount: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

export interface PasswordLoginSecurityInput {
  username: string;
  ip: string;
  now?: number;
}

export interface PasswordLoginSecurityResult {
  blocked: boolean;
  retryAfterSeconds: number;
}

function securityHash(kind: 'account' | 'ip', value: string): string {
  return createHash('sha256')
    .update(`niki-security-v1:${kind}:${value}`)
    .digest('hex');
}

function loginScopes(username: string, ip: string) {
  const accountHash = securityHash('account', username.trim().toLowerCase());
  const ipHash = securityHash('ip', ip.trim() || 'unknown');
  return {
    accountHash,
    ipHash,
    scopeHashes: [`account:${accountHash}`, `ip:${ipHash}`],
  };
}

function getGuard(db: SqliteDb, scopeHash: string): GuardRow | undefined {
  return db.prepare(
    `SELECT failed_count AS failedCount,
            window_started_at AS windowStartedAt,
            locked_until AS lockedUntil
       FROM niki_login_guards
      WHERE scope_hash = ?`,
  ).get(scopeHash) as GuardRow | undefined;
}

function retryAfterSeconds(lockedUntil: number, now: number): number {
  return Math.max(1, Math.ceil((lockedUntil - now) / 1_000));
}

function pruneSecurityData(db: SqliteDb, now: number): void {
  db.prepare(
    'DELETE FROM niki_login_guards WHERE updated_at < ?',
  ).run(now - GUARD_RETENTION_MS);
  db.prepare(
    'DELETE FROM niki_security_events WHERE created_at < ?',
  ).run(now - AUDIT_RETENTION_MS);
}

export function recordNikiSecurityEvent(
  db: SqliteDb,
  input: {
    eventType: string;
    outcome: string;
    userId?: string;
    accountHash?: string;
    ipHash?: string;
    metadata?: Record<string, unknown>;
    now?: number;
  },
): void {
  const now = input.now ?? Date.now();
  db.prepare(
    `INSERT INTO niki_security_events
      (id, event_type, user_id, account_hash, ip_hash, outcome,
       metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.eventType,
    input.userId ?? null,
    input.accountHash ?? null,
    input.ipHash ?? null,
    input.outcome,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
  );
}

export function checkPasswordLoginSecurity(
  db: SqliteDb,
  input: PasswordLoginSecurityInput,
): PasswordLoginSecurityResult {
  const now = input.now ?? Date.now();
  const scopes = loginScopes(input.username, input.ip);
  pruneSecurityData(db, now);

  let blockedUntil = 0;
  for (const scopeHash of scopes.scopeHashes) {
    const guard = getGuard(db, scopeHash);
    if (guard?.lockedUntil && guard.lockedUntil > now) {
      blockedUntil = Math.max(blockedUntil, guard.lockedUntil);
    }
  }
  if (blockedUntil === 0) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  recordNikiSecurityEvent(db, {
    eventType: 'password_login',
    outcome: 'blocked',
    accountHash: scopes.accountHash,
    ipHash: scopes.ipHash,
    now,
  });
  return {
    blocked: true,
    retryAfterSeconds: retryAfterSeconds(blockedUntil, now),
  };
}

export function recordPasswordLoginFailure(
  db: SqliteDb,
  input: PasswordLoginSecurityInput,
): PasswordLoginSecurityResult {
  const now = input.now ?? Date.now();
  const scopes = loginScopes(input.username, input.ip);
  const transaction = db.transaction(() => {
    pruneSecurityData(db, now);
    let blockedUntil = 0;
    for (const scopeHash of scopes.scopeHashes) {
      const existing = getGuard(db, scopeHash);
      const windowStartedAt = existing
        && existing.windowStartedAt + LOGIN_WINDOW_MS > now
        ? existing.windowStartedAt
        : now;
      const failedCount = existing
        && existing.windowStartedAt + LOGIN_WINDOW_MS > now
        ? existing.failedCount + 1
        : 1;
      const lockedUntil = existing?.lockedUntil && existing.lockedUntil > now
        ? existing.lockedUntil
        : failedCount >= LOGIN_MAX_FAILURES
          ? now + LOGIN_LOCK_MS
          : null;
      if (lockedUntil) blockedUntil = Math.max(blockedUntil, lockedUntil);
      db.prepare(
        `INSERT INTO niki_login_guards
          (scope_hash, failed_count, window_started_at, locked_until, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope_hash) DO UPDATE SET
           failed_count = excluded.failed_count,
           window_started_at = excluded.window_started_at,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`,
      ).run(scopeHash, failedCount, windowStartedAt, lockedUntil, now);
    }
    recordNikiSecurityEvent(db, {
      eventType: 'password_login',
      outcome: blockedUntil > 0 ? 'blocked' : 'failure',
      accountHash: scopes.accountHash,
      ipHash: scopes.ipHash,
      now,
    });
    return blockedUntil;
  });
  const blockedUntil = transaction();
  return blockedUntil > 0
    ? {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(blockedUntil, now),
    }
    : { blocked: false, retryAfterSeconds: 0 };
}

export function recordPasswordLoginSuccess(
  db: SqliteDb,
  input: PasswordLoginSecurityInput & { userId: string },
): void {
  const now = input.now ?? Date.now();
  const scopes = loginScopes(input.username, input.ip);
  const transaction = db.transaction(() => {
    for (const scopeHash of scopes.scopeHashes) {
      db.prepare('DELETE FROM niki_login_guards WHERE scope_hash = ?')
        .run(scopeHash);
    }
    recordNikiSecurityEvent(db, {
      eventType: 'password_login',
      outcome: 'success',
      userId: input.userId,
      accountHash: scopes.accountHash,
      ipHash: scopes.ipHash,
      now,
    });
  });
  transaction();
}
