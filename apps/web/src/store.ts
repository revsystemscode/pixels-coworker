import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  DEFAULT_MAP,
  MAPS,
  ServerMessage,
  WORLD_ROOM,
  parseWorldMap,
  type ChatEntry,
  type JoinOptions,
  type MediaTicketMessage,
} from '@pixels/shared';
import { Client } from '@colyseus/sdk';
import { env } from './env.js';
import { MediaSession } from './media/MediaSession.js';
import { useMedia } from './media/store.js';

const MAX_MESSAGES = 200;

type Phase = 'join' | 'connecting' | 'world';

interface AppState {
  phase: Phase;
  error: string | null;
  room: Room | null;
  selfName: string;
  media: MediaSession | null;
  messages: ChatEntry[];
  join: (options: JoinOptions) => Promise<void>;
  leave: () => Promise<void>;
  sendChat: (text: string) => void;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'join',
  error: null,
  room: null,
  selfName: '',
  media: null,
  messages: [],

  join: async (options) => {
    set({ phase: 'connecting', error: null, messages: [], selfName: options.name });
    try {
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
      room.onLeave(() => {
        if (get().room !== room) return;
        void get().media?.stop();
        set({ phase: 'join', room: null, media: null, error: 'Se perdió la conexión.' });
      });

      const media = new MediaSession(room, parseWorldMap(MAPS[DEFAULT_MAP]), ticket);
      set({ phase: 'world', room, media });
      void media.start(useMedia.getState().takePreview());
    } catch {
      set({ phase: 'join', error: 'No se pudo conectar con el servidor de juego.' });
    }
  },

  leave: async () => {
    const { room, media } = get();
    set({ phase: 'join', room: null, media: null, error: null });
    await Promise.all([media?.stop(), room?.leave()]);
  },

  sendChat: (text) => {
    get().room?.send(ClientMessage.Chat, { text });
  },
}));
