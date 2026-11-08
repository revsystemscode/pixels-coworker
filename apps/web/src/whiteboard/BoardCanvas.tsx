import { useEffect, useState } from 'react';
import {
  CaptureUpdateAction,
  Excalidraw,
  newElementWith,
  reconcileElements,
  restoreElements,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import {
  BOARD_ELEMENT_TYPES,
  WHITEBOARD_MAX_ELEMENT_BYTES,
  WHITEBOARD_SEND_INTERVAL_MS,
  jsonSize,
  type BoardElement,
  type BoardPointerTool,
  type BoardRemotePointerMessage,
  type BoardViewer,
} from '@pixels/shared';
import type { BoardConnection, BoardSink } from './store.js';

declare global {
  interface Window {
    /** Dónde busca Excalidraw sus fuentes. */
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// Las fuentes de Excalidraw se sirven desde la propia web (ver vite.config.ts).
window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

/** Colores de los punteros de los demás. */
const COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599', '#e8590c'];
const colorFor = (id: string) => {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const color = COLORS[Math.abs(hash) % COLORS.length]!;
  return { background: color, stroke: color };
};

const ALLOWED = new Set<string>(BOARD_ELEMENT_TYPES);

/** Copia sin `undefined` (no viaja bien por msgpack y el servidor solo acepta JSON). */
const toBoardElement = (el: ExcalidrawElement) => JSON.parse(JSON.stringify(el)) as BoardElement;
const toExcalidraw = (elements: BoardElement[]) =>
  restoreElements(elements as unknown as ExcalidrawElement[], null);

/**
 * Sincroniza Excalidraw con la pizarra de la sala: envía lo que cambia aquí (cada
 * WHITEBOARD_SEND_INTERVAL_MS como mucho) y aplica lo que cambian los demás con la misma regla
 * que el servidor (`reconcileElements`).
 */
class ExcalidrawSync implements BoardSink {
  private api: ExcalidrawImperativeAPI | null = null;
  /** Versión de cada elemento que ya tiene el servidor (la enviamos o nos llegó). */
  private known = new Map<string, number>();
  private queued: BoardElement[] = [];
  private collaborators = new Map<SocketId, Collaborator>();
  private names = new Map<string, string>();
  private flushTimer: number | undefined;
  private pointerTimer: number | undefined;
  private lastPointer: {
    x: number;
    y: number;
    tool: BoardPointerTool;
    button: 'up' | 'down';
  } | null = null;
  private warnedTooBig = false;

  constructor(
    private readonly connection: BoardConnection,
    private readonly selfId: string,
  ) {}

  /** Contenido inicial (ya recibido) para montar Excalidraw. */
  initialElements(): ExcalidrawElement[] {
    const elements = this.connection.snapshot();
    for (const el of elements) this.known.set(el.id, el.version);
    return toExcalidraw(elements);
  }

  setApi(api: ExcalidrawImperativeAPI) {
    this.api = api;
    if (this.queued.length > 0) this.update(this.queued.splice(0));
  }

  scene(elements: BoardElement[]) {
    if (!this.api) {
      this.queued.push(...elements);
      return;
    }
    this.known = new Map(elements.map((el) => [el.id, el.version]));
    this.api.updateScene({
      elements: toExcalidraw(elements),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  update(elements: BoardElement[]) {
    if (!this.api) {
      this.queued.push(...elements);
      return;
    }
    const reconciled = reconcileElements(
      this.api.getSceneElementsIncludingDeleted(),
      toExcalidraw(elements) as RemoteExcalidrawElement[],
      this.api.getAppState(),
    );
    for (const el of elements) {
      this.known.set(el.id, Math.max(this.known.get(el.id) ?? 0, el.version));
    }
    this.api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
  }

  pointer(m: BoardRemotePointerMessage) {
    const previous = this.collaborators.get(m.sessionId as SocketId);
    this.collaborators.set(m.sessionId as SocketId, {
      ...previous,
      pointer: { x: m.x, y: m.y, tool: m.tool },
      button: m.button,
      username: this.names.get(m.sessionId) ?? previous?.username ?? null,
      color: colorFor(m.sessionId),
    });
    this.api?.updateScene({ collaborators: new Map(this.collaborators) });
  }

  viewers(viewers: BoardViewer[]) {
    this.names = new Map(viewers.map((v) => [v.sessionId, v.name]));
    for (const id of this.collaborators.keys()) {
      if (!this.names.has(id)) this.collaborators.delete(id);
    }
    for (const v of viewers) {
      if (v.sessionId === this.selfId) continue;
      const id = v.sessionId as SocketId;
      this.collaborators.set(id, {
        ...this.collaborators.get(id),
        username: v.name,
        color: colorFor(v.sessionId),
      });
    }
    this.api?.updateScene({ collaborators: new Map(this.collaborators) });
  }

  /** Algo ha cambiado en Excalidraw: se envía dentro de poco (agrupando cambios seguidos). */
  changed() {
    this.flushTimer ??= window.setTimeout(() => this.flush(), WHITEBOARD_SEND_INTERVAL_MS);
  }

  flush() {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const api = this.api;
    if (!api) return;

    const changed: BoardElement[] = [];
    const unsupported: ExcalidrawElement[] = [];
    for (const el of api.getSceneElementsIncludingDeleted()) {
      if ((this.known.get(el.id) ?? 0) >= el.version) continue;
      if (!ALLOWED.has(el.type)) {
        if (!el.isDeleted) unsupported.push(el);
        this.known.set(el.id, el.version);
        continue;
      }
      const copy = toBoardElement(el);
      if (jsonSize(copy) > WHITEBOARD_MAX_ELEMENT_BYTES) {
        if (!this.warnedTooBig)
          api.setToast({ message: 'Ese trazo es demasiado grande para compartirlo.' });
        this.warnedTooBig = true;
        continue;
      }
      changed.push(copy);
      this.known.set(el.id, el.version);
    }
    this.connection.sendElements(changed);

    // Imágenes o contenido incrustado (al pegar): no se comparten, así que se quitan.
    if (unsupported.length > 0) {
      const removed = new Set(unsupported.map((el) => el.id));
      api.updateScene({
        elements: api
          .getSceneElementsIncludingDeleted()
          .map((el) => (removed.has(el.id) ? newElementWith(el, { isDeleted: true }) : el)),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.setToast({ message: 'Las imágenes todavía no se pueden usar en la pizarra.' });
    }
  }

  pointerMoved(pointer: { x: number; y: number; tool: BoardPointerTool }, button: 'up' | 'down') {
    this.lastPointer = { ...pointer, button };
    this.pointerTimer ??= window.setTimeout(() => {
      this.pointerTimer = undefined;
      if (this.lastPointer) this.connection.sendPointer(this.lastPointer);
    }, WHITEBOARD_SEND_INTERVAL_MS);
  }

  dispose() {
    window.clearTimeout(this.flushTimer);
    window.clearTimeout(this.pointerTimer);
    this.flushTimer = undefined;
    this.pointerTimer = undefined;
  }

  /** Solo pruebas E2E: lo que hay dibujado. */
  debugSnapshot() {
    return (this.api?.getSceneElements() ?? []).map((el) => ({ id: el.id, type: el.type }));
  }
}

/** Lienzo de Excalidraw conectado a la pizarra abierta. */
export default function BoardCanvas({
  connection,
  selfId,
}: {
  connection: BoardConnection;
  selfId: string;
}) {
  const [{ sync, initialElements }] = useState(() => {
    const sync = new ExcalidrawSync(connection, selfId);
    return { sync, initialElements: sync.initialElements() };
  });

  useEffect(() => {
    connection.attach(sync);
    if (import.meta.env.DEV && window.__pixels) window.__pixels.board = () => sync.debugSnapshot();
    return () => {
      connection.detach(sync);
      if (window.__pixels) delete window.__pixels.board;
      sync.dispose();
    };
  }, [connection, sync]);

  return (
    <Excalidraw
      excalidrawAPI={(api) => sync.setApi(api)}
      initialData={{
        elements: initialElements,
        appState: { viewBackgroundColor: '#ffffff' },
        scrollToContent: true,
      }}
      onChange={() => sync.changed()}
      onPointerUpdate={({ pointer, button }) => sync.pointerMoved(pointer, button)}
      isCollaborating
      langCode="es-ES"
      UIOptions={{
        tools: { image: false },
        canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false },
      }}
    />
  );
}
