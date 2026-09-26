import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getProject,
  insertProject,
  insertConversation,
  listProjects,
  listLatestProjectRunStatuses,
  listProjectsAwaitingInput,
  openDatabase,
  updateProject,
  upsertMessage,
} from '../src/db.js';
import {
  consumeNikiOAuthState,
  createPasswordUser,
  createNikiOAuthState,
  createNikiSession,
  resolveNikiSession,
  updatePasswordUser,
  verifyPasswordUser,
  upsertFeishuUser,
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

  it('isolates project updates, run status, and awaiting-input metadata', () => {
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
    const now = 1_720_000_000_000;

    for (const [user, projectId] of [
      [first, 'first-project'],
      [second, 'second-project'],
    ] as const) {
      runAsNikiUser(user, () => {
        insertProject(db, {
          id: projectId,
          name: projectId,
          createdAt: now,
          updatedAt: now,
        });
        insertConversation(db, {
          id: `${projectId}-conversation`,
          projectId,
          createdAt: now,
          updatedAt: now,
        });
        upsertMessage(db, `${projectId}-conversation`, {
          id: `${projectId}-message`,
          role: 'assistant',
          content: '<question-form>Choose one</question-form>',
          runId: `${projectId}-run`,
          runStatus: 'running',
          createdAt: now,
        });
      });
    }

    expect(runAsNikiUser(first, () =>
      updateProject(db, 'second-project', { name: 'stolen' })))
      .toBeNull();
    expect(runAsNikiUser(first, () =>
      [...listLatestProjectRunStatuses(db).keys()]))
      .toEqual(['first-project']);
    expect(runAsNikiUser(first, () =>
      [...listProjectsAwaitingInput(db)]))
      .toEqual(['first-project']);
    expect(runAsNikiUser(second, () =>
      [...listLatestProjectRunStatuses(db).keys()]))
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

  it('keeps only the ten newest active sessions for one account', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const user = upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'open-first',
      name: 'First teammate',
    });
    const start = 1_720_000_000_000;
    const sessions = Array.from({ length: 11 }, (_, index) =>
      createNikiSession(db, user.id, start + index, 60_000));

    expect(resolveNikiSession(db, sessions[0]!.token, start + 20)).toBeNull();
    expect(resolveNikiSession(db, sessions[10]!.token, start + 20)?.id)
      .toBe(user.id);
    const stored = db.prepare(
      'SELECT COUNT(*) AS count FROM niki_auth_sessions WHERE user_id = ?',
    ).get(user.id) as { count: number };
    expect(stored.count).toBe(10);
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

  it('stores an administrator-created password account as a salted hash', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertFeishuUser(db, {
      tenantKey: 'tenant-a',
      openId: 'admin-open-id',
      name: 'Workspace administrator',
    });

    const created = await createPasswordUser(db, {
      username: 'friend.one',
      name: 'Friend One',
      password: 'A-strong-password-2026',
    });
    const stored = db.prepare(
      `SELECT username, password_hash AS passwordHash
         FROM niki_password_accounts
        WHERE user_id = ?`,
    ).get(created.user.id) as { username: string; passwordHash: string };

    expect(created.username).toBe('friend.one');
    expect(created.user.role).toBe('member');
    expect(stored.username).toBe('friend.one');
    expect(stored.passwordHash).not.toContain('A-strong-password-2026');
    expect((await verifyPasswordUser(
      db,
      'FRIEND.ONE',
      'A-strong-password-2026',
    ))?.id).toBe(created.user.id);
    expect(await verifyPasswordUser(db, 'friend.one', 'wrong-password'))
      .toBeNull();
  });

  it('accepts four-character passwords and rejects shorter passwords', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const created = await createPasswordUser(db, {
      username: 'friend.two',
      name: 'Friend Two',
      password: '1234',
    });

    expect((await verifyPasswordUser(db, 'friend.two', '1234'))?.id)
      .toBe(created.user.id);
    await expect(createPasswordUser(db, {
      username: 'friend.three',
      name: 'Friend Three',
      password: '123',
    })).rejects.toMatchObject({
      code: 'weak-password',
      message: '密码需为 4–128 个字符',
    });
  });

  it('lets an administrator replace a password and invalidates existing sessions', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const created = await createPasswordUser(db, {
      username: 'friend.four',
      name: 'Friend Four',
      password: 'old4',
    });
    const session = createNikiSession(db, created.user.id);

    await expect(updatePasswordUser(db, created.user.id, 'new4'))
      .resolves.toBe(true);

    expect(await verifyPasswordUser(db, 'friend.four', 'old4')).toBeNull();
    expect((await verifyPasswordUser(db, 'friend.four', 'new4'))?.id)
      .toBe(created.user.id);
    expect(resolveNikiSession(db, session.token)).toBeNull();
  });
});
