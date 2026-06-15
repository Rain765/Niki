import type Database from 'better-sqlite3';

import type {
  CanvasEvent,
  CanvasImageContent,
  CanvasNode,
  CanvasNodeInput,
  CanvasNodePatch,
  CanvasNodeType,
  CanvasTextContent,
} from '@open-design/contracts';

/**
 * Persistence + live-event fan-out for the per-project design canvas. The
 * `canvas_nodes` table is the single source of truth: the web tldraw editor,
 * the `od canvas` CLI, and AI image generation all read/write it through the
 * canvas routes. Subscribers (the web SSE stream) receive node mutations so
 * AI-generated images and out-of-band CLI edits appear without a reload.
 */

const VALID_TYPES: ReadonlySet<string> = new Set<CanvasNodeType>(['image', 'text']);

interface RawCanvasNodeRow {
  id: string;
  projectId: string;
  type: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  rotation: number;
  z: number;
  contentJson: string;
  createdAt: number;
  updatedAt: number;
}

const COLS = `
  id,
  project_id AS projectId,
  type,
  x,
  y,
  w,
  h,
  rotation,
  z,
  content_json AS contentJson,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export function migrateCanvas(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('image','text')),
      x REAL NOT NULL,
      y REAL NOT NULL,
      w REAL,
      h REAL,
      rotation REAL NOT NULL DEFAULT 0,
      z INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_canvas_nodes_project
      ON canvas_nodes(project_id, z);
  `);
}

// ---------- subscribers (SSE fan-out) ----------

type CanvasListener = (event: CanvasEvent) => void;
const subscribers = new Map<string, Set<CanvasListener>>();

export function subscribeCanvas(projectId: string, listener: CanvasListener): () => void {
  let set = subscribers.get(projectId);
  if (!set) {
    set = new Set();
    subscribers.set(projectId, set);
  }
  set.add(listener);
  return () => {
    const current = subscribers.get(projectId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) subscribers.delete(projectId);
  };
}

function emitCanvasEvent(projectId: string, event: CanvasEvent): void {
  const set = subscribers.get(projectId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // A failing subscriber must not block others or the write path.
    }
  }
}

// ---------- CRUD ----------

export function listCanvasNodes(db: Database.Database, projectId: string): CanvasNode[] {
  const rows = db
    .prepare(`SELECT ${COLS} FROM canvas_nodes WHERE project_id = ? ORDER BY z ASC, created_at ASC`)
    .all(projectId) as RawCanvasNodeRow[];
  return rows.map(normalizeRow);
}

export function getCanvasNode(db: Database.Database, id: string): CanvasNode | null {
  const raw = db.prepare(`SELECT ${COLS} FROM canvas_nodes WHERE id = ?`).get(id) as
    | RawCanvasNodeRow
    | undefined;
  return raw ? normalizeRow(raw) : null;
}

export function insertCanvasNode(
  db: Database.Database,
  projectId: string,
  input: CanvasNodeInput,
  options: { id?: string; emit?: boolean } = {},
): CanvasNode {
  const now = Date.now();
  const id = options.id ?? `cnode_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const type = normalizeType(input.type);
  const content = normalizeContent(type, input.content);
  db.prepare(
    `INSERT INTO canvas_nodes
       (id, project_id, type, x, y, w, h, rotation, z, content_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    type,
    finiteOr(input.x, 0),
    finiteOr(input.y, 0),
    optionalNumber(input.w),
    optionalNumber(input.h),
    finiteOr(input.rotation, 0),
    Math.trunc(finiteOr(input.z, 0)),
    JSON.stringify(content),
    now,
    now,
  );
  const node = getCanvasNode(db, id);
  if (node === null) throw new Error(`Failed to fetch canvas node after insert: ${id}`);
  if (options.emit !== false) emitCanvasEvent(projectId, { type: 'node-added', node });
  return node;
}

