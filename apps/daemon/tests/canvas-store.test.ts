import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CanvasEvent } from '@open-design/contracts';

import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import {
  appendImageNodes,
  deleteCanvasNode,
  insertCanvasNode,
  listCanvasNodes,
  patchCanvasNode,
  replaceCanvasNodes,
  subscribeCanvas,
} from '../src/canvas-store.js';

describe('canvas store', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-canvas-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function freshDb() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Canvas project', createdAt: now, updatedAt: now });
    return db;
  }

  it('inserts, lists, patches, and deletes nodes', () => {
    const db = freshDb();
    const img = insertCanvasNode(db, 'proj-1', {
      type: 'image',
      x: 10,
      y: 20,
      w: 100,
      h: 100,
      content: { src: '/api/projects/proj-1/files/a.png', alt: 'a' },
    });
    const text = insertCanvasNode(db, 'proj-1', {
      type: 'text',
      x: 0,
      y: 0,
      content: { text: 'hello' },
    });

    let nodes = listCanvasNodes(db, 'proj-1');
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.id === img.id)?.type).toBe('image');
    expect(nodes.find((n) => n.id === text.id)?.content).toEqual({ text: 'hello' });

    patchCanvasNode(db, img.id, { x: 99, y: 88 });
    const moved = listCanvasNodes(db, 'proj-1').find((n) => n.id === img.id);
    expect(moved?.x).toBe(99);
    expect(moved?.y).toBe(88);

    expect(deleteCanvasNode(db, text.id)).toBe(true);
    nodes = listCanvasNodes(db, 'proj-1');
    expect(nodes).toHaveLength(1);
  });

  it('emits SSE events on add / update / remove', () => {
    const db = freshDb();
    const events: CanvasEvent[] = [];
    const unsubscribe = subscribeCanvas('proj-1', (e) => events.push(e));

    const node = insertCanvasNode(db, 'proj-1', { type: 'text', x: 0, y: 0, content: { text: 'hi' } });
    patchCanvasNode(db, node.id, { x: 5 });
    deleteCanvasNode(db, node.id);
    unsubscribe();
    // After unsubscribe, further mutations must not be observed.
    insertCanvasNode(db, 'proj-1', { type: 'text', x: 1, y: 1, content: { text: 'after' } });

    expect(events.map((e) => e.type)).toEqual(['node-added', 'node-updated', 'node-removed']);
  });

  it('bulk replace swaps the whole node set without emitting events', () => {
    const db = freshDb();
    insertCanvasNode(db, 'proj-1', { type: 'text', x: 0, y: 0, content: { text: 'old' } });
    const events: CanvasEvent[] = [];
    const unsubscribe = subscribeCanvas('proj-1', (e) => events.push(e));

    const result = replaceCanvasNodes(db, 'proj-1', [
      { type: 'image', x: 1, y: 1, content: { src: '/x.png' } },
      { type: 'text', x: 2, y: 2, content: { text: 'new' } },
    ]);
    unsubscribe();

    expect(result).toHaveLength(2);
    expect(listCanvasNodes(db, 'proj-1').map((n) => n.type)).toEqual(['image', 'text']);
    expect(events).toHaveLength(0);
  });

  it('appends AI-generated images and emits node-added', () => {
    const db = freshDb();
    const events: CanvasEvent[] = [];
    subscribeCanvas('proj-1', (e) => events.push(e));

    const created = appendImageNodes(db, 'proj-1', [
      { src: '/api/projects/proj-1/files/gen.png', alt: 'gen' },
    ]);

    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe('image');
    expect(events.map((e) => e.type)).toEqual(['node-added']);
    expect(listCanvasNodes(db, 'proj-1')).toHaveLength(1);
  });

  it('rejects unknown node types', () => {
    const db = freshDb();
    expect(() =>
      insertCanvasNode(db, 'proj-1', {
        // @ts-expect-error — invalid type on purpose
        type: 'sticker',
        x: 0,
        y: 0,
        content: { text: 'x' },
      }),
    ).toThrow();
  });
});
