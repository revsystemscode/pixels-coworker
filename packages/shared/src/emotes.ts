/** Reacciones rápidas que se ven unos segundos sobre el avatar (teclas 1–6). */
export const EMOTES = {
  wave: { emoji: '👋', label: 'Saludar' },
  thumbs: { emoji: '👍', label: 'Me gusta' },
  heart: { emoji: '❤️', label: 'Me encanta' },
  laugh: { emoji: '😂', label: 'Me hace gracia' },
  party: { emoji: '🎉', label: 'Celebrar' },
  wow: { emoji: '😮', label: 'Sorpresa' },
} as const;

export type Emote = keyof typeof EMOTES;
export const EMOTE_IDS = Object.keys(EMOTES) as Emote[];

/** Mano levantada (se queda hasta que se baja). */
export const HAND_EMOJI = '✋';

/** Cuánto se ve una reacción sobre el avatar. */
export const EMOTE_DURATION_MS = 3_000;

/** Cliente → servidor. */
export interface EmoteMessage {
  emote: Emote;
}

/** Servidor → todos: alguien ha reaccionado. */
export interface RemoteEmoteMessage {
  sessionId: string;
  emote: Emote;
}

export interface HandMessage {
  raised: boolean;
}

export const isEmote = (raw: unknown): raw is Emote =>
  typeof raw === 'string' && Object.hasOwn(EMOTES, raw);

export function parseEmote(raw: unknown): EmoteMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { emote } = raw as Record<string, unknown>;
  return isEmote(emote) ? { emote } : null;
}

export function parseHand(raw: unknown): HandMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { raised } = raw as Record<string, unknown>;
  return typeof raised === 'boolean' ? { raised } : null;
}
