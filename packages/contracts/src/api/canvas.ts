import type { OkResponse } from '../common.js';

/**
 * Lovart-style infinite design canvas. Each project owns one canvas made of
 * positioned semantic nodes (images + text) that the web tldraw editor renders
 * and that the `od canvas` CLI and AI image generation manipulate through the
 * same `/api/projects/:id/canvas*` endpoints. The semantic node list — not the
 * tldraw store — is the single source of truth.
 */
export type CanvasNodeType = 'image' | 'text';

export interface CanvasImageContent {
  /** Image URL or daemon-served artifact path. */
  src: string;
  alt?: string;
}

export interface CanvasTextContent {
  text: string;
  /** CSS color string; defaults applied client-side when omitted. */
  color?: string;
  /** Font size in canvas units. */
  size?: number;
}

export interface CanvasNode {
  id: string;
  projectId: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  /** Width/height in canvas units. Optional for text nodes that auto-size. */
  w?: number;
  h?: number;
  rotation: number;
  /** Stacking order; higher renders on top. */
  z: number;
  content: CanvasImageContent | CanvasTextContent;
  createdAt: number;
  updatedAt: number;
}

/** Fields the daemon owns and rejects on create. */
export type CanvasNodeDaemonOwnedField = 'id' | 'projectId' | 'createdAt' | 'updatedAt';

export type CanvasNodeRejectDaemonOwnedFields = {
  [Field in CanvasNodeDaemonOwnedField]?: never;
};

export type CanvasNodeInput = CanvasNodeRejectDaemonOwnedFields & {
  type: CanvasNodeType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  z?: number;
  content: CanvasImageContent | CanvasTextContent;
};

export type CanvasNodePatch = CanvasNodeRejectDaemonOwnedFields & {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  z?: number;
  content?: CanvasImageContent | CanvasTextContent;
};

export interface CanvasSnapshot {
  projectId: string;
  nodes: CanvasNode[];
}

/** Bulk replace body used by the web editor's debounced autosave. */
export interface CanvasReplaceRequest {
  nodes: CanvasNodeInput[];
}

export interface CanvasNodeResponse {
  node: CanvasNode;
}

export interface CanvasSnapshotResponse {
  canvas: CanvasSnapshot;
}

export interface CanvasNodeDeleteResponse extends OkResponse {}

/**
 * SSE events streamed from `GET /api/projects/:id/canvas/events`. The web editor
 * subscribes while the canvas surface is open so AI-generated images and
 * out-of-band CLI edits appear live without a reload.
 */
export type CanvasEvent =
  | { type: 'node-added'; node: CanvasNode }
  | { type: 'node-updated'; node: CanvasNode }
  | { type: 'node-removed'; nodeId: string };