export function patchCanvasNode(
  db: Database.Database,
  id: string,
  patch: CanvasNodePatch,
  options: { emit?: boolean } = {},
): CanvasNode | null {
  const existing = getCanvasNode(db, id);
  if (existing === null) return null;
  const content =
    patch.content !== undefined ? normalizeContent(existing.type, patch.content) : existing.content;
  const updatedAt = Date.now();
  db.prepare(
    `UPDATE canvas_nodes
        SET x = ?, y = ?, w = ?, h = ?, rotation = ?, z = ?, content_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    patch.x !== undefined ? finiteOr(patch.x, existing.x) : existing.x,
    patch.y !== undefined ? finiteOr(patch.y, existing.y) : existing.y,
    patch.w !== undefined ? optionalNumber(patch.w) : existing.w ?? null,
    patch.h !== undefined ? optionalNumber(patch.h) : existing.h ?? null,
    patch.rotation !== undefined ? finiteOr(patch.rotation, existing.rotation) : existing.rotation,
    patch.z !== undefined ? Math.trunc(finiteOr(patch.z, existing.z)) : existing.z,
    JSON.stringify(content),
    updatedAt,
    id,
  );
  const node = getCanvasNode(db, id);
  if (node && options.emit !== false) emitCanvasEvent(node.projectId, { type: 'node-updated', node });
  return node;
}

export function deleteCanvasNode(
  db: Database.Database,
  id: string,
  options: { emit?: boolean } = {},
): boolean {
  const existing = getCanvasNode(db, id);
  if (existing === null) return false;
  db.prepare(`DELETE FROM canvas_nodes WHERE id = ?`).run(id);
  if (options.emit !== false) {
    emitCanvasEvent(existing.projectId, { type: 'node-removed', nodeId: id });
  }
  return true;
}

/** Bulk replace used by the web editor's debounced autosave. Emits no events. */
export function replaceCanvasNodes(
  db: Database.Database,
  projectId: string,
  inputs: CanvasNodeInput[],
): CanvasNode[] {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM canvas_nodes WHERE project_id = ?`).run(projectId);
    for (const input of inputs) {
      insertCanvasNode(db, projectId, input, { emit: false });
    }
  });
  tx();
  return listCanvasNodes(db, projectId);
}

/**
 * Append AI-generated images as canvas nodes, laid out in a loose diagonal
 * cascade below existing content. Emits `node-added` so an open canvas shows
 * them live. Returns the created nodes.
 */
export function appendImageNodes(
  db: Database.Database,
  projectId: string,
  images: Array<{ src: string; alt?: string; w?: number; h?: number }>,
): CanvasNode[] {
  if (images.length === 0) return [];
  const existing = listCanvasNodes(db, projectId);
  let baseX = 64;
  let baseY = 64;
  for (const node of existing) {
    baseY = Math.max(baseY, node.y + (node.h ?? 240) + 32);
  }
  const created: CanvasNode[] = [];
  images.forEach((image, index) => {
    const content: CanvasImageContent = { src: image.src };
    if (image.alt) content.alt = image.alt;
    created.push(
      insertCanvasNode(db, projectId, {
        type: 'image',
        x: baseX + index * 48,
        y: baseY + index * 48,
        w: image.w ?? 360,
        h: image.h ?? 360,
        content,
      }),
    );
  });
  return created;
}

// ---------- helpers ----------

function normalizeRow(raw: RawCanvasNodeRow): CanvasNode {
  const type = normalizeType(raw.type);
  const node: CanvasNode = {
    id: raw.id,
    projectId: raw.projectId,
    type,
    x: Number(raw.x),
    y: Number(raw.y),
    rotation: Number(raw.rotation),
    z: Number(raw.z),
    content: normalizeContent(type, parseJson(raw.contentJson)),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
  if (raw.w != null) node.w = Number(raw.w);
  if (raw.h != null) node.h = Number(raw.h);
  return node;
}

export function normalizeType(value: unknown): CanvasNodeType {
  if (typeof value === 'string' && VALID_TYPES.has(value)) return value as CanvasNodeType;
  throw new RangeError(`Invalid canvas node type: "${String(value)}"`);
}

function normalizeContent(
  type: CanvasNodeType,
  value: unknown,
): CanvasImageContent | CanvasTextContent {
  const obj = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  if (type === 'image') {
    const src = typeof obj.src === 'string' ? obj.src : '';
    const content: CanvasImageContent = { src };
    if (typeof obj.alt === 'string') content.alt = obj.alt;
    return content;
  }
  const text = typeof obj.text === 'string' ? obj.text : '';
  const content: CanvasTextContent = { text };
  if (typeof obj.color === 'string') content.color = obj.color;
  if (typeof obj.size === 'number' && Number.isFinite(obj.size)) content.size = obj.size;
  return content;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJson(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
