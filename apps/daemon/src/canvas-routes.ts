import type { Express } from 'express';

import type {
  CanvasEvent,
  CanvasNodeInput,
  CanvasNodePatch,
  CanvasReplaceRequest,
} from '@open-design/contracts';

import {
  deleteCanvasNode,
  getCanvasNode,
  insertCanvasNode,
  listCanvasNodes,
  patchCanvasNode,
  replaceCanvasNodes,
  subscribeCanvas,
} from './canvas-store.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterCanvasRoutesDeps extends RouteDeps<'db' | 'http'> {}

/**
 * Per-project design canvas (`/api/projects/:id/canvas*`). The web tldraw
 * editor, the `od canvas` CLI, and AI image generation all drive the same
 * semantic node store through these endpoints, with a live SSE stream so an
 * open canvas reflects out-of-band edits without a reload.
 */
export function registerCanvasRoutes(app: Express, ctx: RegisterCanvasRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;

  app.get('/api/projects/:id/canvas', (req, res) => {
    try {
      const projectId = req.params.id;
      const nodes = listCanvasNodes(db, projectId);
      res.json({ canvas: { projectId, nodes } });
    } catch (err: any) {
      sendApiError(res, 500, 'CANVAS_ERROR', String(err?.message ?? err));
    }
  });

  app.post('/api/projects/:id/canvas/nodes', (req, res) => {
    try {
      const projectId = req.params.id;
      const input = req.body as CanvasNodeInput;
      if (!input || (input.type !== 'image' && input.type !== 'text')) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'type must be "image" or "text"');
      }
      const node = insertCanvasNode(db, projectId, input);
      res.status(201).json({ node });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message ?? err));
    }
  });

  app.patch('/api/projects/:id/canvas/nodes/:nodeId', (req, res) => {
    try {
      const existing = getCanvasNode(db, req.params.nodeId);
      if (!existing || existing.projectId !== req.params.id) {
        return sendApiError(res, 404, 'NOT_FOUND', 'canvas node not found');
      }
      const node = patchCanvasNode(db, req.params.nodeId, req.body as CanvasNodePatch);
      res.json({ node });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message ?? err));
    }
  });

  app.delete('/api/projects/:id/canvas/nodes/:nodeId', (req, res) => {
    try {
      const existing = getCanvasNode(db, req.params.nodeId);
      if (!existing || existing.projectId !== req.params.id) {
        return sendApiError(res, 404, 'NOT_FOUND', 'canvas node not found');
      }
      deleteCanvasNode(db, req.params.nodeId);
      res.json({ ok: true });
    } catch (err: any) {
      sendApiError(res, 500, 'CANVAS_ERROR', String(err?.message ?? err));
    }
  });

  app.put('/api/projects/:id/canvas', (req, res) => {
    try {
      const projectId = req.params.id;
      const body = req.body as CanvasReplaceRequest;
      const inputs = Array.isArray(body?.nodes) ? body.nodes : [];
      const nodes = replaceCanvasNodes(db, projectId, inputs);
      res.json({ canvas: { projectId, nodes } });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message ?? err));
    }
  });

  // SSE — the web editor subscribes while the canvas surface is open so
  // AI-generated images and out-of-band CLI edits appear live.
  app.get('/api/projects/:id/canvas/events', (req, res) => {
    const projectId = req.params.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    // Initial comment keeps proxies from buffering the idle stream open.
    res.write(': canvas-stream-open\n\n');
    const unsubscribe = subscribeCanvas(projectId, (event: CanvasEvent) => {
      res.write(`event: canvas\ndata: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', () => {
      unsubscribe();
    });
  });
}
