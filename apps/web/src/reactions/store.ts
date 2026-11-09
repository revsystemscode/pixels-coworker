import type { Room } from '@colyseus/sdk';
import { create } from 'zustand';
import { ClientMessage, EMOTE_DURATION_MS, type Emote } from '@pixels/shared';

interface ReactionsState {
  /** Mi mano levantada (la confirma el estado del servidor). */
  handRaised: boolean;
  /** Manos levantadas, por sesión (para las burbujas de video). */
  hands: Record<string, boolean>;
  /** Reacción que se ve ahora, por sesión. `key` cambia con cada reacción (reinicia la animación). */
  emotes: Record<string, { emoji: string; key: number }>;
}

export const useReactions = create<ReactionsState>(() => ({
  handRaised: false,
  hands: {},
  emotes: {},
}));

let emoteKey = 0;

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/** Alguien ha reaccionado: se ve EMOTE_DURATION_MS (también en su burbuja de video). */
export function showEmote(sessionId: string, emoji: string) {
  const key = ++emoteKey;
  useReactions.setState((s) => ({ emotes: { ...s.emotes, [sessionId]: { emoji, key } } }));
  window.setTimeout(() => {
    useReactions.setState((s) => {
      return s.emotes[sessionId]?.key === key ? { emotes: without(s.emotes, sessionId) } : s;
    });
  }, EMOTE_DURATION_MS);
}

export function setHand(sessionId: string, raised: boolean) {
  useReactions.setState((s) => ({
    hands: raised ? { ...s.hands, [sessionId]: true } : without(s.hands, sessionId),
  }));
}

export function forgetReactions(sessionId: string) {
  setHand(sessionId, false);
  useReactions.setState((s) => ({ emotes: without(s.emotes, sessionId) }));
}

export function sendEmote(room: Room, emote: Emote) {
  room.send(ClientMessage.Emote, { emote });
}

export function toggleHand(room: Room) {
  const raised = !useReactions.getState().handRaised;
  // Se marca ya; si el servidor no lo acepta, el estado lo corrige.
  useReactions.setState({ handRaised: raised });
  room.send(ClientMessage.Hand, { raised });
}
