import { AVATAR_COUNT, CHAT_MAX_LENGTH, NAME_MAX_LENGTH } from './constants.js';
import { isDirection, type Direction } from './direction.js';

/** Mensajes que el cliente envía al servidor de juego. */
export const ClientMessage = {
  Step: 'step',
  Chat: 'chat',
  /** Pide un ticket de medios nuevo (por ejemplo, para reconectar el video). */
  MediaTicket: 'media-ticket',
} as const;

/** Mensajes que el servidor de juego envía a los clientes. */
export const ServerMessage = {
  Chat: 'chat',
  ChatHistory: 'chat-history',
  /** Ticket de medios firmado ({ ticket }). Se envía al entrar y cuando se pide. */
  MediaTicket: 'media-ticket',
} as const;

/** Opciones al entrar en la sala. */
export interface JoinOptions {
  name: string;
  avatar: number;
}

/** Un paso de una casilla. `seq` crece en cada paso y permite reconciliar la predicción. */
export interface StepMessage {
  dir: Direction;
  seq: number;
}

export interface ChatSendMessage {
  text: string;
}

export interface ChatEntry {
  id: string;
  sessionId: string;
  name: string;
  text: string;
  /** Milisegundos desde epoch (hora del servidor). */
  at: number;
}

export interface MediaTicketMessage {
  ticket: string;
}

/** POST /media/token (API). */
export interface MediaTokenRequest {
  ticket: string;
}

export interface MediaTokenResponse {
  /** URL de señalización de LiveKit (ws:// o wss://). */
  url: string;
  token: string;
}

// --- Validación de lo que llega del cliente (nunca confiar en él) ---

export function sanitizeName(raw: unknown): string {
  const name =
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH) : '';
  return name || 'Invitado';
}

export function sanitizeAvatar(raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < AVATAR_COUNT
    ? (raw as number)
    : 0;
}

export function parseStep(raw: unknown): StepMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { dir, seq } = raw as Record<string, unknown>;
  if (!isDirection(dir) || !Number.isSafeInteger(seq) || (seq as number) < 0) return null;
  return { dir, seq: seq as number };
}

/** Devuelve el texto limpio o null si el mensaje no es válido o está vacío. */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { text } = raw as Record<string, unknown>;
  if (typeof text !== 'string') return null;
  // Quita caracteres de control (salvo saltos de línea), recorta y limita la longitud.
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  return clean ? clean.slice(0, CHAT_MAX_LENGTH) : null;
}
