'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tldraw,
  AssetRecordType,
  createShapeId,
  getHashForString,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLGeoShape,
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

import { useT } from '../i18n';
import { fetchCanvas, saveCanvas, subscribeCanvasEvents } from '../providers/daemon';

import { Icon } from './Icon';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from './PreviewDrawOverlay';

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
interface AnnotationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function CanvasView({ projectId }: { projectId: string }) {
  const t = useT();
  const editorRef = useRef<Editor | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposers = useRef<Array<() => void>>([]);
  // Region annotation box (screen-space, relative to .canvas-surface).
  const [annotation, setAnnotation] = useState<AnnotationRect | null>(null);
  const [annotationNote, setAnnotationNote] = useState('');
  const [sendingAnnotation, setSendingAnnotation] = useState(false);

  // Drop a draggable/resizable annotation box over the centre of the canvas.
  const startAnnotation = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const w = 340;
    const h = 220;
    const x = rect ? Math.max(16, (rect.width - w) / 2) : 80;
    const y = rect ? Math.max(56, (rect.height - h) / 2) : 80;
    setAnnotationNote('');
    setAnnotation({ x, y, w, h });
  }, []);

  // Send the region annotation: draw a matching rectangle onto the canvas,
  // export the whole thing to PNG (so the agent sees the full image with the
  // marked region), then hand it to the composer via ANNOTATION_EVENT.
  const sendAnnotation = useCallback(async () => {
    const editor = editorRef.current;
    const surf = surfaceRef.current;
    const box = annotation;
    if (!editor || !surf || !box) return;
    setSendingAnnotation(true);
    let rectId: TLShapeId | null = null;
    try {
      const container = (surf.querySelector('.tl-container') as HTMLElement) ?? surf;
      const crect = container.getBoundingClientRect();
      const srect = surf.getBoundingClientRect();
      const toScreen = (px: number, py: number) => ({
        x: srect.left + px - crect.left,
        y: srect.top + py - crect.top,
      });
      const pageTL = editor.screenToPage(toScreen(box.x, box.y));
      const pageBR = editor.screenToPage(toScreen(box.x + box.w, box.y + box.h));
      const w = Math.max(1, Math.abs(pageBR.x - pageTL.x));
      const h = Math.max(1, Math.abs(pageBR.y - pageTL.y));
      rectId = createShapeId();
      editor.createShape<TLGeoShape>({
        id: rectId,
        type: 'geo',
        x: Math.min(pageTL.x, pageBR.x),
        y: Math.min(pageTL.y, pageBR.y),
        props: { geo: 'rectangle', w, h, color: 'red', fill: 'none', dash: 'solid', size: 'm' },
      });
      const ids = [...editor.getCurrentPageShapeIds()];
      const { blob } = await editor.toImage(ids, { format: 'png' });
      if (rectId) editor.deleteShape(rectId);
      rectId = null;
      if (!blob) return;
      const file = new File([blob], `canvas-annotation-${Date.now()}.png`, { type: 'image/png' });
      const detail: AnnotationEventDetail = {
        file,
        note: annotationNote.trim(),
        action: 'queue',
        markKind: 'stroke',
        bounds: { x: 0, y: 0, width: Math.round(w), height: Math.round(h) },
      };
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }));
      setAnnotation(null);
      setAnnotationNote('');
    } finally {
      if (rectId) {
        try {
          editor.deleteShape(rectId);
        } catch {
          // ignore
        }
      }
      setSendingAnnotation(false);
    }
  }, [annotation, annotationNote]);

  // Drop an empty text box at the centre of the current viewport and enter
  // edit mode so the user can start typing immediately.
  const addTextNode = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape<TLTextShape>({
      id,
      type: 'text',
      x: center.x - 100,
      y: center.y - 16,
      props: { richText: toRichText('') },
    });
    editor.select(id);
    editor.setEditingShape(id);
  }, []);

  // Export the canvas (image + annotations the user drew with tldraw's tools)
  // as a PNG and hand it to the chat composer as a staged visual mark, so the
  // user can describe the change and send it to the agent. Reuses the same
  // ANNOTATION_EVENT bridge the HTML-preview draw overlay uses.
  const sendToChat = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const ids = [...editor.getCurrentPageShapeIds()];
    if (ids.length === 0) return;
    const { blob } = await editor.toImage(ids, { format: 'png' });
    if (!blob) return;
    const file = new File([blob], `canvas-annotation-${Date.now()}.png`, { type: 'image/png' });
    const pageBounds = editor.getCurrentPageBounds();
    const detail: AnnotationEventDetail = {
      file,
      note: '',
      action: 'queue',
      markKind: 'stroke',
      bounds: pageBounds
        ? { x: 0, y: 0, width: Math.max(1, Math.round(pageBounds.w)), height: Math.max(1, Math.round(pageBounds.h)) }
        : { x: 0, y: 0, width: 1, height: 1 },
    };
    window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }));
  }, []);

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
    <div
      ref={surfaceRef}
      className="canvas-surface"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <Tldraw onMount={handleMount} />
      <div className="canvas-add-toolbar">
        <button type="button" className="canvas-add-text-btn" onClick={addTextNode}>
          <Icon name="edit" size={14} />
          <span>{t('canvas.addText')}</span>
        </button>
        <button
          type="button"
          className="canvas-add-text-btn"
          onClick={startAnnotation}
          aria-pressed={annotation !== null}
        >
          <Icon name="comment" size={14} />
          <span>{t('canvas.annotate')}</span>
        </button>
        <button type="button" className="canvas-add-text-btn" onClick={() => void sendToChat()}>
          <Icon name="send" size={14} />
          <span>{t('canvas.sendToChat')}</span>
        </button>
      </div>
      {annotation ? (
        <AnnotationOverlay
          rect={annotation}
          note={annotationNote}
          sending={sendingAnnotation}
          onRectChange={setAnnotation}
          onNoteChange={setAnnotationNote}
          onSend={() => void sendAnnotation()}
          onCancel={() => {
            setAnnotation(null);
            setAnnotationNote('');
          }}
          t={t}
        />
      ) : null}
    </div>
  );
}

