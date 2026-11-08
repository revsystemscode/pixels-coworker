import { Client, type Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  LeaveCode,
  ServerMessage,
  WORLD_ROOM,
  parseWorldMap,
  type ChatEntry,
  type JoinOptions,
  type JoinSpaceResponse,
  type MediaTicketMessage,
  type SpaceSummary,
  type TiledMap,
} from '@pixels/shared';
import { api, errorMessage } from './api.js';
import { env } from './env.js';
import { MediaSession } from './media/MediaSession.js';
import { useMedia } from './media/store.js';

const MAX_MESSAGES = 200;

type Phase = 'idle' | 'connecting' | 'world';

interface AppState {
  phase: Phase;
  error: string | null;
  room: Room | null;
  space: SpaceSummary | null;
  map: TiledMap | null;
  selfName: string;
  media: MediaSession | null;
  messages: ChatEntry[];
  join: (spaceId: string, selfName: string) => Promise<void>;
  leave: () => Promise<void>;
  sendChat: (text: string) => void;
  /** Tras renombrar el espacio o cambiar de rol desde el panel. */
  updateSpace: (space: SpaceSummary) => void;
}

const LEAVE_MESSAGES: Record<number, string> = {
  [LeaveCode.Replaced]: 'Entraste a este espacio desde otra pestaña o dispositivo.',
  [LeaveCode.Removed]: 'Ya no tienes acceso a este espacio.',
};

/** Mapas ya descargados, por espacio y versión. */
const mapCache = new Map<string, TiledMap>();

async function loadMap(spaceId: string, version: string) {
  const key = `${spaceId}@${version}`;
  let map = mapCache.get(key);
  if (!map) {
    map = await api<TiledMap>('GET', `/spaces/${spaceId}/map`);
    mapCache.set(key, map);
  }
  return map;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'idle',
  error: null,
  room: null,
  space: null,
  map: null,
  selfName: '',
  media: null,
  messages: [],

  join: async (spaceId, selfName) => {
    set({ phase: 'connecting', error: null, messages: [], selfName });
    let joined: JoinSpaceResponse;
    let tiled: TiledMap;
    try {
      // La API comprueba que soy miembro y firma el ticket que pide el servidor de juego.
      joined = await api<JoinSpaceResponse>('POST', `/spaces/${spaceId}/join`);
      tiled = await loadMap(spaceId, joined.mapVersion);
    } catch (err) {
      set({ phase: 'idle', error: errorMessage(err) });
      return;
    }

    try {
      const options: JoinOptions = { spaceId, ticket: joined.ticket };
      const room = await new Client(env.gameServerWsUrl).joinOrCreate(WORLD_ROOM, options);
      // El servidor envía el ticket de medios nada más entrar.
      const ticket = new Promise<string>((resolve) =>
        room.onMessage(ServerMessage.MediaTicket, (m: MediaTicketMessage) => resolve(m.ticket)),
      );
      room.onMessage(ServerMessage.ChatHistory, (history: ChatEntry[]) =>
        set({ messages: history }),
      );
      room.onMessage(ServerMessage.Chat, (entry: ChatEntry) =>
        set((s) => ({ messages: [...s.messages, entry].slice(-MAX_MESSAGES) })),
      );
      room.onLeave((code: number) => {
        if (get().room !== room) return;
        void get().media?.stop();
        set({
          phase: 'idle',
          room: null,
          media: null,
          error: LEAVE_MESSAGES[code] ?? 'Se perdió la conexión.',
        });
      });

      const media = new MediaSession(room, parseWorldMap(tiled), ticket);
      set({ phase: 'world', room, media, space: joined.space, map: tiled });
      void media.start(useMedia.getState().takePreview());
    } catch (err) {
      const message = err instanceof Error && /lleno/i.test(err.message) ? err.message : null;
      set({ phase: 'idle', error: message ?? 'No se pudo conectar con el servidor de juego.' });
    }
  },

  leave: async () => {
    const { room, media } = get();
    set({ phase: 'idle', room: null, media: null, error: null });
    await Promise.all([media?.stop(), room?.leave()]);
  },

  sendChat: (text) => {
    get().room?.send(ClientMessage.Chat, { text });
  },

  updateSpace: (space) => set({ space }),
}));
