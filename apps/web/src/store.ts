import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import {
  ClientMessage,
  ServerMessage,
  WORLD_ROOM,
  type ChatEntry,
  type JoinOptions,
} from '@pixels/shared';
import { Client } from '@colyseus/sdk';
import { env } from './env.js';

const MAX_MESSAGES = 200;

type Phase = 'join' | 'connecting' | 'world';

interface AppState {
  phase: Phase;
  error: string | null;
  room: Room | null;
  messages: ChatEntry[];
  join: (options: JoinOptions) => Promise<void>;
  leave: () => Promise<void>;
  sendChat: (text: string) => void;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'join',
  error: null,
  room: null,
  messages: [],

  join: async (options) => {
    set({ phase: 'connecting', error: null, messages: [] });
    try {
      const room = await new Client(env.gameServerWsUrl).joinOrCreate(WORLD_ROOM, options);
      room.onMessage(ServerMessage.ChatHistory, (history: ChatEntry[]) =>
        set({ messages: history }),
      );
      room.onMessage(ServerMessage.Chat, (entry: ChatEntry) =>
        set((s) => ({ messages: [...s.messages, entry].slice(-MAX_MESSAGES) })),
      );
      room.onLeave(() => {
        if (get().room === room)
          set({ phase: 'join', room: null, error: 'Se perdió la conexión.' });
      });
      set({ phase: 'world', room });
    } catch {
      set({ phase: 'join', error: 'No se pudo conectar con el servidor de juego.' });
    }
  },

  leave: async () => {
    const { room } = get();
    set({ phase: 'join', room: null, error: null });
    await room?.leave();
  },

  sendChat: (text) => {
    get().room?.send(ClientMessage.Chat, { text });
  },
}));
