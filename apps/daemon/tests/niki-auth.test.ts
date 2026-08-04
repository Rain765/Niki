import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { scryptSync } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getProject,
  insertProject,
  listProjects,
  openDatabase,
} from '../src/db.js';
import {
  bootstrapPasswordAdmin,
  consumeNikiOAuthState,
  createNikiOAuthState,
  createNikiSession,
  resolveNikiSession,
  upsertFeishuUser,
  verifyPasswordUser,
} from '../src/niki-auth.js';
import {
  currentNikiSessionToken,
  runAsNikiUser,
} from '../src/niki-auth-context.js';

describe('Niki Feishu authentication persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'niki-auth-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('makes the first Feishu user admin and assigns legacy projects to them', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = 1_720_000_000_000;
    insertProject(db, {
      id: 'legacy-project',
      name: 'Legacy',
      createdAt: now,
      updatedAt: now,
    });

    const first = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-first',
      unionId: 'union-first',
      name: 'First teammate',
      avatarUrl: 'https://example.test/first.png',
    }, now);
    const second = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-second',
      name: 'Second teammate',
    }, now + 1);

    expect(first.role).toBe('admin');
    expect(second.role).toBe('member');
    expect(runAsNikiUser(first, () => getProject(db, 'legacy-project'))?.id)
      .toBe('legacy-project');
    expect(runAsNikiUser(second, () => getProject(db, 'legacy-project')))
      .toBeNull();
  });

  it('isolates newly created projects by the current Niki user', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const first = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-first',
      name: 'First teammate',
    });
    const second = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-second',
      name: 'Second teammate',
    });

    runAsNikiUser(first, () => insertProject(db, {
      id: 'first-project',
      name: 'First project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    runAsNikiUser(second, () => insertProject(db, {
      id: 'second-project',
      name: 'Second project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    expect(runAsNikiUser(first, () => listProjects(db)).map((project) => project.id))
      .toEqual(['first-project']);
    expect(runAsNikiUser(second, () => listProjects(db)).map((project) => project.id))
      .toEqual(['second-project']);
  });

  it('stores only a hash of the session token and expires the session', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const user = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-first',
      name: 'First teammate',
    });
    const now = 1_720_000_000_000;
    const session = createNikiSession(db, user.id, now, 60_000);
    const stored = db.prepare(
      'SELECT token_hash AS tokenHash FROM niki_auth_sessions',
    ).get() as { tokenHash: string };

    expect(stored.tokenHash).not.toBe(session.token);
    expect(resolveNikiSession(db, session.token, now + 30_000)?.id).toBe(user.id);
    expect(resolveNikiSession(db, session.token, now + 60_001)).toBeNull();
  });

  it('consumes OAuth state exactly once', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = 1_720_000_000_000;
    const state = createNikiOAuthState(db, '/projects/example', now, 60_000);

    expect(consumeNikiOAuthState(db, state, now + 1_000)).toBe('/projects/example');
    expect(consumeNikiOAuthState(db, state, now + 2_000)).toBeNull();
  });

  it('keeps the current browser session available only inside its user context', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const user = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-first',
      name: 'First teammate',
    });

    expect(currentNikiSessionToken()).toBeNull();
    expect(runAsNikiUser(
      user,
      () => currentNikiSessionToken(),
      'session-for-child-cli',
    )).toBe('session-for-child-cli');
    expect(currentNikiSessionToken()).toBeNull();
  });

  it('bootstraps a password admin, claims legacy projects, and stores versioned scrypt', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    insertProject(db, {
      id: 'legacy-project',
      name: 'Legacy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const account = await bootstrapPasswordAdmin(db, {
      username: 'Owner',
      name: 'Workspace owner',
      password: 'correct horse battery staple',
    });
    const stored = db.prepare(
      'SELECT password_hash AS passwordHash FROM niki_password_accounts',
    ).get() as { passwordHash: string };

    expect(account.username).toBe('owner');
    expect(account.user.role).toBe('admin');
    expect(stored.passwordHash).toMatch(/^scrypt\$v1\$16384\$8\$1\$/);
    expect((await verifyPasswordUser(
      db,
      'OWNER',
      'correct horse battery staple',
    ))?.id).toBe(account.user.id);
    expect(runAsNikiUser(
      {
        ...account.user,
        tenantKey: '__niki_password__',
        openId: `password:${account.user.id}`,
        createdAt: account.createdAt,
        updatedAt: account.createdAt,
      },
      () => getProject(db, 'legacy-project'),
    )?.id).toBe('legacy-project');
  });

  it('rejects weak bootstrap passwords', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    await expect(bootstrapPasswordAdmin(db, {
      username: 'owner',
      name: 'Workspace owner',
      password: 'too-short',
    })).rejects.toMatchObject({ code: 'weak-password' });
  });

  it('accepts legacy password hashes and upgrades them after a successful login', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const password = 'correct horse battery staple';
    const account = await bootstrapPasswordAdmin(db, {
      username: 'owner',
      name: 'Workspace owner',
      password,
    });
    const salt = Buffer.from('legacy-password-salt');
    const legacyHash = `scrypt$${salt.toString('base64url')}`
      + `$${scryptSync(password, salt, 64).toString('base64url')}`;
    db.prepare(
      'UPDATE niki_password_accounts SET password_hash = ? WHERE user_id = ?',
    ).run(legacyHash, account.user.id);

    expect((await verifyPasswordUser(db, 'owner', password))?.id)
      .toBe(account.user.id);
    const upgraded = db.prepare(
      'SELECT password_hash AS passwordHash FROM niki_password_accounts',
    ).get() as { passwordHash: string };
    expect(upgraded.passwordHash).toMatch(/^scrypt\$v1\$16384\$8\$1\$/);
  });
});
