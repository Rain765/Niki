'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  Tldraw,
  AssetRecordType,
  createShapeId,
  getHashForString,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLImageShape,
  type TLShapePartial,
  type TLTextShape,
  type TLShapeId,
} from 'tldraw';
import 'tldraw/tldraw.css';

import type {
  CanvasImageContent,
  CanvasNode,
  CanvasNodeInput,
  CanvasTextContent,
} from '@open-design/contracts';

import { fetchCanvas, saveCanvas, subscribeCanvasEvents } from '../providers/daemon';

const SAVE_DEBOUNCE_MS = 600;
const DEFAULT_IMAGE_SIZE = 360;

/**
 * Lovart-style infinite design canvas. Renders the project's semantic canvas
 * nodes (images + text) as tldraw shapes and persists user edits back through
 * a debounced bulk save. While open it subscribes to the canvas SSE stream so
 * AI-generated images and out-of-band `od canvas` edits appear live.
 *
 * The semantic node list (not the tldraw store) is the source of truth; the
 * web editor is authoritative only while it is the active surface, so a full
 * debounced snapshot keeps sync race-free without per-node diffing.
 */
export function CanvasView({ projectId }: { projectId: string }) {
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposers = useRef<Array<() => void>>([]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      void saveCanvas(projectId, shapesToNodes(editor));
    }, SAVE_DEBOUNCE_MS);
  }, [projectId]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Initial load — apply as remote changes so our user-scoped listener
      // doesn't echo the load straight back to the server.
      void fetchCanvas(projectId).then((nodes) => {
        editor.store.mergeRemoteChanges(() => {
          for (const node of nodes) createShapeForNode(editor, node);
        });
        editor.zoomToFit({ animation: { duration: 0 } });
      });

      // Persist user edits (move/resize/add/delete/text) on a debounce.
      const unlisten = editor.store.listen(() => scheduleSave(), {
        source: 'user',
        scope: 'document',
      });
      disposers.current.push(unlisten);

      // Live updates from AI image generation and CLI edits.
      const unsubscribe = subscribeCanvasEvents(projectId, (event) => {
        const ed = editorRef.current;
        if (!ed) return;
        if (event.type === 'node-added' || event.type === 'node-updated') {
          const shapeId = nodeShapeId(event.node.id);
          ed.store.mergeRemoteChanges(() => {
            if (ed.getShape(shapeId)) {
              applyNodeGeometry(ed, shapeId, event.node);
            } else {
              createShapeForNode(ed, event.node);
            }
          });
        } else if (event.type === 'node-removed') {
          const shapeId = nodeShapeId(event.nodeId);
          if (ed.getShape(shapeId)) {
            ed.store.mergeRemoteChanges(() => ed.deleteShape(shapeId));
          }
        }
      });
      disposers.current.push(unsubscribe);
    },
    [projectId, scheduleSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      for (const dispose of disposers.current) {
        try {
          dispose();
        } catch {
          // ignore
        }
      }
      disposers.current = [];
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="canvas-surface" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Tldraw onMount={handleMount} />
    </div>
  );
}

// ---------- node <-> shape mapping ----------

function nodeShapeId(nodeId: string): TLShapeId {
  return createShapeId(nodeId);
}

function createShapeForNode(editor: Editor, node: CanvasNode): void {
  if (node.type === 'image') {
    const content = node.content as CanvasImageContent;
    if (!content.src) return;
    const w = node.w ?? DEFAULT_IMAGE_SIZE;
    const h = node.h ?? DEFAULT_IMAGE_SIZE;
    const assetId = AssetRecordType.createId(getHashForString(content.src));
    if (!editor.getAsset(assetId)) {
      editor.createAssets([
        {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: content.alt ?? 'image',
            src: content.src,
            w,
            h,
            mimeType: null,
            isAnimated: false,
          },
          meta: {},
        },
      ]);
    }
    editor.createShape<TLImageShape>({
      id: nodeShapeId(node.id),
      type: 'image',
      x: node.x,
      y: node.y,
      rotation: node.rotation,
      props: { assetId, w, h },
    });
    return;
  }

  const content = node.content as CanvasTextContent;
  editor.createShape<TLTextShape>({
    id: nodeShapeId(node.id),
    type: 'text',
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    props: { richText: toRichText(content.text ?? '') },
  });
}

function applyNodeGeometry(editor: Editor, shapeId: TLShapeId, node: CanvasNode): void {
  const existing = editor.getShape(shapeId);
  if (!existing) return;
  const update: TLShapePartial = {
    id: shapeId,
    type: existing.type,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
  };
  editor.updateShape(update);
}

function shapesToNodes(editor: Editor): CanvasNodeInput[] {
  const out: CanvasNodeInput[] = [];
  let z = 0;
  for (const id of editor.getCurrentPageShapeIds()) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    if (shape.type === 'image') {
      const image = shape as TLImageShape;
      const asset = image.props.assetId ? editor.getAsset(image.props.assetId) : null;
      const imageAsset = asset && asset.type === 'image' ? asset : null;
      const src = imageAsset?.props.src ?? null;
      if (!src) continue;
      const content: CanvasImageContent = { src };
      if (imageAsset?.props.name) content.alt = imageAsset.props.name;
      out.push({
        type: 'image',
        x: shape.x,
        y: shape.y,
        w: image.props.w,
        h: image.props.h,
        rotation: shape.rotation,
        z: z++,
        content,
      });
    } else if (shape.type === 'text') {
      const text = shape as TLTextShape;
      out.push({
        type: 'text',
        x: shape.x,
        y: shape.y,
        rotation: shape.rotation,
        z: z++,
        content: { text: renderPlaintextFromRichText(editor, text.props.richText) },
      });
    }
  }
  return out;
}
