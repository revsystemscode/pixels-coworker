import { isAvatar } from './avatar.js';
import type { Role } from './roles.js';
import { CHAT_MAX_LENGTH, NAME_MAX_LENGTH } from './constants.js';
import { isDirection, type Direction } from './direction.js';

/** Mensajes que el cliente envía al servidor de juego. */
export const ClientMessage = {
  Step: 'step',
  Chat: 'chat',
  /** Pide un ticket de medios nuevo (por ejemplo, para reconectar el video). */
  MediaTicket: 'media-ticket',
  /** Abre una pizarra ({ boardId }). Hay que estar cerca. Ver whiteboard.ts. */
  BoardOpen: 'board-open',
  /** Cierra la pizarra abierta. */
  BoardClose: 'board-close',
  /** Elementos que han cambiado ({ boardId, elements }). */
  BoardUpdate: 'board-update',
  /** Posición del puntero dentro de la pizarra. */
  BoardPointer: 'board-pointer',
  /** Reacción rápida sobre el avatar ({ emote }). Ver emotes.ts. */
  Emote: 'emote',
  /** Levanta o baja la mano ({ raised }). Queda en el estado del jugador. */
  Hand: 'hand',
  /** Cambia el contenido de un objeto ({ objectId, value }). Solo dueño y admins. */
  ObjectEdit: 'object-edit',
  /** Abre una mesa de juego ({ objectId }) para jugar o mirar. Hay que estar cerca. */
  GameOpen: 'game-open',
  /** Cierra la mesa abierta (y deja el asiento, si tenía). */
  GameClose: 'game-close',
  /** Se sienta a jugar en la mesa abierta. */
  GameSit: 'game-sit',
  /** Deja el asiento (sigue mirando). */
  GameStand: 'game-stand',
  /** Marca una casilla ({ cell }: 0–8). */
  GameMove: 'game-move',
  /** Otra partida, al terminar la anterior. */
  GameRematch: 'game-rematch',
} as const;

/** Mensajes que el servidor de juego envía a los clientes. */
export const ServerMessage = {
  Chat: 'chat',
  ChatHistory: 'chat-history',
  /** Ticket de medios firmado ({ ticket }). Se envía al entrar y cuando se pide. */
  MediaTicket: 'media-ticket',
  /** Contenido completo de la pizarra (al abrirla o para volver a sincronizar). */
  BoardScene: 'board-scene',
  /** Elementos que han cambiado otras personas. */
  BoardUpdate: 'board-update',
  BoardPointer: 'board-pointer',
  BoardViewers: 'board-viewers',
  BoardError: 'board-error',
  /** Alguien ha reaccionado ({ sessionId, emote }). */
  Emote: 'emote',
  /** Al entrar: contenido de los objetos del mapa. Ver objects.ts. */
  ObjectContents: 'object-contents',
  /** Alguien cambió un objeto. */
  ObjectContent: 'object-content',
  ObjectError: 'object-error',
  /** Mi rol en el espacio ha cambiado. */
  RoleChanged: 'role-changed',
  /** Estado de la mesa de juego abierta. Ver tictactoe.ts. */
  GameState: 'game-state',
  GameError: 'game-error',
} as const;

/** Opciones al entrar en la sala: el espacio y el ticket que da la API (POST /spaces/:id/join). */
export interface JoinOptions {
  spaceId: string;
  ticket: string;
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

/** Canal de Redis por el que la API avisa al servidor de juego de cambios en los espacios. */
export const SPACE_EVENTS_CHANNEL = 'pixels:space-events';

/** La API los publica; el servidor de juego saca de la sala a quien ya no tiene acceso. */
export type SpaceEvent =
  | { type: 'member-removed'; spaceId: string; userId: string }
  | { type: 'role-changed'; spaceId: string; userId: string; role: Role }
  | { type: 'space-deleted'; spaceId: string };

/** Códigos con los que el servidor de juego cierra la conexión (el cliente muestra el motivo). */
export const LeaveCode = {
  /** La misma cuenta entró al espacio desde otra pestaña o dispositivo. */
  Replaced: 4001,
  /** Ya no es miembro del espacio (expulsado, salió o se borró el espacio). */
  Removed: 4003,
} as const;

// --- Validación de lo que llega del cliente (nunca confiar en él) ---

export function sanitizeName(raw: unknown): string {
  const name =
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH) : '';
  return name || 'Invitado';
}

export function sanitizeAvatar(raw: unknown): number {
  return isAvatar(raw) ? raw : 0;
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
