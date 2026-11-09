import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  ServerMessage,
  type GameErrorMessage,
  type GameStateMessage,
  type MapObject,
} from '@pixels/shared';
import { useObjects } from '../objects/store.js';

const NOTICE_MS = 4_000;

interface GameState {
  /** Mesa abierta (jugando o mirando). */
  open: MapObject | null;
  room: Room | null;
  /** Estado que manda el servidor (null hasta que llega). */
  state: GameStateMessage | null;
  /** Último error de una jugada (por ejemplo, «No es tu turno»). */
  error: string | null;
  notice: string | null;
  openGame: (room: Room, table: MapObject) => void;
  close: (notice?: string) => void;
  send: (type: string, message?: object) => void;
}

let noticeTimer: number | undefined;

export const useGame = create<GameState>((set, get) => ({
  open: null,
  room: null,
  state: null,
  error: null,
  notice: null,

  openGame: (room, table) => {
    if (get().open?.id === table.id) return;
    get().close();
    useObjects.getState().close();
    window.clearTimeout(noticeTimer);
    set({ open: table, room, state: null, error: null, notice: null });
    room.send(ClientMessage.GameOpen, { objectId: table.id });
  },

  close: (notice) => {
    const { open, room } = get();
    if (open && room?.connection.isOpen && !notice) room.send(ClientMessage.GameClose);
    set({ open: null, room: null, state: null, error: null, notice: notice ?? null });
    window.clearTimeout(noticeTimer);
    if (notice) noticeTimer = window.setTimeout(() => set({ notice: null }), NOTICE_MS);
  },

  send: (type, message) => {
    set({ error: null });
    get().room?.send(type, message);
  },
}));

/** Escucha en la sala el estado de las mesas (se llama al entrar). */
export function bindGames(room: Room) {
  useGame.setState({ open: null, room: null, state: null, error: null, notice: null });
  const mine = (objectId: string) => useGame.getState().open?.id === objectId;
  room.onMessage(ServerMessage.GameState, (m: GameStateMessage) => {
    if (mine(m.objectId)) useGame.setState({ state: m });
  });
  room.onMessage(ServerMessage.GameError, (m: GameErrorMessage) => {
    if (!mine(m.objectId)) return;
    if (m.closed) useGame.getState().close(m.message);
    else useGame.setState({ error: m.message });
  });
}
