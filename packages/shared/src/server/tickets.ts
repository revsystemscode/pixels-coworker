import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRole, type Role } from '../roles.js';

/**
 * Tickets firmados entre servidores (HMAC-SHA256 con un secreto compartido, TICKET_SECRET). Solo
 * para código de servidor. El tipo va dentro de lo firmado: un ticket de un tipo no vale como otro.
 *
 * - `join`: la API lo entrega a un miembro del espacio; el servidor de juego lo exige para entrar.
 * - `media`: el servidor de juego lo entrega a cada jugador; la API lo canjea por un token de
 *   LiveKit. Así la identidad en LiveKit es siempre la sesión real del jugador.
 */
type Kind = 'join' | 'media';

export interface JoinTicketPayload {
  /** Id del usuario (cuenta). */
  uid: string;
  /** Id del espacio. */
  space: string;
  name: string;
  avatar: number;
  role: Role;
  /** Caducidad en milisegundos desde epoch. */
  exp: number;
}

export interface MediaTicketPayload {
  /** sessionId de Colyseus: será la identidad en LiveKit. */
  sid: string;
  /** Sala de LiveKit (una por sala de Colyseus). */
  room: string;
  name: string;
  exp: number;
}

const VERSION = 'v1';
const MAX_LENGTH = 2048;

const hmac = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

function sign(kind: Kind, payload: object, secret: string): string {
  const data = `${kind}.${VERSION}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${data}.${hmac(data, secret)}`;
}

/** Contenido de un ticket con firma válida, del tipo pedido y sin caducar; si no, null. */
function open(kind: Kind, ticket: unknown, secret: string, now: number) {
  if (typeof ticket !== 'string' || ticket.length > MAX_LENGTH) return null;
  const parts = ticket.split('.');
  if (parts.length !== 4) return null;
  const [k, version, body, signature] = parts as [string, string, string, string];
  if (k !== kind || version !== VERSION || !body || !signature) return null;

  const expected = Buffer.from(hmac(`${k}.${version}.${body}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const fields = payload as Record<string, unknown>;
  return typeof fields.exp === 'number' && fields.exp > now ? fields : null;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function signJoinTicket(payload: JoinTicketPayload, secret: string): string {
  return sign('join', payload, secret);
}

export function verifyJoinTicket(
  ticket: unknown,
  secret: string,
  now = Date.now(),
): JoinTicketPayload | null {
  const f = open('join', ticket, secret, now);
  if (
    !f ||
    !nonEmpty(f.uid) ||
    !nonEmpty(f.space) ||
    !nonEmpty(f.name) ||
    !Number.isInteger(f.avatar) ||
    !isRole(f.role)
  ) {
    return null;
  }
  return {
    uid: f.uid,
    space: f.space,
    name: f.name,
    avatar: f.avatar as number,
    role: f.role,
    exp: f.exp as number,
  };
}

export function signMediaTicket(payload: MediaTicketPayload, secret: string): string {
  return sign('media', payload, secret);
}

export function verifyMediaTicket(
  ticket: unknown,
  secret: string,
  now = Date.now(),
): MediaTicketPayload | null {
  const f = open('media', ticket, secret, now);
  if (!f || !nonEmpty(f.sid) || !nonEmpty(f.room) || typeof f.name !== 'string') return null;
  return { sid: f.sid, room: f.room, name: f.name, exp: f.exp as number };
}
