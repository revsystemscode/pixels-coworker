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
  type RoleChangedMessage,
  type SpaceSummary,
  type TiledMap,
} from '@pixels/shared';
import { api, errorMessage } from './api.js';
import { env } from './env.js';
import { MediaSession } from './media/MediaSession.js';
import { useMedia } from './media/store.js';
import { bindObjects, useObjects } from './objects/store.js';
import { bindGames, useGame } from './tictactoe/store.js';
import { useBoard } from './whiteboard/store.js';

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
  /** Aviso breve sobre el mapa (por ejemplo, «Se ha actualizado el mapa»). */
  mapNotice: string | null;
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

const MAP_NOTICE_MS = 4_000;
let mapNoticeTimer: number | undefined;
function showMapNotice(mapNotice: string) {
  window.clearTimeout(mapNoticeTimer);
  useApp.setState({ mapNotice });
  mapNoticeTimer = window.setTimeout(() => useApp.setState({ mapNotice: null }), MAP_NOTICE_MS);
}

/**
 * Se publicó un mapa nuevo: se descarga y se redibuja sin salir de la sala (el juego se vuelve a
 * montar con el mapa nuevo; el video sigue). Las zonas privadas del audio también cambian.
 */
async function reloadMap(room: Room, spaceId: string) {
  let tiled: TiledMap;
  try {
    tiled = await api<TiledMap>('GET', `/spaces/${spaceId}/map`);
  } catch {
    showMapNotice('Se cambió el mapa, pero no se pudo cargar. Sal y vuelve a entrar.');
    return;
  }
  if (useApp.getState().room !== room) return;
  const world = parseWorldMap(tiled);
  for (const key of mapCache.keys()) if (key.startsWith(`${spaceId}@`)) mapCache.delete(key);
  // Un objeto abierto que ya no está (o se movió) se cierra o se actualiza.
  const open = useObjects.getState().open;
  if (open) {
    const moved = world.objects.find((o) => o.id === open.id);
    if (moved) useObjects.setState({ open: moved });
    else useObjects.getState().close('El mapa ha cambiado.');
  }
  useApp.getState().media?.setWorld(world);
  useApp.setState({ map: tiled });
  showMapNotice('Se ha actualizado el mapa.');
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
  mapNotice: null,

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
      bindObjects(room);
      room.onMessage(ServerMessage.MapChanged, () => void reloadMap(room, spaceId));
      bindGames(room);
      room.onMessage(ServerMessage.RoleChanged, ({ role }: RoleChangedMessage) => {
        const space = get().space;
        if (space && get().room === room) set({ space: { ...space, role } });
      });
      room.onMessage(ServerMessage.ChatHistory, (history: ChatEntry[]) =>
        set({ messages: history }),
      );
      room.onMessage(ServerMessage.Chat, (entry: ChatEntry) =>
        set((s) => ({ messages: [...s.messages, entry].slice(-MAX_MESSAGES) })),
      );
      room.onLeave((code: number) => {
        if (get().room !== room) return;
        useBoard.getState().close();
        useObjects.getState().close();
        useGame.getState().close();
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
    useBoard.getState().close();
    useObjects.getState().close();
    useGame.getState().close();
    set({ phase: 'idle', room: null, media: null, error: null });
    await Promise.all([media?.stop(), room?.leave()]);
  },

  sendChat: (text) => {
    get().room?.send(ClientMessage.Chat, { text });
  },

  updateSpace: (space) => set({ space }),
}));
