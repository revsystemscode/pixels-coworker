import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  ServerMessage,
  type MapObject,
  type ObjectContentMessage,
  type ObjectContentsMessage,
  type ObjectErrorMessage,
} from '@pixels/shared';

/** Cuánto se ve un aviso (por ejemplo, «Te alejaste de…»). */
const NOTICE_MS = 4_000;

interface ObjectsState {
  /** Objeto que tenemos lo bastante cerca para abrirlo (lo calcula el juego). */
  near: MapObject | null;
  open: MapObject | null;
  /** Contenido de los objetos editables, por id. */
  contents: Record<string, string>;
  /** Objeto que se está guardando (hasta que el servidor lo confirma o da error). */
  saving: string | null;
  error: string | null;
  notice: string | null;
  openObject: (object: MapObject) => void;
  close: (notice?: string) => void;
  save: (room: Room, objectId: string, value: string) => void;
}

let noticeTimer: number | undefined;

export const useObjects = create<ObjectsState>((set) => ({
  near: null,
  open: null,
  contents: {},
  saving: null,
  error: null,
  notice: null,

  openObject: (open) => {
    window.clearTimeout(noticeTimer);
    set({ open, error: null, saving: null, notice: null });
  },

  close: (notice) => {
    set({ open: null, error: null, saving: null, notice: notice ?? null });
    window.clearTimeout(noticeTimer);
    if (notice) noticeTimer = window.setTimeout(() => set({ notice: null }), NOTICE_MS);
  },

  save: (room, objectId, value) => {
    set({ saving: objectId, error: null });
    room.send(ClientMessage.ObjectEdit, { objectId, value });
  },
}));

/** Escucha en la sala el contenido de los objetos (se llama al entrar). */
export function bindObjects(room: Room) {
  useObjects.setState({ contents: {}, open: null, near: null, saving: null, error: null });
  room.onMessage(ServerMessage.ObjectContents, (m: ObjectContentsMessage) =>
    useObjects.setState({ contents: m.contents }),
  );
  room.onMessage(ServerMessage.ObjectContent, (m: ObjectContentMessage) =>
    useObjects.setState((s) => ({
      contents: { ...s.contents, [m.objectId]: m.value },
      saving: s.saving === m.objectId ? null : s.saving,
    })),
  );
  room.onMessage(ServerMessage.ObjectError, (m: ObjectErrorMessage) =>
    useObjects.setState((s) =>
      s.saving === m.objectId ? { saving: null, error: m.message } : { error: m.message },
    ),
  );
}
