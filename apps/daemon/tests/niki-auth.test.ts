import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  consumeNikiOAuthState,
  createNikiOAuthState,
  createNikiSession,
  resolveNikiSession,
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
});
