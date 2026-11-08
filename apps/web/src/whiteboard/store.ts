import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  ServerMessage,
  WHITEBOARD_MAX_UPDATE_BYTES,
  chunkElements,
  isNewerElement,
  type BoardElement,
  type BoardErrorMessage,
  type BoardPointerMessage,
  type BoardRemotePointerMessage,
  type BoardSceneMessage,
  type BoardUpdateMessage,
  type BoardViewer,
  type BoardViewersMessage,
  type Whiteboard,
} from '@pixels/shared';

/** Cuánto se ve un aviso (por ejemplo, «Te alejaste de la pizarra»). */
const NOTICE_MS = 4_000;

/** Lo que hace el lienzo (Excalidraw) con lo que llega del servidor. */
export interface BoardSink {
  /** Contenido completo (para volver a sincronizar). */
  scene(elements: BoardElement[]): void;
  update(elements: BoardElement[]): void;
  pointer(message: BoardRemotePointerMessage): void;
  viewers(viewers: BoardViewer[]): void;
  /** Envía ya lo que falte (antes de cerrar). */
  flush(): void;
}

/**
 * Conexión con una pizarra abierta: escucha sus mensajes en la sala y envía los cambios. Lo que
 * llega antes de que cargue Excalidraw se guarda y se entrega al conectarse el lienzo.
 */
let connections = 0;

export class BoardConnection {
  /** Distinto en cada apertura (aunque sea la misma pizarra). */
  readonly id = ++connections;
  private off: (() => void)[] = [];
  private sink: BoardSink | null = null;
  private pending = new Map<string, BoardElement>();
  private closed = false;

  constructor(
    private readonly room: Room,
    readonly board: Whiteboard,
  ) {
    const mine = (m: { boardId: string }) => m.boardId === board.id;
    this.off.push(
      room.onMessage(ServerMessage.BoardScene, (m: BoardSceneMessage) => {
        if (!mine(m)) return;
        if (this.sink) this.sink.scene(m.elements);
        else {
          this.pending = new Map(m.elements.map((e) => [e.id, e]));
          useBoard.setState({ status: 'ready' });
        }
      }),
      room.onMessage(ServerMessage.BoardUpdate, (m: BoardUpdateMessage) => {
        if (!mine(m)) return;
        if (this.sink) this.sink.update(m.elements);
        else
          for (const el of m.elements) {
            if (isNewerElement(el, this.pending.get(el.id))) this.pending.set(el.id, el);
          }
      }),
      room.onMessage(ServerMessage.BoardPointer, (m: BoardRemotePointerMessage) => {
        if (mine(m)) this.sink?.pointer(m);
      }),
      room.onMessage(ServerMessage.BoardViewers, (m: BoardViewersMessage) => {
        if (!mine(m)) return;
        useBoard.setState({ viewers: m.viewers });
        this.sink?.viewers(m.viewers);
      }),
      room.onMessage(ServerMessage.BoardError, (m: BoardErrorMessage) => {
        if (!mine(m)) return;
        if (m.closed) useBoard.getState().close(m.message);
        else showNotice(m.message);
      }),
    );
    room.send(ClientMessage.BoardOpen, { boardId: board.id });
  }

  /** Contenido recibido hasta ahora (para montar el lienzo). */
  snapshot(): BoardElement[] {
    return [...this.pending.values()];
  }

  /** El lienzo ya está montado: desde aquí recibe los mensajes (y lo que llegó mientras tanto). */
  attach(sink: BoardSink) {
    this.sink = sink;
    if (this.pending.size > 0) sink.update(this.snapshot());
    this.pending.clear();
  }

  detach(sink: BoardSink) {
    if (this.sink === sink) this.sink = null;
  }

  sendElements(elements: BoardElement[]) {
    if (this.closed || elements.length === 0) return;
    for (const chunk of chunkElements(elements, WHITEBOARD_MAX_UPDATE_BYTES)) {
      this.room.send(ClientMessage.BoardUpdate, { boardId: this.board.id, elements: chunk });
    }
  }

  sendPointer(pointer: Omit<BoardPointerMessage, 'boardId'>) {
    if (this.closed) return;
    this.room.send(ClientMessage.BoardPointer, { boardId: this.board.id, ...pointer });
  }

  close() {
    if (this.closed) return;
    this.sink?.flush();
    this.closed = true;
    this.sink = null;
    this.off.forEach((off) => off());
    this.off = [];
    // Si la conexión con la sala ya se cerró, no hay nada que avisar.
    if (this.room.connection.isOpen) this.room.send(ClientMessage.BoardClose);
  }
}

interface BoardState {
  /** Pizarra a la que estamos lo bastante cerca para abrirla (la calcula el juego). */
  near: Whiteboard | null;
  open: BoardConnection | null;
  /** 'loading' hasta que llega el contenido de la pizarra. */
  status: 'loading' | 'ready';
  viewers: BoardViewer[];
  notice: string | null;
  openBoard: (room: Room, board: Whiteboard) => void;
  /** Cierra la pizarra abierta; `notice` explica por qué (si no la cerró la persona). */
  close: (notice?: string) => void;
}

let noticeTimer: number | undefined;
function showNotice(notice: string) {
  window.clearTimeout(noticeTimer);
  useBoard.setState({ notice });
  noticeTimer = window.setTimeout(() => useBoard.setState({ notice: null }), NOTICE_MS);
}

export const useBoard = create<BoardState>((set, get) => ({
  near: null,
  open: null,
  status: 'loading',
  viewers: [],
  notice: null,

  openBoard: (room, board) => {
    get().open?.close();
    window.clearTimeout(noticeTimer);
    set({
      open: new BoardConnection(room, board),
      status: 'loading',
      viewers: [],
      notice: null,
    });
  },

  close: (notice) => {
    get().open?.close();
    set({ open: null, status: 'loading', viewers: [] });
    if (notice) showNotice(notice);
  },
}));