// ---------- annotation box overlay ----------

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN_BOX = 48;

function AnnotationOverlay({
  rect,
  note,
  sending,
  onRectChange,
  onNoteChange,
  onSend,
  onCancel,
  t,
}: {
  rect: AnnotationRect;
  note: string;
  sending: boolean;
  onRectChange: (r: AnnotationRect) => void;
  onNoteChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useT>;
}) {
  // Pointer drag/resize. We keep the live rect in a ref so the window move
  // handler reads the latest start values without re-binding listeners.
  const drag = useRef<{
    mode: 'move' | Handle;
    startX: number;
    startY: number;
    start: AnnotationRect;
  } | null>(null);

  const onPointerDown = useCallback(
    (mode: 'move' | Handle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...rect } };
      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        const s = d.start;
        let { x, y, w, h } = s;
        if (d.mode === 'move') {
          x = s.x + dx;
          y = s.y + dy;
        } else {
          if (d.mode.includes('e')) w = Math.max(MIN_BOX, s.w + dx);
          if (d.mode.includes('s')) h = Math.max(MIN_BOX, s.h + dy);
          if (d.mode.includes('w')) {
            w = Math.max(MIN_BOX, s.w - dx);
            x = s.x + (s.w - w);
          }
          if (d.mode.includes('n')) {
            h = Math.max(MIN_BOX, s.h - dy);
            y = s.y + (s.h - h);
          }
        }
        onRectChange({ x, y, w, h });
      };
      const onUp = () => {
        drag.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [rect, onRectChange],
  );

  return (
    <div
      className="canvas-annot-box"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={onPointerDown('move')}
    >
      <div className="canvas-annot-panel" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="canvas-annot-input"
          autoFocus
          value={note}
          placeholder={t('canvas.annotationPlaceholder')}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
        <button
          type="button"
          className="canvas-annot-send"
          disabled={sending}
          onClick={onSend}
          title={t('canvas.sendToChat')}
          aria-label={t('canvas.sendToChat')}
        >
          <Icon name="send" size={13} />
        </button>
        <button
          type="button"
          className="canvas-annot-close"
          onClick={onCancel}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      {HANDLES.map((hdl) => (
        <span
          key={hdl}
          className={`canvas-annot-handle canvas-annot-handle-${hdl}`}
          onPointerDown={onPointerDown(hdl)}
        />
      ))}
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
